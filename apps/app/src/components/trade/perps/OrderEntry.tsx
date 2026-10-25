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

const boxSx = {
  borderRadius: "1rem",
  backgroundColor: "overlay.white04",
  border: (t: { palette: { overlay: { white08: string } } }) => `0.0625rem solid ${t.palette.overlay.white08}`,
  p: "0.75rem 1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
} as const;

function NumInput({ value, onChange, label, placeholder = "0.00" }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string }) {
  return (
    <InputBase
      value={value}
      placeholder={placeholder}
      onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && onChange(e.target.value)}
      inputProps={{ inputMode: "decimal", "aria-label": label }}
      sx={{ flex: 1, minWidth: 0, fontSize: "1.25rem", fontWeight: 600, color: "common.black" }}
    />
  );
}

function Chip({ active, onClick, children, grow }: { active: boolean; onClick: () => void; children: React.ReactNode; grow?: boolean }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        flex: grow ? 1 : undefined,
        height: "1.875rem",
        px: "0.625rem",
        borderRadius: "999rem",
        fontSize: "0.75rem",
        color: active ? "sidebar.white" : "grey.200",
        backgroundColor: active ? "sidebar.primary" : "overlay.white04",
      }}
    >
      {children}
    </ButtonBase>
  );
}

const EXPIRIES = [
  { id: "1h", label: "1 hour", sec: 3600 },
  { id: "1d", label: "1 day", sec: 86400 },
  { id: "7d", label: "7 days", sec: 7 * 86400 },
  { id: "30d", label: "30 days", sec: 30 * 86400 },
] as const;
type ExpiryId = (typeof EXPIRIES)[number]["id"];

const trim = (v: number, dp: number) => (Number.isFinite(v) && v > 0 ? String(Number(v.toFixed(dp))) : "");

type OrderType = "market" | "limit" | "stop";

export default function OrderEntry({ market, account }: { market: PerpsMarket | null; account: PerpsAccount | null }) {
  const { isConnected, openConnectModal, activeWallet } = useWallet();
  const usdc = useUsdcBalance();
  const { run, dialog } = usePerpsTx();
  const [side, setSide] = useState<"long" | "short">("long");
  const [type, setType] = useState<OrderType>("market");
  const [marginStr, setMarginStr] = useState("");
  const [sizeStr, setSizeStr] = useState("");
  const [unit, setUnit] = useState<"XLM" | "USDC">("XLM");
  const [lev, setLev] = useState(5);
  const [trigger, setTrigger] = useState("");
  const [slip, setSlip] = useState(50);
  const [expiry, setExpiry] = useState<ExpiryId>("7d");
  const [tpsl, setTpsl] = useState(false);
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");

  const L = market?.limits;
  const maxLev = Math.max(2, L?.maxLeverage ?? 20);
  const isLong = side === "long";
  const mark = market?.price?.mid ?? 0;
  const entry = type !== "market" ? Number(trigger || 0) || mark : isLong ? (market?.price?.ask ?? 0) : (market?.price?.bid ?? 0);
  const m = Number(marginStr || 0);
  // Margin is the anchor: size (notional) = margin x leverage; editing the size moves the margin.
  const notional = m * lev;

  const sizeText = (n: number, u = unit) => (u === "XLM" ? (entry > 0 ? trim(n / entry, 2) : "") : trim(n, 2));
  const onMargin = (v: string) => {
    setMarginStr(v);
    setSizeStr(sizeText(Number(v || 0) * lev));
  };
  const onSize = (v: string) => {
    setSizeStr(v);
    const n = unit === "XLM" ? Number(v || 0) * entry : Number(v || 0);
    setMarginStr(trim(n / lev, 4));
  };
  const onLev = (v: number) => {
    setLev(v);
    setSizeStr(sizeText(m * v));
  };
  const flipUnit = () => {
    const next = unit === "XLM" ? "USDC" : "XLM";
    setUnit(next);
    setSizeStr(sizeText(notional, next));
  };

  const mm = L?.maintenanceMargin ?? 0;
  // Liquidation where equity meets maintenance (fees and accruals left out of the estimate).
  const liq = entry > 0 && notional > 0 ? (isLong ? entry * (1 + mm - m / notional) : entry * (1 - mm + m / notional)) : null;
  const longDominant = (market?.openInterest.long ?? 0) >= (market?.openInterest.short ?? 0);
  const feeRate = L ? ((isLong ? longDominant : !longDominant) ? L.feeDominant : L.feeNonDominant) : 0;
  const impact = L && L.impactScalar > 0 ? Math.min(notional * L.maxImpactRate, (notional * notional) / L.impactScalar) : 0;
  const tradeFee = notional * feeRate + impact;
  const execFee = L?.execFee ?? 0;
  const orders = 1 + (tpsl && tp ? 1 : 0) + (tpsl && sl ? 1 : 0);
  const existing = account?.positions.find((p) => p.side === side);
  const tpN = Number(tp || 0);
  const slN = Number(sl || 0);
  const pnlAt = (px: number) => (entry > 0 && notional > 0 ? ((isLong ? px - entry : entry - px) / entry) * notional : 0);

  const blocker = useMemo(() => {
    if (!market) return "Loading market…";
    if (market.market.status !== 0) return `Market ${market.market.statusLabel.toLowerCase()}`;
    if (type !== "market" && !(Number(trigger) > 0)) return `Enter a ${type} price`;
    if (!(m > 0)) return "Enter margin or size";
    if (L && m < L.minOrderMargin) return `Min margin ${L.minOrderMargin} USDC`;
    if (L && notional < L.minOrderNotional) return `Min size ${L.minOrderNotional} USDC`;
    if (L && L.maxPositionNotional > 0 && notional + (existing?.notional ?? 0) > L.maxPositionNotional + 1e-9) return `Max position ${L.maxPositionNotional} USDC`;
    if (lev > maxLev) return `Max leverage ${maxLev}x`;
    if (tpsl && tp && (isLong ? tpN <= entry : tpN >= entry)) return `Take profit must be ${isLong ? "above" : "below"} entry`;
    if (tpsl && sl && (isLong ? slN >= entry : slN <= entry)) return `Stop loss must be ${isLong ? "below" : "above"} entry`;
    if (tpsl && sl && liq != null && (isLong ? slN <= liq : slN >= liq)) return "Stop loss is past liquidation";
    if (m + execFee * orders > usdc + 1e-9) return "Insufficient USDC";
    return null;
  }, [market, type, trigger, m, L, notional, existing, lev, maxLev, tpsl, tp, sl, isLong, tpN, slN, entry, liq, execFee, orders, usdc]);

  const submit = async () => {
    const label = `${type === "market" ? "Market" : type === "limit" ? "Limit" : "Stop"} ${side} ${formatAmount(notional, 2)} USDC`;
    const ok = await run(label, {
      action: `open-${type}`,
      side,
      margin: m.toFixed(7),
      notional: notional.toFixed(7),
      triggerPrice: type !== "market" ? trigger : undefined,
      slippageBps: slip,
      expirySec: EXPIRIES.find((e) => e.id === expiry)?.sec,
      tp: tpsl && tp ? tp : undefined,
      sl: tpsl && sl ? sl : undefined,
    });
    if (ok) {
      setMarginStr("");
      setSizeStr("");
      setTp("");
      setSl("");
    }
  };

  const details: DetailRow[] = [
    { label: type === "market" ? "Entry (est.)" : `${type === "limit" ? "Limit" : "Stop"} price`, value: entry > 0 ? `$${fmtPx(entry)}` : "—" },
    { label: "Liquidation price (est.)", value: liq != null && liq > 0 ? `$${fmtPx(liq)}` : "—", color: "orange.main" },
    { label: "Trading fee (est.)", value: notional > 0 ? `${formatUsd(tradeFee)} (${(feeRate * 100).toFixed(3)}% + impact)` : "—" },
    { label: `Keeper fee${orders > 1 ? ` x${orders}` : ""}`, value: `${formatAmount(execFee * orders, 2)} USDC` },
    { label: "You pay", value: m > 0 ? `${formatAmount(m + execFee * orders, 4)} USDC` : "—" },
  ];

  const tpslFields: { label: string; value: string; set: (v: string) => void; n: number; color: string }[] = [
    { label: "Take profit", value: tp, set: setTp, n: tpN, color: "green.main" },
    { label: "Stop loss", value: sl, set: setSl, n: slN, color: "error.main" },
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
          { id: "market", label: "Market", padding: "0 0.75rem" },
          { id: "limit", label: "Limit", padding: "0 0.75rem" },
          { id: "stop", label: "Stop", padding: "0 0.75rem" },
        ]}
        activeTab={type}
        setActiveTab={(id) => setType(id as OrderType)}
        isPathProvided={false}
        fullWidth
      />

      {type !== "market" && (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "0.5rem" }}>
          <Box sx={boxSx}>
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{type === "limit" ? "Limit price" : "Stop price"}</Typography>
              {mark > 0 && (
                <ButtonBase onClick={() => setTrigger(fmtPx(mark))} sx={{ fontSize: "0.75rem", color: "primary.main" }}>
                  Mark {fmtPx(mark)}
                </ButtonBase>
              )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <NumInput value={trigger} onChange={setTrigger} label={type === "limit" ? "Limit price" : "Stop price"} />
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>USD</Typography>
            </Box>
          </Box>
          <Box sx={{ ...boxSx, minWidth: "7.5rem" }}>
            <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Expires in</Typography>
            <Box
              component="select"
              value={expiry}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setExpiry(e.target.value as ExpiryId)}
              aria-label="Expires in"
              sx={{ background: "transparent", color: "common.black", border: "none", fontSize: "1rem", fontWeight: 600, fontFamily: "inherit", outline: "none", cursor: "pointer", "& option": { backgroundColor: "#1F1F1F" } }}
            >
              {EXPIRIES.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </Box>
          </Box>
        </Box>
      )}

      <Box sx={boxSx}>
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Margin</Typography>
          <ButtonBase disabled={!usdc} onClick={() => onMargin(trim(Math.max(0, usdc - execFee * orders), 2))} sx={{ fontSize: "0.75rem", color: "grey.200" }}>
            Balance {formatAmount(usdc, 2)}
            {!!usdc && (
              <Box component="span" sx={{ ml: "0.375rem", color: "primary.main", fontWeight: 600 }}>
                MAX
              </Box>
            )}
          </ButtonBase>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <NumInput value={marginStr} onChange={onMargin} label="Margin" />
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <TokenLogo code="USDC" issuer={USDC_ISSUER} size="1.375rem" />
            <Typography sx={{ fontSize: "0.875rem", fontWeight: 600, color: "common.black" }}>USDC</Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={boxSx}>
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Size</Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
            ≈ {unit === "XLM" ? `${formatAmount(notional, 2)} USDC` : entry > 0 ? `${formatAmount(notional / entry, 2)} XLM` : "—"}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <NumInput value={sizeStr} onChange={onSize} label="Size" />
          <ButtonBase
            onClick={flipUnit}
            aria-label="Switch size unit"
            sx={{ display: "flex", alignItems: "center", gap: "0.25rem", color: "primary.main", fontSize: "0.9375rem", fontWeight: 600, borderRadius: "0.5rem", px: "0.25rem" }}
          >
            {unit}
            <Box component="span" sx={{ fontSize: "1rem" }}>
              {"⇄"}
            </Box>
          </ButtonBase>
        </Box>
      </Box>

      <Box>
        <Box sx={{ display: "flex", justifyContent: "space-between", mb: "0.25rem" }}>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Leverage</Typography>
          <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "common.black" }}>{lev.toFixed(1)}x</Typography>
        </Box>
        <Slider value={lev} min={1.1} max={maxLev} step={0.1} onChange={(_, v) => onLev(v as number)} sx={{ color: isLong ? "green.main" : "error.main" }} />
        <Box sx={{ display: "flex", gap: "0.375rem" }}>
          {[2, 5, 10, maxLev]
            .filter((v, i, a) => v <= maxLev && a.indexOf(v) === i)
            .map((v) => (
              <Chip key={v} active={lev === v} onClick={() => onLev(v)} grow>
                {v}x
              </Chip>
            ))}
        </Box>
      </Box>

      {type === "market" && (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Max slippage</Typography>
          <Box sx={{ display: "flex", gap: "0.375rem" }}>
            {[30, 50, 100].map((v) => (
              <Chip key={v} active={slip === v} onClick={() => setSlip(v)}>
                {(v / 100).toFixed(1)}%
              </Chip>
            ))}
          </Box>
        </Box>
      )}

      <Box>
        <ButtonBase onClick={() => setTpsl((v) => !v)} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", borderRadius: "0.5rem" }}>
          <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>Take profit / Stop loss</Typography>
          <Box sx={{ width: "2.5rem", height: "1.375rem", borderRadius: "999rem", p: "0.1875rem", backgroundColor: tpsl ? "primary.main" : "overlay.white20", transition: "background-color 150ms" }}>
            <Box sx={{ width: "1rem", height: "1rem", borderRadius: "50%", backgroundColor: "common.white", transform: tpsl ? "translateX(1.125rem)" : "none", transition: "transform 150ms" }} />
          </Box>
        </ButtonBase>
        {tpsl && (
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", mt: "0.625rem" }}>
            {tpslFields.map((f) => (
              <Box key={f.label} sx={boxSx}>
                <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>{f.label} (USD)</Typography>
                <NumInput value={f.value} onChange={f.set} label={f.label} placeholder={fmtPx(entry || mark)} />
                <Typography sx={{ fontSize: "0.75rem", color: f.n > 0 ? f.color : "grey.200" }}>
                  {f.n > 0 && notional > 0 ? `${pnlAt(f.n) >= 0 ? "+" : ""}${formatUsd(pnlAt(f.n))}` : "PnL —"}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>

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
        {!isConnected ? "Connect wallet" : (blocker ?? `${type === "market" ? "Open" : `Place ${type}`} ${side}`)}
      </Button>
      <Typography sx={{ fontSize: "0.75rem", color: "grey.200", lineHeight: 1.5 }}>
        Orders are created on-chain and filled by Zenex keepers, usually within seconds. Take profit and stop loss go in the same transaction.
        {activeWallet?.walletId === "watch" ? " This is a watch-only wallet: the transaction is built but not signed." : ""}
      </Typography>
      {dialog}
    </Box>
  );
}
