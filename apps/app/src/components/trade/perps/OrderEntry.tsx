"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import { DetailRows, type DetailRow } from "@/components/earn/ActionCard";
import Tabs from "@/components/common/Tabs";
import TokenLogo from "@/components/common/TokenLogo";
import TxDialog from "@/components/tx/TxDialog";
import { formatAmount, formatUsd } from "@/lib/format";
import { runBuilt, type TxStep } from "@/lib/tx";
import { invalidateShared } from "@/lib/useShared";
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import { fmtPx, type PerpsAccount, type PerpsMarket } from "./usePerps";

export const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

export const cardSx = {
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  p: "1.25rem",
  borderRadius: "1.5rem",
  backgroundColor: "surfaceBg.section",
  border: (t: { palette: { border: { main1000: string } } }) => `0.0625rem solid ${t.palette.border.main1000}`,
} as const;

/** Zenex build + sign + submit, with the TxDialog state; refreshes the account afterwards. */
export function usePerpsTx() {
  const { activeWallet } = useWallet();
  const [tx, setTx] = useState<{ open: boolean; title: string; steps: TxStep[]; error: string | null }>({ open: false, title: "", steps: [], error: null });
  const run = async (title: string, body: Record<string, unknown>) => {
    if (!activeWallet) return false;
    setTx({ open: true, title, steps: [{ key: "s0", label: title, status: "building" }], error: null });
    try {
      const r = await runBuilt("/api/zenex/build", { ...body, from: activeWallet.address }, activeWallet, (steps) => setTx((t) => ({ ...t, steps })));
      // Keepers fill within seconds; refresh twice so the fill shows up.
      invalidateShared(`zenex:acct:${activeWallet.address}`);
      setTimeout(() => invalidateShared(`zenex:acct:${activeWallet.address}`), 8_000);
      return !r.unsigned;
    } catch (e) {
      setTx((t) => ({ ...t, error: e instanceof Error ? e.message : String(e) }));
      return false;
    }
  };
  const dialog = <TxDialog open={tx.open} title={tx.title} steps={tx.steps} error={tx.error} onClose={() => setTx((t) => ({ ...t, open: false }))} />;
  return { run, dialog };
}

export function useUsdcBalance() {
  const { activeWallet } = useWallet();
  const { byAddress } = useBalances(activeWallet ? [activeWallet.address] : []);
  return activeWallet ? (byAddress[activeWallet.address]?.tokens.find((t) => t.code === "USDC" && t.issuer === USDC_ISSUER)?.amount ?? 0) : 0;
}

const SideButton = ({ active, long, onClick }: { active: boolean; long: boolean; onClick: () => void }) => (
  <ButtonBase
    onClick={onClick}
    sx={{
      flex: 1,
      height: "2.75rem",
      borderRadius: "999rem",
      fontSize: "0.9375rem",
      fontWeight: 600,
      color: active ? "common.white" : "grey.200",
      backgroundColor: active ? (long ? "green.main" : "error.main") : "overlay.white04",
    }}
  >
    {long ? "Long" : "Short"}
  </ButtonBase>
);

function Field({ label, value, onChange, suffix, right }: { label: string; value: string; onChange: (v: string) => void; suffix: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Box sx={{ borderRadius: "1rem", backgroundColor: "overlay.white04", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`, p: "0.875rem 1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{label}</Typography>
        {right}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <InputBase
          value={value}
          placeholder="0.00"
          onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && onChange(e.target.value)}
          inputProps={{ inputMode: "decimal", "aria-label": label }}
          sx={{ flex: 1, fontSize: "1.375rem", fontWeight: 600, color: "common.black" }}
        />
        {suffix}
      </Box>
    </Box>
  );
}

export default function OrderEntry({ market, account }: { market: PerpsMarket | null; account: PerpsAccount | null }) {
  const { isConnected, openConnectModal, activeWallet } = useWallet();
  const usdc = useUsdcBalance();
  const { run, dialog } = usePerpsTx();
  const [side, setSide] = useState<"long" | "short">("long");
  const [type, setType] = useState<string>("market");
  const [margin, setMargin] = useState("");
  const [lev, setLev] = useState(5);
  const [limitPx, setLimitPx] = useState("");
  const [slip, setSlip] = useState(50);

  const L = market?.limits;
  const maxLev = Math.max(2, L?.maxLeverage ?? 20);
  const isLong = side === "long";
  const m = Number(margin || 0);
  const notional = m * lev;
  const entry = type === "limit" ? Number(limitPx || 0) : isLong ? (market?.price?.ask ?? 0) : (market?.price?.bid ?? 0);
  const mm = L?.maintenanceMargin ?? 0;
  // Liquidation where equity meets maintenance (fees and accruals left out of the estimate).
  const liq = entry > 0 && notional > 0 ? (isLong ? entry * (1 + mm - m / notional) : entry * (1 - mm + m / notional)) : null;
  const longDominant = (market?.openInterest.long ?? 0) >= (market?.openInterest.short ?? 0);
  const feeRate = L ? ((isLong ? longDominant : !longDominant) ? L.feeDominant : L.feeNonDominant) : 0;
  const tradeFee = notional * feeRate;
  const execFee = L?.execFee ?? 0;
  const existing = account?.positions.find((p) => p.side === side);

  const blocker = useMemo(() => {
    if (!market) return "Loading market…";
    if (market.market.status !== 0) return `Market ${market.market.statusLabel.toLowerCase()}`;
    if (!(m > 0)) return "Enter margin";
    if (type === "limit" && !(Number(limitPx) > 0)) return "Enter a limit price";
    if (L && m < L.minOrderMargin) return `Min margin ${L.minOrderMargin} USDC`;
    if (L && notional < L.minOrderNotional) return `Min size ${L.minOrderNotional} USDC`;
    if (L && L.maxPositionNotional > 0 && notional + (existing?.notional ?? 0) > L.maxPositionNotional) return `Max position ${L.maxPositionNotional} USDC`;
    if (lev > maxLev) return `Max leverage ${maxLev}x`;
    if (m + execFee > usdc + 1e-9) return "Insufficient USDC";
    return null;
  }, [market, m, type, limitPx, L, notional, existing, lev, maxLev, execFee, usdc]);

  const submit = async () => {
    const ok = await run(`${type === "market" ? "Market" : "Limit"} ${side} ${formatAmount(notional, 2)} USDC`, {
      action: type === "market" ? "open-market" : "open-limit",
      side,
      margin: m.toFixed(7),
      notional: notional.toFixed(7),
      triggerPrice: type === "limit" ? limitPx : undefined,
      slippageBps: slip,
    });
    if (ok) setMargin("");
  };

  const details: DetailRow[] = [
    { label: type === "market" ? "Entry (est.)" : "Limit price", value: entry > 0 ? `$${fmtPx(entry)}` : "—" },
    { label: "Size", value: notional > 0 && entry > 0 ? `${formatAmount(notional / entry, 2)} XLM · ${formatUsd(notional)}` : "—" },
    { label: "Liquidation price (est.)", value: liq != null && liq > 0 ? `$${fmtPx(liq)}` : "—", color: "orange.main" },
    { label: "Trading fee (est.)", value: notional > 0 ? `${formatUsd(tradeFee)} (${(feeRate * 100).toFixed(3)}%)` : "—" },
    { label: "Keeper fee", value: `${execFee} USDC` },
    { label: "You pay", value: m > 0 ? `${formatAmount(m + execFee, 4)} USDC` : "—" },
  ];

  return (
    <Box sx={cardSx}>
      <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black" }}>Place order</Typography>
      <Box sx={{ display: "flex", gap: "0.5rem", p: "0.375rem", borderRadius: "999rem", backgroundColor: "overlay.white04" }}>
        <SideButton long active={isLong} onClick={() => setSide("long")} />
        <SideButton long={false} active={!isLong} onClick={() => setSide("short")} />
      </Box>
      <Tabs
        tabs={[
          { id: "market", label: "Market", padding: "0 1rem" },
          { id: "limit", label: "Limit", padding: "0 1rem" },
        ]}
        activeTab={type}
        setActiveTab={setType}
        isPathProvided={false}
        fullWidth
      />
      {type === "limit" && (
        <Field
          label="Limit price"
          value={limitPx}
          onChange={setLimitPx}
          suffix={<Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>USD</Typography>}
          right={
            market?.price && (
              <ButtonBase onClick={() => setLimitPx(fmtPx(market.price!.mid))} sx={{ fontSize: "0.75rem", color: "primary.main" }}>
                Mark {fmtPx(market.price.mid)}
              </ButtonBase>
            )
          }
        />
      )}
      <Field
        label="Margin"
        value={margin}
        onChange={setMargin}
        suffix={
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem", px: "0.625rem", height: "2.25rem", borderRadius: "999rem", backgroundColor: "overlay.white08" }}>
            <TokenLogo code="USDC" issuer={USDC_ISSUER} size="1.5rem" />
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "common.black" }}>USDC</Typography>
          </Box>
        }
        right={
          <ButtonBase disabled={!usdc} onClick={() => setMargin(String(Math.max(0, usdc - execFee).toFixed(2)))} sx={{ fontSize: "0.75rem", color: "grey.200" }}>
            Balance {formatAmount(usdc, 2)}
            {!!usdc && <Box component="span" sx={{ ml: "0.375rem", color: "primary.main", fontWeight: 600 }}>MAX</Box>}
          </ButtonBase>
        }
      />
      <Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: "0.25rem" }}>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Leverage</Typography>
          <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "common.black" }}>{lev.toFixed(1)}x</Typography>
        </Box>
        <Slider value={lev} min={1.1} max={maxLev} step={0.1} onChange={(_, v) => setLev(v as number)} sx={{ color: isLong ? "green.main" : "error.main" }} />
        <Box sx={{ display: "flex", gap: "0.375rem" }}>
          {[2, 5, 10, maxLev].filter((v, i, a) => v <= maxLev && a.indexOf(v) === i).map((v) => (
            <ButtonBase key={v} onClick={() => setLev(v)} sx={{ flex: 1, height: "1.875rem", borderRadius: "999rem", fontSize: "0.75rem", color: lev === v ? "sidebar.white" : "grey.200", backgroundColor: lev === v ? "sidebar.primary" : "overlay.white04" }}>
              {v}x
            </ButtonBase>
          ))}
        </Box>
      </Box>
      {type === "market" && (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Max slippage</Typography>
          <Box sx={{ display: "flex", gap: "0.375rem" }}>
            {[30, 50, 100].map((v) => (
              <ButtonBase key={v} onClick={() => setSlip(v)} sx={{ height: "1.75rem", px: "0.625rem", borderRadius: "999rem", fontSize: "0.75rem", color: slip === v ? "sidebar.white" : "grey.200", backgroundColor: slip === v ? "sidebar.primary" : "overlay.white04" }}>
                {(v / 100).toFixed(1)}%
              </ButtonBase>
            ))}
          </Box>
        </Box>
      )}
      <DetailRows rows={details} />
      <Button
        variant="solid"
        disabled={isConnected && !!blocker}
        onClick={() => (isConnected ? void submit() : void openConnectModal())}
        sx={{
          height: "3.25rem",
          borderRadius: "999rem",
          fontWeight: 600,
          textTransform: "uppercase",
          ...(isConnected && !blocker ? { background: isLong ? "#00C46B" : "#E5484D", "&:hover": { background: isLong ? "#00B060" : "#D33F44" } } : {}),
        }}
      >
        {!isConnected ? "Connect wallet" : (blocker ?? `${type === "market" ? "Open" : "Place limit"} ${side}`)}
      </Button>
      <Typography sx={{ fontSize: "0.75rem", color: "grey.200", lineHeight: 1.5 }}>
        Orders are created on-chain and filled by Zenex keepers, usually within seconds. Set take-profit and stop-loss from the position once it opens.
        {activeWallet?.walletId === "watch" ? " This is a watch-only wallet: the transaction is built but not signed." : ""}
      </Typography>
      {dialog}
    </Box>
  );
}
