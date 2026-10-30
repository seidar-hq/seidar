"use client";

import { useEffect, useMemo, useRef } from "react";
import { apiJson } from "@/lib/api";
import { loadShared, useShared, useSharedMany } from "@/lib/useShared";
import type { Exposure } from "./usePortfolio";

export type Range = "1h" | "1d" | "7d" | "14d" | "30d" | "90d" | "1y";
export type SeriesPoint = { time: number; assets: number; positions: number; total: number };

type Chart = { ok?: boolean; points?: { t: number; px: number }[]; change?: number | null };

const chartable = (e: Exposure) => e.key === "native" || e.key.includes(":");
const TTL = 300_000;

const chartLoader = (k: string) => () => {
  const [, range, ...rest] = k.split(":");
  return apiJson<Chart>(`/api/prices/chart?asset=${encodeURIComponent(rest.join(":"))}&range=${range}`);
};

const PREFETCH: Range[] = ["1d", "7d", "30d", "90d", "1y"];

/** USD price charts for every chartable exposure over `range`, keyed by exposure key. */
export function useExposureCharts(exposures: Exposure[], range: Range) {
  const assets = exposures.filter(chartable).map((e) => e.key);
  const keys = assets.map((a) => `chart:${range}:${a}`);
  const { values, loading } = useSharedMany<Chart | null>(keys, chartLoader, TTL);
  // Once this range is in, quietly load the other periods so switching is instant.
  const sig = assets.join(",");
  useEffect(() => {
    if (loading || !assets.length) return;
    const ric = (globalThis as { requestIdleCallback?: (f: () => void) => number }).requestIdleCallback;
    const idle = (cb: () => void) => (ric ? ric(cb) : setTimeout(cb, 400));
    idle(() => {
      for (const r of PREFETCH) if (r !== range) for (const a of assets) void loadShared(`chart:${r}:${a}`, chartLoader(`chart:${r}:${a}`), TTL).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, sig, range]);
  const charts: Record<string, { t: number; px: number }[]> = {};
  for (const e of exposures) {
    const pts = values[`chart:${range}:${e.key}`]?.points;
    if (pts?.length) charts[e.key] = pts;
  }
  return { charts, loading };
}

/**
 * Portfolio value over time: today's holdings at each point's prices. Assets without a market
 * chart contribute their current value as a flat line.
 */
export function usePortfolioSeries(exposures: Exposure[], range: Range) {
  const { charts, loading } = useExposureCharts(exposures, range);

  const series = useMemo<SeriesPoint[]>(() => {
    const withChart = exposures.filter((e) => charts[e.key]);
    if (withChart.length === 0) return [];
    const grid = withChart.map((e) => charts[e.key]).sort((a, b) => b.length - a.length)[0].map((p) => p.t);
    const flat = exposures
      .filter((e) => !charts[e.key])
      .reduce((s, e) => ({ a: s.a + e.assets * e.price, p: s.p + e.positions * e.price }), { a: 0, p: 0 });
    // The longest chart sets the time grid; every series is read at those times, carrying prices forward.
    const lookup = withChart.map((e) => {
      const pts = charts[e.key];
      let j = 0;
      return (t: number) => {
        while (j + 1 < pts.length && pts[j + 1].t <= t) j++;
        return pts[j].t <= t || j === 0 ? pts[j].px : e.price;
      };
    });
    return grid.map((t) => {
      let assets = flat.a;
      let positions = flat.p;
      for (const [k, e] of withChart.entries()) {
        const px = lookup[k](t);
        assets += e.assets * px;
        positions += e.positions * px;
      }
      return { time: t, assets, positions, total: assets + positions };
    });
  }, [exposures, charts]);

  return { series, loading };
}

/** % change per exposure key over `range` (null when no market data). */
export function usePriceChanges(exposures: Exposure[], range: Range) {
  const assets = exposures.filter(chartable).map((e) => e.key);
  const key = assets.length ? `changes:${range}:${[...assets].sort().join(",")}` : null;
  const { value, loading } = useShared<{ changes?: Record<string, number | null> } | null>(
    key,
    () =>
      apiJson(`/api/prices/changes?assets=${encodeURIComponent(assets.join(","))}&range=${range}`),
    TTL,
  );
  // The key is the asset set, so a deposit or withdrawal that adds or drops an asset starts a new
  // key with no data: keep the last changes on screen until it arrives (else the movers and the
  // performance KPI flash back to skeletons).
  // Only within the same range: switching 1d -> 7d must not show 1d numbers as 7d.
  const last = useRef<{ range: Range; changes: Record<string, number | null> } | null>(null);
  if (value?.changes) last.current = { range, changes: value.changes };
  const held = last.current?.range === range ? last.current.changes : null;
  return { changes: value?.changes ?? (loading && held ? held : {}), loading: loading && !held };
}

/**
 * 24h performance of everything held: each asset's net exposure (wallet + positions) times its
 * move. `base` is the value a day ago (0 while nothing is priced yet).
 */
export function usePerformance24h(exposures: Exposure[]) {
  const { changes, loading } = usePriceChanges(exposures, "1d");
  let base = 0;
  let delta = 0;
  for (const e of exposures) {
    const usd = (e.assets + e.positions) * e.price;
    const c = changes[e.key];
    if (c == null || !usd) continue;
    base += usd / (1 + c / 100);
    delta += usd - usd / (1 + c / 100);
  }
  return { pct: base > 0 ? (delta / base) * 100 : 0, delta, base, loading };
}

/** Latest price per exposure, preferring the chart's last point over the stored price. */
export function priceOf(e: Exposure, charts: Record<string, { t: number; px: number }[]>) {
  const pts = charts[e.key];
  return pts?.length ? pts[pts.length - 1].px : e.price;
}
