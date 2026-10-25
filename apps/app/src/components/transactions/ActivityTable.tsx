"use client";

import Box from "@mui/material/Box";
import Link from "@mui/material/Link";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import CallMadeRoundedIcon from "@mui/icons-material/CallMadeRounded";
import CallReceivedRoundedIcon from "@mui/icons-material/CallReceivedRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import WidgetsOutlinedIcon from "@mui/icons-material/WidgetsOutlined";
import DataTable, { type Column } from "@/components/common/DataTable";
import TokenLogo from "@/components/common/TokenLogo";
import { formatAmount, shortAddress } from "@/lib/format";
import { explorerTx } from "@/lib/tx";
import { useWallet, walletLabel } from "@/wallet/WalletContext";
import type { ActivityItem } from "./useActivity";

const KIND_ICON = {
  swap: SwapHorizRoundedIcon,
  position: AccountBalanceOutlinedIcon,
  other: WidgetsOutlinedIcon,
};

function TypeCell({ i }: { i: ActivityItem }) {
  const Icon =
    i.kind === "transfer" ? (i.legs.some((l) => l.dir === "out") ? CallMadeRoundedIcon : CallReceivedRoundedIcon) : KIND_ICON[i.kind];
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
      <Box
        sx={{
          width: "2rem",
          height: "2rem",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "border.iconBg",
        }}
      >
        <Icon sx={{ fontSize: "1.125rem", color: "primary.main" }} />
      </Box>
      <Box>
        <Typography variant="body3" color="common.black" sx={{ display: "block" }}>
          {i.action}
        </Typography>
        <Typography variant="caption" color={i.ok ? "grey.200" : "error.main"} sx={{ display: "block" }}>
          {i.ok ? new Date(i.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Failed"}
        </Typography>
      </Box>
    </Box>
  );
}

function Legs({ i }: { i: ActivityItem }) {
  if (!i.legs.length)
    return (
      <Typography variant="body3" color="grey.200">
        —
      </Typography>
    );
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {i.legs.map((l, k) => (
        <Box key={k} sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <TokenLogo code={l.code} issuer={l.issuer} size="1.75rem" />
          <Typography variant="body3" color={l.dir === "in" ? "green.main" : "common.black"}>
            {l.dir === "in" ? "+" : "-"}
            {formatAmount(l.amount, 6)} {l.code}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function WalletName({ address }: { address: string }) {
  const { wallets } = useWallet();
  const w = wallets.find((x) => x.address === address);
  return (
    <Typography variant="body3" color="black.main100">
      {w ? walletLabel(w) : shortAddress(address)}
    </Typography>
  );
}

/** History table: date + type, assets moved, protocol, counterparty, wallet, fee and explorer link. */
export default function ActivityTable({ items, loading, multi }: { items: ActivityItem[]; loading: boolean; multi: boolean }) {
  const columns: Column<ActivityItem>[] = [
    { id: "type", header: "Type", cell: (i) => <TypeCell i={i} /> },
    { id: "assets", header: "Assets", cell: (i) => <Legs i={i} /> },
    {
      id: "protocol",
      header: "Protocol",
      cell: (i) => (
        <Typography variant="body3" color="black.main100">
          {i.protocol ?? (i.kind === "transfer" ? "Stellar" : "—")}
        </Typography>
      ),
    },
    {
      id: "counterparty",
      header: "Counterparty",
      cell: (i) =>
        i.counterparty ? (
          <Tooltip title={i.counterparty} arrow placement="top">
            <Typography variant="body3" color="primary.main" sx={{ cursor: "default" }}>
              {shortAddress(i.counterparty, 5, 5)}
            </Typography>
          </Tooltip>
        ) : (
          <Typography variant="body3" color="grey.200">
            —
          </Typography>
        ),
    },
    ...(multi ? [{ id: "wallet", header: "Wallet", cell: (i: ActivityItem) => <WalletName address={i.wallet} /> }] : []),
    {
      id: "fee",
      header: "Fee",
      cell: (i) => (
        <Typography variant="body3" color="black.main100">
          {i.feeXlm != null ? `${formatAmount(i.feeXlm, 5)} XLM` : "—"}
        </Typography>
      ),
    },
    {
      id: "tx",
      header: "Transaction",
      cell: (i) => (
        <Link href={explorerTx(i.hash)} target="_blank" rel="noopener" variant="body3">
          {shortAddress(i.hash, 6, 4)}
        </Link>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={items}
      isLoading={loading && items.length === 0}
      emptyDataText="No activity yet"
      getRowId={(i) => `${i.wallet}:${i.id}`}
    />
  );
}
