"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import CheckRounded from "@mui/icons-material/CheckRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import TokenLogo from "@/components/common/TokenLogo";
import TxDialog from "@/components/tx/TxDialog";
import { useTxRunner } from "@/components/tx/useTxRunner";
import { apiJson } from "@/lib/api";
import { formatAmount, formatUsd } from "@/lib/format";
import { buildTrustline, hasTrustline } from "@/lib/payment";
import { postJson } from "@/lib/tx";
import { useShared } from "@/lib/useShared";
import { STELLAR_LOGO } from "@/lib/wallets";
import { useThemeMode } from "@/theme/ThemeModeContext";
import { useWallet } from "@/wallet/WalletContext";
import { bridgeInputs, bridgeLayout, bridgeText, bridgeTooltip } from "./bridgeStyles";

export type SourceToken = { symbol: string; name: string; decimals: number; tokenAddress: string; isNative: boolean; usdPrice: number | null };
export type SourceChain = { chain: string; name: string; chainType: string; chainId: string | null; tokens: SourceToken[] };
export type Quote = { amountIn: string; amountOut: string; minAmountOut: string; timeEstimate: number; estimated: boolean; amountInUsd?: string; amountOutUsd?: string };
export type Deposit = { depositAddress: string; depositMemo?: string; amountIn: string; amountOut: string; minAmountOut: string; deadline: string; timeEstimate: number };
export type BridgeState = {
  chain: SourceChain | undefined;
  token: SourceToken | undefined;
  dest: "USDC" | "XLM";
  amount: string;
  quote: Quote | null;
  deposit: Deposit | null;
  evmTx: { to?: string; from?: string; value?: string | number; data?: string } | null;
  toAccount: string;
  fromAccount: string;
};

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

// Chain logos (DefiLlama icon CDN).
const CHAIN_LOGO: Record<string, string> = {
  ETH: "ethereum",
  POL: "polygon",
  ARB: "arbitrum",
  AVA: "avalanche",
  OPT: "optimism",
  BAS: "base",
  BSC: "bsc",
  TRX: "tron",
  SOL: "solana",
  SUI: "sui",
};
export const chainLogo = (c: string) => (CHAIN_LOGO[c] ? `https://icons.llamao.fi/icons/chains/rsz_${CHAIN_LOGO[c]}.jpg` : STELLAR_LOGO);

const isNumber = (v: string) => v === "" || /^\d*\.?\d*$/.test(v);
const ethereum = () => (typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum);

function ChainSelect({ value, onChange, options, disabled }: { value: SourceChain | undefined; onChange: (c: SourceChain | undefined) => void; options: SourceChain[]; disabled: boolean }) {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const s = useMemo(() => bridgeLayout(theme, isDarkMode), [theme, isDarkMode]);
  return (
    <Autocomplete
      value={value ?? undefined}
      onChange={(_, v) => onChange(v ?? undefined)}
      options={options}
      getOptionLabel={(o) => o.name}
      disabled={disabled}
      popupIcon={<KeyboardArrowDown sx={{ color: "grey.200", fontSize: "1.25rem" }} />}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          placeholder="From"
          sx={s.networkDropdownContainer}
          slotProps={{
            input: {
              ...params.InputProps,
              style: s.networkInputStyle,
              startAdornment: value ? (
                <InputAdornment position="start" sx={s.inputAdornment}>
                  <img src={chainLogo(value.chain)} alt={value.name} style={s.networkLogoInInput} />
                </InputAdornment>
              ) : null,
            },
          }}
        />
      )}
      renderOption={(props, option, { selected }) => {
        const { key, ...rest } = props;
        return (
          <Box key={key} component="li" {...rest} sx={{ display: "flex !important", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
              <Box sx={s.networkLogoDropdownContainer}>
                <img src={chainLogo(option.chain)} alt={option.name} style={s.networkLogoInDropdown} />
              </Box>
              <Typography variant="body3" sx={{ color: "sidebar.heading" }} noWrap>
                {option.name}
              </Typography>
            </Box>
            <Box sx={selected ? s.networkOptionCheck : s.networkOptionRadio}>
              {selected && <CheckRounded sx={{ fontSize: "0.625rem", color: isDarkMode ? "sidebar.purple100" : "sidebar.white" }} />}
            </Box>
          </Box>
        );
      }}
      isOptionEqualToValue={(a, b) => a.chain === b.chain}
      disableClearable
      noOptionsText="No networks found"
      slotProps={{ paper: { sx: s.networkDropdownPaper } }}
    />
  );
}

/** The destination network is always Stellar: a static badge, not a selector. */
function StellarTarget() {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const s = useMemo(() => bridgeLayout(theme, isDarkMode), [theme, isDarkMode]);
  return (
    <Box sx={{ ...s.networkDropdownContainer, display: "flex", alignItems: "center", gap: "0.5rem", height: "2.75rem", px: "0.875rem", borderRadius: "999rem", backgroundColor: isDarkMode ? theme.palette.overlay.white05 : theme.palette.grey[100] }}>
      <img src={STELLAR_LOGO} alt="Stellar" style={s.networkLogoInInput} />
      <Typography variant="body3" color="sidebar.heading">
        Stellar
      </Typography>
    </Box>
  );
}

const Pill = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <ButtonBase
    onClick={onClick}
    sx={{
      gap: "0.375rem",
      px: "0.625rem",
      py: "0.375rem",
      borderRadius: "999rem",
      border: (t) => `0.0625rem solid ${active ? t.palette.primary.main : t.palette.border.main700}`,
      backgroundColor: active ? "overlay.white08" : "transparent",
    }}
  >
    {children}
  </ButtonBase>
);

export default function BridgeForm({ state, setState }: { state: BridgeState; setState: (p: Partial<BridgeState>) => void }) {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const { isConnected, activeWallet, openConnectModal } = useWallet();
  const t = useMemo(() => bridgeText(theme, isDarkMode), [theme, isDarkMode]);
  const inputs = useMemo(() => bridgeInputs(theme), [theme]);
  const s = useMemo(() => bridgeLayout(theme, isDarkMode), [theme, isDarkMode]);
  const tip = useMemo(() => bridgeTooltip(theme), [theme]);
  const tx = useTxRunner();
  const { value: routes, loading: routesLoading } = useShared<{ sources?: SourceChain[] } | null>("bridge:routes", () => apiJson("/api/bridge/routes", undefined, 90_000), 600_000);
  const sources = routes?.sources ?? [];
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [trust, setTrust] = useState<boolean | null>(true);
  const seq = useRef(0);
  const { chain, token, dest, amount, quote, toAccount, fromAccount } = state;

  // Defaults: Base USDC -> Stellar USDC, delivered to the active wallet.
  useEffect(() => {
    if (!chain && sources.length) {
      const c = sources.find((x) => x.chain === "BAS") ?? sources[0];
      setState({ chain: c, token: c.tokens.find((x) => x.symbol === "USDC") ?? c.tokens[0] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources.length]);
  useEffect(() => {
    if (activeWallet && !toAccount) setState({ toAccount: activeWallet.address });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWallet?.address]);

  // USDC needs a trustline on the receiving Stellar account.
  useEffect(() => {
    if (dest !== "USDC" || !/^G[A-Z2-7]{55}$/.test(toAccount)) return setTrust(true);
    let live = true;
    void hasTrustline(toAccount, "USDC", USDC_ISSUER).then((v) => live && setTrust(v));
    return () => {
      live = false;
    };
  }, [dest, toAccount]);

  // Debounced quote.
  useEffect(() => {
    setState({ quote: null });
    setQuoteError(null);
    if (!chain || !token || !(Number(amount) > 0)) return;
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      setQuoting(true);
      type QuoteResp = { ok?: boolean; quote?: Quote; error?: string };
      const r: QuoteResp = await postJson<QuoteResp>("/api/bridge/quote", {
        fromChain: chain.chain,
        fromToken: token.tokenAddress,
        toToken: dest,
        amount,
      }).catch((e): QuoteResp => ({ ok: false, error: String(e) }));
      if (id !== seq.current) return;
      setQuoting(false);
      if (r.ok && r.quote) setState({ quote: r.quote });
      else setQuoteError(r.error ?? "No quote available.");
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain?.chain, token?.tokenAddress, dest, amount]);

  const fillFromBrowserWallet = async () => {
    const eth = ethereum();
    if (!eth) return setQuoteError("No browser EVM wallet found. Paste your address instead.");
    const accts = (await eth.request({ method: "eth_requestAccounts" }).catch(() => [])) as string[];
    if (accts?.[0]) setState({ fromAccount: accts[0] });
  };

  const create = async () => {
    if (!chain || !token) return;
    setCreating(true);
    type DepositResp = { ok?: boolean; deposit?: Deposit; evmTx?: BridgeState["evmTx"]; error?: string };
    const r: DepositResp = await postJson<DepositResp>("/api/bridge/deposit", {
      fromChain: chain.chain,
      fromToken: token.tokenAddress,
      toToken: dest,
      amount,
      fromAccount,
      toAccount,
    }).catch((e): DepositResp => ({ ok: false, error: String(e) }));
    setCreating(false);
    if (r.ok && r.deposit) setState({ deposit: r.deposit, evmTx: r.evmTx ?? null });
    else setQuoteError(r.error ?? "Could not create the bridge deposit.");
  };

  const addTrustline = () =>
    activeWallet &&
    void tx
      .runSingle("Add USDC trustline", "Allow this wallet to hold Circle USDC", activeWallet, () => buildTrustline(activeWallet.address, "USDC", USDC_ISSUER))
      .then((ok) => ok && setTrust(true));

  const validTo = /^G[A-Z2-7]{55}$/.test(toAccount);
  const evm = chain?.chainType === "EVM";
  const validFrom = evm ? /^0x[0-9a-fA-F]{40}$/.test(fromAccount) : fromAccount.trim().length >= 20;
  let cta = "CONFIRM";
  let ok = false;
  if (!isConnected) cta = "CONNECT WALLET";
  else if (!chain || !token) cta = "SELECT NETWORK";
  else if (!(Number(amount) > 0)) cta = "ENTER AMOUNT";
  else if (!validTo) cta = "ENTER STELLAR ADDRESS";
  else if (trust === false) cta = "ADD USDC TRUSTLINE FIRST";
  else if (!validFrom) cta = `ENTER YOUR ${chain.name.toUpperCase()} ADDRESS`;
  else if (!quote) cta = quoting ? "GETTING QUOTE…" : "NO QUOTE";
  else ok = true;

  return (
    <Box sx={{ width: "100%", maxWidth: "43.750rem" }}>
      <Typography variant="subtitle2" sx={{ ...t.subheading, mb: "1rem" }}>
        Bridge to Stellar
      </Typography>
      <Box sx={{ mb: "1rem" }}>
        <Typography variant="subtitle1" sx={{ mb: "1rem", ...t.bodyLarge }}>
          Select Network
        </Typography>
        <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: "1rem" }}>
          <Box sx={{ flex: 1 }}>
            <ChainSelect
              value={chain}
              onChange={(c) => setState({ chain: c, token: c?.tokens.find((x) => x.symbol === "USDC") ?? c?.tokens[0], amount: "", fromAccount: "" })}
              options={sources}
              disabled={routesLoading && !sources.length}
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <StellarTarget />
          </Box>
        </Box>
      </Box>

      <Box sx={{ mb: "1rem" }}>
        <Typography variant="subtitle2" sx={{ mb: "0.5rem", ...t.bodyLarge }}>
          You send
        </Typography>
        <Box sx={s.greyContainer}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", width: "100%", mb: "0.75rem" }}>
            <TextField
              variant="outlined"
              placeholder="0"
              size="small"
              sx={{ ...s.transparentInput, flex: 1, "& .MuiInputBase-input": inputs.inputLarge }}
              onChange={(e) => isNumber(e.target.value) && setState({ amount: e.target.value })}
              value={amount}
            />
            {quoting && <CircularProgress size={18} />}
          </Box>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", width: "100%" }}>
            {(chain?.tokens ?? []).map((tk) => (
              <Pill key={tk.tokenAddress} active={tk.tokenAddress === token?.tokenAddress} onClick={() => setState({ token: tk })}>
                <Typography variant="subtitle3" color="common.black">
                  {tk.symbol}
                </Typography>
              </Pill>
            ))}
          </Box>
          <Box sx={{ ...s.flexSpaceBetween, width: "100%", mt: "0.75rem" }}>
            <Typography variant="body2" sx={{ ...t.secondary }}>
              ≈{formatUsd(quote?.amountInUsd ? Number(quote.amountInUsd) : token?.usdPrice ? Number(amount || 0) * token.usdPrice : 0)}
            </Typography>
            <Typography variant="body2" sx={{ ...t.secondary }}>
              on {chain?.name ?? "—"}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mb: "1rem" }}>
        <Typography variant="subtitle2" sx={{ mb: "0.5rem", ...t.bodyLarge }}>
          You receive on Stellar
        </Typography>
        <Box sx={s.greyContainer}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "1rem", flexWrap: "wrap" }}>
            <Typography variant="h5" color={quote ? "common.black" : "grey.200"}>
              {quote ? formatAmount(Number(quote.amountOut), 6) : "0"}
            </Typography>
            <Box sx={{ display: "flex", gap: "0.5rem" }}>
              {(["USDC", "XLM"] as const).map((d) => (
                <Pill key={d} active={dest === d} onClick={() => setState({ dest: d })}>
                  <TokenLogo code={d} issuer={d === "USDC" ? USDC_ISSUER : null} size="1.25rem" />
                  <Typography variant="subtitle3" color="common.black">
                    {d}
                  </Typography>
                </Pill>
              ))}
            </Box>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%", mt: "0.75rem", pt: "0.75rem", borderTop: `0.0625rem solid ${theme.palette.grey[300]}`, flexWrap: "wrap", gap: "0.5rem" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <img src="/assets/bridge/timer.svg" alt="" style={{ width: "1.25rem", height: "1.25rem" }} />
              <Typography variant="body1" color="grey.200">
                {quote ? `~${Math.max(1, Math.round(quote.timeEstimate / 60))} min` : "—"}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <Typography variant="body1" color="grey.200">
                Min {quote ? `${formatAmount(Number(quote.minAmountOut), 6)} ${dest}` : "—"}
              </Typography>
              <Tooltip
                arrow
                placement="top"
                componentsProps={tip.tooltipProps}
                title={
                  <Box>
                    <Typography sx={tip.titleStyle}>Minimum received</Typography>
                    <Typography sx={tip.descriptionStyle}>Fees are inside the quote. If solvers can&apos;t deliver at least this much, the deposit is refunded to your source address.</Typography>
                  </Box>
                }
              >
                <InfoOutlinedIcon sx={{ fontSize: "1rem", color: "primary.main" }} />
              </Tooltip>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mb: "1rem", display: "grid", gap: "1rem", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        <Box sx={s.greyContainer}>
          <Typography variant="body1" sx={{ mb: "0.5rem", color: theme.palette.grey[200] }}>
            Your {chain?.name ?? "source"} address (refunds)
          </Typography>
          <TextField
            value={fromAccount}
            onChange={(e) => setState({ fromAccount: e.target.value.trim() })}
            placeholder={evm ? "0x…" : "Address"}
            fullWidth
            size="small"
            sx={{ ...s.transparentInput, "& .MuiInputBase-input": inputs.inputMedium }}
          />
          {evm && (
            <ButtonBase onClick={() => void fillFromBrowserWallet()} sx={{ mt: "0.5rem", color: "primary.main", fontSize: "0.8125rem" }}>
              Use browser wallet
            </ButtonBase>
          )}
        </Box>
        <Box sx={s.greyContainer}>
          <Typography variant="body1" sx={{ mb: "0.5rem", color: theme.palette.grey[200] }}>
            Stellar destination
          </Typography>
          <TextField
            value={toAccount}
            onChange={(e) => setState({ toAccount: e.target.value.trim() })}
            placeholder="G…"
            fullWidth
            size="small"
            sx={{ ...s.transparentInput, "& .MuiInputBase-input": inputs.inputMedium }}
          />
        </Box>
      </Box>

      {trust === false && (
        <Alert
          severity="warning"
          sx={{ mb: "0.75rem" }}
          action={
            toAccount === activeWallet?.address ? (
              <Button size="small" onClick={addTrustline}>
                Add trustline
              </Button>
            ) : undefined
          }
        >
          This Stellar account has no USDC trustline yet, so it cannot receive USDC.
        </Alert>
      )}
      {quoteError && (
        <Alert severity="error" sx={{ mb: "0.75rem" }}>
          {quoteError}
        </Alert>
      )}
      <Button variant="solid" fullWidth disabled={isConnected && (!ok || creating)} onClick={() => (isConnected ? void create() : void openConnectModal())}>
        {creating ? "CREATING DEPOSIT…" : cta}
      </Button>
      <Typography variant="caption" color="grey.200" sx={{ display: "block", mt: "0.75rem" }}>
        Powered by Allbridge Core over NEAR Intents. No approval needed: you send the tokens to a one-time deposit address.
      </Typography>
      <TxDialog {...tx.dialog} />
    </Box>
  );
}
