"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import SwapLockedWidget from "@/components/swap/SwapLockedWidget";
import SwapWidget from "@/components/swap/SwapWidget";
import type { SwapToken } from "@/components/swap/TokenSelectDialog";
import ActivityTable from "@/components/transactions/ActivityTable";
import { useActivity } from "@/components/transactions/useActivity";
import { useWallet } from "@/wallet/WalletContext";
import PairChart from "./PairChart";
import Perps from "./Perps";
import { MarketLocked } from "./TradeLocked";

function SwapHistory() {
  const { address } = useWallet();
  const act = useActivity(address ? [address] : [], "swaps");
  return (
    <Box
      sx={{
        p: "1.25rem",
        borderRadius: "1.5rem",
        backgroundColor: "surfaceBg.section",
        border: (t) => `0.0625rem solid ${t.palette.border.main1000}`,
      }}
    >
      <Typography variant="subtitle2" color="common.black" sx={{ mb: "1rem" }}>
        Swap history
      </Typography>
      <ActivityTable items={act.items.slice(0, 20)} loading={act.loading} multi={false} />
    </Box>
  );
}

function SwapTab() {
  const { isConnected } = useWallet();
  const [pair, setPair] = useState<{ from: SwapToken | null; to: SwapToken | null }>({ from: null, to: null });
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
        {isConnected ? (
          <>
            <PairChart base={pair.from} quote={pair.to} />
            <SwapHistory />
          </>
        ) : (
          <MarketLocked />
        )}
      </Box>
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
        {isConnected ? <SwapWidget onPairChange={(from, to) => setPair({ from, to })} /> : <SwapLockedWidget />}
      </Box>
    </Box>
  );
}

const TABS: TabItem[] = [
  { id: "dex", label: "Swap", path: "/trade-swap/dex" },
  { id: "perps", label: "Perps", path: "/trade-swap/perps" },
];

export default function TradeSwap() {
  const pathname = usePathname();
  const [active, setActive] = useState(() => (pathname.startsWith("/trade-swap/perps") ? "perps" : "dex"));
  useEffect(() => setActive(pathname.startsWith("/trade-swap/perps") ? "perps" : "dex"), [pathname]);
  return (
    <>
      <Tabs tabs={TABS} activeTab={active} setActiveTab={setActive} />
      <Box sx={{ mt: "1rem" }}>{active === "perps" ? <Perps /> : <SwapTab />}</Box>
    </>
  );
}
