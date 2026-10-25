"use client";

import { useState } from "react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import WalletPromo from "@/components/common/locked/WalletPromo";
import { useWallet } from "@/wallet/WalletContext";

export const SwapAccordion = styled(Accordion)(({ theme }) => ({
  width: "100%",
  backgroundColor: theme.palette.surfaceBg.section,
  border: `0.0625rem solid ${theme.palette.mode === "dark" ? theme.palette.overlay.white08 : theme.palette.border.main600}`,
  borderRadius: "1.5rem !important",
  overflow: "hidden",
  "&:before": { display: "none" },
}));

export const SwapSummary = styled(AccordionSummary)({
  padding: "1rem 1rem 0",
  minHeight: 0,
  "& .MuiAccordionSummary-content": { margin: 0 },
});

export const SwapDetails = styled(AccordionDetails)({
  padding: "1.25rem 1rem 1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.625rem",
});

const TokenStack = styled(Box)({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.625rem",
  width: "100%",
});

const SwapArrowSlot = styled(Box)({
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "3rem",
  height: "3rem",
  zIndex: 1,
  cursor: "pointer",
});

const TokenPanel = styled(Box)(({ theme }) => {
  const dark = theme.palette.mode === "dark";
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: "1rem",
    width: "100%",
    height: "10.375rem",
    padding: "1rem",
    borderRadius: "0.75rem",
    backgroundColor: dark ? theme.palette.overlay.white02 : theme.palette.grey[400],
    border: `0.0625rem solid ${dark ? theme.palette.overlay.white08 : theme.palette.border.main600}`,
    boxShadow: dark ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.exchange}` : "none",
  };
});

const SpaceRow = styled(Box)({ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" });
const TokenPanelBody = styled(Box)({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.75rem",
  width: "100%",
});

const BalancePill = styled("span")(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.5rem",
  borderRadius: "999rem",
  backgroundColor: theme.palette.mode === "dark" ? theme.palette.overlay.white05 : theme.palette.grey[800],
}));

const ExchangeButton = styled(Button)({
  height: "3rem",
  padding: "0.375rem 0.5rem 0.3125rem",
  gap: "0.25rem",
  borderRadius: "999rem",
});

const WidgetRoot = styled(Box)(({ theme }) => ({
  width: "100%",
  height: "38.5rem",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  borderRadius: "1.5rem",
  backgroundColor: theme.palette.surfaceBg.section,
  backgroundImage: theme.palette.gradient.walletPromoGlow,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "bottom",
  backgroundSize: "100% 50%",
  "& > .MuiPaper-root": {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "transparent",
    backgroundImage: "none",
    border: "none",
  },
  "& .MuiCollapse-root, & .MuiCollapse-wrapper, & .MuiCollapse-wrapperInner, & [role='region'], & .MuiAccordionDetails-root": {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
}));

const ExchangeSelectRow = styled(Box)({ padding: "1.25rem 1rem 0.625rem" });

const ExchangeSelect = styled(Box)(({ theme }) => {
  const line = theme.palette.mode === "dark" ? theme.palette.overlay.white08 : theme.palette.border.main600;
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    height: "3rem",
    padding: "0.375rem 1rem",
    borderRadius: "999rem",
    backgroundColor: theme.palette.grey[400],
    borderTop: `0.0625rem solid ${line}`,
    borderBottom: `0.0625rem solid ${line}`,
    opacity: "0.5",
  };
});

const StackArea = styled(Box)({
  flex: 1,
  minHeight: 0,
  display: "grid",
  gridTemplateAreas: '"stack"',
  gridTemplateRows: "1fr",
  "& > *": { gridArea: "stack" },
});

const BlurredForm = styled(Box)({
  isolation: "isolate",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  width: "100%",
  padding: "0 1rem 1rem",
  pointerEvents: "none",
  filter: "blur(3.125rem)",
});

const PromoOverlay = styled(Box)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-end",
  padding: "1rem 1rem 1.75rem",
  borderRadius: "0 0 1.75rem 1.75rem",
  backdropFilter: "blur(0.5rem)",
  WebkitBackdropFilter: "blur(0.5rem)",
  backgroundImage: theme.palette.gradient.walletPromoGlow,
}));

const TokenSelectPill = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  width: "7.8125rem",
  height: "2.0625rem",
  padding: "0.5rem 0.75rem",
  borderRadius: "6.25rem",
  backgroundColor: theme.palette.overlay.white08,
  border: `0.0625rem solid ${theme.palette.grey[300]}`,
}));

const SwapCircle = styled(Box)(({ theme }) => ({
  width: "3rem",
  height: "3rem",
  borderRadius: "50%",
  backgroundColor: theme.palette.sidebar.primary,
}));

const SlippageLabel = styled(Box)({ display: "flex", alignItems: "center", gap: "0.5rem" });

const SlippageInput = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  width: "10.9375rem",
  height: "2.5rem",
  padding: "0.5rem 0.625rem",
  borderRadius: "6.25rem",
  backgroundColor: theme.palette.grey[400],
}));

export const SWAP_TABS: TabItem[] = [
  { id: "swap", label: "Swap" },
  { id: "cross-chain-swap", label: "Cross-Chain Swap" },
  { id: "send", label: "Send" },
  { id: "receive", label: "Receive" },
];

function GhostTokenPanel({ label }: { label: string }) {
  return (
    <TokenPanel>
      <Typography variant="subtitle1" color="grey.200">
        {label}
      </Typography>
      <TokenPanelBody>
        <SpaceRow>
          <Typography variant="h5" color="grey.200">
            0
          </Typography>
          <TokenSelectPill>
            <Typography variant="subtitle3" color="common.black">
              Select Token
            </Typography>
            <KeyboardArrowDown sx={{ fontSize: "1rem", color: "grey.200" }} />
          </TokenSelectPill>
        </SpaceRow>
        <SpaceRow>
          <BalancePill>
            <Typography variant="subtitle3" color="grey.200">
              Balance: 0.00
            </Typography>
          </BalancePill>
          <Typography variant="subtitle3" color="grey.200">
            ≈$0.00
          </Typography>
        </SpaceRow>
      </TokenPanelBody>
    </TokenPanel>
  );
}

export default function SwapLockedWidget() {
  const [tab] = useState("swap");
  const { openConnectModal } = useWallet();

  return (
    <WidgetRoot>
      <SwapAccordion elevation={0} expanded>
        <SwapSummary>
          <Box sx={{ pointerEvents: "none", opacity: 0.75 }}>
            <Tabs tabs={SWAP_TABS} activeTab={tab} setActiveTab={() => {}} isPathProvided={false} fullWidth />
          </Box>
        </SwapSummary>
        <SwapDetails sx={{ p: 0 }}>
          <ExchangeSelectRow>
            <ExchangeSelect>
              <Typography variant="subtitle3" color="sidebar.heading">
                Select your Exchange
              </Typography>
              <KeyboardArrowDown sx={{ fontSize: "1.25rem", color: "grey.200" }} />
            </ExchangeSelect>
          </ExchangeSelectRow>
          <StackArea>
            <BlurredForm aria-hidden>
              <TokenStack>
                <GhostTokenPanel label="From" />
                <GhostTokenPanel label="To" />
                <SwapArrowSlot>
                  <SwapCircle />
                </SwapArrowSlot>
              </TokenStack>
              <SpaceRow>
                <SlippageLabel>
                  <Typography variant="subtitle3" color="sidebar.heading">
                    Max Slippage
                  </Typography>
                  <InfoOutlinedIcon sx={{ fontSize: "1rem", color: "primary.main" }} />
                </SlippageLabel>
                <SlippageInput>
                  <Typography variant="subtitle3" color="sidebar.heading">
                    %
                  </Typography>
                </SlippageInput>
              </SpaceRow>
              <ExchangeButton variant="solid" color="primary" fullWidth>
                EXCHANGE
              </ExchangeButton>
            </BlurredForm>
            <PromoOverlay>
              <WalletPromo onConnect={openConnectModal} />
            </PromoOverlay>
          </StackArea>
        </SwapDetails>
      </SwapAccordion>
    </WidgetRoot>
  );
}
