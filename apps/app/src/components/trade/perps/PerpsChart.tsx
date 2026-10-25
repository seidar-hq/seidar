"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { Bar, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import TokenLogo from "@/components/common/TokenLogo";
import { RESOLUTIONS, fmtPx, hourlyPct, useCandles, type Candle, type PerpsMarket } from "./usePerps";

type Row = Candle & { range: [number, number] };

/** Candle drawn inside the [low, high] bar: wick across the bar, body between open and close. */
function CandleShape(props: { x?: number; y?: number; width?: number; height?: number; payload?: Row; up: string; down: string }) {
  const { x = 0, y = 0, width = 0, height = 0, payload, up, down } = props;
  if (!payload) return null;
  const { o, c, h, l } = payload;
  const color = c >= o ? up : down;
  const span = h - l || 1e-12;
  const yOf = (v: number) => y + ((h - v) / span) * height;
  const top = yOf(Math.max(o, c));
  const bottom = yOf(Math.min(o, c));
  const bodyW = Math.max(1, width * 0.7);
  const cx = x + width / 2;
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - bodyW / 2} y={top} width={bodyW} height={Math.max(1, bottom - top)} fill={color} rx={1} />
    </g>
  );
}

const Stat = ({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>{label}</Typography>
    <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: color ?? "common.black" }} noWrap>
      {value}
    </Typography>
  </Box>
);

export default function PerpsChart({ market }: { market: PerpsMarket | null }) {
  const theme = useTheme();
  const [res, setRes] = useState<(typeof RESOLUTIONS)[number]>(RESOLUTIONS[1]);
  const { candles, loading } = useCandles(market?.market.chartSymbol ?? null, res);
  const rows: Row[] = candles.map((k) => ({ ...k, range: [k.l, k.h] }));
  const up = theme.palette.green.main;
  const down = theme.palette.error.main;
  const first = candles[0]?.o;
  const last = market?.price?.mid ?? candles[candles.length - 1]?.c;
  const change = first && last ? ((last - first) / first) * 100 : null;
  const fundL = hourlyPct(market?.rates?.current?.long.fundingPerSec);
  const fundS = hourlyPct(market?.rates?.current?.short.fundingPerSec);
  const fmtTime = (t: number) =>
    res.id === "D" ? new Date(t).toLocaleDateString([], { month: "short", day: "numeric" }) : new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        p: "1.25rem",
        borderRadius: "1.5rem",
        backgroundColor: "surfaceBg.section",
        border: (t) => `0.0625rem solid ${t.palette.border.main1000}`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Box sx={{ position: "relative", width: "2.75rem", height: "2.75rem" }}>
            <TokenLogo code="XLM" size="2.75rem" />
            <Box component="img" src="/protocols/zenex.png" alt="" sx={{ position: "absolute", right: "-0.25rem", bottom: "-0.25rem", width: "1.25rem", height: "1.25rem", borderRadius: "50%" }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: "1.25rem", fontWeight: 700, color: "common.black" }}>{market?.market.symbol ?? "XLM/USD"} Perp</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>Zenex · settles in USDC · up to {market?.limits.maxLeverage ?? "—"}x</Typography>
          </Box>
        </Box>
        <Stat label="Mark" value={`$${fmtPx(last)}`} />
        <Stat label={`Change (${res.label === "1D" ? "120d" : res.label === "4h" ? "14d" : res.label === "1h" ? "4d" : "24h"})`} value={change == null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`} color={change == null ? undefined : change >= 0 ? "green.main" : "error.main"} />
        <Stat label="Bid / Ask" value={market?.price ? `${fmtPx(market.price.bid)} / ${fmtPx(market.price.ask)}` : "—"} />
        <Stat label="Funding /1h (L · S)" value={fundL == null ? "—" : `${fundL.toFixed(4)}% · ${(fundS ?? 0).toFixed(4)}%`} />
        <Stat label="Open interest (L · S)" value={market ? `$${market.openInterest.long.toFixed(0)} · $${market.openInterest.short.toFixed(0)}` : "—"} />
        {market && market.market.status !== 0 && <Stat label="Market" value={market.market.statusLabel} color="orange.main" />}
      </Box>

      <Box sx={{ height: "24rem" }}>
        {loading ? (
          <Skeleton variant="rounded" height="100%" sx={{ background: theme.palette.overlay.white04 }} />
        ) : rows.length === 0 ? (
          <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography sx={{ color: "grey.200" }}>No candles for this range yet.</Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="t" tickFormatter={fmtTime} tick={{ fill: theme.palette.grey[200], fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={40} />
              <YAxis orientation="right" domain={["dataMin", "dataMax"]} tickFormatter={(v) => fmtPx(Number(v))} tick={{ fill: theme.palette.grey[200], fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
              <ChartTooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{ background: "#1F1F1F", border: "1px solid #323232", borderRadius: 12 }}
                labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
                formatter={(_v, _n, item) => {
                  const p = (item as { payload?: Row }).payload;
                  return p ? [`O ${fmtPx(p.o)}  H ${fmtPx(p.h)}  L ${fmtPx(p.l)}  C ${fmtPx(p.c)}`, ""] : ["", ""];
                }}
              />
              {last != null && <ReferenceLine y={last} stroke={theme.palette.grey[200]} strokeDasharray="4 4" />}
              <Bar dataKey="range" isAnimationActive={false} shape={(p: object) => <CandleShape {...(p as object)} up={up} down={down} />} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Box>
      <Box sx={{ display: "flex", gap: "0.375rem" }}>
        {RESOLUTIONS.map((r) => (
          <ButtonBase
            key={r.id}
            onClick={() => setRes(r)}
            sx={{ height: "1.875rem", px: "0.75rem", borderRadius: "999rem", fontSize: "0.8125rem", color: res.id === r.id ? "sidebar.white" : "grey.200", backgroundColor: res.id === r.id ? "sidebar.primary" : "overlay.white04" }}
          >
            {r.label}
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
}
