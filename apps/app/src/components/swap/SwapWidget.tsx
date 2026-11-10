"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { LOOK, TINT, lookInset, lookPanel } from "@/theme/exploreLook";
import { styled } from "@mui/material/styles";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import SwapVertRoundedIcon from "@mui/icons-material/SwapVertRounded";
import QRCode from "qrcode";
import Tabs from "@/components/common/Tabs";
import TokenLogo from "@/components/common/TokenLogo";
import Shimmer from "@/components/common/Shimmer";
import TxDialog from "@/components/tx/TxDialog";
import { useTxRunner } from "@/components/tx/useTxRunner";
import { CopyButton } from "@/components/wallet/WalletParts";
import { apiJson } from "@/lib/api";
import { formatAmount, formatUsd, shortAddress } from "@/lib/format";
import { buildPayment, buildTrustline, cleanAmount, hasTrustline } from "@/lib/payment";
import { postJson, toBase } from "@/lib/tx";
import { useShared } from "@/lib/useShared";
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import { SWAP_TABS, SwapAccordion, SwapDetails, SwapSummary } from "./SwapLockedWidget";
import TokenSelectDialog, { type SwapToken } from "./TokenSelectDialog";
import { useSwapTokens } from "./useSwapTokens";
import { fromBase, useSwapQuote, useTrustline } from "./useSwapQuote";

// ---------- DEX venues (swaps always route across all of them: Auto) ----------

export const DEXES = [
  { id: "soroswap", name: "Soroswap", logo: "/protocols/soroswap.png" },
  { id: "aqua", name: "Aquarius", logo: "/protocols/aqua.png" },
  { id: "phoenix", name: "Phoenix", logo: "/protocols/phoenix.png" },
  { id: "sdex", name: "Stellar DEX", logo: "/tokens/xlm.png" },
  { id: "sushi", name: "Sushi", logo: "/protocols/sushi.png" },
] as const;
const dexName = (id: string) => DEXES.find((d) => d.id === id)?.name ?? id;

// ---------- styles ----------

const Root = styled(Box)(({ theme }) => ({
  width: "100%",
  minHeight: "38.5rem",
  display: "flex",
  flexDirection: "column",
  borderRadius: "1.5rem",
  backgroundColor: theme.palette.surfaceBg.section,
  overflow: "hidden",
  [LOOK]: lookPanel(TINT.violet),
}));

const Panel = styled(Box)(({ theme }) => {
  const dark = theme.palette.mode === "dark";
  return {
    display: "flex",
    flexDirection: "column",
    gap: "0.875rem",
    width: "100%",
    padding: "1rem",
    borderRadius: "0.75rem",
    backgroundColor: dark ? theme.palette.surfaceBg.softInset : theme.palette.grey[400],
    border: `0.0625rem solid ${dark ? theme.palette.surfaceBg.softInsetStrong : theme.palette.border.main600}`,
    [LOOK]: lookInset,
  };
});

const SpaceRow = styled(Box)({ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "0.5rem" });

const AmountInput = styled(InputBase)(({ theme }) => ({
  flex: 1,
  minWidth: 0,
  fontSize: "1.75rem",
  fontWeight: 500,
  color: theme.palette.common.black,
  "& input": { padding: 0 },
  "& input::placeholder": { color: theme.palette.grey[200], opacity: 1 },
}));

const TokenPill = styled(ButtonBase)(({ theme }) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  flexShrink: 0,
  height: "2.5rem",
  padding: "0.25rem 0.625rem 0.25rem 0.25rem",
  borderRadius: "6.25rem",
  backgroundColor: theme.palette.overlay.white08,
  border: `0.0625rem solid ${theme.palette.grey[300]}`,
  "&:hover": { backgroundColor: theme.palette.overlay.white20 },
}));

const SmallPill = styled(ButtonBase)(({ theme }) => ({
  padding: "0.25rem 0.5rem",
  borderRadius: "999rem",
  backgroundColor: theme.palette.overlay.white05,
  color: theme.palette.grey[200],
  fontSize: "0.75rem",
  "&:hover": { color: theme.palette.common.black },
}));

const FlipButton = styled(IconButton)(({ theme }) => ({
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "2.75rem",
  height: "2.75rem",
  zIndex: 1,
  color: theme.palette.sidebar.white,
  backgroundColor: theme.palette.sidebar.primary,
  border: `0.25rem solid ${theme.palette.surfaceBg.section}`,
  "&:hover": { backgroundColor: theme.palette.sidebar.primary, opacity: 0.9 },
}));

const SlippageBox = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
  width: "8rem",
  height: "2.5rem",
  padding: "0.5rem 0.75rem",
  borderRadius: "6.25rem",
  backgroundColor: theme.palette.grey[400],
}));

const MainButton = styled(Button)({ height: "3rem", borderRadius: "999rem" });

const DetailRow = ({ label, tip, value, color }: { label: string; tip: string; value: React.ReactNode; color?: string }) => (
  <SpaceRow>
    <Box sx={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
      <Typography variant="subtitle3" color="grey.200">
        {label}
      </Typography>
      <Tooltip title={tip} arrow placement="top">
        <InfoOutlinedIcon sx={{ fontSize: "0.875rem", color: "grey.200" }} />
      </Tooltip>
    </Box>
    <Typography variant="subtitle3" color={color ?? "common.black"} sx={{ textAlign: "right" }}>
      {value}
    </Typography>
  </SpaceRow>
);

function TokenButton({ token, onClick }: { token: SwapToken | null; onClick: () => void }) {
  return (
    <TokenPill onClick={onClick}>
      {token ? (
        <>
          <TokenLogo code={token.code} issuer={token.issuer} size="2.25rem" />
          <Typography variant="subtitle1" color="common.black">
            {token.code}
          </Typography>
        </>
      ) : (
        <Typography variant="subtitle3" color="common.black" sx={{ pl: "0.5rem" }}>
          Select Token
        </Typography>
      )}
      <KeyboardArrowDown sx={{ fontSize: "1rem", color: "grey.200" }} />
    </TokenPill>
  );
}

// ---------- quote ----------


function usePrices(codes: string[]) {
  const key = codes.length ? `px:${[...codes].sort().join(",")}` : null;
  const { value } = useShared<{ prices?: Record<string, number | null> } | null>(
    key,
    () => apiJson(`/api/prices?codes=${encodeURIComponent(codes.join(","))}`),
    60_000,
  );
  return value?.prices ?? {};
}

// ---------- Swap ----------

export type PairListener = (from: SwapToken | null, to: SwapToken | null) => void;

/** The active wallet's balances are still loading, or updating after a transaction. */
function useBalanceBusy() {
  const { activeWallet } = useWallet();
  const address = activeWallet?.address ?? null;
  const { byAddress, refreshing } = useBalances(address ? [address] : []);
  return !!address && ((byAddress[address]?.loading ?? true) || refreshing);
}

function SwapPanel({ tokens, onPairChange }: { tokens: SwapToken[]; onPairChange?: PairListener }) {
  const balBusy = useBalanceBusy();
  const { activeWallet } = useWallet();
  const tx = useTxRunner();
  const [fromC, setFromC] = useState<string | null>(null);
  const [toC, setToC] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [details, setDetails] = useState(false);
  const [addingTrust, setAddingTrust] = useState(false);

  // Default pair once the catalogue loads: XLM -> USDC, or XLM / USDC -> the token in ?buy=CODE:ISSUER
  // (Home's Swap buttons) when the catalogue has it.
  useEffect(() => {
    if (!tokens.length || fromC) return;
    const xlm = tokens.find((t) => t.code === "XLM" && !t.issuer)?.contract ?? null;
    const usdc = tokens.find((t) => t.code === "USDC" && t.issuer?.startsWith("GA5ZSE"))?.contract ?? null;
    const [code, issuer] = (new URLSearchParams(window.location.search).get("buy") ?? "").split(":");
    // CODE:ISSUER (classic), CODE:CONTRACT (Soroban-only) or XLM.
    const buy = code
      ? tokens.find((t) => (issuer?.startsWith("C") ? t.contract === issuer : t.code === code && (t.issuer ?? null) === (issuer || null)))?.contract
      : undefined;
    setFromC(buy && buy === xlm ? usdc : xlm);
    setToC(buy ?? usdc);
  }, [tokens, fromC]);

  const from = tokens.find((t) => t.contract === fromC) ?? null;
  const to = tokens.find((t) => t.contract === toC) ?? null;
  const prices = usePrices([from?.code, to?.code].filter(Boolean) as string[]);
  useEffect(() => {
    onPairChange?.(from, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.contract, to?.contract]);
  const slipNum = Number(slippage);
  const slipBad = !(slipNum > 0 && slipNum < 100);
  const base = from && cleanAmount(amount) ? toBase(cleanAmount(amount)!, from.decimals) : null;
  const insufficient = !!from && !!cleanAmount(amount) && Number(amount) > from.balance;

  // Receiving a classic asset needs a trustline on this wallet. XLM and
  // Soroban-only tokens have no issuer, so they never need one.
  const walletAddress = activeWallet?.address ?? null;
  const { trust, setTrust, checkingTrust } = useTrustline(walletAddress, to);
  const { quote, quoteError, quoting, quotePaused } = useSwapQuote(from, to, base, slipNum);

  const outAmount = quote && to ? fromBase(quote.amountOut, to.decimals) : 0;
  const minOut = quote && to ? fromBase(quote.otherAmountThreshold, to.decimals) : 0;
  const rate = quote && from && to && Number(amount) > 0 ? outAmount / Number(amount) : 0;
  const impact = quote?.priceImpactPct != null ? Number(quote.priceImpactPct) : null;
  const venues = [...new Set((quote?.routePlan ?? []).map((r) => r.swapInfo?.protocol).filter(Boolean) as string[])];
  const pxIn = from ? (prices[from.code] ?? from.price) : null;
  const pxOut = to ? (prices[to.code] ?? to.price) : null;

  const flip = () => {
    setFromC(toC);
    setToC(fromC);
    setAmount(quote && to ? String(Number(outAmount.toFixed(to.decimals))) : amount);
  };

  const execute = async () => {
    if (!activeWallet || !quote || !from || !to) return;
    const ok = await tx.runSingle(`Swap ${from.code} → ${to.code}`, `Swap ${amount} ${from.code} for ~${formatAmount(outAmount, 4)} ${to.code}`, activeWallet, async () => {
      const b = await postJson<{ ok?: boolean; xdr?: string; error?: string }>("/api/swap/build", {
        quote,
        from: activeWallet.address,
      });
      if (!b.ok || !b.xdr) throw new Error(b.error ?? "Could not build the swap.");
      return b.xdr;
    }, { kind: "swap", protocol: quote.provider ?? "soroswap" });
    if (ok) setAmount("");
  };

  const watchOnly = activeWallet?.walletId === "watch";
  const checkingNeededTrust = !!activeWallet && !!to?.issuer && checkingTrust;
  const needsTrust = !!to?.issuer && trust === false;

  const addTrustline = async () => {
    const issuer = to?.issuer;
    if (!activeWallet || !to || !issuer) return;
    setAddingTrust(true);
    try {
      const ok = await tx.runSingle(
        `Add ${to.code} trustline`,
        `Allow this wallet to hold ${to.code}`,
        activeWallet,
        () => buildTrustline(activeWallet.address, to.code, issuer),
        { kind: "trustline", protocol: "stellar" },
      );
      if (ok) setTrust(true);
    } finally {
      setAddingTrust(false);
    }
  };

  const primaryAction = async () => {
    if (needsTrust) {
      if (!watchOnly) void addTrustline();
      return;
    }
    // The background check hasn't got an answer yet: ask once more before signing, so a wallet that
    // really lacks the trustline gets the Add button rather than a failed swap.
    if (activeWallet && to?.issuer && trust === null) {
      const v = await hasTrustline(activeWallet.address, to.code, to.issuer);
      if (v !== null) setTrust(v);
      if (v === false) return;
    }
    void execute();
  };

  let cta = "EXCHANGE";
  let disabled = true;
  if (!from || !to) cta = "SELECT TOKENS";
  else if (from.contract === to.contract) cta = "SELECT DIFFERENT TOKENS";
  else if (!base) cta = "ENTER AMOUNT";
  else if (slipBad) cta = "SET SLIPPAGE";
  else if (insufficient) cta = `INSUFFICIENT ${from.code}`;
  else if (checkingNeededTrust) cta = "CHECKING TRUSTLINE…";
  else if (addingTrust) cta = "ADDING TRUSTLINE…";
  else if (needsTrust) {
    cta = watchOnly ? "WATCH-ONLY WALLET" : `ADD ${to.code} TRUSTLINE`;
    disabled = watchOnly;
  } else if (quoting && !quote) cta = "FINDING BEST ROUTE…";
  else if (quotePaused) cta = "QUOTE PAUSED";
  else if (!quote) cta = "NO ROUTE";
  else disabled = false;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.875rem", p: "1.25rem 1rem 1rem" }}>
      <Box sx={{ position: "relative", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <Panel>
          <SpaceRow>
            <Typography variant="subtitle1" color="grey.200">
              From
            </Typography>
            {from && from.balance > 0 && (
              <SmallPill
                onClick={() =>
                  // Keep 2 XLM back for the reserve and fees when selling native XLM.
                  setAmount(String(Math.max(0, Number((from.balance - (from.code === "XLM" && !from.issuer ? 2 : 0)).toFixed(7)))))
                }
                sx={{ color: "primary.main", fontWeight: 600 }}
              >
                MAX
              </SmallPill>
            )}
          </SpaceRow>
          <SpaceRow>
            <AmountInput
              placeholder="0"
              value={amount}
              inputProps={{ inputMode: "decimal" }}
              onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setAmount(e.target.value)}
            />
            <TokenButton token={from} onClick={() => setPicker("from")} />
          </SpaceRow>
          <SpaceRow>
            <Typography variant="subtitle3" color={insufficient ? "error.main" : "grey.200"}>
              Balance:{" "}
              <Shimmer on={balBusy} width="3.5rem" height="0.875rem">
                {from ? formatAmount(from.balance, 4) : "0"}
              </Shimmer>
            </Typography>
            <Typography variant="subtitle3" color="grey.200">
              ≈{formatUsd(pxIn ? Number(amount || 0) * pxIn : 0)}
            </Typography>
          </SpaceRow>
        </Panel>
        <FlipButton onClick={flip} aria-label="Swap direction">
          <SwapVertRoundedIcon />
        </FlipButton>
        <Panel>
          <Typography variant="subtitle1" color="grey.200">
            To
          </Typography>
          <SpaceRow>
            <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
              <Typography sx={{ fontSize: "1.75rem", fontWeight: 500, color: quote ? "common.black" : "grey.200" }} noWrap>
                {quote ? formatAmount(outAmount, 6) : "0"}
              </Typography>
              {quoting && <CircularProgress size={16} />}
            </Box>
            <TokenButton token={to} onClick={() => setPicker("to")} />
          </SpaceRow>
          <SpaceRow>
            <Typography variant="subtitle3" color="grey.200">
              Balance:{" "}
              <Shimmer on={balBusy} width="3.5rem" height="0.875rem">
                {to ? formatAmount(to.balance, 4) : "0"}
              </Shimmer>
            </Typography>
            <Typography variant="subtitle3" color="grey.200">
              ≈{formatUsd(pxOut ? outAmount * pxOut : 0)}
            </Typography>
          </SpaceRow>
        </Panel>
      </Box>

      <SpaceRow>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <Typography variant="subtitle3" color="sidebar.heading">
            Max Slippage
          </Typography>
          <Tooltip title="The swap reverts if the price moves against you by more than this percentage." arrow placement="top">
            <InfoOutlinedIcon sx={{ fontSize: "1rem", color: "primary.main" }} />
          </Tooltip>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          {["0.1", "0.5", "1"].map((v) => (
            <SmallPill key={v} onClick={() => setSlippage(v)} sx={slippage === v ? { color: "common.black", backgroundColor: "overlay.white20" } : undefined}>
              {v}%
            </SmallPill>
          ))}
          <SlippageBox>
            <InputBase
              value={slippage}
              onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && Number(e.target.value || 0) <= 50 && setSlippage(e.target.value)}
              sx={{ flex: 1, fontSize: "0.875rem", color: "common.black", "& input": { textAlign: "right", p: 0 } }}
            />
            <Typography variant="subtitle3" color="sidebar.heading">
              %
            </Typography>
          </SlippageBox>
        </Box>
      </SpaceRow>
      {(slipBad || slipNum > 5) && (
        <Typography variant="subtitle3" color={slipBad ? "error.main" : "warning.main"} sx={{ textAlign: "right", mt: "-0.5rem" }}>
          {slipBad ? "Slippage must be above 0%." : "High slippage: you may receive much less."}
        </Typography>
      )}
      {quoteError && base && (
        <Typography variant="subtitle3" color="error.main" sx={{ textAlign: "center" }}>
          {quoteError}
        </Typography>
      )}
      {impact != null && impact >= 3 && (
        <Typography variant="subtitle3" color={impact >= 10 ? "error.main" : "warning.main"} sx={{ textAlign: "center" }}>
          {impact >= 10 ? "Very high" : "High"} price impact ({impact.toFixed(2)}%).
        </Typography>
      )}
      {needsTrust && !watchOnly && !addingTrust && (
        <Typography variant="subtitle3" color="grey.200" sx={{ textAlign: "center", mt: "-0.5rem" }}>
          One-time trustline; locks 0.5 XLM as reserve.
        </Typography>
      )}

      <MainButton variant="solid" color="primary" fullWidth disabled={disabled} onClick={primaryAction}>
        {cta}
      </MainButton>

      {quote && from && to && (
        <Box>
          <ButtonBase onClick={() => setDetails((d) => !d)} sx={{ width: "100%", justifyContent: "space-between", py: "0.25rem" }}>
            <Typography variant="subtitle3" color="common.black">
              Details
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <Typography variant="subtitle3" color="grey.200">
                1 {from.code} = {formatAmount(rate, 6)} {to.code}
              </Typography>
              <KeyboardArrowDown sx={{ fontSize: "1.125rem", color: "grey.200", transition: "transform .2s", transform: details ? "rotate(180deg)" : "none" }} />
            </Box>
          </ButtonBase>
          <Collapse in={details}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem", pt: "0.75rem" }}>
              <DetailRow label="Rate" tip="Quoted exchange rate for this amount." value={`1 ${from.code} = ${formatAmount(rate, 6)} ${to.code}`} />
              <DetailRow
                label="Minimum received"
                tip="The least you receive after slippage; otherwise the swap reverts."
                value={`${formatAmount(minOut, 6)} ${to.code}`}
              />
              <DetailRow
                label="Price impact"
                tip="How much this trade moves the pool price."
                value={impact == null ? "—" : `${impact.toFixed(2)}%`}
                color={impact != null && impact >= 3 ? "warning.main" : undefined}
              />
              <DetailRow
                label="Route"
                tip="DEXs the aggregator splits this swap across."
                value={venues.length ? venues.map(dexName).join(" + ") : dexName(quote.platform)}
              />
              <DetailRow label="Max slippage" tip="Your slippage tolerance." value={`${slippage}%`} />
              <DetailRow label="Network fee" tip="Stellar network fee, paid in XLM by your wallet." value="< 0.01 XLM" />
            </Box>
          </Collapse>
        </Box>
      )}

      <TokenSelectDialog
        open={picker !== null}
        onClose={() => setPicker(null)}
        tokens={tokens}
        selected={picker === "from" ? fromC : toC}
        onSelect={(t) => {
          if (picker === "from") {
            if (t.contract === toC) setToC(fromC);
            setFromC(t.contract);
          } else {
            if (t.contract === fromC) setFromC(toC);
            setToC(t.contract);
          }
        }}
      />
      <TxDialog {...tx.dialog} />
    </Box>
  );
}

// ---------- Send ----------

function SendPanel({ tokens }: { tokens: SwapToken[] }) {
  const balBusy = useBalanceBusy();
  const { activeWallet } = useWallet();
  const tx = useTxRunner();
  const held = useMemo(() => tokens.filter((t) => t.balance > 0), [tokens]);
  const [tokenC, setTokenC] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [memo, setMemo] = useState("");
  const [picker, setPicker] = useState(false);
  const token = held.find((t) => t.contract === tokenC) ?? held[0] ?? null;
  const watchOnly = activeWallet?.walletId === "watch";
  const clean = cleanAmount(amount);
  const tooMuch = !!token && !!clean && Number(clean) > token.balance;
  const validTo = /^G[A-Z2-7]{55}$/.test(to.trim());

  const send = async () => {
    if (!activeWallet || !token || !clean) return;
    const ok = await tx.runSingle(`Send ${token.code}`, `Send ${clean} ${token.code} to ${shortAddress(to.trim())}`, activeWallet, () =>
      buildPayment({ from: activeWallet.address, to: to.trim(), code: token.code, issuer: token.issuer, amount: clean, memo }),
      { kind: "send", protocol: "stellar" },
    );
    if (ok) {
      setAmount("");
      setTo("");
      setMemo("");
    }
  };

  let cta = "SEND";
  if (watchOnly) cta = "WATCH-ONLY WALLET CANNOT SEND";
  else if (!token) cta = "NO TOKENS TO SEND";
  else if (!clean) cta = "ENTER AMOUNT";
  else if (tooMuch) cta = `INSUFFICIENT ${token.code}`;
  else if (!validTo) cta = "ENTER RECIPIENT";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "0.875rem", p: "1.25rem 1rem 1rem" }}>
      <Panel>
        <Typography variant="subtitle1" color="grey.200">
          Amount
        </Typography>
        <SpaceRow>
          <AmountInput
            placeholder="0"
            value={amount}
            inputProps={{ inputMode: "decimal" }}
            onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && setAmount(e.target.value)}
          />
          <TokenButton token={token} onClick={() => setPicker(true)} />
        </SpaceRow>
        <SpaceRow>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <Typography variant="subtitle3" color={tooMuch ? "error.main" : "grey.200"}>
              Balance:{" "}
              <Shimmer on={balBusy} width="3.5rem" height="0.875rem">
                {token ? formatAmount(token.balance, 4) : "0"}
              </Shimmer>
            </Typography>
            {token && (
              <SmallPill
                onClick={() => setAmount(String(Math.max(0, Number((token.balance - (token.code === "XLM" && !token.issuer ? 2 : 0)).toFixed(7)))))}
              >
                MAX
              </SmallPill>
            )}
          </Box>
          <Typography variant="subtitle3" color="grey.200">
            ≈{formatUsd(token?.price ? Number(amount || 0) * token.price : 0)}
          </Typography>
        </SpaceRow>
      </Panel>
      <Panel>
        <Typography variant="subtitle1" color="grey.200">
          Recipient
        </Typography>
        <InputBase
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Stellar address (G…)"
          sx={{ fontSize: "0.9375rem", color: "common.black" }}
        />
        {to && !validTo && (
          <Typography variant="caption" color="error.main">
            Enter a valid Stellar address.
          </Typography>
        )}
      </Panel>
      <Panel>
        <Typography variant="subtitle1" color="grey.200">
          Memo (optional)
        </Typography>
        <InputBase
          value={memo}
          inputProps={{ maxLength: 28 }}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="Required by some exchanges"
          sx={{ fontSize: "0.9375rem", color: "common.black" }}
        />
      </Panel>
      <MainButton variant="solid" color="primary" fullWidth disabled={cta !== "SEND"} onClick={() => void send()}>
        {cta}
      </MainButton>
      <TokenSelectDialog open={picker} onClose={() => setPicker(false)} tokens={held} selected={token?.contract} onSelect={(t) => setTokenC(t.contract)} onlyHeld />
      <TxDialog {...tx.dialog} />
    </Box>
  );
}

// ---------- Receive ----------

function ReceivePanel() {
  const { activeWallet } = useWallet();
  const [qr, setQr] = useState<string | null>(null);
  const address = activeWallet?.address ?? "";

  useEffect(() => {
    if (!address) return;
    void QRCode.toDataURL(address, { margin: 1, width: 360, color: { dark: "#111111", light: "#FFFFFF" } }).then(setQr);
  }, [address]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem", p: "1.75rem 1rem 1rem" }}>
      <Box sx={{ p: "0.75rem", borderRadius: "1rem", backgroundColor: "#FFFFFF" }}>
        {qr ? <Box component="img" src={qr} alt="Wallet address QR code" sx={{ width: "12rem", height: "12rem", display: "block" }} /> : <Box sx={{ width: "12rem", height: "12rem" }} />}
      </Box>
      <Typography variant="subtitle1" color="grey.200" sx={{ textAlign: "center" }}>
        Send only Stellar (XLM or Stellar assets) to this address. Assets other than XLM need a trustline in your wallet first.
      </Typography>
      <Panel sx={{ flexDirection: "row", alignItems: "center" }}>
        <Typography variant="subtitle3" color="common.black" sx={{ flex: 1, wordBreak: "break-all" }}>
          {address}
        </Typography>
        <CopyButton text={address} size="1.25rem" />
      </Panel>
    </Box>
  );
}

/** Connected swap widget: Swap (aggregated across Stellar DEXs), Send and Receive. */
export default function SwapWidget({ onPairChange }: { onPairChange?: PairListener }) {
  const [tab, setTab] = useState("swap");
  const { address } = useWallet();
  const tokens = useSwapTokens(address);

  return (
    <Root>
      <SwapAccordion elevation={0} expanded sx={{ flex: 1 }}>
        <SwapSummary>
          <Tabs tabs={SWAP_TABS} activeTab={tab} setActiveTab={setTab} isPathProvided={false} fullWidth />
        </SwapSummary>
        <SwapDetails sx={{ p: 0 }}>
          {tab === "swap" && <SwapPanel tokens={tokens} onPairChange={onPairChange} />}
          {tab === "send" && <SendPanel tokens={tokens} />}
          {tab === "receive" && <ReceivePanel />}
        </SwapDetails>
      </SwapAccordion>
    </Root>
  );
}
