// Depositor counts for Gami, Sentora Evergreen and the Sentora deposit vaults, from Stellar Index's
// public, keyless API. Soroban RPC can't list a contract's holders.
//
// The obvious field, balance_entries on /assets/{id}/supply, keeps wallets that fully withdrew
// (checked 2026-11-07: 70 on Gami earnUSDC, where 46 still hold), and /assets/{id}/holders only sees
// trustlines, so it says 0. So balances are replayed from the vault's events instead, and the count is
// only trusted if they add up to what the vault holds (share vaults: total supply; Sentora deposit
// vaults: TotalPrincipal), so a missed event can't produce a wrong number. Checked 2026-11-08: exact on all six.

import { withCache } from "@seidar/cache";

const BASE = "https://api.stellarindex.io/v1";
const TIMEOUT_MS = 20_000;
const PAGE = 500;
/** A safety stop at 10,000 events; the busiest, Sentora XLM, had 1,803 on 2026-11-08. */
const MAX_PAGES = 20;

type VaultEvent = { topic_0?: unknown; topics?: unknown; data?: unknown };

const amountIn = (e: VaultEvent, field: "shares" | "amount") => {
  const m = String(e.data).match(new RegExp(`\\b${field}: (\\d+)`));
  if (!m) throw new Error(`event without ${field}`);
  return BigInt(m[1]);
};

type Replay = { holders: number; total: bigint };

function ledger() {
  const balances = new Map<string, bigint>();
  const add = (owner: unknown, v: bigint) => {
    if (typeof owner !== "string") throw new Error("event without an owner");
    balances.set(owner, (balances.get(owner) ?? 0n) + v);
  };
  const result = (): Replay => {
    const held = [...balances.values()];
    return { holders: held.filter((v) => v > 0n).length, total: held.reduce((s, v) => s + v, 0n) };
  };
  return { add, result };
}

/** Share vaults (deposit / withdraw / transfer of shares): wallets holding shares, and the shares held. */
export function replayShares(events: VaultEvent[]): Replay {
  const { add, result } = ledger();
  for (const e of events) {
    const topics = Array.isArray(e.topics) ? e.topics : [];
    if (e.topic_0 === "deposit") add(topics.at(-1), amountIn(e, "shares"));
    else if (e.topic_0 === "withdraw") add(topics.at(-1), -amountIn(e, "shares"));
    else if (e.topic_0 === "transfer") {
      const v = amountIn(e, "amount");
      add(topics[0], -v);
      add(topics[1], v);
    }
  }
  return result();
}

/** Sentora deposit vaults (DEPOSIT / WITHDRAW of principal, owner in the data): wallets with principal in. */
export function replayPrincipal(events: VaultEvent[]): Replay {
  const { add, result } = ledger();
  for (const e of events) {
    if (e.topic_0 !== "DEPOSIT" && e.topic_0 !== "WITHDRAW") continue;
    const owner = String(e.data).match(/\bowner: ([GC][A-Z2-7]{55})\b/)?.[1];
    add(owner, e.topic_0 === "DEPOSIT" ? amountIn(e, "amount") : -amountIn(e, "amount"));
  }
  return result();
}

/** GET a Stellar Index route; returns its `data`. Throws on any non-2xx (404 included). */
export async function stellarIndex(path: string) {
  const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`stellar index ${r.status}`);
  return ((await r.json()) as { data?: Record<string, unknown> }).data ?? {};
}

/** Wallets in the vault, or null when the source is unreachable or the replay doesn't add up to `expected`. */
async function counted(address: string, replay: (events: VaultEvent[]) => Replay, expected: () => Promise<unknown>): Promise<number | null> {
  const out = await withCache(
    `vaults:depositors:${address}`,
    30 * 60_000,
    async () => {
      const events: VaultEvent[] = [];
      let cursor: unknown;
      let page = 0;
      do {
        const d = await stellarIndex(`/contracts/${address}?limit=${PAGE}${cursor ? `&cursor=${encodeURIComponent(String(cursor))}` : ""}`);
        events.push(...((d.events as VaultEvent[] | undefined) ?? []));
        cursor = d.next_cursor;
      } while (cursor && ++page < MAX_PAGES);
      if (cursor) throw new Error("too many events");

      const { holders, total } = replay(events);
      // Thrown, not cached: the next request tries again (a deposit can land between the two reads).
      if (String(total) !== String(await expected())) throw new Error("replayed balances differ from the vault's total");
      return holders;
    },
    { swr: true },
  ).catch(() => null);
  return out?.value ?? null;
}

/** Share vaults: checked against the share token's total supply. */
export const vaultDepositors = (address: string) => counted(address, replayShares, async () => (await stellarIndex(`/assets/${address}/supply`)).total_supply);

/** Sentora deposit vaults: checked against the TotalPrincipal the vault stores, read by the caller. */
export const principalDepositors = (address: string, totalPrincipal: () => Promise<bigint>) => counted(address, replayPrincipal, totalPrincipal);
