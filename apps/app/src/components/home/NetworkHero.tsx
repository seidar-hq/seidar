"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import PeriodButtons, { type Period } from "@/components/common/PeriodButtons";
import { InsetCard } from "@/components/common/SectionCard";
import ZoomChart from "@/components/common/ZoomChart";
import { SourceNote, compactUsd, pctText, useMarketOverview } from "./marketData";

type Range = "30d" | "90d" | "1y" | "all";
const PERIODS: Period<Range>[] = [
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "1y", label: "1y" },
  { value: "all", label: "All" },
];
const DAYS: Record<Range, number> = { "30d": 30, "90d": 90, "1y": 365, all: Infinity };

/** Stellar DeFi TVL (DefiLlama): headline figure, 1d / 7d change and its zoomable history. */
export default function NetworkHero() {
  const theme = useTheme();
  const { overview, loading } = useMarketOverview();
  const [range, setRange] = useState<Range>("90d");
  const tvl = overview?.tvl ?? null;
  const series = useMemo(() => {
    const all = tvl?.series ?? [];
    const n = DAYS[range];
    return Number.isFinite(n) ? all.slice(-n - 1) : all;
  }, [tvl, range]);
  const ranged = series.length > 1 ? ((series[series.length - 1].v - series[0].v) / series[0].v) * 100 : null;

  return (
    <InsetCard sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          <Typography variant="subtitle3" color="grey.200">
            Stellar DeFi · total value locked
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            {loading || !tvl ? (
              <Skeleton variant="rounded" animation="wave" width="12rem" height="2.75rem" />
            ) : (
              <Typography sx={{ fontSize: { xs: "2rem", sm: "2.5rem" }, fontWeight: 600, color: "common.black", lineHeight: 1.1 }}>
                {compactUsd(tvl.current)}
              </Typography>
            )}
            {tvl?.change1d != null && <Chip variant="mini" color={tvl.change1d >= 0 ? "success" : "error"} label={`${pctText(tvl.change1d)} 24h`} />}
            {tvl?.change7d != null && <Chip variant="mini" color={tvl.change7d >= 0 ? "success" : "error"} label={`${pctText(tvl.change7d)} 7d`} />}
          </Box>
          <Typography variant="subtitle3" color="grey.200">
            Stablecoins on Stellar:{" "}
            <Box component="span" sx={{ color: "common.black", fontWeight: 500 }}>
              {overview?.stablecoinsUsd != null ? compactUsd(overview.stablecoinsUsd) : "—"}
            </Box>
            {ranged != null && (
              <>
                {"  ·  "}TVL over this period:{" "}
                <Box component="span" sx={{ color: ranged >= 0 ? "green.main" : "error.main", fontWeight: 500 }}>
                  {pctText(ranged)}
                </Box>
              </>
            )}
          </Typography>
        </Box>
        <PeriodButtons periods={PERIODS} value={range} onChange={setRange} noTopMargin />
      </Box>
      {loading ? (
        <Skeleton variant="rectangular" animation="wave" sx={{ height: "17rem", borderRadius: "0.5rem" }} />
      ) : series.length < 2 ? (
        <Box sx={{ height: "17rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography variant="subtitle2" color="grey.200">
            TVL history is unavailable right now.
          </Typography>
        </Box>
      ) : (
        <ZoomChart
          fitKey={range}
          height="17rem"
          format={compactUsd}
          series={[{ id: "tvl", label: "TVL", color: theme.palette.sidebar.primary, points: series }]}
        />
      )}
      <SourceNote text="Data: DefiLlama (Stellar chain TVL, excluding centralised exchanges)." />
    </InsetCard>
  );
}
