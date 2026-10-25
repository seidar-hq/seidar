"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import { SpotLocked } from "@/components/trade/TradeLocked";
import { useWallet } from "@/wallet/WalletContext";
import TransactionFilter from "./TransactionFilter";

const TABS: TabItem[] = [
  { id: "transaction", label: "Transaction" },
  { id: "positions", label: "Positions" },
];

const TRANSACTIONS_TEXT = "Connect a wallet to view your swaps, bridges, transfers, and on-chain activity.";
const POSITIONS_TEXT = "Connect a wallet to track your active staking, lending, liquidity, and trading positions.";
const ILLUSTRATION = "/assets/allTransactionsLocked.svg";

function TransactionsContent() {
  const theme = useTheme();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "positions" ? "positions" : "transaction");
  const [filter, setFilter] = useState("all");
  const { isConnected } = useWallet();

  useEffect(() => {
    const t = params.get("tab");
    if (t === "positions" || t === "transaction") setTab(t);
  }, [params]);

  const downloadButton = (
    <Button variant="solid" endIcon={<SaveAltIcon />} disabled={!isConnected} sx={{ textTransform: "none" }}>
      Download CSV
    </Button>
  );

  return (
    <Box sx={{ backgroundColor: "transparent", minHeight: "100vh" }}>
      <Typography variant="body4" sx={{ display: "block", mt: "1rem" }}>
        History
      </Typography>
      <Box
        sx={{
          backgroundColor: theme.palette.surfaceBg.section,
          border: (t) => `0.0625rem solid ${t.palette.border.main1000}`,
          borderRadius: "1.500rem",
        }}
        overflow="hidden"
        padding="1rem"
        width="100%"
        mt="1rem"
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: "1rem" }}>
          <Tabs tabs={TABS} activeTab={tab} setActiveTab={setTab} isPathProvided={false} />
          {tab === "transaction" && (
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <TransactionFilter value={filter} onChange={setFilter} />
              {downloadButton}
            </Box>
          )}
          {tab === "positions" && downloadButton}
        </Box>
        <Box sx={{ width: "100%", minHeight: "630px" }}>
          <SpotLocked text={tab === "transaction" ? TRANSACTIONS_TEXT : POSITIONS_TEXT} illustration={ILLUSTRATION} bare />
        </Box>
      </Box>
    </Box>
  );
}

export default function Transactions() {
  return (
    <Suspense fallback={null}>
      <TransactionsContent />
    </Suspense>
  );
}
