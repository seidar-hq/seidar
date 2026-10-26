"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import { SpotLocked } from "@/components/trade/TradeLocked";
import { useWallet } from "@/wallet/WalletContext";
import PortfolioCards from "./PortfolioCards";
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

const TABS: TabItem[] = [{ id: "portfolios", label: "Portfolios & Wallets" }];

const WALLET_TEXT = "Connect a wallet to create portfolios, manage linked wallets, and track activity across Stellar.";

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
            Group your Stellar wallets into portfolios and choose which one is active. Seidar never custodies funds
            or keys: every transaction is signed in your own wallet.
          </Typography>
        </Heading>
        <DashedRule />
        <Box sx={{ alignSelf: "flex-start" }}>
          <Tabs tabs={TABS} activeTab="portfolios" setActiveTab={() => {}} isPathProvided={false} />
        </Box>
        {isConnected ? (
          <>
            <PortfolioCards />
            <DashedRule />
            <WalletCards />
          </>
        ) : (
          <SpotLocked text={WALLET_TEXT} illustration="/assets/settingsWalletLocked.svg" />
        )}
      </Card>
    </Root>
  );
}
