// Share-price history for vaults run on Upshift's backend (August Digital): the Gami vaults and
// Sentora Evergreen. Soroban RPC only reads current state, so past share prices come from here.
// Public, keyless. asset_share_ratio is total_assets / total_shares, the same share price we read
// on-chain (checked 2026-11-07: both 1.027838 on Evergreen). No holder count is exposed.

import { withCache } from "@seidar/cache";
import { apyFromSeries, type PpsPoint } from "@seidar/vaults";

const AUGUST = "https://api.augustdigital.io/api/v1";
/** About 14 h apart, so this is roughly the last 70 days. */
const CHART_POINTS = 120;

/** Share prices oldest first. Snapshots from before the first deposit say nothing about the price. */
export function augustPoints(snapshots: unknown): PpsPoint[] {
  if (!Array.isArray(snapshots)) return [];
  return snapshots
    .map((s: { snapshot_datetime?: unknown; asset_share_ratio?: unknown; total_shares?: unknown }) => ({
      // The timestamps are UTC, written without a zone.
      t: Date.parse(`${String(s?.snapshot_datetime ?? "")}Z`),
      pps: Number(s?.asset_share_ratio),
      shares: Number(s?.total_shares),
    }))
    .filter((p) => Number.isFinite(p.t) && p.pps > 0 && p.shares > 0)
    .map(({ t, pps }) => ({ t, pps }))
    .sort((a, b) => a.t - b.t);
}

/** Realized APY in percent: the figure Upshift publishes (a fraction), so ours matches its site. */
export function augustApy(historicalApy: unknown, days: 7 | 30, points: PpsPoint[]): number | null {
  const v = (historicalApy as Record<string, unknown> | null | undefined)?.[days];
  // The share price moves in uneven steps, so this estimate is only the fallback.
  return typeof v === "number" && Number.isFinite(v) ? v * 100 : apyFromSeries(points, days);
}

/** Chart points and realized APY; empty when the source is unreachable (the page shows "—"). */
export async function vaultHistory(address: string) {
  const out = await withCache(
    `vaults:august:${address}`,
    30 * 60_000,
    async () => {
      const r = await fetch(`${AUGUST}/tokenized_vault/${address}`, { signal: AbortSignal.timeout(20_000), headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`august ${r.status}`);
      const j = (await r.json()) as { historical_snapshots?: unknown; historical_apy?: unknown };
      const points = augustPoints(j.historical_snapshots);
      return { history: points.slice(-CHART_POINTS), ownApy7d: augustApy(j.historical_apy, 7, points), ownApy30d: augustApy(j.historical_apy, 30, points) };
    },
    { swr: true },
  ).catch(() => null);
  return out?.value ?? { history: [], ownApy7d: null, ownApy30d: null };
}
