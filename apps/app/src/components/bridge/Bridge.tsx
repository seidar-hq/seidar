"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Link from "@mui/material/Link";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import QRCode from "qrcode";
import { ConnectPill } from "@/components/trade/TradeLocked";
import { CopyButton } from "@/components/wallet/WalletParts";
import { formatAmount, shortAddress } from "@/lib/format";
import { postJson } from "@/lib/tx";
import { useThemeMode } from "@/theme/ThemeModeContext";
import { useWallet } from "@/wallet/WalletContext";
import BridgeForm, { chainLogo, type BridgeState } from "./BridgeForm";
import { bridgeLayout, bridgeText, summaryStyles } from "./bridgeStyles";

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <Box sx={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
    <Typography variant="subtitle3" color="grey.200">
      {label}
    </Typography>
    <Typography variant="subtitle3" color="common.black" sx={{ textAlign: "right", wordBreak: "break-all" }}>
      {value}
    </Typography>
  </Box>
);

function useCountdown(deadline: string | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return "expired";
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function DepositPanel({ state, onReset }: { state: BridgeState; onReset: () => void }) {
  const d = state.deposit!;
  const [qr, setQr] = useState<string | null>(null);
  const [txId, setTxId] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const left = useCountdown(d.deadline);
  const evm = state.chain?.chainType === "EVM";

  useEffect(() => {
    void QRCode.toDataURL(d.depositAddress, { margin: 1, width: 300 }).then(setQr);
  }, [d.depositAddress]);

  const report = async (hash: string) => {
    setSent(hash);
    await postJson("/api/bridge/submit", { depositAddress: d.depositAddress, depositMemo: d.depositMemo, txId: hash }).catch(() => {});
  };

  const sendWithWallet = async () => {
    setErr(null);
    const eth = (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
    if (!eth || !state.evmTx) return setErr("No browser EVM wallet found. Send manually to the address above.");
    try {
      if (state.chain?.chainId) await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: state.chain.chainId }] });
      const [from] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const tx = state.evmTx;
      const value = tx.value == null ? "0x0" : String(tx.value).startsWith("0x") ? String(tx.value) : `0x${BigInt(String(tx.value)).toString(16)}`;
      const hash = (await eth.request({ method: "eth_sendTransaction", params: [{ from, to: tx.to, data: tx.data, value }] })) as string;
      await report(hash);
    } catch (e) {
      setErr(e instanceof Error ? e.message.slice(0, 160) : "The wallet rejected the transaction.");
    }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <Typography variant="subtitle1" color="common.black">
        Send exactly {d.amountIn} {state.token?.symbol} on {state.chain?.name}
      </Typography>
      <Box sx={{ alignSelf: "center", p: "0.75rem", backgroundColor: "#FFFFFF", borderRadius: "1rem" }}>
        {qr ? <Box component="img" src={qr} alt="Deposit address QR" sx={{ width: "11rem", height: "11rem", display: "block" }} /> : <Box sx={{ width: "11rem", height: "11rem" }} />}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", p: "0.75rem", borderRadius: "0.75rem", backgroundColor: "surfaceBg.softInset" }}>
        <Typography variant="subtitle3" color="common.black" sx={{ flex: 1, wordBreak: "break-all" }}>
          {d.depositAddress}
        </Typography>
        <CopyButton text={d.depositAddress} />
      </Box>
      {d.depositMemo && <Row label="Memo (required)" value={<>{d.depositMemo} <CopyButton text={d.depositMemo} size="0.875rem" /></>} />}
      <Row label="You receive" value={`${formatAmount(Number(d.amountOut), 6)} ${state.dest} (min ${formatAmount(Number(d.minAmountOut), 6)})`} />
      <Row label="To" value={shortAddress(state.toAccount, 6, 6)} />
      <Row label="Send within" value={left === "expired" ? "Expired: create a new deposit" : left ?? "—"} />
      {evm && !sent && (
        <Button variant="solid" color="primary" disabled={left === "expired"} onClick={() => void sendWithWallet()}>
          Send with browser wallet
        </Button>
      )}
      {!sent && (
        <Box sx={{ display: "flex", gap: "0.5rem" }}>
          <TextField size="small" fullWidth placeholder="Sent manually? Paste the tx hash" value={txId} onChange={(e) => setTxId(e.target.value.trim())} />
          <Button variant="outlined" color="cancel" disabled={txId.length < 20} onClick={() => void report(txId)}>
            Submit
          </Button>
        </Box>
      )}
      {sent && (
        <Typography variant="subtitle3" color="green.main">
          Deposit sent ({shortAddress(sent, 8, 6)}). Funds usually arrive on Stellar in ~{Math.max(1, Math.round(d.timeEstimate / 60))} min.
        </Typography>
      )}
      {err && (
        <Typography variant="subtitle3" color="error.main">
          {err}
        </Typography>
      )}
      <Link href={`https://explorer.near-intents.org/?search=${d.depositAddress}`} target="_blank" rel="noopener" variant="subtitle3">
        Track on NEAR Intents explorer
      </Link>
      <Button variant="outlined" color="cancel" onClick={onReset}>
        New transfer
      </Button>
    </Box>
  );
}

function TransactionSummary({ state, onReset }: { state: BridgeState; onReset: () => void }) {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const { isConnected, openConnectModal } = useWallet();
  const s = useMemo(() => summaryStyles(theme, isDarkMode), [theme, isDarkMode]);

  return (
    <Card elevation={0} sx={{ ...s.txnSummaryCard, gap: "1.25rem" }}>
      <Typography variant="h6" color="common.black">
        Transaction Summary
      </Typography>
      {!isConnected ? (
        <Box sx={s.lockedBody}>
          <Box component="img" src="/assets/bridgeSummaryLocked.svg" alt="" sx={s.lockedIllustration} />
          <Typography variant="subtitle10" color="sidebar.subText" sx={{ textAlign: "center", maxWidth: "16.375rem" }}>
            Connect a wallet to bring assets onto Stellar.
          </Typography>
          <ConnectPill onClick={openConnectModal} sx={{ alignSelf: "center" }} />
        </Box>
      ) : state.deposit ? (
        <DepositPanel state={state} onReset={onReset} />
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {state.chain && <Box component="img" src={chainLogo(state.chain.chain)} alt="" sx={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%" }} />}
            <Typography variant="subtitle1" color="common.black">
              {state.chain?.name ?? "Source"} → Stellar
            </Typography>
          </Box>
          <Row label="Send" value={state.amount ? `${state.amount} ${state.token?.symbol ?? ""}` : "—"} />
          <Row label="Receive" value={state.quote ? `${formatAmount(Number(state.quote.amountOut), 6)} ${state.dest}` : "—"} />
          <Row label="Minimum" value={state.quote ? `${formatAmount(Number(state.quote.minAmountOut), 6)} ${state.dest}` : "—"} />
          <Row label="Estimated time" value={state.quote ? `~${Math.max(1, Math.round(state.quote.timeEstimate / 60))} min` : "—"} />
          <Row label="Route" value="Allbridge Core · NEAR Intents" />
          <Typography variant="caption" color="grey.200">
            Confirm to get a one-time deposit address. Send the exact amount from any wallet or exchange on the source network before the timer runs out.
          </Typography>
        </Box>
      )}
    </Card>
  );
}

const INITIAL: BridgeState = {
  chain: undefined,
  token: undefined,
  dest: "USDC",
  amount: "",
  quote: null,
  deposit: null,
  evmTx: null,
  toAccount: "",
  fromAccount: "",
};

export default function Bridge() {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const t = useMemo(() => bridgeText(theme, isDarkMode), [theme, isDarkMode]);
  const s = useMemo(() => bridgeLayout(theme, isDarkMode), [theme, isDarkMode]);
  const [state, setStateRaw] = useState<BridgeState>(INITIAL);
  const setState = (p: Partial<BridgeState>) => setStateRaw((cur) => ({ ...cur, ...p }));

  return (
    <Box sx={{ backgroundColor: "transparent", minHeight: "100vh" }}>
      <Box sx={{ display: "grid", gap: "1rem", gridTemplateColumns: "1fr 28.5625rem", mt: "0.4rem", "@media (max-width: 75rem)": { gridTemplateColumns: "1fr" } }}>
        <Box sx={{ ...s.bridgeSectionCard, padding: { xs: "1rem", sm: "1.500rem" } }}>
          <Box sx={{ mb: "1.500rem" }}>
            <Typography variant="h5" sx={{ ...t.heading, mb: "0.500rem" }}>
              Bridge
            </Typography>
            <Typography variant="body1" sx={{ ...t.body }}>
              Bring USDC, stablecoins and native tokens from other networks onto Stellar.
            </Typography>
          </Box>
          <Box sx={{ ...s.bridgeWidgetWrapper, minHeight: { xs: "auto", md: "50vh" } }}>
            <BridgeForm state={state} setState={setState} />
          </Box>
        </Box>
        <Box sx={{ display: "flex" }}>
          <TransactionSummary state={state} onReset={() => setState({ deposit: null, evmTx: null, amount: "", quote: null })} />
        </Box>
      </Box>
    </Box>
  );
}
