"use client";

import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Slider from "@mui/material/Slider";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import { glassMenuPaperSx } from "@/components/wallet/WalletParts";
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

/** One-line TP/SL field: the placeholder names it, the unit sits on the right. */
function TpslInput({ value, onChange, label, unit, accent }: { value: string; onChange: (v: string) => void; label: string; unit: string; accent?: boolean }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        height: "2.875rem",
        px: "0.875rem",
        borderRadius: "0.75rem",
        backgroundColor: "overlay.white04",
        border: (t) => `0.0625rem solid ${t.palette.overlay.white08}`,
        transition: "border-color 150ms",
        "&:focus-within": { borderColor: "primary.main" },
      }}
    >
      <InputBase
        value={value}
        placeholder={label}
        onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && onChange(e.target.value)}
        inputProps={{ inputMode: "decimal", "aria-label": label }}
        sx={{ flex: 1, minWidth: 0, fontSize: "0.9375rem", fontWeight: 500, color: "common.black", "& input::placeholder": { color: "grey.200", opacity: 1 } }}
      />
      <Typography sx={{ fontSize: accent ? "0.9375rem" : "0.75rem", fontWeight: accent ? 600 : 400, color: accent ? "info.light" : "grey.200", flexShrink: 0 }}>{unit}</Typography>
    </Box>
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
  /** Custom max slippage in percent; empty while a preset chip is chosen. */
  const [slipCustom, setSlipCustom] = useState("");
  const [expiry, setExpiry] = useState<ExpiryId>("7d");
  const [tpsl, setTpsl] = useState(false);
  // Each TP/SL row is a price and a $ amount; whichever was typed last is the source, the other follows
  // (so changing margin or leverage keeps a typed gain/loss and moves the price, or the other way round).
  const [tpPrice, setTpPrice] = useState("");
  const [tpGain, setTpGain] = useState("");
  const [tpSrc, setTpSrc] = useState<"price" | "usd">("price");
  const [slPrice, setSlPrice] = useState("");
  const [slLoss, setSlLoss] = useState("");
  const [slSrc, setSlSrc] = useState<"price" | "usd">("price");
  const [expiryAnchor, setExpiryAnchor] = useState<HTMLElement | null>(null);
  const theme = useTheme();

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
  const existing = account?.positions.find((p) => p.side === side);
  const pnlAt = (px: number) => (entry > 0 && notional > 0 ? ((isLong ? px - entry : entry - px) / entry) * notional : 0);
  /** The price at which the position's PnL is `pnl` (USD). */
  const priceAt = (pnl: number) => (entry > 0 && notional > 0 ? entry * (1 + ((isLong ? 1 : -1) * pnl) / notional) : 0);
  const pxText = (v: number) => (v > 0 ? fmtPx(v) : "");
  const tp = tpSrc === "price" ? tpPrice : tpGain ? pxText(priceAt(Number(tpGain))) : "";
  const sl = slSrc === "price" ? slPrice : slLoss ? pxText(priceAt(-Number(slLoss))) : "";
  const tpN = Number(tp || 0);
  const slN = Number(sl || 0);
  const tpGainShown = tpSrc === "usd" ? tpGain : tpN > 0 && pnlAt(tpN) > 0 ? trim(pnlAt(tpN), 2) : "";
  const slLossShown = slSrc === "usd" ? slLoss : slN > 0 && pnlAt(slN) < 0 ? trim(-pnlAt(slN), 2) : "";
  const orders = 1 + (tpsl && tp ? 1 : 0) + (tpsl && sl ? 1 : 0);

  const blocker = useMemo(() => {
    if (!market) return "Loading market…";
    if (market.market.status !== 0) return `Market ${market.market.statusLabel.toLowerCase()}`;
    if (type !== "market" && !(Number(trigger) > 0)) return `Enter a ${type} price`;
    if (!(m > 0)) return "Enter margin or size";
    if (L && m < L.minOrderMargin) return `Min margin ${L.minOrderMargin} USDC`;
    if (L && notional < L.minOrderNotional) return `Min size ${L.minOrderNotional} USDC`;
    if (L && L.maxPositionNotional > 0 && notional + (existing?.notional ?? 0) > L.maxPositionNotional + 1e-9) return `Max position ${L.maxPositionNotional} USDC`;
    if (lev > maxLev) return `Max leverage ${maxLev}x`;
    if (type === "market" && slipCustom && !(Number(slipCustom) >= 0.05 && Number(slipCustom) <= 10)) return "Slippage must be 0.05% to 10%";
    if (tpsl && tp && (isLong ? tpN <= entry : tpN >= entry)) return `Take profit must be ${isLong ? "above" : "below"} entry`;
    if (tpsl && sl && (isLong ? slN >= entry : slN <= entry)) return `Stop loss must be ${isLong ? "below" : "above"} entry`;
    if (tpsl && sl && liq != null && (isLong ? slN <= liq : slN >= liq)) return "Stop loss is past liquidation";
    if (m + execFee * orders > usdc + 1e-9) return "Insufficient USDC";
    return null;
  }, [market, type, trigger, m, L, notional, existing, lev, maxLev, tpsl, tp, sl, isLong, tpN, slN, entry, liq, execFee, orders, usdc, slipCustom]);

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
      setTpPrice("");
      setTpGain("");
      setSlPrice("");
      setSlLoss("");
    }
  };

  const details: DetailRow[] = [
    { label: type === "market" ? "Entry (est.)" : `${type === "limit" ? "Limit" : "Stop"} price`, value: entry > 0 ? `$${fmtPx(entry)}` : "—" },
    { label: "Liquidation price (est.)", value: liq != null && liq > 0 ? `$${fmtPx(liq)}` : "—", color: "orange.main" },
    { label: "Trading fee (est.)", value: notional > 0 ? `${formatUsd(tradeFee)} (${(feeRate * 100).toFixed(3)}% + impact)` : "—" },
    { label: `Keeper fee${orders > 1 ? ` x${orders}` : ""}`, value: `${formatAmount(execFee * orders, 2)} USDC` },
    { label: "You pay", value: m > 0 ? `${formatAmount(m + execFee * orders, 4)} USDC` : "—" },
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
            <ButtonBase
              onClick={(e) => setExpiryAnchor(e.currentTarget)}
              aria-label="Expires in"
              aria-haspopup="listbox"
              aria-expanded={!!expiryAnchor}
              sx={{ justifyContent: "space-between", gap: "0.25rem", borderRadius: "0.5rem", fontSize: "1rem", fontWeight: 600, color: "common.black" }}
            >
              {EXPIRIES.find((e) => e.id === expiry)?.label}
              <KeyboardArrowDownRoundedIcon sx={{ fontSize: "1.25rem", color: "grey.200", transform: expiryAnchor ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
            </ButtonBase>
            <Menu
              anchorEl={expiryAnchor}
              open={!!expiryAnchor}
              onClose={() => setExpiryAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              slotProps={{
                paper: { elevation: 0, sx: glassMenuPaperSx(theme, "10rem") },
                list: { sx: { p: "0.5rem", display: "flex", flexDirection: "column", gap: "0.25rem" } },
              }}
            >
              {EXPIRIES.map((e) => (
                <MenuItem
                  key={e.id}
                  selected={e.id === expiry}
                  onClick={() => {
                    setExpiry(e.id);
                    setExpiryAnchor(null);
                  }}
                  sx={{ borderRadius: "0.75rem", py: "0.625rem", gap: "0.75rem", justifyContent: "space-between", fontSize: "0.9375rem", color: "common.black" }}
                >
                  {e.label}
                  {e.id === expiry && <CheckRoundedIcon sx={{ fontSize: "1.125rem", color: "primary.main" }} />}
                </MenuItem>
              ))}
            </Menu>
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
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            {[30, 50, 100].map((v) => (
              <Chip
                key={v}
                active={!slipCustom && slip === v}
                onClick={() => {
                  setSlipCustom("");
                  setSlip(v);
                }}
              >
                {(v / 100).toFixed(1)}%
              </Chip>
            ))}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "0.125rem",
                width: "4.5rem",
                height: "1.875rem",
                px: "0.625rem",
                borderRadius: "999rem",
                backgroundColor: slipCustom ? "sidebar.primary" : "overlay.white04",
                border: (t) => `0.0625rem solid ${slipCustom ? "transparent" : t.palette.overlay.white08}`,
                "&:focus-within": { borderColor: "primary.main" },
              }}
            >
              <InputBase
                value={slipCustom}
                placeholder="Custom"
                onChange={(e) => {
                  const v = e.target.value;
                  if (!/^\d*\.?\d*$/.test(v) || Number(v || 0) > 10) return;
                  setSlipCustom(v);
                  if (Number(v) > 0) setSlip(Math.round(Number(v) * 100));
                }}
                inputProps={{ inputMode: "decimal", "aria-label": "Custom max slippage (%)" }}
                sx={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: "0.75rem",
                  color: slipCustom ? "sidebar.white" : "common.black",
                  "& input": { p: 0, textAlign: "right" },
                  "& input::placeholder": { color: "grey.200", opacity: 1, textAlign: "center" },
                }}
              />
              {slipCustom && <Typography sx={{ fontSize: "0.75rem", color: "sidebar.white" }}>%</Typography>}
            </Box>
          </Box>
        </Box>
      )}
      {type === "market" && slipCustom && Number(slipCustom) > 5 && Number(slipCustom) <= 10 && (
        <Typography sx={{ fontSize: "0.75rem", color: "warning.main", textAlign: "right", mt: "-0.5rem" }}>High slippage: the fill can be much worse than the price shown.</Typography>
      )}

      <Box>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
          <Tooltip
            arrow
            placement="top-start"
            title="Close the position automatically: take profit when the price reaches your target, stop loss before losses grow. Enter a price, or the $ you want to gain or can afford to lose. Both orders go in the same transaction as the trade."
          >
            <Typography
              sx={{ fontSize: "0.9375rem", color: "common.black", cursor: "help", textDecoration: "underline dotted", textDecorationColor: (t) => t.palette.grey[200], textUnderlineOffset: "0.25rem" }}
            >
              Take profit / Stop loss
            </Typography>
          </Tooltip>
          <ButtonBase
            role="switch"
            aria-checked={tpsl}
            aria-label="Take profit / Stop loss"
            onClick={() => setTpsl((v) => !v)}
            sx={{ width: "2.75rem", height: "1.5rem", borderRadius: "999rem", p: "0.1875rem", justifyContent: "flex-start", backgroundColor: tpsl ? "green.main" : "overlay.white20", transition: "background-color 150ms" }}
          >
            <Box sx={{ width: "1.125rem", height: "1.125rem", borderRadius: "50%", backgroundColor: "#fff", transform: tpsl ? "translateX(1.25rem)" : "none", transition: "transform 150ms" }} />
          </ButtonBase>
        </Box>
        {tpsl && (
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", mt: "0.625rem" }}>
            <TpslInput label="TP price" unit="USD" value={tp} onChange={(v) => { setTpSrc("price"); setTpPrice(v); }} />
            <TpslInput label="Gain" unit="$" accent value={tpGainShown} onChange={(v) => { setTpSrc("usd"); setTpGain(v); }} />
            <TpslInput label="SL price" unit="USD" value={sl} onChange={(v) => { setSlSrc("price"); setSlPrice(v); }} />
            <TpslInput label="Loss" unit="$" accent value={slLossShown} onChange={(v) => { setSlSrc("usd"); setSlLoss(v); }} />
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
