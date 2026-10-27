"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { ago, int, usd } from "@/lib/format";
import { INTEGRATIONS } from "@/lib/meta";
import type { Summary, WindowId } from "@/lib/types";
import { Card, Loading, Segmented } from "./ui";

export const WINDOWS: { id: WindowId; label: string; phrase: string }[] = [
  { id: "all", label: "All time", phrase: "all time" },
  { id: "30d", label: "30 days", phrase: "in the last 30 days" },
  { id: "7d", label: "7 days", phrase: "in the last 7 days" },
  { id: "24h", label: "24 hours", phrase: "in the last 24 hours" },
];

/** Live status + the time filter that drives every usage number below it. */
export function StatsBar({ data, error, win, onWin }: { data: Summary | null; error: string | null; win: WindowId; onWin: (w: WindowId) => void }) {
  const dot = error ? "#EF4444" : "#10B981";
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
      <Box sx={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", px: "0.75rem", height: "1.875rem", borderRadius: "999rem", backgroundColor: "overlay.white04", border: (t) => `0.0625rem solid ${t.palette.border.main1000}` }}>
        <Box sx={{ width: "0.4rem", height: "0.4rem", borderRadius: "50%", backgroundColor: dot, boxShadow: `0 0 0.5rem ${dot}` }} />
        <Typography sx={{ fontSize: "0.8125rem", color: "sidebar.subText" }}>{error ? "Data unavailable" : data ? `Live · updated ${ago(data.generatedAt)}` : "Loading…"}</Typography>
      </Box>
      <Segmented<WindowId> value={win} onChange={onWin} options={WINDOWS.map((w) => ({ id: w.id, label: w.label }))} />
    </Box>
  );
}

function Tile({ label, value, sub, loading, accent }: { label: string; value: string; sub?: string; loading: boolean; accent?: boolean }) {
  return (
    <Card sx={{ display: "flex", flexDirection: "column", gap: "0.625rem", ...(accent ? { background: "linear-gradient(135deg, rgba(52,108,255,0.22), rgba(141,232,255,0.06))", borderColor: "rgba(92,132,255,0.35)" } : {}) }}>
      <Typography variant="body1" color="grey.200">
        {label}
      </Typography>
      {loading ? (
        <Loading h="2.25rem" w="55%" />
      ) : (
        <Typography sx={{ fontSize: { xs: "1.75rem", md: "2.125rem" }, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, color: "common.black" }}>{value}</Typography>
      )}
      <Typography variant="caption" color="grey.200" sx={{ minHeight: "1rem" }}>
        {loading ? "" : sub}
      </Typography>
    </Card>
  );
}

export function Kpis({ data, win }: { data: Summary | null; win: WindowId }) {
  const w = data?.windows?.[win];
  const phrase = WINDOWS.find((x) => x.id === win)?.phrase ?? "";
  const loading = !w;
  return (
    <Box sx={{ display: "grid", gap: "1rem", mt: "1rem", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(3, 1fr)" } }}>
      <Tile accent loading={loading} label="Volume through Seidar" value={usd(w?.volumeUsd)} sub={`USD moved ${phrase}`} />
      <Tile loading={loading} label="Transactions" value={int(w?.txs)} sub={`Confirmed on Stellar mainnet ${phrase}`} />
      <Tile loading={loading} label="Transacting wallets" value={int(w?.transactingWallets)} sub={`Unique wallets that signed through Seidar ${phrase}`} />
      <Tile
        loading={loading}
        label="Connected wallets"
        value={int(data?.totals.wallets)}
        sub={win === "all" ? "Wallets linked in Seidar" : `${int(w?.newWallets)} new ${phrase}`}
      />
      <Tile
        loading={loading}
        label="Active wallets"
        value={int(w?.activeWallets)}
        sub={win === "24h" ? "Used Seidar today or yesterday (UTC days)" : `Used Seidar ${phrase}`}
      />
      <Tile loading={false} label="Integrations" value={String(INTEGRATIONS)} sub="Lending, DEXs, vaults, perps and a bridge" />
    </Box>
  );
}
