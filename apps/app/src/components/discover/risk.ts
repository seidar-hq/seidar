// Wallet risk score, 0 (calm) to 100 (very risky), from live figures only. Each factor scores
// 0-100 and carries a weight; the score is their weighted mean. Nothing here predicts the future:
// it summarises how exposed the wallet is right now.
//
//   Leverage       health factor of its loans and how much of its value is borrowed
//   Volatility     annualised swing of the portfolio's value over the last 30 days
//   Concentration  how much rides on one asset (Herfindahl index of net exposure)
//   Stability      share held in stablecoins
//   Protocols      share deployed in DeFi contracts, and any frozen / on-ice pools
//   Asset quality  share in tokens without a reliable market price

import type { Exposure } from "@/portfolio/usePortfolio";
import type { SeriesPoint } from "@/portfolio/useSeries";
import { isStable, type CopyItem, type RiskLevel } from "./discoverData";

export type RiskFactor = { id: string; label: string; score: number; weight: number; detail: string };
export type RiskReport = { score: number; level: RiskLevel | "very high"; label: string; factors: RiskFactor[] };

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export function annualisedVol(series: SeriesPoint[]): number | null {
  const pts = series.filter((p) => p.total > 0);
  if (pts.length < 6) return null;
  const rets: number[] = [];
  for (let i = 1; i < pts.length; i++) rets.push(Math.log(pts[i].total / pts[i - 1].total));
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  const stepMs = (pts[pts.length - 1].time - pts[0].time) / (pts.length - 1);
  if (!(stepMs > 0)) return null;
  const perYear = (365 * 86_400_000) / stepMs;
  return sd * Math.sqrt(perYear) * 100;
}

export function riskReport(input: {
  exposures: Exposure[];
  totals: { totalUsd: number; borrowedUsd: number; utilisedUsd: number };
  healthFactor: number | null;
  items: CopyItem[];
  /** Tokens held that have no market price (their value is unknown). */
  unpricedCount: number;
  series30d: SeriesPoint[];
}): RiskReport | null {
  const { exposures, totals, healthFactor, items } = input;
  const gross = exposures.map((e) => ({ e, usd: Math.max(0, (e.assets + e.positions) * e.price) })).filter((x) => x.usd > 0);
  const total = gross.reduce((s, x) => s + x.usd, 0);
  if (!(totals.totalUsd > 1) || total <= 0) return null;

  // Leverage
  const borrowShare = totals.utilisedUsd > 0 ? totals.borrowedUsd / totals.utilisedUsd : 0;
  let lev = 0;
  let levDetail = "No loans";
  if (totals.borrowedUsd > 1) {
    const hf = healthFactor;
    const hfRisk = hf == null ? 50 : hf >= 3 ? 15 : hf >= 2 ? 30 : hf >= 1.5 ? 50 : hf >= 1.2 ? 75 : 95;
    lev = clamp(Math.max(hfRisk, borrowShare * 100));
    levDetail = `${Math.round(borrowShare * 100)}% of deposits borrowed${hf != null ? ` · health ${hf.toFixed(2)}` : ""}`;
  }

  // Volatility
  const vol = annualisedVol(input.series30d);
  const volScore = vol == null ? 50 : clamp((vol / 90) * 100);
  const volDetail = vol == null ? "Not enough price history" : `${vol.toFixed(0)}% a year (30-day)`;

  // Concentration
  const hhi = gross.reduce((s, x) => s + (x.usd / total) ** 2, 0);
  const top = gross.sort((a, b) => b.usd - a.usd)[0];
  const conc = clamp(((hhi - 0.15) / 0.85) * 100);
  const concDetail = `${top.e.code} is ${Math.round((top.usd / total) * 100)}% of holdings`;

  // Stability
  const stableUsd = gross.filter((x) => isStable(x.e.code, x.e.price)).reduce((s, x) => s + x.usd, 0);
  const stab = clamp(100 - (stableUsd / total) * 100);
  const stabDetail = `${Math.round((stableUsd / total) * 100)}% in stablecoins`;

  // Protocols
  const deployed = totals.totalUsd > 0 ? Math.min(1, totals.utilisedUsd / (totals.totalUsd + totals.borrowedUsd)) : 0;
  const shaky = items.filter((i) => i.kind !== "token" && i.risk.level === "high").reduce((s, i) => s + i.usd, 0);
  const protocols = new Set(items.filter((i) => i.kind !== "token").map((i) => i.protocol.id)).size;
  const prot = clamp(deployed * 60 + (totals.utilisedUsd > 0 ? (shaky / totals.utilisedUsd) * 40 : 0));
  const protDetail = protocols ? `${Math.round(deployed * 100)}% deployed across ${protocols} protocol${protocols === 1 ? "" : "s"}` : "Nothing deployed in DeFi";

  // Asset quality
  const unpriced = clamp(input.unpricedCount * 12);
  const qualDetail = input.unpricedCount ? `${input.unpricedCount} token${input.unpricedCount === 1 ? "" : "s"} without a market price` : "Every holding has a market price";

  const factors: RiskFactor[] = [
    { id: "leverage", label: "Leverage", score: lev, weight: 0.25, detail: levDetail },
    { id: "volatility", label: "Volatility", score: volScore, weight: 0.25, detail: volDetail },
    { id: "concentration", label: "Concentration", score: conc, weight: 0.2, detail: concDetail },
    { id: "stability", label: "Stablecoin share", score: stab, weight: 0.1, detail: stabDetail },
    { id: "protocols", label: "Protocol exposure", score: prot, weight: 0.12, detail: protDetail },
    { id: "quality", label: "Asset quality", score: unpriced, weight: 0.08, detail: qualDetail },
  ];
  const score = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0));
  const level = score < 30 ? "low" : score < 55 ? "medium" : score < 75 ? "high" : "very high";
  const label = level === "low" ? "Low risk" : level === "medium" ? "Moderate risk" : level === "high" ? "High risk" : "Very high risk";
  return { score, level, label, factors };
}

/** Risk of a copy: the selected items' levels weighted by the money each gets. */
export function copyRisk(alloc: { item: CopyItem; usd: number }[]): { level: RiskLevel; score: number } | null {
  const t = alloc.reduce((s, a) => s + a.usd, 0);
  if (!(t > 0)) return null;
  const v = { low: 20, medium: 50, high: 85 } as const;
  const score = Math.round(alloc.reduce((s, a) => s + v[a.item.risk.level] * a.usd, 0) / t);
  return { score, level: score < 35 ? "low" : score < 62 ? "medium" : "high" };
}

export const riskColor = (level: string) => (level === "low" ? "#17B26A" : level === "medium" ? "#F5B83D" : level === "high" ? "#FF7A45" : "#FF3B47");
