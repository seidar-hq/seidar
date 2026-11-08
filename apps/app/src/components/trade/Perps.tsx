"use client";

import Box from "@mui/material/Box";
import { useWallet } from "@/wallet/WalletContext";
import { PerpsLocked } from "./TradeLocked";
import OrderEntry from "./perps/OrderEntry";
import PerpsTables, { AccountCard } from "./perps/PerpsAccount";
import PerpsChart from "./perps/PerpsChart";
import { usePerpsAccounts, usePerpsMarket } from "./perps/usePerps";

// Zenex perps (XLM/USD, settled in USDC): live chart, order entry, account and history.
// Without a wallet the page shows the locked layout instead.
export default function Perps() {
  const { isConnected } = useWallet();
  return isConnected ? <PerpsTrading /> : <PerpsLocked />;
}

function PerpsTrading() {
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
        "@media (max-width: 75rem)": { gridTemplateColumns: "minmax(0, 1fr)" },
      }}
    >
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
        <PerpsChart market={market} />
        {/* Out of flow, so its rows can't stretch the page: the card ends level with the Account card
            and scrolls inside. The column stacks on small screens, so it needs its own height there. */}
        <Box sx={{ position: "relative", flex: "1 1 0", minHeight: "22rem", "@media (max-width: 75rem)": { flex: "none", height: "32rem" } }}>
          <Box sx={{ position: "absolute", inset: 0 }}>
            <PerpsTables account={acct} market={market} loading={!!me && loading} />
          </Box>
        </Box>
      </Box>
      <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1rem" }}>
        <OrderEntry market={market} account={acct} />
        <AccountCard account={acct} loading={!!me && loading} />
      </Box>
    </Box>
  );
}
