"use client";

import Box from "@mui/material/Box";
import { styled } from "@mui/material/styles";
import { SectionCard, fadedBorder } from "@/components/common/SectionCard";
import SwapLockedWidget from "@/components/swap/SwapLockedWidget";
import PortfolioKpis from "@/components/wallets/PortfolioKpis";
import { usePortfolio } from "@/portfolio/usePortfolio";
import { useWallet } from "@/wallet/WalletContext";
import AssetTables from "./AssetTables";
import News from "./News";
import PortfolioBalance from "./PortfolioBalance";
import PortfolioLocked from "./PortfolioLocked";
import WalletTableLocked from "./WalletTableLocked";
import SwapWidget from "@/components/swap/SwapWidget";

const PortfolioCard = styled(SectionCard)(({ theme }) => ({ ...fadedBorder(theme), minHeight: "38.5rem" }));

function ConnectedPortfolio() {
  const portfolio = usePortfolio();
  return (
    <>
      <PortfolioCard>
        <PortfolioKpis />
        <PortfolioBalance portfolio={portfolio} />
      </PortfolioCard>
      <AssetTables portfolio={portfolio} />
    </>
  );
}

export default function Dashboard() {
  const { isConnected } = useWallet();
  return (
    <Box sx={{ minHeight: "100vh" }}>
      <Box
        sx={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "minmax(12.500rem, 1fr) 27.375rem",
          "@media (max-width: 54.250rem)": { gridTemplateColumns: "1fr" },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          {isConnected ? (
            <ConnectedPortfolio />
          ) : (
            <>
              <PortfolioLocked />
              <WalletTableLocked />
            </>
          )}
        </Box>
        <Box>
          {isConnected ? <SwapWidget /> : <SwapLockedWidget />}
          <News />
        </Box>
      </Box>
    </Box>
  );
}
