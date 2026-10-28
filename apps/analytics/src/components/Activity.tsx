"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { int, shortDay, usd } from "@/lib/format";
import type { Summary, WindowId } from "@/lib/types";
import { Card, CardTitle, Empty, Loading, Segmented } from "./ui";

type View = "volume" | "txs" | "wallets";
type Mode = "daily" | "cumulative";

const BLUE = "#5C84FF";
const CYAN = "#8DE8FF";
const GRID = "rgba(255,255,255,0.06)";
const AXIS = { fill: "#9E9E9E", fontSize: 11 };

function TooltipBox({ active, payload, label, view, fmtX }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; view: View; fmtX: (x: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <Box sx={{ backgroundColor: "#1F1F1F", border: "1px solid #323232", borderRadius: "0.75rem", p: "0.625rem 0.75rem" }}>
      <Typography variant="caption" color="grey.200">
        {label ? fmtX(label) : ""}
      </Typography>
      {payload.map((p) => (
        <Box key={p.name} sx={{ display: "flex", alignItems: "center", gap: "0.5rem", mt: "0.25rem" }}>
          <Box sx={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", backgroundColor: p.color }} />
          <Typography sx={{ fontSize: "0.8125rem", color: "#fff" }}>
            {p.name}: {view === "volume" ? usd(p.value, false) : int(p.value)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

const hourLabel = (h: string) => `${h.slice(11, 13)}:00`;

/** Range follows the page's time filter; 24 hours is hourly, the rest daily (UTC). */
export default function Activity({ data, win }: { data: Summary | null; win: WindowId }) {
  const [pick, setView] = useState<View>("volume");
  const [mode, setMode] = useState<Mode>("daily");
  const hourly = win === "24h";
  const view: View = hourly && pick === "wallets" ? "volume" : pick;

  const rows = useMemo(() => {
    if (!data) return [];
    type Row = { x: string; txs: number; volumeUsd: number; totalWallets: number; activeWallets: number };
    let base: Row[];
    if (hourly) base = data.hourly.map((h) => ({ x: h.hour, txs: h.txs, volumeUsd: h.volumeUsd, totalWallets: 0, activeWallets: 0 }));
    else {
      const d = data.daily.map((p) => ({ x: p.day, txs: p.txs, volumeUsd: p.volumeUsd, totalWallets: p.totalWallets, activeWallets: p.activeWallets }));
      if (win === "30d") base = d.slice(-30);
      else if (win === "7d") base = d.slice(-7);
      else {
        // All time: from the first day with any activity (at least two weeks so the chart has shape).
        const first = data.daily.findIndex((p) => p.txs > 0 || p.newWallets > 0 || p.activeWallets > 0);
        base = d.slice(first < 0 ? -30 : Math.min(first, d.length - 14));
      }
    }
    // Cumulative is the running all-time total (it starts from everything before the first bar).
    const all = data.windows?.all;
    let v = (all?.volumeUsd ?? 0) - base.reduce((s, r) => s + r.volumeUsd, 0);
    let t = (all?.txs ?? 0) - base.reduce((s, r) => s + r.txs, 0);
    return base.map((r) => {
      v += r.volumeUsd;
      t += r.txs;
      return { ...r, cumVolume: Math.max(0, v), cumTxs: Math.max(0, t) };
    });
  }, [data, win, hourly]);

  const empty = view === "wallets" ? rows.every((r) => r.totalWallets === 0 && r.activeWallets === 0) : rows.every((r) => r.txs === 0 && r.volumeUsd === 0);
  const fmtY = (v: number) => (view === "volume" ? usd(v) : int(v, true));
  const fmtX = hourly ? hourLabel : shortDay;
  const tickEvery = Math.max(1, Math.round(rows.length / 7));
  const unit = hourly ? "UTC hours" : "UTC days";

  return (
    <Card>
      <CardTitle
        title="Activity over time"
        sub={view === "wallets" ? "Total connected wallets and wallets active each day" : view === "volume" ? `USD value moved by Seidar transactions (${unit})` : `Confirmed transactions submitted through Seidar (${unit})`}
        right={
          <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Segmented<View>
              value={view}
              onChange={setView}
              options={[
                { id: "volume", label: "Volume" },
                { id: "txs", label: "Transactions" },
                ...(hourly ? [] : [{ id: "wallets" as const, label: "Wallets" }]),
              ]}
            />
            {view !== "wallets" && (
              <Segmented<Mode>
                value={mode}
                onChange={setMode}
                options={[
                  { id: "daily", label: hourly ? "Hourly" : "Daily" },
                  { id: "cumulative", label: "Cumulative" },
                ]}
              />
            )}
          </Box>
        }
      />
      <Box sx={{ position: "relative", height: { xs: "16rem", md: "20rem" } }}>
        {!data ? (
          <Loading h="100%" w="100%" />
        ) : empty ? (
          <Empty h="100%" text="No activity recorded in this period yet. New transactions appear here within minutes." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fillBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BLUE} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={BLUE} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="x" tick={AXIS} tickLine={false} axisLine={false} interval={tickEvery - 1} tickFormatter={fmtX} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={fmtY} allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<TooltipBox view={view} fmtX={fmtX} />} />
              {view === "volume" &&
                (mode === "daily" ? (
                  <Bar dataKey="volumeUsd" name="Volume" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                ) : (
                  <Area dataKey="cumVolume" name="Cumulative volume" stroke={BLUE} strokeWidth={2} fill="url(#fillBlue)" type="monotone" isAnimationActive={false} />
                ))}
              {view === "txs" &&
                (mode === "daily" ? (
                  <Bar dataKey="txs" name="Transactions" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                ) : (
                  <Area dataKey="cumTxs" name="Cumulative transactions" stroke={BLUE} strokeWidth={2} fill="url(#fillBlue)" type="monotone" isAnimationActive={false} />
                ))}
              {/* No fragment here: Recharts 2 uses react-is 18, which can't see React 19 fragments and drops their children. */}
              {view === "wallets" && <Area dataKey="totalWallets" name="Connected wallets" stroke={BLUE} strokeWidth={2} fill="url(#fillBlue)" type="monotone" isAnimationActive={false} />}
              {view === "wallets" && <Bar dataKey="activeWallets" name="Active that day" fill={CYAN} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Card>
  );
}
