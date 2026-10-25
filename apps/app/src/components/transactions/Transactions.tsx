"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import Tabs, { type TabItem } from "@/components/common/Tabs";
import { SpotLocked } from "@/components/trade/TradeLocked";
import PortfolioSelect from "@/components/wallet/PortfolioSelect";
import { useWallet } from "@/wallet/WalletContext";
import ActivityTable from "./ActivityTable";
import TransactionFilter from "./TransactionFilter";
import { category, isDust, useActivity, type ActivityItem } from "./useActivity";

const TABS: TabItem[] = [
  { id: "transaction", label: "Transaction" },
  { id: "positions", label: "Positions" },
];

const TRANSACTIONS_TEXT = "Connect a wallet to view your swaps, transfers and on-chain activity.";
const POSITIONS_TEXT = "Connect a wallet to track your lending, liquidity and vault activity.";
const ILLUSTRATION = "/assets/allTransactionsLocked.svg";

function toCsv(items: ActivityItem[]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const head = ["date", "type", "status", "assets", "protocol", "counterparty", "wallet", "fee_xlm", "tx_hash"];
  const rows = items.map((i) =>
    [
      i.at,
      i.action,
      i.ok ? "success" : "failed",
      i.legs.map((l) => `${l.dir === "in" ? "+" : "-"}${l.amount} ${l.code}${l.issuer ? `:${l.issuer}` : ""}`).join(" "),
      i.protocol ?? "",
      i.counterparty ?? "",
      i.wallet,
      i.feeXlm != null ? String(i.feeXlm) : "",
      i.hash,
    ]
      .map((v) => esc(String(v)))
      .join(","),
  );
  return [head.join(","), ...rows].join("\n");
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ConnectedHistory({ tab, filter, showDust }: { tab: string; filter: string; showDust: boolean }) {
  const { portfolioAddresses } = useWallet();
  const act = useActivity(portfolioAddresses, tab === "positions" ? "positions" : "all");
  const rows = useMemo(
    () =>
      act.items.filter((i) => (showDust || !isDust(i)) && (tab === "positions" || filter === "all" || category(i) === filter)),
    [act.items, filter, showDust, tab],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <ActivityTable items={rows} loading={act.loading} multi={portfolioAddresses.length > 1} />
      {act.error && (
        <Typography variant="subtitle3" color="error.main" sx={{ textAlign: "center" }}>
          {act.error}
        </Typography>
      )}
      <Box sx={{ display: "flex", justifyContent: "center", gap: "0.75rem" }}>
        {act.hasMore && (
          <Button variant="outlined" color="cancel" size="small" disabled={act.loading} onClick={() => void act.loadMore()} sx={{ height: "2.5rem", textTransform: "none" }}>
            {act.loading ? "Loading…" : "Load older activity"}
          </Button>
        )}
        <Button
          variant="solid"
          size="small"
          endIcon={<SaveAltIcon />}
          disabled={!rows.length}
          onClick={() => download(`seidar-${tab}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows))}
          sx={{ height: "2.5rem", textTransform: "none" }}
        >
          Download CSV
        </Button>
      </Box>
    </Box>
  );
}

function TransactionsContent() {
  const theme = useTheme();
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "positions" ? "positions" : "transaction");
  const [filter, setFilter] = useState("all");
  const [showDust, setShowDust] = useState(false);
  const { isConnected } = useWallet();

  useEffect(() => {
    const t = params.get("tab");
    if (t === "positions" || t === "transaction") setTab(t);
  }, [params]);

  return (
    <Box sx={{ backgroundColor: "transparent", minHeight: "100vh" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: "1rem" }}>
        <Typography variant="body4">History</Typography>
        {isConnected && <PortfolioSelect />}
      </Box>
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
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", mb: "1rem" }}>
          <Tabs tabs={TABS} activeTab={tab} setActiveTab={setTab} isPathProvided={false} />
          {isConnected && tab === "transaction" && (
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <FormControlLabel
                control={<Switch size="small" checked={showDust} onChange={(e) => setShowDust(e.target.checked)} />}
                label={
                  <Typography variant="subtitle3" color="grey.200">
                    Show dust
                  </Typography>
                }
              />
              <TransactionFilter value={filter} onChange={setFilter} />
            </Box>
          )}
        </Box>
        <Box sx={{ width: "100%", minHeight: "630px" }}>
          {isConnected ? (
            <ConnectedHistory tab={tab} filter={filter} showDust={showDust} />
          ) : (
            <SpotLocked text={tab === "transaction" ? TRANSACTIONS_TEXT : POSITIONS_TEXT} illustration={ILLUSTRATION} bare />
          )}
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
