"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { apiJson } from "@/lib/api";
import { useShared } from "@/lib/useShared";

// Home's market data (services/api/src/market.ts): Stellar assets by category, DeFi TVL,
// protocols and daily network activity. Public data, no wallet needed.

export type Category = "stable" | "rwa" | "yield" | "defi" | "major" | "other";

export const CATEGORIES: { id: Category | "all"; label: string; hint: string }[] = [
  { id: "all", label: "All", hint: "Every asset listed below." },
  { id: "stable", label: "Stablecoins", hint: "Tokens pegged to a fiat currency (USD, EUR, ARS, NGN…)." },
  { id: "rwa", label: "RWA", hint: "Tokenised real-world assets: money-market funds and government bonds." },
  { id: "yield", label: "Yield-bearing", hint: "Tokens whose value grows with the yield they earn." },
  { id: "defi", label: "DeFi tokens", hint: "Governance and utility tokens of Stellar DeFi protocols." },
  { id: "major", label: "XLM & wrapped", hint: "Stellar's native XLM and wrapped BTC, ETH and XRP." },
  { id: "other", label: "Other", hint: "Other well-rated Stellar assets with a verified home domain." },
];

export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.id === c)?.label ?? c;

export type MarketAsset = {
  id: string;
  code: string;
  issuer: string | null;
  /** Soroban-only tokens: their contract (no issuer). */
  contract: string | null;
  name: string;
  domain: string | null;
  icon: string | null;
  cats: Category[];
  price: number | null;
  priceSource: "market" | "nav" | null;
  change24h: number | null;
  change7d: number | null;
  spark: number[];
  supply: number;
  marketCap: number | null;
  volume7d: number | null;
  /** null: not published (Soroban-only tokens). */
  holders: number | null;
};

export type Protocol = {
  name: string;
  category: string;
  tvl: number;
  change7d: number | null;
  logo: string | null;
  url: string | null;
  seidar: string | null;
};

export type ActivityPoint = { t: number; transactions: number; payments: number; trades: number; activeAccounts: number };

type AssetsResp = { ok?: boolean; assets?: MarketAsset[]; counts?: Record<string, number> };
type OverviewResp = {
  ok?: boolean;
  tvl: { current: number; change1d: number | null; change7d: number | null; series: { t: number; v: number }[] } | null;
  stablecoinsUsd: number | null;
  protocols: Protocol[];
  activity: ActivityPoint[];
  day: {
    t: number;
    payments: number;
    paymentsPrev: number | null;
    activeAccounts: number;
    activeAccountsPrev: number | null;
    transactions: number;
    transactionsPrev: number | null;
  } | null;
};

const TTL = 5 * 60_000;

export function useMarketAssets() {
  const { value, loading } = useShared<AssetsResp | null>("market:assets", () => apiJson<AssetsResp>("/api/market/assets"), TTL);
  const ok = value?.ok ? value : null;
  return { assets: ok?.assets ?? [], counts: ok?.counts ?? {}, loading: loading && !ok };
}

export function useMarketOverview() {
  const { value, loading } = useShared<OverviewResp | null>("market:overview", () => apiJson<OverviewResp>("/api/market/overview"), TTL);
  const ok = value?.ok ? value : null;
  return { overview: ok, loading: loading && !ok };
}

type AssetRef = { code: string; issuer: string | null; contract?: string | null };
/** CODE:ISSUER for classic assets, CODE:CONTRACT for Soroban-only tokens, XLM for lumens. */
export const assetParam = (a: AssetRef) => (a.contract ? `${a.code}:${a.contract}` : a.issuer ? `${a.code}:${a.issuer}` : "XLM");

/** Asset detail page for a market row. */
export const assetHref = (a: AssetRef) => `/asset?asset=${encodeURIComponent(assetParam(a))}`;

/** Swap with this asset preselected as the token to buy. */
export const swapHref = (a: AssetRef) => `/trade-swap/dex?buy=${encodeURIComponent(assetParam(a))}`;

export const compactUsd = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(a >= 1 ? 2 : 0)}`;
};

export const compactNum = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
};

/** Token price: more decimals for sub-cent assets. */
export const priceText = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1000) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toPrecision(3)}`;
};

export const pctText = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)}%`;

export const pctColor = (v: number | null | undefined) => (v == null || Math.abs(v) < 0.005 ? "grey.200" : v > 0 ? "green.main" : "error.main");

/** Change from `prev` to `cur` in percent. */
export const changeOf = (cur: number | null | undefined, prev: number | null | undefined) =>
  cur != null && prev ? ((cur - prev) / prev) * 100 : null;

/** Tiny line of the last 7 daily prices, green when up and red when down. */
export function Sparkline({ values, width = 96, height = 32 }: { values: number[]; width?: number; height?: number }) {
  const theme = useTheme();
  if (values.length < 2) return <Typography sx={{ color: "grey.200", fontSize: "0.875rem" }}>—</Typography>;
  // At least ±1% of the average in height, so a stablecoin's 0.1% wiggles draw flat, not as a crash.
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, mean * 0.02) || 1;
  const min = (lo + hi) / 2 - span / 2;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? theme.palette.green.main : theme.palette.error.main} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

/** Chart tooltip in the dashboard's style: a date and one or more labelled figures. */
export function ChartTip({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        minWidth: "12rem",
        p: "0.75rem 1rem",
        borderRadius: "0.75rem",
        backgroundColor: "#1A1A1A",
        border: `0.0625rem solid ${theme.palette.overlay.white08}`,
        boxShadow: `0 0.5rem 1.5rem ${theme.palette.shadow.heavy}`,
        display: "flex",
        flexDirection: "column",
        gap: "0.375rem",
      }}
    >
      <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{title}</Typography>
      {rows.map((r) => (
        <Box key={r.label} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1.5rem" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {r.color && <Box sx={{ width: "0.875rem", height: "0.25rem", borderRadius: "999rem", backgroundColor: r.color }} />}
            <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>{r.label}</Typography>
          </Box>
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "common.black" }}>{r.value}</Typography>
        </Box>
      ))}
    </Box>
  );
}

/** "Data: …" credit under cards fed by third-party sources. */
export function SourceNote({ text }: { text: string }) {
  return <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>{text}</Typography>;
}
