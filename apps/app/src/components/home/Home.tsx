"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { SectionCard, fadedBorder } from "@/components/common/SectionCard";
import News from "@/components/portfolio/News";
import ActivityChart from "./ActivityChart";
import AssetsTable from "./AssetsTable";
import Leaderboards from "./Leaderboards";
import MarketKpis from "./MarketKpis";
import Markets from "./Markets";
import NetworkHero from "./NetworkHero";
import PortfolioCard from "./PortfolioCard";
import Protocols from "./Protocols";

const Title = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <Box sx={{ display: "flex", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap", px: "0.25rem" }}>
    <Typography variant="h6" sx={{ fontWeight: 500, color: "common.black" }}>
      {children}
    </Typography>
    {sub && (
      <Typography variant="subtitle3" color="grey.200">
        {sub}
      </Typography>
    )}
  </Box>
);

/**
 * Home: an overview of Stellar DeFi for everyone, wallet or not. Same two-column grid as
 * Portfolio: the market on the left; the connected portfolio, protocols and news on the right.
 */
export default function Home() {
  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Box
        sx={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "minmax(12.500rem, 1fr) 27.375rem",
          alignItems: "start",
          "@media (max-width: 54.250rem)": { gridTemplateColumns: "1fr" },
        }}
      >
        <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
          <SectionCard sx={(t) => fadedBorder(t)}>
            <Title sub="Live market overview of the Stellar network">Stellar at a glance</Title>
            <NetworkHero />
            <MarketKpis />
          </SectionCard>

          <SectionCard>
            <Title sub="Chart any asset and compare it with others; drag the axes to zoom">Markets</Title>
            <Markets />
          </SectionCard>

          <SectionCard>
            <Title sub="By 7-day DEX volume, market cap and number of holders">Top assets</Title>
            <Leaderboards />
          </SectionCard>

          <SectionCard>
            <Title sub="Stablecoins, real-world assets, yield-bearing tokens and more">Assets</Title>
            <AssetsTable />
          </SectionCard>

          <SectionCard>
            <ActivityChart />
          </SectionCard>
        </Box>

        <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
          <SectionCard>
            <PortfolioCard />
          </SectionCard>
          <SectionCard>
            <Protocols />
          </SectionCard>
          <News />
        </Box>
      </Box>
    </Box>
  );
}
