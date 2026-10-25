"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import {
  InsetCard,
  SectionCard,
  SectionHeaderLeft,
  SectionHeaderRow,
  fadedBorder,
} from "@/components/common/SectionCard";
import { LockedChartArt, LockedChartRoot, LockedCopy, WATERMARK_ICON } from "@/components/common/locked/LockedParts";
import TourGuideModal from "@/components/layout/tour/TourGuideModal";
import { useWallet } from "@/wallet/WalletContext";

const Root = styled(SectionCard)(({ theme }) => ({
  ...fadedBorder(theme),
  height: "38.5rem",
  [theme.breakpoints.down("sm")]: { height: "auto" },
}));

const BalancePanel = styled(InsetCard)(({ theme }) => ({ ...fadedBorder(theme), zIndex: 1, flex: 1, minHeight: 0 }));

const SectionGlow = styled(Box)(({ theme }) => ({
  position: "absolute",
  left: 0,
  right: 0,
  bottom: "-2.5rem",
  height: "34%",
  zIndex: 0,
  pointerEvents: "none",
  filter: "blur(3rem)",
  backgroundImage: theme.palette.gradient.lockedSectionGlow,
}));

const Watermark = styled("img")(({ theme }) => ({
  position: "absolute",
  right: "1rem",
  bottom: "1rem",
  width: "1.0625rem",
  height: "1.0625rem",
  zIndex: 2,
  pointerEvents: "none",
  ...(theme.palette.mode !== "dark" && { filter: "invert(1)" }),
}));

const TopBlock = styled(Box)({
  position: "relative",
  zIndex: 1,
  display: "flex",
  flexDirection: "column",
  gap: "0.625rem",
  borderRadius: "0.875rem",
});

const TopGlow = styled(Box)(({ theme }) => ({
  position: "absolute",
  left: 0,
  right: 0,
  bottom: "-2.5rem",
  height: "42%",
  zIndex: 0,
  pointerEvents: "none",
  filter: "blur(3rem)",
  backgroundImage: theme.palette.gradient.lockedSectionGlow,
}));

const TopRow = styled(Box)(({ theme }) => ({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  minHeight: "8rem",
  [theme.breakpoints.down("sm")]: { flexDirection: "column", alignItems: "stretch", minHeight: 0 },
}));

const IntroColumn = styled(Box)({
  position: "relative",
  zIndex: 2,
  flex: "0 0 auto",
  display: "flex",
  flexDirection: "column",
  gap: "0.875rem",
  maxWidth: "32.875rem",
  paddingLeft: "1.625rem",
});

const ButtonsRow = styled(Box)({ display: "flex", flexWrap: "wrap", gap: "0.5rem" });

const ConnectPill = styled(ButtonBase)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.375rem",
  height: "2.0625rem",
  padding: "0 0.625rem",
  borderRadius: "3.125rem",
  background: theme.palette.gradient.buttonGradient,
  boxShadow: theme.palette.mode === "dark" ? `0rem 0.25rem 1.25rem 0rem ${theme.palette.shadow.elevated}` : "none",
}));

const TourPill = styled(ButtonBase)(({ theme }) => {
  const dark = theme.palette.mode === "dark";
  const line = dark ? theme.palette.overlay.white08 : theme.palette.border.main600;
  return {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    height: "2.0625rem",
    padding: "0.375rem 0.375rem 0.375rem 0.5rem",
    borderRadius: "6.25rem",
    backgroundColor: theme.palette.overlay.white05,
    borderTop: `0.0625rem solid ${line}`,
    borderBottom: `0.0625rem solid ${line}`,
    boxShadow: dark ? `0rem 0.25rem 2.5rem 0rem ${theme.palette.shadow.elevated}` : "none",
  };
});

const PillIcon = styled("img")({ width: "1.125rem", height: "1.125rem" });

const KpiStack = styled(Box)(({ theme }) => ({
  position: "relative",
  zIndex: 1,
  flex: 1,
  minWidth: 0,
  height: "8rem",
  [theme.breakpoints.down("sm")]: { display: "none" },
}));

const KpiCard = styled(Box, { shouldForwardProp: (p) => p !== "idx" })<{ idx: number }>(({ theme, idx }) => ({
  position: "absolute",
  top: 0,
  right: `${(3 - idx) * 6.4375}rem`,
  zIndex: idx,
  width: "19.9375rem",
  maxWidth: "100%",
  height: "8rem",
  padding: "1rem",
  borderRadius: "0.75rem",
  backgroundImage: theme.palette.gradient.kpiCardLocked,
  border: `0.0625rem solid ${theme.palette.overlay.white08}`,
  boxShadow:
    theme.palette.mode === "dark"
      ? `0rem 0.25rem 2.5rem 0rem ${theme.palette.shadow.elevated}`
      : `-0.25rem 0rem 2.5rem 0rem ${theme.palette.shadow.elevated}`,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "flex-start",
  gap: "1rem",
  overflow: "hidden",
}));

const KpiValueRow = styled(Box)({ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" });
const KpiBody = styled(Box)({ display: "flex", flexDirection: "column", gap: "0.375rem", width: "100%" });

const Bar = styled(Box, { shouldForwardProp: (p) => p !== "w" && p !== "big" })<{ w: string; big?: boolean }>(
  ({ theme, w, big }) => ({
    height: big ? "0.625rem" : "0.375rem",
    width: w,
    borderRadius: "12.5rem",
    backgroundColor: big ? theme.palette.overlay.white10 : theme.palette.overlay.white05,
  }),
);

const CHART_TABS: TabItem[] = [
  { id: "timeline", label: "Timeline" },
  { id: "allocation", label: "Allocation" },
  { id: "performer", label: "Performer" },
];

const KPI_LABELS = ["Total Balance", "Performance", "Total Utilised"];

export default function PortfolioLocked() {
  const [tab] = useState("timeline");
  const [tourOpen, setTourOpen] = useState(false);
  const { openConnectModal } = useWallet();

  return (
    <>
      <Root>
        <SectionGlow />
        <TopBlock>
          <TopGlow />
          <Typography variant="h6" sx={{ pl: "1.625rem", color: "common.black" }}>
            All Portfolios
          </Typography>
          <TopRow>
            <IntroColumn>
              <Typography variant="subtitle9" color="sidebar.subText">
                Track balances, allocations, performance, rewards, and AI insights across all your wallets in one
                place.
              </Typography>
              <ButtonsRow>
                <ConnectPill onClick={openConnectModal}>
                  <Typography variant="subtitle3" color="sidebar.white">
                    Connect Wallet
                  </Typography>
                  <PillIcon src="/assets/locked/walletGradient.svg" alt="" />
                </ConnectPill>
                <TourPill onClick={() => setTourOpen(true)}>
                  <Typography variant="caption" color="common.black">
                    Watch Tour Guide
                  </Typography>
                  <PlayCircleOutlineIcon sx={{ fontSize: "1.125rem", color: "common.black" }} />
                </TourPill>
              </ButtonsRow>
            </IntroColumn>
            <KpiStack>
              {KPI_LABELS.map((label, i) => (
                <KpiCard key={label} idx={i}>
                  <KpiBody>
                    <Typography variant="subtitle5">{label}</Typography>
                    <Bar w="6.6875rem" big />
                  </KpiBody>
                  <Bar w="3.25rem" />
                </KpiCard>
              ))}
              <KpiCard idx={3}>
                <KpiBody>
                  <Typography variant="subtitle5">Total Rewards</Typography>
                  <KpiValueRow>
                    <Typography variant="body4" color="common.black">
                      $ 6,472.83
                    </Typography>
                    <Chip variant="mini" color="success" label="+0.6%" />
                  </KpiValueRow>
                </KpiBody>
                <Typography variant="subtitle5">Reward 24H</Typography>
                <Watermark src={WATERMARK_ICON} alt="" />
              </KpiCard>
            </KpiStack>
          </TopRow>
        </TopBlock>
        <BalancePanel>
          <SectionHeaderRow>
            <SectionHeaderLeft>
              <Typography variant="h6" sx={{ fontWeight: 500, color: "common.black" }}>
                Portfolio Balance
              </Typography>
            </SectionHeaderLeft>
            <Box sx={{ pointerEvents: "none", opacity: 0.75 }}>
              <Tabs tabs={CHART_TABS} activeTab={tab} setActiveTab={() => {}} isPathProvided={false} />
            </Box>
          </SectionHeaderRow>
          <LockedChartRoot>
            <LockedChartArt>
              <img src="/assets/locked/portfolioLine.svg" alt="" />
            </LockedChartArt>
            <LockedCopy
              titleLead="Your "
              titleAccent="Crypto Wealth"
              titleTrail=", Visualized"
              description="Unlock timeline tracking, allocation analysis, top & worst performers insights designed to help you manage risk and maximize opportunities."
              ctaLabel="Connect & Analyze"
              onConnect={openConnectModal}
            />
          </LockedChartRoot>
        </BalancePanel>
        <Watermark src={WATERMARK_ICON} alt="" />
      </Root>
      <TourGuideModal open={tourOpen} handleClose={() => setTourOpen(false)} />
    </>
  );
}
