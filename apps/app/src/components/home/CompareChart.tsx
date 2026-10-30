"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import PeriodButtons, { type Period } from "@/components/common/PeriodButtons";
import TokenLogo from "@/components/common/TokenLogo";
import ZoomChart, { type ZoomSeries } from "@/components/common/ZoomChart";
import { apiJson } from "@/lib/api";
import { useSharedMany } from "@/lib/useShared";
import { priceText, type MarketAsset } from "./marketData";

type Range = "1d" | "7d" | "30d" | "90d" | "1y";
const PERIODS: Period<Range>[] = [
  { value: "1d", label: "1D" },
  { value: "7d", label: "1W" },
  { value: "30d", label: "1M" },
  { value: "90d", label: "3M" },
  { value: "1y", label: "1Y" },
];
const MAX_COMPARE = 3;
/** Compared series colours (the primary uses the theme's chart blue). */
const COMPARE_COLORS = ["#F7931A", "#2DD4BF", "#F472B6"];

type Chart = { ok?: boolean; points?: { t: number; px: number }[] };
type Asset = Pick<MarketAsset, "id" | "code" | "issuer" | "contract" | "icon">;

/** Price-history key for /prices/chart: XLM is "native", classic assets CODE:ISSUER; Soroban-only tokens have none. */
export const chartKeyOf = (a: Pick<MarketAsset, "code" | "issuer" | "contract">) =>
  a.contract ? null : a.issuer ? `${a.code}:${a.issuer}` : a.code === "XLM" ? "native" : null;

const chip = (color: string) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  height: "2rem",
  px: "0.625rem",
  borderRadius: "0.5rem",
  border: (t: import("@mui/material/styles").Theme) => `0.0625rem solid ${t.palette.overlay.white08}`,
  backgroundColor: "overlay.white04",
  "& .swatch": { width: "0.75rem", height: "0.75rem", borderRadius: "0.1875rem", backgroundColor: color },
});

/**
 * Price chart of one asset with up to three others compared against it (each on its own axis in
 * price mode, or all as % change), zoomable on both axes.
 */
export default function CompareChart({ primary, candidates, height = "22rem" }: { primary: Asset; candidates: MarketAsset[]; height?: string }) {
  const theme = useTheme();
  const [range, setRange] = useState<Range>("30d");
  const [mode, setMode] = useState<"price" | "percent">("price");
  const [compare, setCompare] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [q, setQ] = useState("");

  const others = compare.map((id) => candidates.find((c) => c.id === id)).filter((x): x is MarketAsset => !!x && x.id !== primary.id);
  const shown: Asset[] = [primary, ...others];
  const keys = shown.map((a) => chartKeyOf(a)).filter((k): k is string => !!k);
  const { values, loading } = useSharedMany<Chart | null>(
    keys.map((k) => `chart:${range}:${k}`),
    (k) => () => {
      const asset = k.split(":").slice(2).join(":");
      return apiJson<Chart>(`/api/prices/chart?asset=${encodeURIComponent(asset)}&range=${range}`);
    },
    300_000,
  );

  const colors = [theme.palette.sidebar.primary, ...COMPARE_COLORS];
  const series: ZoomSeries[] = [];
  const missing: string[] = [];
  shown.forEach((a, i) => {
    const k = chartKeyOf(a);
    const pts = k ? (values[`chart:${range}:${k}`]?.points ?? []) : [];
    if (pts.length >= 2) series.push({ id: a.id, label: a.code, color: colors[i], points: pts.map((p) => ({ t: p.t, v: p.px })) });
    else if (!loading || !k) missing.push(a.code);
  });

  const pickable = useMemo(() => {
    const query = q.trim().toLowerCase();
    return candidates
      .filter((c) => c.id !== primary.id && !compare.includes(c.id) && chartKeyOf(c))
      .filter((c) => !query || `${c.code} ${c.name} ${c.domain ?? ""}`.toLowerCase().includes(query))
      .slice(0, 30);
  }, [candidates, primary.id, compare, q]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem", minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <Box sx={chip(colors[0])}>
          <span className="swatch" />
          <TokenLogo code={primary.code} issuer={primary.issuer} contract={primary.contract} src={primary.icon} size="1.125rem" />
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "common.black" }}>{primary.code}</Typography>
        </Box>
        <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>compared to:</Typography>
        {others.map((a, i) => (
          <Box key={a.id} sx={chip(colors[i + 1])}>
            <span className="swatch" />
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "common.black" }}>{a.code}</Typography>
            <ButtonBase aria-label={`Remove ${a.code}`} onClick={() => setCompare((c) => c.filter((x) => x !== a.id))} sx={{ borderRadius: "50%", color: "grey.200", "&:hover": { color: "common.black" } }}>
              <CloseRoundedIcon sx={{ fontSize: "1rem" }} />
            </ButtonBase>
          </Box>
        ))}
        {others.length < MAX_COMPARE && (
          <ButtonBase onClick={(e) => setAnchor(e.currentTarget)} sx={{ ...chip("transparent"), "& .swatch": undefined, "&:hover": { backgroundColor: "overlay.white08" } }}>
            <AddRoundedIcon sx={{ fontSize: "1rem", color: "common.black" }} />
            <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>Add</Typography>
          </ButtonBase>
        )}
        <Box sx={{ flex: 1 }} />
        <Box sx={{ display: "flex", borderRadius: "0.5rem", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`, overflow: "hidden" }}>
          {(["price", "percent"] as const).map((m) => (
            <ButtonBase
              key={m}
              onClick={() => setMode(m)}
              sx={{ px: "0.75rem", height: "2rem", fontSize: "0.8125rem", color: mode === m ? "common.black" : "grey.200", backgroundColor: mode === m ? "overlay.white08" : "transparent" }}
            >
              {m === "price" ? "Price" : "% change"}
            </ButtonBase>
          ))}
        </Box>
        <PeriodButtons periods={PERIODS} value={range} onChange={setRange} noTopMargin />
      </Box>

      {loading && series.length === 0 ? (
        <Skeleton variant="rectangular" animation="wave" sx={{ height, borderRadius: "0.5rem" }} />
      ) : series.length === 0 ? (
        <Box sx={{ height, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", px: "2rem" }}>
          <Typography variant="subtitle2" color="grey.200">
            No price history for {primary.code} on the Stellar DEX over this period.
          </Typography>
        </Box>
      ) : (
        <ZoomChart series={series} mode={mode} height={height} format={priceText} intraday={range === "1d" || range === "7d"} fitKey={`${range}:${primary.id}`} />
      )}
      {missing.length > 0 && series.length > 0 && (
        <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>No DEX price history for {missing.join(", ")} over this period.</Typography>
      )}

      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => {
          setAnchor(null);
          setQ("");
        }}
        slotProps={{ paper: { sx: { mt: "0.5rem", width: "18rem", maxHeight: "24rem", backgroundColor: "#1A1A1A", backgroundImage: "none", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`, borderRadius: "0.75rem" } } }}
      >
        <Box sx={{ px: "0.75rem", pb: "0.5rem" }} onKeyDown={(e) => e.stopPropagation()}>
          <InputBase autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search asset to compare" sx={{ width: "100%", fontSize: "0.875rem", color: "common.black" }} />
        </Box>
        {pickable.map((c) => (
          <MenuItem
            key={c.id}
            onClick={() => {
              setCompare((x) => [...x, c.id]);
              setAnchor(null);
              setQ("");
            }}
            sx={{ gap: "0.625rem" }}
          >
            <TokenLogo code={c.code} issuer={c.issuer} contract={c.contract} src={c.icon} size="1.5rem" />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>{c.code}</Typography>
              <Typography sx={{ fontSize: "0.6875rem", color: "grey.200" }} noWrap>
                {c.domain ?? c.name}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{priceText(c.price)}</Typography>
          </MenuItem>
        ))}
        {pickable.length === 0 && (
          <Typography sx={{ px: "1rem", py: "0.5rem", fontSize: "0.8125rem", color: "grey.200" }}>No matching asset with price history.</Typography>
        )}
      </Menu>
    </Box>
  );
}
