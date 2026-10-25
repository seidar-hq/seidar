"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { styled, useTheme, type Theme } from "@mui/material/styles";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { EmptyState } from "@/components/common/DataTable";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import { useThemeMode } from "@/theme/ThemeModeContext";
import { BackButton, StatCard, TimePeriodSelector } from "./AssetParts";

// Placeholder asset until a wallet is connected and a token is picked from the dashboard.
const ASSET = { name: "Asset", symbol: "N/A", logo: "/assets/wallets/xlm-logo.png", walletAddress: "G…" };

const PERIODS = ["1d", "7d", "30d", "90d", "1y"].map((v) => ({ value: v, label: v }));

const YIELD_TABS: TabItem[] = [
  { id: "position", label: "Positions" },
  { id: "earn", label: "Earn" },
  { id: "transactions", label: "Transactions" },
  { id: "borrow", label: "Borrow" },
];

const WalletPill = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.overlay.white08 : theme.palette.overlay.dark06,
  borderRadius: "6.25rem",
  padding: "0.375rem 0.75rem",
}));

const MetricShell = styled(Box)({
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  height: "8rem",
  padding: "1.125rem",
  borderRadius: "0.5rem",
  overflow: "hidden",
});

const perfStyles = (theme: Theme, dark: boolean) => ({
  container: { display: "flex", flexDirection: "column" as const, gap: "1rem" },
  card: {
    backgroundColor: theme.palette.surfaceBg.section,
    borderRadius: "1.25rem",
    overflow: "hidden",
    boxShadow: dark ? `0 0.25rem 1.25rem 0 ${theme.palette.shadow.exchange}` : "none",
  },
  metricsContainer: { display: "flex", flexDirection: "column" as const, gap: "1rem", padding: "1rem" },
  metricRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: "2rem",
    padding: "0.375rem 0.5rem 0.375rem 0.375rem",
    borderRadius: "0.5rem",
  },
  divider: { my: "0rem", borderColor: theme.palette.border.main600 },
});

function AssetHeader() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "1.625rem" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <BackButton />
        <Typography variant="subtitle1" color="grey.200" ml="0.75rem">
          Dashboard
        </Typography>
        <Typography variant="subtitle1" color="grey.200">
          {"<"}
        </Typography>
        <Typography variant="subtitle1" color="grey.200">
          Asset
        </Typography>
        <Typography variant="subtitle2" color="black.main100">
          {"<"}
        </Typography>
        <Typography variant="subtitle2" color="black.main100">
          {ASSET.symbol}
        </Typography>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.9375rem" }}>
          <Box component="img" src={ASSET.logo} alt={ASSET.name} sx={{ borderRadius: "50%", width: "2.5rem", height: "2.5rem" }} />
          <Typography variant="body4" color="common.black">
            {ASSET.name}
          </Typography>
          <Typography variant="body4" color="grey.200">
            $0
          </Typography>
          <Chip size="small" color="error" label="0%" sx={{ cursor: "default" }} />
        </Box>
        <WalletPill>
          <Box sx={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", backgroundColor: "red.main" }} />
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
            <Box component="img" src="/assets/defaultWallet.svg" sx={{ width: "1.25rem", height: "1.25rem" }} />
            <Typography variant="body3" color="primary.main">
              {ASSET.walletAddress}
            </Typography>
          </Box>
        </WalletPill>
      </Box>
      <Box sx={{ display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: { xs: "1.5rem", sm: "4rem" }, padding: "1.125rem" }}>
        <Box>
          <Typography variant="subtitle1" color="grey.200">
            Total Balance
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem", mt: "1rem" }}>
            <Typography variant="h4">0 {ASSET.symbol}</Typography>
            <Typography variant="subtitle5">$0</Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function AssetMetrics() {
  const theme = useTheme();
  const metrics = [
    { label: "Wallet Balance", value: `0 ${ASSET.symbol}`, sub: "$0" },
    { label: "Utilised Balance", value: `0 ${ASSET.symbol}`, sub: "$0" },
    { label: "Utilization Rate", value: "0%" },
    { label: "Rewards", value: "$0.00", color: theme.palette.green.main },
    { label: "APY", value: "0%", color: theme.palette.green.main },
  ];
  return (
    <Box sx={{ display: "grid", gap: "1rem", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", lg: "repeat(5, 1fr)" } }}>
      {metrics.map((m) => (
        <MetricShell key={m.label}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem", height: "5.75rem", width: "100%" }}>
            <Typography variant="subtitle1" color="grey.200">
              {m.label}
            </Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <Typography variant="body4" color={m.color || "common.black"}>
                {m.value}
              </Typography>
              {m.sub && <Typography variant="subtitle5">{m.sub}</Typography>}
            </Box>
          </Box>
        </MetricShell>
      ))}
    </Box>
  );
}

function AssetChart() {
  const theme = useTheme();
  const [period, setPeriod] = useState("1d");
  return (
    <Card elevation={0} sx={{ backgroundColor: theme.palette.grey[400], borderRadius: "0.500rem", p: "1rem", width: "100%", overflow: "visible", position: "relative" }}>
      <Box sx={{ position: "relative", height: `${251 / 16}rem`, mb: "0.5rem", width: "100%", overflow: "visible" }} />
      <TimePeriodSelector timePeriods={PERIODS} selected={period} onSelect={setPeriod} />
    </Card>
  );
}

function AssetStats() {
  const top = ["Market Cap", "Fully Diluted Valuation", "Circulating Supply", "Total Supply", "Max. Supply"];
  const bottom = ["24h Change", "7d Change", "30d Change", "60d Change"];
  const size = { xs: 6, sm: 4, lg: 2.4 };
  return (
    <Grid container spacing="1.500rem">
      <Grid size={12}>
        <Grid container spacing="1.500rem">
          {top.map((label) => (
            <Grid key={label} size={size}>
              <StatCard label={label} value="N/A" />
            </Grid>
          ))}
        </Grid>
      </Grid>
      <Grid size={12}>
        <Grid container spacing="1.500rem">
          <Grid size={size}>
            <StatCard label="24h Trading Volume" value="N/A" />
          </Grid>
          {bottom.map((label) => (
            <Grid key={label} size={size}>
              <StatCard label={label} value="0%" valueTooltip="+0%" showChange changeValue={-0.0001} />
            </Grid>
          ))}
        </Grid>
      </Grid>
    </Grid>
  );
}

function Yields() {
  const [tab, setTab] = useState("position");
  return (
    <Card elevation={0} sx={{ backgroundColor: "inherit", boxShadow: "none", width: "100%", overflow: "visible" }}>
      <Typography variant="h6" sx={(t) => ({ fontWeight: 500, color: t.palette.common.black, mb: "0.750rem" })}>
        Yields
      </Typography>
      <Box sx={{ mb: "1.5rem" }}>
        <Tabs tabs={YIELD_TABS} activeTab={tab} setActiveTab={setTab} isPathProvided={false} />
      </Box>
      <EmptyState message="No data found" />
    </Card>
  );
}

function InfoTip({ title }: { title: string }) {
  return (
    <Tooltip title={title} placement="top" arrow>
      <InfoOutlinedIcon sx={{ fontSize: "0.875rem", color: "grey.200", cursor: "pointer" }} />
    </Tooltip>
  );
}

function TokenPerformance() {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const s = perfStyles(theme, isDarkMode);
  const rows = [
    { label: "Invested", tip: "Total amount you have invested in this token across all protocols", value: `0 ${ASSET.symbol}` },
    { label: "Avg. Price", tip: "Average purchase price per token based on your investment history", value: "$0" },
    { label: "Rewards", tip: "Total rewards earned from liquidity provision", value: "$0.00", color: theme.palette.green.main },
    { label: "Current Holding", tip: "Your current token balance including any accrued interest or yields", value: `0 ${ASSET.symbol}` },
  ];
  return (
    <Box sx={s.container}>
      <Box sx={s.card}>
        <Box sx={{ padding: "1rem" }}>
          <Typography variant="subtitle4" sx={{ color: "common.black", fontWeight: 500 }}>
            Token Performance
          </Typography>
        </Box>
        <Box sx={s.metricsContainer}>
          {rows.map((r) => (
            <Box key={r.label} sx={s.metricRow}>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <Typography variant="body3" color="common.black">
                  {r.label}
                </Typography>
                <InfoTip title={r.tip} />
              </Box>
              <Typography variant="subtitle3" sx={{ color: r.color || "sidebar.heading", textTransform: "uppercase" }}>
                {r.value}
              </Typography>
            </Box>
          ))}
          <Divider sx={s.divider} />
          <Box display="flex" flexDirection="column" gap="0.75rem">
            <Box sx={s.metricRow}>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <Typography variant="subtitle5" color="common.black">
                  Current Value
                </Typography>
                <InfoTip title="The current market value of your holdings" />
              </Box>
              <Typography variant="subtitle5" color="sidebar.heading">
                $0
              </Typography>
            </Box>
            <Box sx={s.metricRow}>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <Typography variant="subtitle5" color="common.black">
                  Profit/Loss
                </Typography>
                <InfoTip title="The difference between your current value and total invested amount" />
              </Box>
              <Typography variant="subtitle5" sx={{ color: theme.palette.green.main }}>
                $0 (0%)
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
          backgroundColor: isDarkMode ? "transparent" : theme.palette.surfaceBg.section,
          border: isDarkMode ? `0.0625rem solid ${theme.palette.overlay.white08}` : `0.0625rem solid ${theme.palette.border.main1000}`,
          padding: "1rem",
          borderRadius: "1.25rem",
          boxShadow: isDarkMode ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.exchange}` : "none",
        }}
      >
        <Typography variant="subtitle2">Stellar Network</Typography>
      </Box>
    </Box>
  );
}

export default function Asset() {
  const theme = useTheme();
  return (
    <Box sx={{ backgroundColor: "transparent", minHeight: "100vh", maxWidth: "100%", overflowX: "hidden" }}>
      <Box
        sx={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "1fr 28.5625rem",
          mt: "0.4rem",
          "@media (max-width: 75rem)": { gridTemplateColumns: "1fr" },
        }}
      >
        <Box sx={{ minWidth: 0, backgroundColor: theme.palette.common.white, borderRadius: "1.75rem", padding: { xs: "1rem", sm: "1.500rem" } }}>
          <Box sx={{ mb: "1.500rem" }}>
            <AssetHeader />
          </Box>
          <Box sx={{ mb: "1rem" }}>
            <AssetMetrics />
          </Box>
          <Box sx={{ mb: "1rem" }}>
            <AssetChart />
          </Box>
          <Box sx={{ mb: "1rem" }}>
            <AssetStats />
          </Box>
          <Box sx={{ mt: "2rem" }}>
            <Yields />
          </Box>
        </Box>
        <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
          <TokenPerformance />
        </Box>
      </Box>
    </Box>
  );
}
