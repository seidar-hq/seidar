"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Link from "@mui/material/Link";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DataTable, { type Column } from "@/components/common/DataTable";
import GlassDialog, { MODAL } from "@/components/common/GlassDialog";
import Tabs from "@/components/common/Tabs";
import { DetailRows } from "@/components/earn/ActionCard";
import { formatAmount, formatUsd } from "@/lib/format";
import { explorerTx } from "@/lib/tx";
import { useWallet } from "@/wallet/WalletContext";
import { cardSx, usePerpsTx, useUsdcBalance } from "./OrderEntry";
import { fmtPx, positionExits, type PerpsAccount, type PerpsClosed, type PerpsFill, type PerpsMarket, type PerpsOrder, type PerpsPosition } from "./usePerps";

const T = ({ children, color = "common.black", size = "0.9375rem" }: { children: React.ReactNode; color?: string; size?: string }) => (
  <Typography sx={{ fontSize: size, color }}>{children}</Typography>
);
const SideTag = ({ side }: { side: string }) => (
  <Box component="span" sx={{ px: "0.5rem", py: "0.125rem", borderRadius: "999rem", fontSize: "0.75rem", fontWeight: 600, color: side === "long" ? "green.main" : "error.main", backgroundColor: side === "long" ? "rgba(0,196,107,0.12)" : "rgba(229,72,77,0.12)", textTransform: "capitalize" }}>
    {side}
  </Box>
);
const pnlColor = (v: number) => (v > 0 ? "green.main" : v < 0 ? "error.main" : "common.black");
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const TxLink = ({ tx }: { tx: string }) => (
  <Link href={explorerTx(tx)} target="_blank" rel="noreferrer" sx={{ fontSize: "0.875rem" }}>
    {tx.slice(0, 6)}…{tx.slice(-4)}
  </Link>
);

type Mode = "close" | "reduce" | "add" | "withdraw" | "tp" | "sl";

/** Manage one position: close (full / part), margin in / out, take profit, stop loss. */
function PositionDialog({ position, market, initialMode = "close", onClose }: { position: PerpsPosition; market: PerpsMarket | null; initialMode?: Mode; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [value, setValue] = useState("");
  const [part, setPart] = useState(100);
  const { run, dialog } = usePerpsTx();
  const usdc = useUsdcBalance();
  const isLong = position.side === "long";
  const n = Number(value || 0);
  const execFee = market?.limits.execFee ?? 0;
  const mark = market?.price?.mid ?? position.markPrice;

  const submit = async () => {
    const side = position.side;
    const body: Record<string, unknown> =
      mode === "close"
        ? part >= 100
          ? { action: "close", side }
          : { action: "decrease", side, notional: ((position.notional * part) / 100).toFixed(7) }
        : mode === "add"
          ? { action: "add-margin", side, amount: n.toFixed(7) }
          : mode === "withdraw"
            ? { action: "withdraw-margin", side, amount: n.toFixed(7) }
            : { action: mode === "tp" ? "take-profit" : "stop-loss", side, triggerPrice: value };
    const title = mode === "close" ? (part >= 100 ? `Close ${side}` : `Close ${part}% of ${side}`) : mode === "add" ? "Add margin" : mode === "withdraw" ? "Withdraw margin" : mode === "tp" ? "Set take profit" : "Set stop loss";
    if (await run(title, body)) onClose();
  };

  const blocker =
    mode === "close"
      ? null
      : !(n > 0)
        ? "Enter a value"
        : mode === "add" && n + execFee > usdc + 1e-9
          ? "Insufficient USDC"
          : mode === "withdraw" && n >= position.margin
            ? "Leaves no margin"
            : mode === "tp" && (isLong ? n <= mark : n >= mark)
              ? `Take profit must be ${isLong ? "above" : "below"} the mark`
              : mode === "sl" && (isLong ? n >= mark : n <= mark)
                ? `Stop loss must be ${isLong ? "below" : "above"} the mark`
                : null;

  // Leverage and liquidation after a margin move (estimate).
  const newMargin = mode === "add" ? position.margin + n : mode === "withdraw" ? position.margin - n : position.margin;
  const mm = market?.limits.maintenanceMargin ?? 0;
  const liqAfter = isLong ? position.entryPrice * (1 + mm - newMargin / position.notional) : position.entryPrice * (1 - mm + newMargin / position.notional);

  return (
    <>
      <GlassDialog
        open
        onClose={onClose}
        title={`${isLong ? "Long" : "Short"} ${formatAmount(position.size, 2)} XLM`}
        subtitle={`Entry $${fmtPx(position.entryPrice)} · Mark $${fmtPx(mark)} · Net PnL ${formatUsd(position.netPnl)}`}
        primaryLabel={mode === "close" ? (part >= 100 ? "Close position" : `Close ${part}%`) : "Confirm"}
        primaryDisabled={!!blocker}
        onPrimary={submit}
      >
        <Tabs
          tabs={[
            { id: "close", label: "Close", padding: "0 0.5rem" },
            { id: "add", label: "Add margin", padding: "0 0.5rem" },
            { id: "withdraw", label: "Withdraw", padding: "0 0.5rem" },
            { id: "tp", label: "TP", padding: "0 0.5rem" },
            { id: "sl", label: "SL", padding: "0 0.5rem" },
          ]}
          activeTab={mode}
          setActiveTab={(id) => (setMode(id as Mode), setValue(""))}
          isPathProvided={false}
          fullWidth
        />
        {mode === "close" ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Typography sx={{ color: "#E3E3E3", fontSize: "1.5rem", fontWeight: 600 }}>{part}%</Typography>
            <Box sx={{ display: "flex", gap: "0.5rem" }}>
              {[25, 50, 75, 100].map((v) => (
                <ButtonBase key={v} onClick={() => setPart(v)} sx={{ flex: 1, height: "2rem", borderRadius: "999rem", fontSize: "0.8125rem", color: part === v ? "sidebar.white" : "#E3E3E3", backgroundColor: part === v ? "sidebar.primary" : MODAL.inset }}>
                  {v}%
                </ButtonBase>
              ))}
            </Box>
            <DetailRows
              rows={[
                { label: "Closes", value: `${formatUsd((position.notional * part) / 100)} of ${formatUsd(position.notional)}` },
                { label: "Net PnL realised (est.)", value: formatUsd((position.netPnl * part) / 100), color: pnlColor(position.netPnl) },
                { label: "Keeper fee", value: `${execFee} USDC` },
              ]}
            />
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", p: "0.875rem 1rem", borderRadius: "1rem", backgroundColor: MODAL.inset }}>
              <InputBase
                autoFocus
                value={value}
                placeholder={mode === "tp" || mode === "sl" ? fmtPx(mark) : "0.00"}
                onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setValue(e.target.value)}
                sx={{ flex: 1, fontSize: "1.375rem", fontWeight: 600, color: "#E3E3E3" }}
              />
              <Typography sx={{ color: MODAL.muted }}>{mode === "tp" || mode === "sl" ? "USD" : "USDC"}</Typography>
            </Box>
            <DetailRows
              rows={
                mode === "add" || mode === "withdraw"
                  ? [
                      { label: "Margin after", value: `${formatAmount(newMargin, 4)} USDC` },
                      { label: "Liquidation after (est.)", value: n > 0 ? `$${fmtPx(liqAfter)}` : `$${fmtPx(position.liquidationPrice)}`, color: "orange.main" },
                      { label: mode === "add" ? "Wallet USDC" : "Keeper fee", value: mode === "add" ? formatAmount(usdc, 2) : `${execFee} USDC` },
                    ]
                  : [
                      { label: "Closes", value: "The whole position when the price crosses the trigger" },
                      { label: "Liquidation (est.)", value: `$${fmtPx(position.liquidationPrice)}`, color: "orange.main" },
                      { label: "Keeper fee (escrowed)", value: `${execFee} USDC` },
                    ]
              }
            />
          </Box>
        )}
        {blocker && mode !== "close" && n > 0 && <Typography sx={{ fontSize: "0.8125rem", color: "error.main" }}>{blocker}</Typography>}
      </GlassDialog>
      {dialog}
    </>
  );
}

/** Account summary: equity, margin used, unrealised PnL, wallet USDC and claimable credit. */
export function AccountCard({ account, loading }: { account: PerpsAccount | null; loading: boolean }) {
  const { isConnected } = useWallet();
  const usdc = useUsdcBalance();
  const { run, dialog } = usePerpsTx();
  const ps = account?.positions ?? [];
  const equity = ps.reduce((s, p) => s + p.equity, 0);
  const margin = ps.reduce((s, p) => s + p.margin, 0);
  const upnl = ps.reduce((s, p) => s + p.netPnl, 0);
  const credit = account?.claimableCredit ?? 0;
  const rows = [
    { label: "Wallet USDC", value: formatUsd(usdc) },
    { label: "Position equity", value: formatUsd(equity) },
    { label: "Margin in use", value: formatUsd(margin) },
    { label: "Unrealised net PnL", value: formatUsd(upnl), color: pnlColor(upnl) },
    { label: "Open orders", value: String(account?.openOrders.length ?? 0) },
  ];
  return (
    <Box sx={cardSx}>
      <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black" }}>Account</Typography>
      {!isConnected ? (
        <Typography sx={{ color: "grey.200", fontSize: "0.875rem" }}>Connect a wallet to see your Zenex balance, margin and PnL.</Typography>
      ) : loading && !account ? (
        <Typography sx={{ color: "grey.200", fontSize: "0.875rem" }}>Loading your Zenex account…</Typography>
      ) : (
        <>
          <DetailRows rows={rows} />
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", p: "0.875rem 1rem", borderRadius: "1rem", backgroundColor: "overlay.white04" }}>
            <Box>
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Claimable credit</Typography>
              <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: credit > 0 ? "green.main" : "common.black" }}>{formatAmount(credit, 4)} USDC</Typography>
            </Box>
            <Button variant="outlined" color="cancel" disabled={!(credit > 0)} onClick={() => void run("Claim Zenex credit", { action: "claim" })} sx={{ borderRadius: "999rem" }}>
              Claim
            </Button>
          </Box>
          <Typography sx={{ fontSize: "0.75rem", color: "grey.200", lineHeight: 1.5 }}>
            Margin is posted per position: add or withdraw it from a position&apos;s Manage menu. Claimable credit is USDC Zenex owes you: funding your positions earned (credited when a position settles) and any payout that couldn&apos;t reach your wallet, for example without a USDC trustline. Claim sends it to your wallet; Zenex charges no fee.
          </Typography>
        </>
      )}
      {dialog}
    </Box>
  );
}

/** Positions / Open Orders / Order History / Trades / Closed. */
export default function PerpsTables({ account, market, loading }: { account: PerpsAccount | null; market: PerpsMarket | null; loading: boolean }) {
  const { isConnected } = useWallet();
  const [tab, setTab] = useState("positions");
  const [managing, setManaging] = useState<{ position: PerpsPosition; mode: Mode } | null>(null);
  const { run, dialog } = usePerpsTx();
  const a = account;

  const posCols: Column<PerpsPosition>[] = [
    { id: "side", header: "Market", cell: (p) => <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><T>XLM/USD</T><SideTag side={p.side} /></Box> },
    { id: "size", header: "Size", cell: (p) => <Box><T>{formatAmount(p.size, 2)} XLM</T><T size="0.75rem" color="grey.200">{formatUsd(p.notional)}</T></Box>, sortValue: (p) => p.notional },
    { id: "entry", header: "Entry", cell: (p) => <T>${fmtPx(p.entryPrice)}</T> },
    { id: "mark", header: "Mark", cell: (p) => <T>${fmtPx(market?.price?.mid ?? p.markPrice)}</T> },
    { id: "liq", header: "Liq. price", cell: (p) => <T color="orange.main">${fmtPx(p.liquidationPrice)}</T> },
    { id: "margin", header: "Margin", cell: (p) => <Box><T>{formatUsd(p.margin)}</T><T size="0.75rem" color="grey.200">{p.leverage.toFixed(1)}x</T></Box> },
    { id: "pnl", header: "Net PnL", cell: (p) => <Box><T color={pnlColor(p.netPnl)}>{formatUsd(p.netPnl)}</T><T size="0.75rem" color={pnlColor(p.netPnl)}>{p.netPnlPct.toFixed(2)}%</T></Box>, sortValue: (p) => p.netPnl },
    {
      id: "tpsl",
      header: "TP / SL",
      cell: (p) => {
        const { tp, sl } = positionExits(a?.openOrders, p.side);
        const exit = (label: string, prices: number[], mode: Mode, color: string) => (
          <ButtonBase onClick={() => setManaging({ position: p, mode })} sx={{ justifyContent: "flex-start", fontSize: "0.875rem", color: prices.length ? color : "grey.200", "&:hover": { textDecoration: "underline" } }}>
            {label} {prices.length ? prices.map((v) => `$${fmtPx(v)}`).join(", ") : "Set"}
          </ButtonBase>
        );
        return (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            {exit("TP", tp, "tp", "green.main")}
            {exit("SL", sl, "sl", "error.main")}
          </Box>
        );
      },
    },
    {
      id: "funding",
      header: (
        <Tooltip arrow placement="top" title="Funding accrued on this position since it last settled. Negative: you pay it from margin when the position changes or closes. Positive: you earn it, and it's paid to your claimable credit.">
          <span>Funding</span>
        </Tooltip>
      ),
      cell: (p) => <T color={p.pendingFunding > 0 ? "error.main" : p.pendingFunding < 0 ? "green.main" : "common.black"}>{p.pendingFunding > 0 ? "−" : p.pendingFunding < 0 ? "+" : ""}{formatUsd(Math.abs(p.pendingFunding))}</T>,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (p) => (
        <Box sx={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <Button size="small" variant="outlined" color="cancel" onClick={() => setManaging({ position: p, mode: "close" })} sx={{ borderRadius: "999rem" }}>Manage</Button>
          <Button size="small" variant="solid" onClick={() => void run(`Close ${p.side}`, { action: "close", side: p.side })} sx={{ borderRadius: "999rem" }}>Close</Button>
        </Box>
      ),
    },
  ];

  const orderCols = (open: boolean): Column<PerpsOrder>[] => [
    { id: "placed", header: "Placed", cell: (o) => <T size="0.875rem">{when(o.placedAt)}</T> },
    { id: "type", header: "Type", cell: (o) => <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><T>{o.label}</T><SideTag side={o.side} /></Box> },
    { id: "size", header: "Size", cell: (o) => <T>{o.fullClose ? "Full position" : o.notional ? formatUsd(o.notional) : "—"}</T> },
    { id: "margin", header: "Margin", cell: (o) => <T>{o.margin ? formatUsd(o.margin) : "—"}</T> },
    { id: "trigger", header: "Trigger / bound", cell: (o) => <T>{o.triggerPrice ? `$${fmtPx(o.triggerPrice)}` : o.priceBound ? `≤ $${fmtPx(o.priceBound)}` : "Market"}</T> },
    { id: "status", header: "Status", cell: (o) => <T color={o.status === "filled" ? "green.main" : o.status === "pending" ? "primary.main" : "grey.200"}>{o.status}</T> },
    open
      ? { id: "cancel", header: "", align: "right", cell: (o) => <Button size="small" variant="outlined" color="cancel" onClick={() => void run(`Cancel order #${o.id}`, { action: "cancel", orderId: o.id })} sx={{ borderRadius: "999rem" }}>Cancel</Button> }
      : { id: "tx", header: "Transaction", cell: (o) => <TxLink tx={o.tx} /> },
  ];

  const fillCols: Column<PerpsFill>[] = [
    { id: "at", header: "Time", cell: (f) => <T size="0.875rem">{when(f.at)}</T> },
    { id: "side", header: "Fill", cell: (f) => <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><T>{f.kind === "increase" ? "Open" : f.kind === "decrease" ? "Close" : f.kind}</T><SideTag side={f.side} /></Box> },
    { id: "price", header: "Price", cell: (f) => <T>${fmtPx(f.price)}</T> },
    { id: "size", header: "Size", cell: (f) => <T>{formatUsd(f.notional)}</T> },
    { id: "pnl", header: "PnL", cell: (f) => <T color={pnlColor(f.pnl)}>{f.pnl ? formatUsd(f.pnl) : "—"}</T> },
    { id: "fees", header: "Fees", cell: (f) => <T color="grey.200">{formatUsd(f.fees)}</T> },
    { id: "tx", header: "Transaction", cell: (f) => <TxLink tx={f.tx} /> },
  ];

  const closedCols: Column<PerpsClosed>[] = [
    { id: "closed", header: "Closed", cell: (c) => <T size="0.875rem">{when(c.closedAt)}</T> },
    { id: "side", header: "Side", cell: (c) => <SideTag side={c.side} /> },
    { id: "size", header: "Size", cell: (c) => <T>{formatAmount(c.size, 2)} XLM</T> },
    { id: "entry", header: "Entry → Exit", cell: (c) => <T>${fmtPx(c.entryPrice)} → ${fmtPx(c.exitPrice)}</T> },
    { id: "lev", header: "Leverage", cell: (c) => <T>{c.leverage.toFixed(1)}x</T> },
    { id: "pnl", header: "Net PnL", cell: (c) => <T color={pnlColor(c.netPnl)}>{formatUsd(c.netPnl)}</T>, sortValue: (c) => c.netPnl },
    { id: "reason", header: "Reason", cell: (c) => <T color="grey.200">{c.reason === "user" ? "Closed" : c.reason}</T> },
  ];

  const tabs = [
    { id: "positions", label: `Positions${a?.positions.length ? ` (${a.positions.length})` : ""}` },
    { id: "open", label: `Open Orders${a?.openOrders.length ? ` (${a.openOrders.length})` : ""}` },
    { id: "history", label: "Order History" },
    { id: "fills", label: "Trades" },
    { id: "closed", label: "Closed" },
  ];
  const empty = isConnected ? undefined : "Connect a wallet to see your perps activity";
  const busy = loading && !a;

  return (
    <Box sx={cardSx}>
      <Box sx={{ alignSelf: "flex-start", maxWidth: "100%", overflowX: "auto" }}>
        <Tabs tabs={tabs.map((t) => ({ ...t, padding: "0 0.75rem" }))} activeTab={tab} setActiveTab={setTab} isPathProvided={false} />
      </Box>
      {tab === "positions" && <DataTable columns={posCols} rows={a?.positions ?? []} isLoading={busy} emptyDataText={empty ?? "No open positions"} emptyMinHeight="12rem" getRowId={(p) => p.side} />}
      {tab === "open" && <DataTable columns={orderCols(true)} rows={a?.openOrders ?? []} isLoading={busy} emptyDataText={empty ?? "No open orders"} emptyMinHeight="12rem" getRowId={(o) => String(o.id)} />}
      {tab === "history" && <DataTable columns={orderCols(false)} rows={a?.orderHistory ?? []} isLoading={busy} emptyDataText={empty ?? "No orders yet"} emptyMinHeight="12rem" getRowId={(o) => String(o.id)} pageSize={10} />}
      {tab === "fills" && <DataTable columns={fillCols} rows={a?.fills ?? []} isLoading={busy} emptyDataText={empty ?? "No trades yet"} emptyMinHeight="12rem" getRowId={(f) => f.id} pageSize={10} />}
      {tab === "closed" && <DataTable columns={closedCols} rows={a?.closed ?? []} isLoading={busy} emptyDataText={empty ?? "No closed positions yet"} emptyMinHeight="12rem" getRowId={(c) => c.id} pageSize={10} />}
      {a && !a.indexed && <Typography sx={{ fontSize: "0.75rem", color: "orange.main" }}>Zenex&apos;s history index is unreachable right now; positions are read on-chain.</Typography>}
      {managing && <PositionDialog position={managing.position} market={market} initialMode={managing.mode} onClose={() => setManaging(null)} />}
      {dialog}
    </Box>
  );
}
