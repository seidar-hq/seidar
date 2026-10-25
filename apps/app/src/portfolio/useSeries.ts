"use client";

import { useMemo } from "react";
import { apiJson } from "@/lib/api";
import { useShared, useSharedMany } from "@/lib/useShared";
import type { Exposure } from "./usePortfolio";

export type Range = "1h" | "1d" | "7d" | "14d" | "30d" | "90d" | "1y";
export type SeriesPoint = { time: number; assets: number; positions: number; total: number };

type Chart = { ok?: boolean; points?: { t: number; px: number }[]; change?: number | null };

const chartable = (e: Exposure) => e.key === "native" || e.key.includes(":");
const TTL = 300_000;

/** USD price charts for every chartable exposure over `range`, keyed by exposure key. */
export function useExposureCharts(exposures: Exposure[], range: Range) {
  const keys = exposures.filter(chartable).map((e) => `chart:${range}:${e.key}`);
  const { values, loading } = useSharedMany<Chart | null>(
    keys,
    (k) => () => {
      const asset = k.split(":").slice(2).join(":");
      return apiJson<Chart>(`/api/prices/chart?asset=${encodeURIComponent(asset)}&range=${range}`);
    },
    TTL,
  );
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
  return { changes: value?.changes ?? {}, loading };
}

/** Latest price per exposure, preferring the chart's last point over the stored price. */
export function priceOf(e: Exposure, charts: Record<string, { t: number; px: number }[]>) {
  const pts = charts[e.key];
  return pts?.length ? pts[pts.length - 1].px : e.price;
}
