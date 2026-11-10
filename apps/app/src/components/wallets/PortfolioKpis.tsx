"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import Shimmer from "@/components/common/Shimmer";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { ThemeIcon, type IconKind } from "@/components/common/ChromeIcons";
import { LOOK } from "@/theme/exploreLook";
import { KpiCard, KpiFooterRow, KpiHeader, KpiSection, KpiTop, KpiValueRow } from "@/components/common/SectionCard";
import PortfolioSelect from "@/components/wallet/PortfolioSelect";
import { formatAmount, formatUsd } from "@/lib/format";
import { usePortfolio } from "@/portfolio/usePortfolio";
import { usePerformance24h } from "@/portfolio/useSeries";

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
  const { pct: perf, delta, base, loading: changesLoading } = usePerformance24h(p.exposures);

  const t = p.totals;
  // A value that shimmers (measured from its own text) while it loads or updates.
  const sk = (on: boolean, v: string) => <Shimmer on={on} width="7rem">{v}</Shimmer>;
  const skSmall = (on: boolean, v: string) => <Shimmer on={on} width="4rem">{v}</Shimmer>;
  const totalsLoading = p.assetsLoading || p.positionsLoading;
  // Updating after a transaction: shimmer until the new totals land (no jump from the old figure).
  const totalsBusy = p.assetsRefreshing || p.positionsRefreshing;
  // 24h performance moves with the holdings, so it shimmers with them too: while they first load
  // there is nothing to price yet, which would otherwise read as a flat +0.00%.
  const perfBusy = ((totalsLoading || changesLoading) && !base) || totalsBusy;
  const utilisation = t.assetsUsd + t.utilisedUsd > 0 ? (t.utilisedUsd / (t.assetsUsd + t.utilisedUsd)) * 100 : 0;

  const KPI_ICON: Record<string, IconKind> = { "Total Balance": "coins", "Performance %": "growth", "Total Utilised": "cube", "Total Rewards": "star" };
  const kpis: Kpi[] = [
    {
      heading: "Total Balance",
      infoTooltip: "Wallet assets plus your positions in Stellar protocols, net of anything borrowed.",
      value: sk((totalsLoading && !t.totalUsd) || totalsBusy, formatUsd(t.totalUsd)),
      valueTooltip: totalsLoading ? "Positions are still loading" : undefined,
    },
    {
      heading: "Performance %",
      infoTooltip: "How the value of everything you hold moved in the last 24 hours.",
      value: sk(perfBusy, pct(perf)),
      chip: perfBusy ? undefined : { label: pct(perf), positive: perf >= 0 },
      subtext: "Change 24h",
      subValue: skSmall(perfBusy, signedUsd(delta)),
      subTone: delta > 0 ? "positive" : delta < 0 ? "negative" : undefined,
    },
    {
      heading: "Total Utilised",
      infoTooltip: "Capital deployed into lending markets, liquidity pools and vaults.",
      value: sk((p.positionsLoading && !t.utilisedUsd) || totalsBusy, formatUsd(t.utilisedUsd)),
      subtext: "Utilisation %",
      subValue: skSmall((p.positionsLoading && !t.utilisedUsd) || totalsBusy, `${utilisation.toFixed(2)}%`),
    },
    {
      heading: "Total Rewards",
      infoTooltip: "Unclaimed rewards: Blend BLND emissions and Aquarius LP rewards.",
      value: sk((p.positionsLoading && !t.rewardsUsd) || p.positionsRefreshing, formatUsd(t.rewardsUsd)),
      subtext: "Claimable BLND",
      subValue: skSmall(p.lendingLoading || p.lendingRefreshing, formatAmount(t.claimableBlnd, 2)),
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
            {/* Chrome object in the corner, shown only with the Explore look (Portfolio). */}
            <Box
              className="look-decor"
              aria-hidden
              sx={{ display: "none", position: "absolute", right: "-2.25rem", bottom: "-2.25rem", width: "7rem", height: "7rem", opacity: 0.55, pointerEvents: "none", [LOOK]: { display: "block" } }}
            >
              <ThemeIcon kind={KPI_ICON[k.heading] ?? "coins"} size="100%" />
            </Box>
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
