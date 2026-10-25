"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import { SpotLocked } from "@/components/trade/TradeLocked";

const Root = styled(Box)({ display: "flex", flexDirection: "column", minHeight: "100vh", paddingTop: "0.5rem" });

const Card = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.surfaceBg.section,
  border: `0.0625rem solid ${theme.palette.border.main600}`,
  borderRadius: "1.5rem",
  padding: "1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "1.25rem",
}));

const Heading = styled(Box)({ display: "flex", flexDirection: "column", gap: "0.5rem" });

const DashedRule = styled(Box)(({ theme }) => ({ width: "100%", borderTop: `0.0625rem dashed ${theme.palette.border.dashed}` }));

const TABS: TabItem[] = [
  { id: "wallet", label: "Wallet" },
  { id: "exchange", label: "Exchange APIs" },
];

const STORAGE_KEY = "seidar.settings.activeTab";
const WALLET_TEXT = "Connect a wallet to view balances, manage assets, and track activity across Stellar.";

export default function Settings() {
  const [tab, setTab] = useState("wallet");

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "exchange") setTab("exchange");
    } catch {}
  }, []);

  const select = (id: string) => {
    setTab(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  };

  return (
    <Root>
      <Card>
        <Heading>
          <Typography variant="h4" color="common.black">
            Settings
          </Typography>
          <Typography variant="body3">
            Connect wallets and exchange API keys. Seidar never custodies funds, keys are encrypted client-side and
            stored in your browser keystore.
          </Typography>
        </Heading>
        <DashedRule />
        <Tabs tabs={TABS} activeTab={tab} setActiveTab={select} isPathProvided={false} />
        {tab === "wallet" ? <SpotLocked text={WALLET_TEXT} illustration="/assets/settingsWalletLocked.svg" /> : <SpotLocked />}
      </Card>
    </Root>
  );
}
