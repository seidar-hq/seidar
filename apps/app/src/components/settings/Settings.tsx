"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import { SpotLocked } from "@/components/trade/TradeLocked";
import { useWallet } from "@/wallet/WalletContext";
import WalletCards from "./WalletCards";

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

const TABS: TabItem[] = [{ id: "wallet", label: "Wallet" }];

const WALLET_TEXT = "Connect a wallet to view balances, manage assets, and track activity across Stellar.";

export default function Settings() {
  const { isConnected } = useWallet();

  return (
    <Root>
      <Card>
        <Heading>
          <Typography variant="h4" color="common.black">
            Settings
          </Typography>
          <Typography variant="body3">
            Link and manage your Stellar wallets. Seidar never custodies funds or keys: every transaction is signed in
            your own wallet.
          </Typography>
        </Heading>
        <DashedRule />
        <Tabs tabs={TABS} activeTab="wallet" setActiveTab={() => {}} isPathProvided={false} />
        {isConnected ? <WalletCards /> : <SpotLocked text={WALLET_TEXT} illustration="/assets/settingsWalletLocked.svg" />}
      </Card>
    </Root>
  );
}
