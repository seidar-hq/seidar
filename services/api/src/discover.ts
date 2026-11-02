// Discover: find wallets worth looking at, and describe any wallet.
//   GET /discover/featured          active DeFi wallets, from recent Blend pool events
//   GET /discover/account?address=  account facts (age, activity, directory label, wallet value)
//   GET /discover/resolve?q=        federation name (name*domain) -> G address
//
// Sources: Stellar Expert (contract events, account stats, directory of labelled accounts, wallet
// value) and stellar.toml federation servers. Positions themselves are read by the app through the
// normal /positions, /vaults/positions and /dex/positions routes, so a profile shows exactly what
// the Portfolio page would show for that wallet.

import { withCache } from "@seidar/cache";
import { getPoolData, PINNED_POOLS } from "./pools.js";

const SE = "https://api.stellar.expert/explorer";
const G = /^G[A-Z2-7]{55}$/;

async function seJson<T>(path: string, ms = 15_000): Promise<T | null> {
  try {
    const r = await fetch(`${SE}${path}`, { signal: AbortSignal.timeout(ms), headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** Run `fn` over `items`, at most `n` at a time. */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

type SeEvent = { ts: number; topics?: string[]; contract: string };
type SeDirectory = { address: string; name?: string; domain?: string; tags?: string[] };
type SeValue = { total?: number; balances?: { asset: string; value?: number }[] };

/** Directory labels (exchanges, issuers, known services) for up to 50 addresses. */
async function directory(addresses: string[]): Promise<Map<string, SeDirectory>> {
  const out = new Map<string, SeDirectory>();
  for (let i = 0; i < addresses.length; i += 40) {
    const q = addresses.slice(i, i + 40).map((a) => `address[]=${a}`).join("&");
    const r = await seJson<{ _embedded?: { records?: SeDirectory[] } }>(`/directory?${q}&limit=50`);
    for (const d of r?._embedded?.records ?? []) out.set(d.address, d);
  }
  return out;
}

/** Wallet token value (USD) from Stellar Expert, with the three largest holdings. */
async function walletValue(address: string): Promise<{ usd: number | null; top: { asset: string; usd: number }[] }> {
  const v = await seJson<SeValue>(`/public/account/${address}/value`);
  if (!v) return { usd: null, top: [] };
  const top = (v.balances ?? [])
    .filter((b) => (b.value ?? 0) > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 4)
    .map((b) => ({ asset: b.asset.replace(/-1$/, ""), usd: b.value ?? 0 }));
  return { usd: typeof v.total === "number" ? v.total : null, top };
}

const LEND_EVENTS: Record<string, "supply" | "withdraw" | "borrow" | "repay"> = {
  supply: "supply",
  supply_collateral: "supply",
  withdraw: "withdraw",
  withdraw_collateral: "withdraw",
  borrow: "borrow",
  repay: "repay",
};

/** Exchanges, issuers and services are not people to copy. */
const SKIP_TAGS = new Set(["exchange", "issuer", "custodian", "anchor", "malicious", "unsafe", "pool"]);

export type FeaturedWallet = {
  address: string;
  label: string | null;
  /** Lending actions seen in the sampled window, by kind. */
  actions: { supply: number; withdraw: number; borrow: number; repay: number };
  lastActive: number;
  pools: { id: string; name: string }[];
  /** Asset contracts the wallet moved in those pools. */
  assets: string[];
  walletUsd: number | null;
  topHoldings: { asset: string; usd: number }[];
};

const FEATURED_TTL = 20 * 60_000;
/** Only recent activity counts. */
const WINDOW_MS = 30 * 86_400_000;

/** A pool's events since `since`, newest first (up to 3 pages of 200). */
async function recentEvents(contract: string, since: number): Promise<SeEvent[]> {
  const out: SeEvent[] = [];
  let path: string | null = `/public/contract/${contract}/events?order=desc&limit=200`;
  for (let page = 0; path && page < 3; page++) {
    const r: { _embedded?: { records?: SeEvent[] }; _links?: { next?: { href?: string } } } | null = await seJson(path);
    const recs = r?._embedded?.records ?? [];
    for (const e of recs) if (e.ts * 1000 >= since) out.push(e);
    if (recs.length < 200 || recs[recs.length - 1].ts * 1000 < since) break;
    const next: string | undefined = r?._links?.next?.href;
    path = next ? next.replace(/^\/explorer/, "") : null;
  }
  return out;
}

async function loadFeatured(): Promise<{ ok: true; wallets: FeaturedWallet[]; window: { from: number; to: number }; source: string }> {
  // The busiest pools first: their recent events are where active lenders and borrowers are.
  // Frozen and setup pools are skipped: their events are mostly people leaving, nothing to copy.
  const names = new Map<string, string>();
  const tvl = new Map<string, number>();
  const status = new Map<string, number | null>();
  try {
    const d = await getPoolData("blend");
    for (const r of d.rows as { pool: string; poolName: string; poolSupplied?: number | null; poolStatus?: number | null }[]) {
      names.set(r.pool, r.poolName);
      tvl.set(r.pool, Math.max(tvl.get(r.pool) ?? 0, r.poolSupplied ?? 0));
      status.set(r.pool, r.poolStatus ?? null);
    }
  } catch {
    /* names are optional */
  }
  const open = (p: string) => !status.has(p) || (status.get(p) ?? 0) <= 3;
  const pools = [...new Set(PINNED_POOLS)].filter(open).sort((a, b) => (tvl.get(b) ?? 0) - (tvl.get(a) ?? 0)).slice(0, 4);
  const since = Date.now() - WINDOW_MS;

  type Acc = FeaturedWallet & { score: number };
  const by = new Map<string, Acc>();
  let from = Infinity;
  let to = 0;
  const pages = await pool(pools, 2, (p) => recentEvents(p, since));
  pages.forEach((events, i) => {
    const pid = pools[i];
    for (const e of events) {
      const [name, asset, user] = e.topics ?? [];
      const kind = LEND_EVENTS[name ?? ""];
      if (!kind || !user || !G.test(user)) continue;
      from = Math.min(from, e.ts * 1000);
      to = Math.max(to, e.ts * 1000);
      const w: Acc = by.get(user) ?? {
        address: user,
        label: null,
        actions: { supply: 0, withdraw: 0, borrow: 0, repay: 0 },
        lastActive: 0,
        pools: [],
        assets: [],
        walletUsd: null,
        topHoldings: [],
        score: 0,
      };
      w.actions[kind]++;
      // Opening and adding to positions says more about a strategy than closing one.
      w.score += kind === "supply" || kind === "borrow" ? 2 : 1;
      w.lastActive = Math.max(w.lastActive, e.ts * 1000);
      if (!w.pools.some((x) => x.id === pid)) w.pools.push({ id: pid, name: names.get(pid) ?? "Blend pool" });
      if (asset && !w.assets.includes(asset)) w.assets.push(asset);
      by.set(user, w);
    }
  });

  // Most active first, then drop labelled services and price the rest.
  const ranked = [...by.values()].sort((a, b) => b.score - a.score || b.lastActive - a.lastActive).slice(0, 36);
  const dir = await directory(ranked.map((w) => w.address));
  const people = ranked.filter((w) => !(dir.get(w.address)?.tags ?? []).some((t) => SKIP_TAGS.has(t)));
  for (const w of people) {
    const d = dir.get(w.address);
    w.label = d?.name ?? null;
  }
  const values = await pool(people.slice(0, 24), 4, (w) => walletValue(w.address));
  const wallets = people.slice(0, 24).map((w, i) => {
    const { score: _score, ...rest } = w;
    void _score;
    return { ...rest, walletUsd: values[i].usd, topHoldings: values[i].top };
  });
  return {
    ok: true,
    wallets,
    window: { from: Number.isFinite(from) ? from : Date.now(), to: to || Date.now() },
    source: "Recent Blend pool events (Stellar Expert)",
  };
}

export async function featuredWallets() {
  const r = await withCache("discover:featured:v2", FEATURED_TTL, loadFeatured, { swr: true });
  return r.value ?? { ok: false as const, error: "Couldn't load wallets right now. Try again shortly." };
}

type SeAccount = {
  address: string;
  created?: number;
  creator?: string;
  payments?: number;
  trades?: number;
  activity?: { yearly?: string; monthly?: string };
  assets?: string[];
  home_domain?: string;
};

export async function accountInfo(address: string) {
  if (!G.test(address)) return { status: 400, body: { ok: false, error: "invalid address" } };
  const r = await withCache(
    `discover:account:${address}`,
    10 * 60_000,
    async () => {
      const [acct, dir, value] = await Promise.all([
        seJson<SeAccount>(`/public/account/${address}`),
        directory([address]),
        walletValue(address),
      ]);
      if (!acct) return { ok: false as const, error: "not-found" };
      const d = dir.get(address);
      return {
        ok: true as const,
        address,
        created: acct.created ? acct.created * 1000 : null,
        creator: acct.creator ?? null,
        payments: acct.payments ?? null,
        trades: acct.trades ?? null,
        activity: acct.activity ?? null,
        homeDomain: acct.home_domain ?? null,
        label: d?.name ?? null,
        domain: d?.domain ?? null,
        tags: d?.tags ?? [],
        walletUsd: value.usd,
      };
    },
    { swr: true },
  );
  const v = r.value;
  if (!v) return { status: 200, body: { ok: false, error: "Couldn't read this account right now." } };
  if (!v.ok) return { status: 200, body: { ok: false, error: "This account doesn't exist on Stellar (never funded)." } };
  return { status: 200, body: v };
}

/** name*domain -> G address via the domain's stellar.toml FEDERATION_SERVER; G addresses pass through. */
export async function resolveAddress(q: string) {
  const s = q.trim();
  if (G.test(s.toUpperCase())) return { status: 200, body: { ok: true, address: s.toUpperCase(), via: null } };
  if (!/^[^*\s]+\*[a-z0-9.-]+\.[a-z]{2,}$/i.test(s))
    return { status: 200, body: { ok: false, error: "Enter a Stellar address (G…) or a federation name like name*domain.com." } };
  try {
    const sdk = await import("@stellar/stellar-sdk");
    const rec = await sdk.Federation.Server.resolve(s, { timeout: 10_000 });
    if (!rec.account_id || !G.test(rec.account_id)) return { status: 200, body: { ok: false, error: "That name doesn't point to a Stellar account." } };
    return { status: 200, body: { ok: true, address: rec.account_id, via: s } };
  } catch {
    return { status: 200, body: { ok: false, error: `Couldn't resolve ${s}. Check the name and domain.` } };
  }
}
