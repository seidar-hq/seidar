"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import { Measured, MeasuredBlock } from "@/components/common/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip } from "recharts";
import { SectionCard } from "@/components/common/SectionCard";
import TokenLogo from "@/components/common/TokenLogo";
import ZoomChart from "@/components/common/ZoomChart";
import { formatUsd } from "@/lib/format";
import type { Portfolio } from "@/portfolio/usePortfolio";
import type { Range } from "@/portfolio/useSeries";
import type { CopyItem } from "./discoverData";
import type { PnlResult } from "./pnl";
import { riskColor, type RiskReport } from "./risk";
import { CardTitle, Segmented, Stat } from "./parts";

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${formatUsd(Math.abs(v))}`;
const pctSigned = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`);

export const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];

// ---------------------------------------------------------------- performance

export function PerformanceCard({ pnl, range, onRange }: { pnl: PnlResult; range: Range; onRange: (r: Range) => void }) {
  const theme = useTheme();
  const [mode, setMode] = useState<"pnl" | "value">("pnl");
  const up = pnl.pnl >= 0;
  const color = mode === "value" ? theme.palette.sidebar.primary : up ? "#17B26A" : "#FF3B47";
  const series = useMemo(
    () => [
      {
        id: mode,
        label: mode === "pnl" ? "Profit / loss" : "Value",
        color,
        kind: "area" as const,
        points: pnl.series.map((p) => ({ t: p.t, v: mode === "pnl" ? p.pnl : p.value })),
      },
    ],
    [pnl.series, mode, color],
  );
  const busy = pnl.loading;
  const rangeLabel = RANGES.find((r) => r.value === range)?.label ?? range;

  return (
    <SectionCard>
      <CardTitle
        sub="Estimated from the wallet's own history: price moves and trades count, deposits and withdrawals don't."
        right={
          <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: "pnl", label: "P&L" },
                { value: "value", label: "Value" },
              ]}
            />
            <Segmented size="sm" value={range} onChange={onRange} options={RANGES} />
          </Box>
        }
      >
        Profit &amp; loss
      </CardTitle>

      <Measured loading={busy}>
        <Box sx={{ display: "grid", gap: "1rem", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, px: "0.25rem" }}>
          <Stat label={`P&L · ${rangeLabel}`} value={signed(pnl.pnl)} color={up ? "green.main" : "error.main"} sub={pctSigned(pnl.pnlPct)} />
          <Stat label="Value" value={formatUsd(pnl.endValue)} sub={`from ${formatUsd(pnl.startValue)}`} />
          <Stat label="Deposited" value={formatUsd(pnl.deposits)} sub="transfers in" />
          <Stat label="Withdrawn" value={formatUsd(pnl.withdrawals)} sub="transfers out" />
        </Box>
      </Measured>

      <MeasuredBlock loading={busy} height="17rem">
        {pnl.series.length < 2 ? (
          <Box sx={{ height: "17rem", display: "grid", placeItems: "center" }}>
            <Typography color="grey.200">No price history for this wallet&apos;s holdings.</Typography>
          </Box>
        ) : (
          <ZoomChart series={series} height="17rem" format={(v) => (mode === "pnl" ? signed(v) : formatUsd(v))} intraday={range === "1d" || range === "7d"} fitKey={`${range}:${mode}`} />
        )}
      </MeasuredBlock>

      {!pnl.loading && !pnl.complete && (
        <Typography variant="caption" sx={{ color: "#F5B83D", px: "0.25rem" }}>
          This wallet made more transactions than Seidar reads at once (800), so the start of the period assumes nothing changed before its oldest one.
        </Typography>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------- risk

function Gauge({ score, color }: { score: number; color: string }) {
  // Half circle, 0 at the left, 100 at the right.
  const r = 70;
  const c = Math.PI * r;
  return (
    <Box sx={{ position: "relative", width: "11rem", height: "6.5rem" }}>
      <svg viewBox="0 0 180 100" width="100%" height="100%">
        <defs>
          <linearGradient id="riskTrack" x1="0" x2="1">
            <stop offset="0%" stopColor="#17B26A" />
            <stop offset="45%" stopColor="#F5B83D" />
            <stop offset="75%" stopColor="#FF7A45" />
            <stop offset="100%" stopColor="#FF3B47" />
          </linearGradient>
        </defs>
        <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="url(#riskTrack)" strokeOpacity={0.18} strokeWidth={12} strokeLinecap="round" />
        <path
          d="M 20 90 A 70 70 0 0 1 160 90"
          fill="none"
          stroke="url(#riskTrack)"
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${(c * score) / 100} ${c}`}
          style={{ transition: "stroke-dasharray 600ms ease" }}
        />
      </svg>
      <Box sx={{ position: "absolute", left: 0, right: 0, bottom: 0, textAlign: "center" }}>
        <Typography sx={{ fontSize: "2rem", fontWeight: 700, color, lineHeight: 1 }}>{score}</Typography>
        <Typography variant="caption" color="grey.200">
          out of 100
        </Typography>
      </Box>
    </Box>
  );
}

export function RiskCard({ report, loading }: { report: RiskReport | null; loading: boolean }) {
  return (
    <SectionCard sx={{ height: "100%" }}>
      <CardTitle
        sub="How exposed this wallet is right now"
        right={
          <Tooltip title="A summary of today's exposure from live figures (loans, price swings, concentration, stablecoins, protocols, unpriced tokens). It doesn't predict returns.">
            <InfoOutlinedIcon sx={{ fontSize: "1.125rem", color: "grey.200" }} />
          </Tooltip>
        }
      >
        Risk score
      </CardTitle>
      {!report ? (
        loading ? (
          <MeasuredBlock loading height="16rem">
            {null}
          </MeasuredBlock>
        ) : (
          <Typography color="grey.200" sx={{ py: "2rem", textAlign: "center" }}>
            Nothing held to score.
          </Typography>
        )
      ) : (
        <>
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.375rem" }}>
            <Gauge score={report.score} color={riskColor(report.level)} />
            <Typography sx={{ fontWeight: 600, color: riskColor(report.level), whiteSpace: "nowrap" }}>{report.label}</Typography>
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {report.factors.map((f) => {
              const c = riskColor(f.score < 30 ? "low" : f.score < 55 ? "medium" : f.score < 75 ? "high" : "very high");
              return (
                <Box key={f.id}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", mb: "0.25rem" }}>
                    <Typography sx={{ fontSize: "0.8125rem", color: "common.black", fontWeight: 500 }}>{f.label}</Typography>
                    <Typography variant="caption" color="grey.200" noWrap sx={{ minWidth: 0 }}>
                      {f.detail}
                    </Typography>
                  </Box>
                  <Box sx={{ height: "0.3125rem", borderRadius: "999rem", backgroundColor: "overlay.white08", overflow: "hidden" }}>
                    <Box sx={{ width: `${Math.max(3, f.score)}%`, height: "100%", borderRadius: "999rem", backgroundColor: c, transition: "width 500ms ease" }} />
                  </Box>
                </Box>
              );
            })}
          </Box>
        </>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------- allocation

type Slice = { key: string; name: string; usd: number; pct: number; logo?: { code: string; issuer: string | null } | { src?: string } };

export function AllocationCard({ portfolio, items, loading }: { portfolio: Portfolio; items: CopyItem[]; loading: boolean }) {
  const [view, setView] = useState<"assets" | "protocols">("assets");
  const colors = ["#5C84FF", "#8DE8FF", "#346CFF", "#AEBFFF", "#17B26A", "#F5B83D", "#B58CFF", "#5B5B5B"];

  const slices = useMemo<Slice[]>(() => {
    const rows: Omit<Slice, "pct">[] = [];
    if (view === "assets") {
      for (const e of portfolio.exposures) {
        const usd = (e.assets + e.positions) * e.price;
        if (usd > 0) rows.push({ key: e.key, name: e.code, usd, logo: { code: e.code, issuer: e.issuer } });
      }
    } else {
      const by = new Map<string, Omit<Slice, "pct">>();
      for (const i of items) {
        const k = i.protocol.id;
        const r = by.get(k) ?? { key: k, name: i.protocol.name, usd: 0, logo: { src: i.protocol.logo } };
        r.usd += i.usd;
        by.set(k, r);
      }
      rows.push(...by.values());
    }
    const total = rows.reduce((s, r) => s + r.usd, 0);
    if (total <= 0) return [];
    const all = rows.map((r) => ({ ...r, pct: (r.usd / total) * 100 })).sort((a, b) => b.usd - a.usd);
    if (all.length <= 7) return all;
    const rest = all.slice(6);
    return [...all.slice(0, 6), { key: "other", name: `${rest.length} more`, usd: rest.reduce((s, r) => s + r.usd, 0), pct: rest.reduce((s, r) => s + r.pct, 0) }];
  }, [view, portfolio.exposures, items]);

  return (
    <SectionCard sx={{ height: "100%" }}>
      <CardTitle
        sub="Where the money sits"
        right={
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "assets", label: "Assets" },
              { value: "protocols", label: "Protocols" },
            ]}
          />
        }
      >
        Allocation
      </CardTitle>
      {loading || slices.length === 0 ? (
        loading ? (
          <MeasuredBlock loading height="16rem">
            {null}
          </MeasuredBlock>
        ) : (
          <Typography color="grey.200" sx={{ py: "2rem", textAlign: "center" }}>
            Nothing held.
          </Typography>
        )
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          <Box sx={{ width: "10.5rem", height: "10.5rem", position: "relative" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} dataKey="usd" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={1} cornerRadius={4} stroke="none" isAnimationActive>
                  {slices.map((s, i) => (
                    <Cell key={s.key} fill={colors[i % colors.length]} />
                  ))}
                </Pie>
                <ChartTooltip
                  content={({ active, payload }) => {
                    const s = active ? (payload?.[0]?.payload as Slice | undefined) : undefined;
                    if (!s) return null;
                    return (
                      <Box sx={{ p: "0.5rem 0.75rem", borderRadius: "0.625rem", backgroundColor: "surfaceBg.main", border: `0.0625rem solid ${alpha("#fff", 0.08)}` }}>
                        <Typography variant="caption" color="common.black">
                          {s.name} · {formatUsd(s.usd)}
                        </Typography>
                      </Box>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <Box sx={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
              <Typography sx={{ fontSize: "0.75rem", color: "grey.200", textAlign: "center", lineHeight: 1.3 }}>
                {slices.length}
                <br />
                {view === "assets" ? "assets" : "venues"}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {slices.map((s, i) => (
              <Box key={s.key} sx={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <Box sx={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", backgroundColor: colors[i % colors.length], flexShrink: 0 }} />
                {s.logo && "code" in s.logo ? (
                  <TokenLogo code={s.logo.code} issuer={s.logo.issuer} size="1.25rem" />
                ) : s.logo && "src" in s.logo && s.logo.src ? (
                  <Box component="img" src={s.logo.src} alt="" sx={{ width: "1.25rem", height: "1.25rem", borderRadius: "50%" }} />
                ) : null}
                <Typography sx={{ fontSize: "0.8125rem", color: "common.black", flex: 1, minWidth: 0 }} noWrap>
                  {s.name}
                </Typography>
                <Typography variant="caption" color="grey.200">
                  {formatUsd(s.usd)}
                </Typography>
                <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "common.black", width: "3.25rem", textAlign: "right" }}>{s.pct.toFixed(1)}%</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </SectionCard>
  );
}
