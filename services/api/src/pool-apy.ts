// LP fee APY from what liquidity providers actually earned (Soroswap, Phoenix).
//
// In a constant-product pool every swap fee stays in the reserves, so the pool's invariant per LP
// share, sqrt(reserve0 * reserve1) / totalShares, rises only by fees: deposits and withdrawals
// mint or burn shares in proportion (the index doesn't move), and price moves rebalance the
// reserves without changing their product. Snapshotting that index hourly and annualising its
// growth gives the realised fee APY, net of any protocol cut, with no volume or price estimates:
//   APY = (index_now / index_then) ^ (1 year / elapsed) - 1        (fees compound in the pool)
//
// Snapshots live in the shared cache (KV on Workers) so every isolate and the cron agree. The
// first APY shows once a pool has MIN_SPAN of history; the window then grows to 7 days.

import { cacheGetEntry, cacheSet } from "@seidar/cache";

export type IndexVenue = "soroswap" | "phoenix";
type Snap = [t: number, index: number];
type Store = { at: number; pools: Record<string, Snap[]> };

const KEY = (v: IndexVenue) => `poolapy:v1:${v}`;
const EVERY_MS = 60 * 60_000; // one snapshot an hour
const KEEP_MS = 8 * 24 * 3600_000;
const WINDOW_MS = 7 * 24 * 3600_000;
export const MIN_SPAN_MS = 20 * 3600_000; // under ~a day, a few large swaps would dominate the figure
const YEAR_MS = 365 * 24 * 3600_000;
/** Pools below this TVL aren't tracked (dust pools swing wildly and cost reads). */
const MIN_TVL_USD = 250;

type View = (contract: string, method: string, args?: unknown[]) => Promise<unknown>;

const big = (v: unknown): number | null => {
  const n = typeof v === "bigint" ? Number(v) : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** sqrt(r0 * r1) / shares, read in one moment (null when any part is missing). */
async function readIndex(venue: IndexVenue, pool: string, view: View): Promise<number | null> {
  if (venue === "phoenix") {
    const info = (await view(pool, "query_pool_info")) as {
      asset_a?: { amount?: unknown };
      asset_b?: { amount?: unknown };
      asset_lp_share?: { amount?: unknown };
    } | null;
    const a = big(info?.asset_a?.amount);
    const b = big(info?.asset_b?.amount);
    const s = big(info?.asset_lp_share?.amount);
    return a && b && s ? Math.sqrt(a * b) / s : null;
  }
  const [res, supply] = await Promise.all([view(pool, "get_reserves"), view(pool, "total_supply")]);
  const r = Array.isArray(res) ? res : [];
  const a = big(r[0]);
  const b = big(r[1]);
  const s = big(supply);
  return a && b && s ? Math.sqrt(a * b) / s : null;
}

async function load(venue: IndexVenue): Promise<Store> {
  const hit = await cacheGetEntry<Store>(KEY(venue)).catch(() => null);
  return hit?.value?.pools ? hit.value : { at: 0, pools: {} };
}

/**
 * Takes this hour's snapshot for a venue's pools (no-op when the last one is under an hour old).
 * Reads are spread a few at a time; a pool whose read fails just misses this hour.
 */
export async function recordPoolIndexes(venue: IndexVenue, rows: { address: string; tvlUsd: number | null }[], view: View): Promise<void> {
  const store = await load(venue);
  const now = Date.now();
  if (now - store.at < EVERY_MS) return;
  // Claim the hour first, so concurrent requests / isolates don't all read the chain at once.
  await cacheSet(KEY(venue), { ...store, at: now }, KEEP_MS).catch(() => {});
  const tracked = rows.filter((r) => (r.tvlUsd ?? 0) >= MIN_TVL_USD).map((r) => r.address);
  const pools: Record<string, Snap[]> = {};
  for (const [p, snaps] of Object.entries(store.pools)) {
    const kept = snaps.filter(([t]) => now - t <= KEEP_MS);
    if (kept.length) pools[p] = kept;
  }
  for (let i = 0; i < tracked.length; i += 6) {
    await Promise.all(
      tracked.slice(i, i + 6).map(async (p) => {
        const idx = await readIndex(venue, p, view).catch(() => null);
        if (idx != null) pools[p] = [...(pools[p] ?? []), [now, idx]];
      }),
    );
  }
  await cacheSet(KEY(venue), { at: now, pools }, KEEP_MS).catch(() => {});
}

/** Realised fee APY (%) per pool, from the oldest snapshot inside the last 7 days. */
export async function poolIndexApys(venue: IndexVenue): Promise<Map<string, { apyPct: number; spanDays: number }>> {
  const { pools } = await load(venue);
  const now = Date.now();
  const out = new Map<string, { apyPct: number; spanDays: number }>();
  for (const [p, snaps] of Object.entries(pools)) {
    if (snaps.length < 2) continue;
    const last = snaps[snaps.length - 1];
    const first = snaps.find(([t]) => now - t <= WINDOW_MS);
    if (!first || first === last) continue;
    const span = last[0] - first[0];
    if (span < MIN_SPAN_MS || !(first[1] > 0)) continue;
    // A falling index can only be rounding or a share mint (protocol fee): no negative fee yield.
    const growth = Math.max(1, last[1] / first[1]);
    const apy = (Math.pow(growth, YEAR_MS / span) - 1) * 100;
    if (Number.isFinite(apy)) out.set(p, { apyPct: apy, spanDays: span / 86_400_000 });
  }
  return out;
}
