"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { KpiCard, KpiFooterRow, KpiHeader, KpiSection, KpiTop, KpiValueRow } from "@/components/common/SectionCard";
import PortfolioSelect from "@/components/wallet/PortfolioSelect";
import { formatAmount, formatUsd } from "@/lib/format";
import { usePortfolio } from "@/portfolio/usePortfolio";
import { usePriceChanges } from "@/portfolio/useSeries";

export const InfoIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8.0026 14.6673C11.6845 14.6673 14.6693 11.6825 14.6693 8.00065C14.6693 4.31875 11.6845 1.33398 8.0026 1.33398C4.32071 1.33398 1.33594 4.31875 1.33594 8.00065C1.33594 11.6825 4.32071 14.6673 8.0026 14.6673Z"
      fill="currentColor"
      fillOpacity="0.2"
    />
    <path d="M8 11.334V7.33398" stroke="currentColor" strokeLinecap="round" />
    <path
      d="M8 4C8.55228 4 9 4.44772 9 5C9 5.55228 8.55228 6 8 6C7.44772 6 7 5.55228 7 5C7 4.44772 7.44772 4 8 4Z"
      fill="currentColor"
    />
  </svg>
);

type Kpi = {
  heading: string;
  infoTooltip: string;
  value: React.ReactNode;
  valueTooltip?: string;
  chip?: { label: string; positive: boolean };
  subtext?: string;
  subValue?: React.ReactNode;
  subTone?: "positive" | "negative";
};

const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)}%`;
const signedUsd = (v: number) => (v === 0 ? "$0.00" : `${v > 0 ? "+" : "-"}${formatUsd(Math.abs(v))}`);

/** Portfolio KPIs for the current portfolio selection (all wallets or one). */
export default function PortfolioKpis() {
  const theme = useTheme();
  const dark = theme.palette.mode === "dark";
  const small = dark ? "subtitle5" : "subtitle3";
  const detail = dark ? "subtitle3" : "body3";
  const p = usePortfolio();
  const { changes, loading: changesLoading } = usePriceChanges(p.exposures, "1d");

  // 24h performance of everything held: each asset's net exposure (wallet + positions) times its move.
  let base = 0;
  let delta = 0;
  for (const e of p.exposures) {
    const usd = (e.assets + e.positions) * e.price;
    const c = changes[e.key];
    if (c == null || !usd) continue;
    base += usd / (1 + c / 100);
    delta += usd - usd / (1 + c / 100);
  }
  const perf = base > 0 ? (delta / base) * 100 : 0;

  const t = p.totals;
  const sk = <Skeleton variant="rounded" animation="wave" width="7rem" height="1.75rem" />;
  const skSmall = <Skeleton variant="rounded" animation="wave" width="4rem" height="1rem" />;
  const totalsLoading = p.assetsLoading || p.positionsLoading;
  // Updating after a transaction: shimmer until the new totals land (no jump from the old figure).
  const totalsBusy = p.assetsRefreshing || p.positionsRefreshing;
  const utilisation = t.assetsUsd + t.utilisedUsd > 0 ? (t.utilisedUsd / (t.assetsUsd + t.utilisedUsd)) * 100 : 0;

  const kpis: Kpi[] = [
    {
      heading: "Total Balance",
      infoTooltip: "Wallet assets plus your positions in Stellar protocols, net of anything borrowed.",
      value: (totalsLoading && !t.totalUsd) || totalsBusy ? sk : formatUsd(t.totalUsd),
      valueTooltip: totalsLoading ? "Positions are still loading" : undefined,
    },
    {
      heading: "Performance %",
      infoTooltip: "How the value of everything you hold moved in the last 24 hours.",
      value: changesLoading && !base ? sk : pct(perf),
      chip: changesLoading && !base ? undefined : { label: pct(perf), positive: perf >= 0 },
      subtext: "Change 24h",
      subValue: changesLoading && !base ? skSmall : signedUsd(delta),
      subTone: delta > 0 ? "positive" : delta < 0 ? "negative" : undefined,
    },
    {
      heading: "Total Utilised",
      infoTooltip: "Capital deployed into lending markets, liquidity pools and vaults.",
      value: (p.positionsLoading && !t.utilisedUsd) || totalsBusy ? sk : formatUsd(t.utilisedUsd),
      subtext: "Utilisation %",
      subValue: (p.positionsLoading && !t.utilisedUsd) || totalsBusy ? skSmall : `${utilisation.toFixed(2)}%`,
    },
    {
      heading: "Total Rewards",
      infoTooltip: "Unclaimed rewards: Blend BLND emissions and Aquarius LP rewards.",
      value: p.positionsLoading && !t.rewardsUsd ? sk : formatUsd(t.rewardsUsd),
      subtext: "Claimable BLND",
      subValue: p.lendingLoading ? skSmall : formatAmount(t.claimableBlnd, 2),
    },
  ];

  return (
    <KpiSection>
      {/* Phones only: from sm up the picker lives in the navbar. */}
      <KpiHeader sx={{ justifyContent: "space-between", display: { xs: "flex", sm: "none" } }}>
        <PortfolioSelect />
      </KpiHeader>
      <Grid size={12} spacing="1rem" container>
        {kpis.map((k) => (
          <KpiCard key={k.heading} size={{ xs: 12, sm: 6, md: 3 }}>
            <KpiTop>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <Typography variant={small}>{k.heading}</Typography>
                <Tooltip placement="top" arrow title={k.infoTooltip}>
                  <Box sx={{ display: "flex", cursor: "default", color: "grey.200" }}>
                    <InfoIcon size={14} />
                  </Box>
                </Tooltip>
              </Box>
              <KpiValueRow>
                <Tooltip placement="top" arrow title={k.valueTooltip ?? ""}>
                  <Typography variant="body4" color="common.black" component="div">
                    {k.value}
                  </Typography>
                </Tooltip>
                {k.chip && <Chip variant="mini" color={k.chip.positive ? "success" : "error"} label={k.chip.label} />}
              </KpiValueRow>
            </KpiTop>
            {k.subtext && (
              <KpiFooterRow>
                <Typography variant={small}>{k.subtext}</Typography>
                <Typography
                  variant={detail}
                  component="div"
                  color={k.subTone === "positive" ? "green.main" : k.subTone === "negative" ? "error.main" : undefined}
                >
                  {k.subValue}
                </Typography>
              </KpiFooterRow>
            )}
          </KpiCard>
        ))}
      </Grid>
    </KpiSection>
  );
}
