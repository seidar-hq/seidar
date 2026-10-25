"use client";

import Box from "@mui/material/Box";
import SwapLockedWidget from "@/components/swap/SwapLockedWidget";
import News from "./News";
import PortfolioLocked from "./PortfolioLocked";
import WalletTableLocked from "./WalletTableLocked";

// Wallet connection is not wired up yet, so the dashboard always renders its locked widgets.
export default function Dashboard() {
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
          <PortfolioLocked />
          <WalletTableLocked />
        </Box>
        <Box>
          <SwapLockedWidget />
          <News />
        </Box>
      </Box>
    </Box>
  );
}
