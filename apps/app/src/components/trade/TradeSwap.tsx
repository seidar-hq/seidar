"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import SwapLockedWidget from "@/components/swap/SwapLockedWidget";
import { MarketLocked, PerpsLocked, SpotLocked } from "./TradeLocked";

function SwapTab() {
  return (
    <Box
      sx={{
        backgroundColor: "transparent",
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "1fr 27.375rem",
        alignItems: "start",
        "@media (max-width: 70rem)": { gridTemplateColumns: "1fr" },
      }}
    >
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
        <MarketLocked />
      </Box>
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
        <SwapLockedWidget />
      </Box>
    </Box>
  );
}

const TABS: (TabItem & { component: React.ReactNode })[] = [
  { id: "dex", label: "Swap", path: "/trade-swap/dex", component: <SwapTab /> },
  { id: "cex", label: "Spot", path: "/trade-swap/cex", component: <SpotLocked /> },
  { id: "perps", label: "Derivatives", path: "/trade-swap/perps", component: <PerpsLocked /> },
];

export default function TradeSwap() {
  const [active, setActive] = useState("dex");
  const current = TABS.find((t) => t.id === active) ?? TABS[0];
  return (
    <>
      <Tabs tabs={TABS} activeTab={active} setActiveTab={setActive} />
      <Box sx={{ mt: "1rem", backgroundColor: "overlay.white02" }}>{current.component}</Box>
    </>
  );
}
