"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { alpha, styled, useTheme } from "@mui/material/styles";
import { Area, AreaChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import PeriodButtons, { type Period } from "@/components/common/PeriodButtons";
import TokenLogo from "@/components/common/TokenLogo";
import { apiJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { useShared } from "@/lib/useShared";
import type { Range } from "@/portfolio/useSeries";
import type { SwapToken } from "@/components/swap/TokenSelectDialog";

const Card = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  padding: "1.25rem",
  borderRadius: "1.5rem",
  backgroundColor: theme.palette.surfaceBg.section,
  border: `0.0625rem solid ${theme.palette.border.main1000}`,
}));

const PERIODS: Period<Range>[] = [
  { value: "1h", label: "1h" },
  { value: "1d", label: "1d" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "1y", label: "1y" },
];

const ref = (t: SwapToken) => (!t.issuer && t.code === "XLM" ? "native" : t.issuer ? `${t.code}:${t.issuer}` : null);

/**
 * Price of the selected pair (base in quote units) from Stellar's own trade history (order book
 * and AMM trades via Horizon). Covers classic assets; Soroban-only tokens have no such history.
 */
export default function PairChart({ base, quote }: { base: SwapToken | null; quote: SwapToken | null }) {
  const theme = useTheme();
  const [range, setRange] = useState<Range>("1d");
  const a = base ? ref(base) : null;
  const b = quote ? ref(quote) : null;
  const key = a && b && a !== b ? `pair:${a}:${b}:${range}` : null;
  const { value, loading } = useShared<{ ok?: boolean; points?: { t: number; px: number }[]; change?: number | null } | null>(
    key,
    () => apiJson(`/api/prices/chart?asset=${encodeURIComponent(a!)}&counter=${encodeURIComponent(b!)}&range=${range}`),
    60_000,
  );
  const pts = value?.ok ? (value.points ?? []) : [];
  const last = pts[pts.length - 1]?.px;
  const change = value?.ok ? (value.change ?? null) : null;
  const up = (change ?? 0) >= 0;
  const color = up ? theme.palette.green.main : theme.palette.error.main;
  const fmtTime = (t: number) =>
    range === "1h" || range === "1d"
      ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <Card>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {base && quote && (
            <Box sx={{ display: "flex" }}>
              <TokenLogo code={base.code} issuer={base.issuer} size="2rem" />
              <Box sx={{ ml: "-0.5rem" }}>
                <TokenLogo code={quote.code} issuer={quote.issuer} size="2rem" />
              </Box>
            </Box>
          )}
          <Box>
            <Typography variant="subtitle2" color="common.black">
              {base && quote ? `${base.code} / ${quote.code}` : "Select a pair"}
            </Typography>
            {last != null && (
              <Box sx={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                <Typography variant="h6" color="common.black">
                  {formatAmount(last, 7)}
                </Typography>
                {change != null && (
                  <Typography variant="subtitle3" color={up ? "green.main" : "error.main"}>
                    {up ? "+" : ""}
                    {change.toFixed(2)}%
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        </Box>
        <PeriodButtons periods={PERIODS} value={range} onChange={setRange} noTopMargin />
      </Box>
      <Box sx={{ height: "22rem", position: "relative" }}>
        {!key ? (
          <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography variant="subtitle2" color="grey.200">
              {base && quote && (!a || !b) ? "No Stellar market history for this token yet." : "Pick two different tokens to see their chart."}
            </Typography>
          </Box>
        ) : loading && !pts.length ? (
          <Skeleton variant="rectangular" animation="wave" sx={{ height: "100%", borderRadius: "0.75rem" }} />
        ) : pts.length < 2 ? (
          <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography variant="subtitle2" color="grey.200">
              No trades for this pair in this period.
            </Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pts} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="pair-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={alpha(color, 0.45)} />
                  <stop offset="100%" stopColor={alpha(color, 0)} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                tickFormatter={fmtTime}
                minTickGap={48}
                tick={{ fill: theme.palette.grey[200], fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                orientation="right"
                domain={["auto", "auto"]}
                width={70}
                tickFormatter={(v: number) => formatAmount(v, 5)}
                tick={{ fill: theme.palette.grey[200], fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <ChartTooltip
                cursor={{ stroke: theme.palette.overlay.white20 }}
                content={({ active, payload }) => {
                  const p = active ? (payload?.[0]?.payload as { t: number; px: number } | undefined) : undefined;
                  if (!p) return null;
                  return (
                    <Box sx={{ p: "0.5rem 0.75rem", borderRadius: "0.5rem", backgroundColor: "surfaceBg.main" }}>
                      <Typography variant="caption" color="grey.200">
                        {new Date(p.t).toLocaleString()}
                      </Typography>
                      <Typography variant="subtitle1" color="common.black">
                        {formatAmount(p.px, 7)} {quote?.code}
                      </Typography>
                    </Box>
                  );
                }}
              />
              <Area type="monotone" dataKey="px" stroke={color} strokeWidth={2} fill="url(#pair-grad)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Card>
  );
}
