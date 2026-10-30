"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import DataTable, { EmptyState, type Column } from "@/components/common/DataTable";
import TokenLogo from "@/components/common/TokenLogo";
import { fmtPx, positionExits, usePerpsAccounts, type PerpsPosition } from "@/components/trade/perps/usePerps";
import { formatAmount, formatUsd } from "@/lib/format";
import { useWallet, walletLabel } from "@/wallet/WalletContext";

type Row = PerpsPosition & { wallet: string };

const T = ({ children, color = "common.black" }: { children: React.ReactNode; color?: string }) => (
  <Typography variant="body1" sx={{ color }}>
    {children}
  </Typography>
);
const pnlColor = (v: number) => (v > 0 ? "green.main" : v < 0 ? "error.main" : "common.black");

// Zenex perps positions for the wallets the portfolio covers.
export default function PerpsPositions({ addresses }: { addresses: string[] }) {
  const { wallets } = useWallet();
  const { byAddress, loading } = usePerpsAccounts(addresses);
  if (!addresses.length) return <EmptyState message="Connect a wallet to view your perps positions." />;
  const rows: Row[] = addresses.flatMap((a) => (byAddress[`zenex:acct:${a}`]?.positions ?? []).map((p) => ({ ...p, wallet: a })));
  const multi = addresses.length > 1;
  const name = (a: string) => {
    const w = wallets.find((x) => x.address === a);
    return w ? walletLabel(w) : a.slice(0, 6);
  };
  const cols: Column<Row>[] = [
    {
      id: "market",
      header: "Market",
      cell: (r) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <TokenLogo code="XLM" size="2.25rem" />
          <Box>
            <T>
              XLM/USD{" "}
              <Box component="span" sx={{ color: r.side === "long" ? "green.main" : "error.main", textTransform: "capitalize" }}>
                {r.side}
              </Box>
            </T>
            <Typography variant="caption" color="grey.200">
              Zenex{multi ? ` · ${name(r.wallet)}` : ""}
            </Typography>
          </Box>
        </Box>
      ),
    },
    { id: "size", header: "Size", cell: (r) => <T>{formatAmount(r.size, 2)} XLM</T> },
    { id: "value", header: "Position value", cell: (r) => <T>{formatUsd(r.notional)}</T>, sortValue: (r) => r.notional },
    { id: "entry", header: "Entry / Liq.", cell: (r) => <T>${fmtPx(r.entryPrice)} / ${fmtPx(r.liquidationPrice)}</T> },
    { id: "margin", header: "Margin", cell: (r) => <T>{formatUsd(r.margin)} · {r.leverage.toFixed(1)}x</T> },
    {
      id: "tpsl",
      header: "TP / SL",
      cell: (r) => {
        const { tp, sl } = positionExits(byAddress[`zenex:acct:${r.wallet}`]?.openOrders, r.side);
        const px = (v: number[]) => (v.length ? v.map((x) => `$${fmtPx(x)}`).join(", ") : "—");
        return (
          <T>
            <Box component="span" sx={{ color: tp.length ? "green.main" : "grey.200" }}>{px(tp)}</Box>
            {" / "}
            <Box component="span" sx={{ color: sl.length ? "error.main" : "grey.200" }}>{px(sl)}</Box>
          </T>
        );
      },
    },
    { id: "pnl", header: "Net PnL", cell: (r) => <T color={pnlColor(r.netPnl)}>{formatUsd(r.netPnl)} ({r.netPnlPct.toFixed(2)}%)</T>, sortValue: (r) => r.netPnl },
  ];
  return <DataTable from="portfolio" columns={cols} rows={rows} isLoading={loading && rows.length === 0} emptyDataText="No open perps positions" getRowId={(r) => `${r.wallet}:${r.side}`} />;
}
