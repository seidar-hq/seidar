"use client";

// Buy / Sell card on the asset page: a market order through the same aggregator quote and build as
// the Swap page.

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import InputBase from "@mui/material/InputBase";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import { SectionCard } from "@/components/common/SectionCard";
import TokenLogo from "@/components/common/TokenLogo";
import { DetailRows, sanitizeAmount, type DetailRow } from "@/components/earn/ActionCard";
import TokenSelectDialog from "@/components/swap/TokenSelectDialog";
import { fromBase, useSwapQuote, useTrustline } from "@/components/swap/useSwapQuote";
import { useSwapTokens } from "@/components/swap/useSwapTokens";
import TxDialog from "@/components/tx/TxDialog";
import { useTxRunner } from "@/components/tx/useTxRunner";
import { apiJson } from "@/lib/api";
import { formatAmount, formatUsd } from "@/lib/format";
import { buildTrustline, cleanAmount, hasTrustline } from "@/lib/payment";
import { postJson, toBase } from "@/lib/tx";
import { useShared } from "@/lib/useShared";
import { useWallet } from "@/wallet/WalletContext";

type Side = "buy" | "sell";
const SLIPPAGES = ["0.5", "1", "2"];
const BUY = "#00C46B";
const SELL = "#E5484D";

/** Stellar amounts carry at most 7 decimals. */
const to7 = (v: number) => {
  const s = v.toFixed(7).replace(/\.?0+$/, "");
  return s === "" ? "0" : s;
};

const tradeBoxSx = {
  borderRadius: "1rem",
  backgroundColor: "overlay.white04",
  border: (t: { palette: { overlay: { white08: string } } }) => `0.0625rem solid ${t.palette.overlay.white08}`,
  p: "0.75rem 1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.375rem",
  transition: "border-color 150ms",
  "&:focus-within": { borderColor: "primary.main" },
} as const;

function usePrices(codes: string[]) {
  const key = codes.length ? `px:${[...codes].sort().join(",")}` : null;
  const { value } = useShared<{ prices?: Record<string, number | null> } | null>(key, () => apiJson(`/api/prices?codes=${encodeURIComponent(codes.join(","))}`), 60_000);
  return value?.prices ?? {};
}

const SideButton = ({ side, active, onClick }: { side: Side; active: boolean; onClick: () => void }) => (
  <ButtonBase
    onClick={onClick}
    sx={{
      flex: 1,
      height: "2.75rem",
      borderRadius: "999rem",
      fontSize: "0.9375rem",
      fontWeight: 600,
      color: active ? "common.white" : "grey.200",
      backgroundColor: active ? (side === "buy" ? "green.main" : "error.main") : "transparent",
    }}
  >
    {side === "buy" ? "Buy" : "Sell"}
  </ButtonBase>
);

/** Token chip: a button when the token can be changed, plain when it is this page's asset. */
function TokenChip({ token, onClick }: { token: { code: string; issuer: string | null; contract: string } | null; onClick?: () => void }) {
  const inner = (
    <>
      {token && <TokenLogo code={token.code} issuer={token.issuer} contract={token.contract} size="1.5rem" />}
      <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "common.black" }}>{token?.code ?? "Select"}</Typography>
      {onClick && <KeyboardArrowDown sx={{ fontSize: "1.125rem", color: "grey.200" }} />}
    </>
  );
  const sx = { display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0, p: "0.25rem 0.5rem 0.25rem 0.25rem", borderRadius: "999rem" } as const;
  return onClick ? (
    <ButtonBase onClick={onClick} sx={{ ...sx, backgroundColor: "overlay.white08", "&:hover": { backgroundColor: "overlay.white12" } }}>
      {inner}
    </ButtonBase>
  ) : (
    <Box sx={sx}>{inner}</Box>
  );
}


export default function AssetTrade({ code, issuer, contract }: { code: string; issuer: string | null; contract: string | null }) {
  const { activeWallet, isConnected, openConnectModal } = useWallet();
  const address = activeWallet?.address ?? null;
  const watchOnly = activeWallet?.walletId === "watch";
  const tokens = useSwapTokens(address);
  const tx = useTxRunner();

  const asset = useMemo(
    () => tokens.find((t) => (contract ? t.contract === contract : t.code === code && (t.issuer ?? null) === issuer)) ?? null,
    [tokens, code, issuer, contract],
  );

  const [side, setSide] = useState<Side>("buy");
  const [otherC, setOtherC] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [editSlip, setEditSlip] = useState(false);
  const [picker, setPicker] = useState(false);
  const [inverted, setInverted] = useState(false);
  const [addingTrust, setAddingTrust] = useState(false);

  // Default counter-token: USDC, or XLM on USDC's own page.
  useEffect(() => {
    if (otherC || !tokens.length || !asset) return;
    const usdc = tokens.find((t) => t.code === "USDC" && t.issuer?.startsWith("GA5ZSE"));
    const xlm = tokens.find((t) => t.code === "XLM" && !t.issuer);
    setOtherC((usdc && usdc.contract !== asset.contract ? usdc : xlm)?.contract ?? null);
  }, [tokens, asset, otherC]);

  const other = tokens.find((t) => t.contract === otherC) ?? null;
  const from = side === "buy" ? other : asset;
  const to = side === "buy" ? asset : other;
  const n = Number(amount) || 0;
  const base = from && cleanAmount(amount) ? toBase(cleanAmount(amount)!, from.decimals) : null;
  const slipNum = Number(slippage);
  const slipBad = !(slipNum > 0 && slipNum < 100);
  const prices = usePrices([from?.code, to?.code].filter(Boolean) as string[]);
  const pxIn = from ? (prices[from.code] ?? from.price) : null;
  const pxOut = to ? (prices[to.code] ?? to.price) : null;

  const market = useSwapQuote(from, to, base, slipNum);
  const quote = market.quote;
  const outMarket = quote && to ? fromBase(quote.amountOut, to.decimals) : 0;
  const impact = quote?.priceImpactPct != null ? Number(quote.priceImpactPct) : null;

  const out = outMarket;

  const { trust, setTrust, checkingTrust } = useTrustline(address, to);
  const needsTrust = !!to?.issuer && trust === false;
  const insufficient = !!from && n > from.balance + 1e-9;
  const pct = from && from.balance > 0 ? Math.min(100, (n / from.balance) * 100) : 0;
  const pickable = useMemo(() => tokens.filter((t) => t.contract !== asset?.contract), [tokens, asset]);

  if (!asset) {
    return (
      <SectionCard sx={{ gap: "0.75rem" }}>
        <Typography sx={{ fontSize: "1.125rem", fontWeight: 500, color: "common.black" }}>Buy / Sell {code}</Typography>
        <Typography variant="subtitle3" color="grey.200">
          {tokens.length ? `${code} can't be traded on Seidar yet.` : "Loading tokens…"}
        </Typography>
      </SectionCard>
    );
  }

  const blocker = (() => {
    if (!from || !to) return "Select a token";
    if (!(n > 0)) return "Enter an amount";
    if (insufficient) return `Insufficient ${from.code}`;
    if (checkingTrust && to.issuer) return "Checking trustline…";
    if (addingTrust) return "Adding trustline…";
    if (needsTrust) return null;
    if (slipBad) return "Set slippage";
    if (market.quoting && !quote) return "Finding best route…";
    if (market.quotePaused) return "Quote paused";
    if (!quote) return market.quoteError ?? "No route";
    return null;
  })();
  const cta = (!isConnected ? "Connect wallet" : needsTrust ? (watchOnly ? "Watch-only wallet" : `Add ${to?.code} trustline`) : (blocker ?? `${side === "buy" ? "Buy" : "Sell"} ${code}`));

  const addTrustline = async () => {
    if (!activeWallet || !to?.issuer) return;
    setAddingTrust(true);
    try {
      const ok = await tx.runSingle(`Add ${to.code} trustline`, `Allow this wallet to hold ${to.code}`, activeWallet, () => buildTrustline(activeWallet.address, to.code, to.issuer!), {
        kind: "trustline",
        protocol: "stellar",
      });
      if (ok) setTrust(true);
    } finally {
      setAddingTrust(false);
    }
  };

  const submit = async () => {
    if (!activeWallet || !from || !to) return;
    if (needsTrust) return void addTrustline();
    // The background check had no answer yet: ask once more before signing.
    if (to.issuer && trust === null) {
      const v = await hasTrustline(activeWallet.address, to.code, to.issuer);
      if (v !== null) setTrust(v);
      if (v === false) return;
    }
    if (!quote) return;
    const ok = await tx.runSingle(`${side === "buy" ? "Buy" : "Sell"} ${code}`, `Swap ${amount} ${from.code} for ~${formatAmount(outMarket, 4)} ${to.code}`, activeWallet, async () => {
      const b = await postJson<{ ok?: boolean; xdr?: string; error?: string }>("/api/swap/build", { quote, from: activeWallet.address });
      if (!b.ok || !b.xdr) throw new Error(b.error ?? "Could not build the swap.");
      return b.xdr;
    }, { kind: "swap", protocol: quote.provider ?? "soroswap" });
    if (ok) setAmount("");
  };

  const setPct = (p: number) => {
    if (!from || from.balance <= 0) return;
    const v = p >= 100 ? from.balance : (from.balance * p) / 100;
    setAmount(p > 0 ? to7(Math.floor(v * 1e7) / 1e7) : "");
  };

  const rate = (() => {
    if (!from || !to || !(n > 0) || !(out > 0)) return null;
    const r = out / n;
    return inverted ? `1 ${to.code} = ${formatAmount(1 / r, 6)} ${from.code}` : `1 ${from.code} = ${formatAmount(r, 6)} ${to.code}`;
  })();

  const details: DetailRow[] = [
    { label: "Order value", value: pxIn != null && n > 0 ? formatUsd(n * pxIn) : "—" },
    { label: "Minimum received", value: quote && to ? `${formatAmount(fromBase(quote.otherAmountThreshold, to.decimals), 6)} ${to.code}` : "—" },
    { label: "Est. price impact", value: impact != null ? `${impact.toFixed(2)}%` : "—", color: impact != null && impact > 3 ? "error.main" : undefined },
  ];

  const isBuy = side === "buy";
  const ready = isConnected && (needsTrust ? !watchOnly && !addingTrust : !blocker);

  return (
    <SectionCard sx={{ gap: "1rem" }}>
      <Box sx={{ display: "flex", gap: "0.375rem", p: "0.3125rem", borderRadius: "999rem", backgroundColor: "overlay.white04" }}>
        <SideButton side="buy" active={isBuy} onClick={() => (setSide("buy"), setAmount(""))} />
        <SideButton side="sell" active={!isBuy} onClick={() => (setSide("sell"), setAmount(""))} />
      </Box>
      <Box sx={tradeBoxSx}>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Pay</Typography>
          {isConnected && from && (
            <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>
              Balance {formatAmount(from.balance, 4)} {from.code}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <InputBase
            value={amount}
            placeholder="0.00"
            onChange={(e) => {
              const v = sanitizeAmount(e.target.value);
              if (v != null) setAmount(v);
            }}
            inputProps={{ inputMode: "decimal", "aria-label": `Pay ${from?.code ?? ""}` }}
            sx={{ flex: 1, minWidth: 0, fontSize: "1.375rem", fontWeight: 600, color: "common.black" }}
          />
          <TokenChip token={from} onClick={isBuy ? () => setPicker(true) : undefined} />
        </Box>
      </Box>

      {isConnected && from && from.balance > 0 && (
        <Box sx={{ display: "flex", alignItems: "center", gap: "1rem", px: "0.375rem" }}>
          <Slider
            value={Math.round(pct)}
            onChange={(_, v) => setPct(v as number)}
            step={1}
            marks={[0, 25, 50, 75, 100].map((value) => ({ value }))}
            aria-label="Share of balance"
            sx={{ flex: 1, color: isBuy ? "green.main" : "error.main", "& .MuiSlider-mark": { width: "0.375rem", height: "0.375rem", borderRadius: "50%" } }}
          />
          <Typography sx={{ width: "3rem", textAlign: "right", fontSize: "0.875rem", fontWeight: 600, color: "common.black" }}>{Math.round(pct)}%</Typography>
        </Box>
      )}

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", px: "0.25rem" }}>
        <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>Receive</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
          <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "common.black" }} noWrap>
            {out > 0 ? `~${formatAmount(out, 6)}` : "0"}
          </Typography>
          <TokenChip token={to} onClick={isBuy ? undefined : () => setPicker(true)} />
        </Box>
      </Box>
      {pxOut != null && out > 0 && (
        <Typography sx={{ fontSize: "0.75rem", color: "grey.200", textAlign: "right", mt: "-0.75rem", px: "0.25rem" }}>≈ {formatUsd(out * pxOut)}</Typography>
      )}

      <Button
        variant="solid"
        disabled={isConnected && !ready}
        onClick={() => (isConnected ? void submit() : void openConnectModal())}
        sx={{
          height: "3.25rem",
          borderRadius: "999rem",
          fontWeight: 600,
          textTransform: "none",
          ...(ready ? { background: isBuy ? BUY : SELL, "&:hover": { background: isBuy ? "#00B060" : "#D33F44" } } : {}),
        }}
      >
        {cta}
      </Button>

      {rate && (
        <ButtonBase onClick={() => setInverted((v) => !v)} sx={{ alignSelf: "flex-start", gap: "0.375rem", fontSize: "0.8125rem", color: "grey.200", px: "0.25rem" }}>
          {rate}
          <SwapHorizRoundedIcon sx={{ fontSize: "1rem" }} />
        </ButtonBase>
      )}
      <DetailRows rows={details} />
      <Box sx={{ px: "0.25rem" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>Max slippage</Typography>
          <ButtonBase onClick={() => setEditSlip((v) => !v)} sx={{ gap: "0.375rem", fontSize: "0.875rem", color: "common.black" }} aria-label="Edit max slippage">
            {slippage}%
            <EditOutlinedIcon sx={{ fontSize: "0.9375rem", color: "grey.200" }} />
          </ButtonBase>
        </Box>
        {editSlip && (
          <Box sx={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end", mt: "0.5rem" }}>
            {SLIPPAGES.map((v) => (
              <ButtonBase
                key={v}
                onClick={() => setSlippage(v)}
                sx={{ px: "0.75rem", height: "1.875rem", borderRadius: "999rem", fontSize: "0.8125rem", color: slippage === v ? "common.white" : "grey.200", backgroundColor: slippage === v ? "sidebar.primary" : "overlay.white04" }}
              >
                {v}%
              </ButtonBase>
            ))}
            <InputBase
              value={SLIPPAGES.includes(slippage) ? "" : slippage}
              placeholder="Custom"
              onChange={(e) => {
                const v = sanitizeAmount(e.target.value);
                if (v != null) setSlippage(v || "0.5");
              }}
              inputProps={{ inputMode: "decimal", "aria-label": "Custom slippage" }}
              sx={{ width: "4.5rem", height: "1.875rem", px: "0.625rem", borderRadius: "999rem", fontSize: "0.8125rem", backgroundColor: "overlay.white04", color: "common.black" }}
            />
          </Box>
        )}
        {!slipBad && slipNum > 5 && (
          <Typography sx={{ fontSize: "0.75rem", color: "warning.main", textAlign: "right", mt: "0.375rem" }}>High slippage: you may receive much less.</Typography>
        )}
      </Box>

      <TokenSelectDialog
        open={picker}
        onClose={() => setPicker(false)}
        tokens={pickable}
        selected={otherC}
        onSelect={(t) => setOtherC(t.contract)}
      />
      <TxDialog {...tx.dialog} />
    </SectionCard>
  );
}
