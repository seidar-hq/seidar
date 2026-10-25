"use client";

import Box from "@mui/material/Box";
import { useWallet } from "@/wallet/WalletContext";
import OrderEntry from "./perps/OrderEntry";
import PerpsTables, { AccountCard } from "./perps/PerpsAccount";
import PerpsChart from "./perps/PerpsChart";
import { usePerpsAccounts, usePerpsMarket } from "./perps/usePerps";

// Zenex perps (XLM/USD, settled in USDC): live chart, order entry, account and history.
export default function Perps() {
  const { activeWallet } = useWallet();
  const { market } = usePerpsMarket();
  const me = activeWallet?.address ?? null;
  const { byAddress, loading } = usePerpsAccounts(me ? [me] : []);
  const account = me ? (byAddress[`zenex:acct:${me}`] ?? null) : null;
  const acct = account?.ok ? account : null;
  return (
    <Box
      sx={{
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "minmax(0, 1fr) 27.875rem",
        alignItems: "start",
        "@media (max-width: 75rem)": { gridTemplateColumns: "minmax(0, 1fr)" },
      }}
    >
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
        <PerpsChart market={market} />
        <PerpsTables account={acct} market={market} loading={!!me && loading} />
      </Box>
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
        <OrderEntry market={market} account={acct} />
        <AccountCard account={acct} loading={!!me && loading} />
      </Box>
    </Box>
  );
}
