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

// ---------------------------------------------------------------- Sushi V3 (concentrated liquidity)
//
// A concentrated pool's reserves don't follow x*y=k, so the invariant above doesn't apply. The pool
// keeps its own fee accounting instead: fee_growth_global_{0,1}_x128 is the fees earned per unit of
// liquidity since launch (after the protocol's cut), in Q128. Over a span, the fees LPs earned are
//   fees_i = (growth_i(now) - growth_i(then)) * activeLiquidity / 2^128      (token i base units)
// valued in USD and set against the pool's TVL, then compounded to a year like the rest.

type SushiSnap = [t: number, g0: string, g1: string, liq: string];
type SushiStore = { at: number; pools: Record<string, SushiSnap[]> };
const SUSHI_KEY = "poolapy:v1:sushi";
const Q128 = 2n ** 128n;

const bigOf = (v: unknown): bigint | null => {
  const x = Array.isArray(v) ? v[0] : v; // views return a 1-tuple for U256
  try {
    return typeof x === "bigint" ? x : typeof x === "string" && /^\d+$/.test(x) ? BigInt(x) : typeof x === "number" && Number.isSafeInteger(x) ? BigInt(x) : null;
  } catch {
    return null;
  }
};

export async function recordSushiGrowth(rows: { address: string; tvlUsd: number | null }[], view: View): Promise<void> {
  const hit = await cacheGetEntry<SushiStore>(SUSHI_KEY).catch(() => null);
  const store: SushiStore = hit?.value?.pools ? hit.value : { at: 0, pools: {} };
  const now = Date.now();
  if (now - store.at < EVERY_MS) return;
  await cacheSet(SUSHI_KEY, { ...store, at: now }, KEEP_MS).catch(() => {});
  const tracked = rows.filter((r) => (r.tvlUsd ?? 0) >= MIN_TVL_USD).map((r) => r.address);
  const pools: Record<string, SushiSnap[]> = {};
  for (const [p, snaps] of Object.entries(store.pools)) {
    const kept = snaps.filter(([t]) => now - t <= KEEP_MS);
    if (kept.length) pools[p] = kept;
  }
  for (let i = 0; i < tracked.length; i += 4) {
    await Promise.all(
      tracked.slice(i, i + 4).map(async (p) => {
        const [g0, g1, liq] = await Promise.all([
          view(p, "fee_growth_global_0_x128").catch(() => null),
          view(p, "fee_growth_global_1_x128").catch(() => null),
          view(p, "liquidity").catch(() => null),
        ]);
        const a = bigOf(g0);
        const b = bigOf(g1);
        const l = bigOf(liq);
        if (a != null && b != null && l != null) pools[p] = [...(pools[p] ?? []), [now, a.toString(), b.toString(), l.toString()]];
      }),
    );
  }
  await cacheSet(SUSHI_KEY, { at: now, pools }, KEEP_MS).catch(() => {});
}

/**
 * Realised fee APY (%) for Sushi pools. `pool` gives each pool's TVL and, per token, its decimals
 * and USD price (null when unpriced: that pool gets no APY rather than a wrong one).
 */
export async function sushiGrowthApys(
  pool: (address: string) => { tvlUsd: number | null; tokens: { decimals: number; priceUsd: number | null }[] } | null,
): Promise<Map<string, { apyPct: number; spanDays: number }>> {
  const hit = await cacheGetEntry<SushiStore>(SUSHI_KEY).catch(() => null);
  const pools = hit?.value?.pools ?? {};
  const now = Date.now();
  const out = new Map<string, { apyPct: number; spanDays: number }>();
  for (const [p, snaps] of Object.entries(pools)) {
    const info = pool(p);
    if (!info || !(info.tvlUsd && info.tvlUsd > 0) || info.tokens.length < 2 || info.tokens.some((t) => t.priceUsd == null)) continue;
    const last = snaps[snaps.length - 1];
    const first = snaps.find(([t]) => now - t <= WINDOW_MS);
    if (!first || !last || first === last) continue;
    const span = last[0] - first[0];
    if (span < MIN_SPAN_MS) continue;
    // Active liquidity moves as positions come and go: use the average over the span.
    const inSpan = snaps.filter(([t]) => t >= first[0]);
    const avgL = inSpan.reduce((s, x) => s + BigInt(x[3]), 0n) / BigInt(inSpan.length);
    let feesUsd = 0;
    for (let i = 0; i < 2; i++) {
      const d = BigInt(last[1 + i] as string) - BigInt(first[1 + i] as string);
      if (d <= 0n) continue;
      const units = Number((d * avgL) / Q128) / 10 ** info.tokens[i].decimals;
      feesUsd += units * (info.tokens[i].priceUsd as number);
    }
    const apy = (Math.pow(1 + feesUsd / info.tvlUsd, YEAR_MS / span) - 1) * 100;
    if (Number.isFinite(apy)) out.set(p, { apyPct: apy, spanDays: span / 86_400_000 });
  }
  return out;
}
