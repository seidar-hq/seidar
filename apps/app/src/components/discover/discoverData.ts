"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api";
import { useShared } from "@/lib/useShared";
import { actionBlock, LEND_PROTOCOLS, marketHref, useLendMarkets, type Market } from "@/components/earn/lendData";
import { usePools, venueMeta, isConcentrated, type Pool } from "@/components/earn/poolData";
import { useVaultList, vaultProtocol, type VaultListRow } from "@/components/earn/vaultData";
import { assetKey, useTokenCatalogue, type Portfolio } from "@/portfolio/usePortfolio";

// Discover's data: wallets worth looking at (API /discover/*), the viewer's watchlist and recent
// visits (this browser only), and a wallet's holdings turned into items that can be copied.

export const isAddress = (s: string) => /^G[A-Z2-7]{55}$/.test(s);

// ---------------------------------------------------------------- featured wallets / account

export type FeaturedWallet = {
  address: string;
  label: string | null;
  actions: { supply: number; withdraw: number; borrow: number; repay: number };
  lastActive: number;
  pools: { id: string; name: string }[];
  assets: string[];
  walletUsd: number | null;
  topHoldings: { asset: string; usd: number }[];
};
type FeaturedResp = { ok?: boolean; wallets?: FeaturedWallet[]; window?: { from: number; to: number }; source?: string; error?: string };

export function useFeatured() {
  const { value, loading, error } = useShared<FeaturedResp | null>("discover:featured", () => apiJson<FeaturedResp>("/api/discover/featured", undefined, 120_000), 600_000);
  return { wallets: value?.wallets ?? [], window: value?.window ?? null, source: value?.source ?? null, loading: loading && !value, failed: !loading && (error || value?.ok === false) };
}

export type AccountInfo = {
  ok: boolean;
  error?: string;
  address: string;
  created: number | null;
  payments: number | null;
  trades: number | null;
  activity: { yearly?: string; monthly?: string } | null;
  homeDomain: string | null;
  label: string | null;
  domain: string | null;
  tags: string[];
  walletUsd: number | null;
};

export function useAccountInfo(address: string | null) {
  const { value, loading } = useShared<AccountInfo | null>(address ? `discover:acct:${address}` : null, () => apiJson<AccountInfo>(`/api/discover/account?address=${address}`), 600_000);
  return { info: value, loading: loading && !value };
}

/** G address or federation name -> G address. */
export async function resolveQuery(q: string): Promise<{ address?: string; error?: string }> {
  const s = q.trim();
  if (isAddress(s.toUpperCase())) return { address: s.toUpperCase() };
  const r = await apiJson<{ ok?: boolean; address?: string; error?: string }>(`/api/discover/resolve?q=${encodeURIComponent(s)}`);
  if (r?.ok && r.address) return { address: r.address };
  return { error: r?.error ?? "Couldn't reach Seidar to look that up. Try again." };
}

// ---------------------------------------------------------------- watchlist + recents (local)

export type SavedWallet = { address: string; name?: string; at: number };
const WATCH_KEY = "seidar.discover.watch";
const RECENT_KEY = "seidar.discover.recent";
const EVENT = "seidar:discover-lists";

const read = (k: string): SavedWallet[] => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => x && isAddress(x.address)) : [];
  } catch {
    return [];
  }
};
const write = (k: string, v: SavedWallet[]) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    window.dispatchEvent(new Event(EVENT));
  } catch {}
};

export function useSavedWallets() {
  const [watch, setWatch] = useState<SavedWallet[]>([]);
  const [recent, setRecent] = useState<SavedWallet[]>([]);
  useEffect(() => {
    const load = () => {
      setWatch(read(WATCH_KEY));
      setRecent(read(RECENT_KEY));
    };
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);
  return {
    watch,
    recent,
    isWatched: (a: string) => watch.some((w) => w.address === a),
    toggleWatch: (a: string, name?: string) => {
      const cur = read(WATCH_KEY);
      write(WATCH_KEY, cur.some((w) => w.address === a) ? cur.filter((w) => w.address !== a) : [{ address: a, name, at: Date.now() }, ...cur].slice(0, 50));
    },
    rename: (a: string, name: string) => write(WATCH_KEY, read(WATCH_KEY).map((w) => (w.address === a ? { ...w, name: name.trim() || undefined } : w))),
    visit: (a: string) => write(RECENT_KEY, [{ address: a, at: Date.now() }, ...read(RECENT_KEY).filter((w) => w.address !== a)].slice(0, 8)),
    clearRecent: () => write(RECENT_KEY, []),
  };
}

// ---------------------------------------------------------------- copyable items

export type RiskLevel = "low" | "medium" | "high";
export type Asset = { code: string; issuer: string | null; contract: string | null; decimals: number; price: number | null };

type Base = {
  id: string;
  title: string;
  subtitle: string;
  protocol: { id: string; name: string; logo?: string };
  usd: number;
  apy: number | null;
  risk: { level: RiskLevel; reasons: string[] };
  /** Null when it can be copied; otherwise why not. */
  blocked: string | null;
  /** Page where the same position can be opened by hand. */
  href: string | null;
};
export type CopyItem =
  | (Base & { kind: "token"; asset: Asset })
  | (Base & { kind: "lend"; asset: Asset; market: Market })
  | (Base & { kind: "vault"; asset: Asset; vault: VaultListRow })
  | (Base & { kind: "lp"; legs: Asset[]; pool: Pool });

export type DebtItem = { id: string; code: string; issuer: string | null; usd: number; amount: number | null; protocol: string; poolName: string; apy: number | null };

/** USD- and EUR-pegged codes; a code alone proves nothing, so the price must agree too. */
const PEG: Record<string, [number, number]> = {
  USDC: [0.95, 1.05],
  PYUSD: [0.95, 1.05],
  USDX: [0.95, 1.05],
  USDGLO: [0.95, 1.05],
  YUSDC: [0.95, 1.1],
  EURC: [1.0, 1.3],
  EURX: [1.0, 1.3],
};
export const isStable = (code: string, price: number | null | undefined) => {
  const r = PEG[code.toUpperCase()];
  return !!r && price != null && price >= r[0] && price <= r[1];
};
const MAJOR = new Set(["XLM", "BTC", "WBTC", "ETH", "WETH", "SOL"]);

function tokenRisk(code: string, price: number | null, listed = true): Base["risk"] {
  if (!listed || price == null) return { level: "high", reasons: ["No reliable market price"] };
  if (isStable(code, price)) return { level: "low", reasons: ["Stablecoin: price held near its peg"] };
  if (MAJOR.has(code.toUpperCase())) return { level: "medium", reasons: ["Major crypto asset: price moves with the market"] };
  return { level: "high", reasons: ["Smaller token: prices can swing sharply"] };
}
const worst = (...ls: RiskLevel[]): RiskLevel => (ls.includes("high") ? "high" : ls.includes("medium") ? "medium" : "low");

export const MIN_COPY_USD = 1;

/** A wallet's positions and tokens as copy candidates (biggest first), plus its debts. */
export function useCopyItems(p: Portfolio) {
  const { tokens } = useTokenCatalogue();
  const { markets } = useLendMarkets();
  const { rows: vaultRows } = useVaultList();
  const { pools } = usePools();

  return useMemo(() => {
    const contractOf = (code: string, issuer: string | null) =>
      tokens.find((t) => t.code === code && (t.issuer ?? null) === (issuer ?? null))?.contract ?? null;
    const decimalsOf = (contract: string | null) => tokens.find((t) => t.contract === contract)?.decimals ?? 7;
    const priceOf = (code: string, issuer: string | null) => p.exposures.find((e) => e.key === assetKey(code, issuer))?.price || null;
    const asset = (code: string, issuer: string | null, contract?: string | null, decimals?: number): Asset => {
      const c = contract ?? contractOf(code, issuer);
      return { code, issuer, contract: c, decimals: decimals ?? decimalsOf(c), price: priceOf(code, issuer) };
    };

    const items: CopyItem[] = [];
    for (const t of p.assets) {
      if (t.usd < 0.5) continue;
      const a = asset(t.code, t.issuer);
      a.price = t.price ?? a.price;
      items.push({
        id: `token:${assetKey(t.code, t.issuer)}`,
        kind: "token",
        title: t.code,
        subtitle: "Held in wallet",
        protocol: { id: "wallet", name: "Wallet" },
        usd: t.usd,
        apy: null,
        risk: tokenRisk(t.code, t.price, t.listed),
        blocked: !t.listed || !t.price ? "No market price to size a copy" : !a.contract ? "Not tradable on Stellar DEXs" : null,
        asset: a,
        href: a.contract ? `/trade-swap/dex?buy=${t.issuer ? `${t.code}:${t.issuer}` : "XLM"}` : null,
      });
    }

    for (const r of p.supplied) {
      if (r.kind === "lend") {
        const m = markets.find((x) => x.protocol === r.protocol && x.pool === r.pool && x.contract === r.contract);
        const a = asset(r.code, r.issuer, r.contract ?? m?.contract, m?.decimals);
        if (m?.priceUsd) a.price = a.price ?? m.priceUsd;
        const tr = tokenRisk(r.code, a.price);
        const reasons = [...tr.reasons];
        let lvl = tr.level === "high" ? "high" : tr.level === "medium" ? "medium" : "low";
        if (m?.status != null && m.status >= 2) {
          reasons.push(m.status >= 4 ? "Pool is frozen" : "Pool is on ice (borrowing paused)");
          lvl = worst(lvl as RiskLevel, m.status >= 4 ? "high" : "medium");
        }
        if (m?.utilPct != null && m.utilPct > 92) {
          reasons.push(`${m.utilPct.toFixed(0)}% utilised: withdrawals can wait for repayments`);
          lvl = worst(lvl as RiskLevel, "medium");
        }
        const meta = LEND_PROTOCOLS[r.protocol as "blend" | "xoxno"];
        const xoxnoSpoke = m?.xoxno?.spokes.find((s) => s.canSupply);
        items.push({
          id: `lend:${r.protocol}:${r.pool}:${r.contract}`,
          kind: "lend",
          title: `Supply ${r.code}`,
          subtitle: `${meta?.name ?? r.label} · ${m?.poolName ?? "pool"}`,
          protocol: { id: r.protocol, name: meta?.name ?? r.label, logo: meta?.logo },
          usd: r.usd,
          apy: m?.supplyApy ?? null,
          risk: { level: lvl as RiskLevel, reasons: ["Smart-contract risk of the lending pool", ...reasons] },
          blocked: !m ? "Market not found" : actionBlock(m, "supply") ?? (m.protocol === "xoxno" && !xoxnoSpoke ? "No XOXNO spoke accepts this asset" : !a.price ? "No price" : null),
          asset: a,
          market: m as Market,
          href: m ? marketHref(m, "supply") : null,
        });
      } else {
        const pool = pools.find((x) => x.protocol === r.protocol && x.address === r.pool);
        const legs = (pool?.legs ?? (r.legs ?? []).map((l) => ({ ...l, contract: contractOf(l.code, l.issuer) ?? "", decimals: 7 }))).map((l) => asset(l.code, l.issuer, l.contract, l.decimals));
        const stables = legs.filter((l) => isStable(l.code, l.price)).length;
        const lvl: RiskLevel = stables === 2 ? "low" : stables === 1 ? "medium" : "high";
        const venue = venueMeta(r.protocol);
        const cl = pool ? isConcentrated(pool) : false;
        items.push({
          id: `lp:${r.protocol}:${r.pool}`,
          kind: "lp",
          title: `${legs.map((l) => l.code).join(" / ") || r.code} liquidity`,
          subtitle: `${venue.name}${pool ? ` · ${pool.poolType === "stable" ? "Stable" : cl ? "Concentrated" : "Constant product"}` : ""}`,
          protocol: { id: r.protocol, name: venue.name, logo: venue.logo },
          usd: r.usd,
          apy: pool?.apyPct ?? null,
          risk: {
            level: lvl,
            reasons: [
              "Smart-contract risk of the DEX",
              stables === 2 ? "Both sides are stablecoins: little impermanent loss" : "Impermanent loss when the two prices drift apart",
            ],
          },
          blocked: !pool
            ? "Pool not found"
            : cl
              ? "Concentrated ranges are personal: open it on the pool page"
              : legs.length !== 2 || legs.some((l) => !l.contract || !l.price)
                ? "A leg has no price"
                : null,
          legs,
          pool: pool as Pool,
          href: pool ? `/earn/pools/view?protocol=${pool.protocol}&pool=${pool.address}&tab=supply` : null,
        });
      }
    }

    for (const v of p.vaults) {
      const row = vaultRows.find((x) => x.address === v.vault);
      const meta = vaultProtocol(v.protocol);
      const u = v.underlying[0];
      const a = asset(row?.assetCode ?? u?.code ?? "?", u?.issuer ?? null, row?.asset, row?.assetDecimals);
      const tr = tokenRisk(a.code, a.price);
      const reasons = ["Strategy and smart-contract risk of the vault", ...tr.reasons];
      let lvl: RiskLevel = tr.level === "low" ? "low" : "medium";
      if (row?.withdrawalDays) {
        reasons.push(`${row.withdrawalDays}-day withdrawal queue`);
        lvl = worst(lvl, "medium");
      }
      if (row?.paused) {
        reasons.push("Vault is paused");
        lvl = "high";
      }
      items.push({
        id: `vault:${v.vault}`,
        kind: "vault",
        title: v.name,
        subtitle: `${meta.name} vault · ${a.code}`,
        protocol: { id: v.protocol, name: meta.name, logo: meta.logo },
        usd: v.usd,
        apy: row?.apyPct ?? null,
        risk: { level: lvl, reasons },
        blocked: !row ? "Vault not found" : row.paused ? "Vault is paused" : v.underlying.length > 1 ? "Multi-asset vault: deposit on its page" : !a.price ? "No price" : null,
        asset: a,
        vault: row as VaultListRow,
        href: `/earn/vaults/view?address=${v.vault}&mode=deposit`,
      });
    }
    items.sort((a, b) => b.usd - a.usd);

    const debts: DebtItem[] = p.borrowed.map((b) => {
      const m = markets.find((x) => x.protocol === b.protocol && x.pool === b.pool && x.contract === b.contract);
      return {
        id: `debt:${b.protocol}:${b.pool}:${b.contract}`,
        code: b.code,
        issuer: b.issuer,
        usd: b.usd,
        amount: b.amount,
        protocol: LEND_PROTOCOLS[b.protocol as "blend" | "xoxno"]?.name ?? b.protocol,
        poolName: m?.poolName ?? "",
        apy: m?.borrowApy ?? null,
      };
    });
    return { items, debts };
  }, [p.assets, p.supplied, p.vaults, p.borrowed, p.exposures, tokens, markets, vaultRows, pools]);
}

// ---------------------------------------------------------------- avatar

/** Two colours derived from an address, for its gradient avatar. */
export function addressHues(address: string): [number, number] {
  let h = 0;
  for (let i = 0; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) >>> 0;
  return [h % 360, (h >>> 9) % 360];
}

export const timeAgo = (ms: number) => {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 60) return `${Math.round(s / 86400)}d ago`;
  return new Date(ms).toLocaleDateString([], { month: "short", year: "numeric" });
};
