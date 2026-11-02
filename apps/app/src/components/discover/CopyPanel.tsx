"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import AccountBalanceOutlinedIcon from "@mui/icons-material/AccountBalanceOutlined";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import ConnectWalletButton from "@/components/common/ConnectWalletButton";
import GlassDialog from "@/components/common/GlassDialog";
import { SectionCard } from "@/components/common/SectionCard";
import TokenLogo, { PairLogos } from "@/components/common/TokenLogo";
import { sanitizeAmount } from "@/components/earn/ActionCard";
import TxDialog from "@/components/tx/TxDialog";
import { formatAmount, formatUsd } from "@/lib/format";
import type { TxStep } from "@/lib/tx";
import { useTokenCatalogue } from "@/portfolio/usePortfolio";
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import { MIN_COPY_USD, type CopyItem } from "./discoverData";
import { planCopy, runCopy, type Alloc, type Source } from "./copy";
import { copyRisk } from "./risk";
import { RiskPill, Segmented } from "./parts";

type Mode = "match" | "equal" | "custom";
type Plan = Awaited<ReturnType<typeof planCopy>>;

/** XLM left behind for fees and the reserves of any new trustlines. */
const XLM_KEEP = 1.5;

function useSources(address: string | null): Source[] {
  const { tokens } = useTokenCatalogue();
  const { tokens: held } = useBalances(address ? [address] : []);
  return useMemo(() => {
    const out: Source[] = [];
    for (const h of held) {
      if (!h.price || h.amount <= 0) continue;
      const t = tokens.find((x) => x.code === h.code && (x.issuer ?? null) === (h.issuer ?? null));
      if (!t) continue;
      const isXlm = !h.issuer && h.code === "XLM";
      const balance = isXlm ? Math.max(0, (h.spendable ?? h.amount - 1) - XLM_KEEP) : h.amount;
      out.push({ code: h.code, issuer: h.issuer, contract: t.contract, decimals: t.decimals ?? 7, price: h.price, balance });
    }
    return out.sort((a, b) => b.balance * b.price - a.balance * a.price);
  }, [tokens, held]);
}

function ItemIcon({ item, size = "1.75rem" }: { item: CopyItem; size?: string }) {
  return item.kind === "lp" ? <PairLogos legs={item.legs} size={size} /> : <TokenLogo code={item.asset.code} issuer={item.asset.issuer} contract={item.asset.contract} size={size} />;
}

export default function CopyPanel({ viewed, items, onRemove }: { viewed: string; items: CopyItem[]; onRemove: (id: string) => void }) {
  const { activeWallet, isConnected } = useWallet();
  const sources = useSources(activeWallet?.address ?? null);
  const [srcKey, setSrcKey] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<Mode>("match");
  const [custom, setCustom] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [review, setReview] = useState<{ open: boolean; plan: Plan | null; error: string | null }>({ open: false, plan: null, error: null });
  const [tx, setTx] = useState<{ open: boolean; steps: TxStep[]; error: string | null }>({ open: false, steps: [], error: null });

  // Default payment token: USDC when there is some, else the largest holding.
  useEffect(() => {
    if (srcKey && sources.some((s) => s.contract === srcKey)) return;
    const pick = sources.find((s) => s.code === "USDC" && s.balance * s.price >= 5) ?? sources[0];
    if (pick) setSrcKey(pick.contract);
  }, [sources, srcKey]);
  const source = sources.find((s) => s.contract === srcKey) ?? null;

  const n = Number(amount || 0);
  const usd = source ? n * source.price : 0;

  // Share of the amount each item gets (sums to 1), whether or not an amount is entered yet.
  const shares = useMemo(() => {
    const w = items.map((i) => (mode === "equal" ? 1 : mode === "custom" ? (custom[i.id] ?? 0) : i.usd));
    const sum = w.reduce((s, x) => s + x, 0);
    return w.map((x) => (sum > 0 ? x / sum : 0));
  }, [items, mode, custom]);
  const allocs: Alloc[] = useMemo(() => items.map((item, k) => ({ item, usd: usd * shares[k] })), [items, shares, usd]);
  const weightPct = (k: number) => shares[k] * 100;

  const apyUsd = allocs.reduce((s, a) => s + a.usd * (a.item.apy ?? 0), 0);
  const estApy = usd > 0 ? apyUsd / usd : null;
  const risk = copyRisk(allocs);
  const swaps = allocs.reduce((s, a) => s + (a.item.kind === "lp" ? a.item.legs : [a.item.asset]).filter((l) => !source || l.contract !== source.contract).length, 0);
  const deposits = allocs.filter((a) => a.item.kind !== "token").length;

  const own = activeWallet?.address === viewed;
  const blocker = !isConnected
    ? null
    : own
      ? "This is your own wallet"
      : !items.length
        ? "Select positions to copy"
        : !source
          ? "No priced token in your wallet to pay with"
          : !(n > 0)
            ? "Enter an amount"
            : n > source.balance + 1e-9
              ? `Insufficient ${source.code}${source.code === "XLM" ? ` (${XLM_KEEP} XLM is kept for fees)` : ""}`
              : allocs.some((a) => a.usd < MIN_COPY_USD * (a.item.kind === "lp" ? 2 : 1))
                ? "Each position needs at least $1: raise the amount or select fewer"
                : null;

  const openReview = async () => {
    if (!activeWallet || !source || blocker) return;
    setReview({ open: true, plan: null, error: null });
    try {
      const plan = await planCopy(allocs, source, activeWallet.address);
      setReview({ open: true, plan, error: null });
    } catch (e) {
      setReview({ open: true, plan: null, error: e instanceof Error ? e.message : "Couldn't prepare the copy." });
    }
  };

  const start = async () => {
    const plan = review.plan;
    if (!activeWallet || !source || !plan) return;
    setReview({ open: false, plan: null, error: null });
    setTx({ open: true, steps: plan.map((p) => ({ key: p.key, label: p.label, status: "queued" })), error: null });
    const r = await runCopy(plan, source, activeWallet, (steps) => setTx((t) => ({ ...t, steps })));
    if (r.stopped === "failed" || r.stopped === "pending")
      setTx((t) => ({ ...t, error: `${r.done} of ${r.total} steps done. ${r.error ?? ""} Anything already deposited stays in your wallet's positions.` }));
    else if (!r.stopped) setAmount("");
  };

  const sectionLabel = (t: string) => (
    <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "grey.200" }}>{t}</Typography>
  );

  return (
    <SectionCard
      id="copy-panel"
      sx={(t) => ({
        gap: "1.125rem",
        position: { md: "sticky" },
        top: { md: "6.5rem" },
        background: `linear-gradient(180deg, ${alpha(t.palette.sidebar.primary, 0.1)}, transparent 9rem), ${t.palette.surfaceBg.section}`,
      })}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Box sx={{ width: "2.5rem", height: "2.5rem", borderRadius: "0.875rem", display: "grid", placeItems: "center", color: "#fff", backgroundColor: "sidebar.primary" }}>
          <ContentCopyRoundedIcon sx={{ fontSize: "1.125rem" }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black", lineHeight: 1.3, whiteSpace: "nowrap" }}>Copy this wallet</Typography>
          <Typography variant="caption" color="grey.200">
            {items.length ? `${items.length} position${items.length === 1 ? "" : "s"} selected` : "Tick positions on the left"}
          </Typography>
        </Box>
      </Box>

      {/* Amount */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {sectionLabel("You invest")}
        <Box sx={{ borderRadius: "1rem", p: "0.875rem 1rem", backgroundColor: "overlay.white04", border: (t) => `0.0625rem solid ${blocker?.startsWith("Insufficient") ? t.palette.error.main : t.palette.overlay.white08}` }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <InputBase
              placeholder="0.00"
              value={amount}
              disabled={!isConnected}
              onChange={(e) => {
                const v = sanitizeAmount(e.target.value);
                if (v != null) setAmount(v);
              }}
              inputProps={{ inputMode: "decimal", "aria-label": "Amount to invest" }}
              sx={{ flex: 1, fontSize: "1.625rem", fontWeight: 600, color: "common.black", minWidth: 0 }}
            />
            <ButtonBase
              onClick={(e) => setMenu(e.currentTarget)}
              disabled={!sources.length}
              sx={{ gap: "0.375rem", pl: "0.375rem", pr: "0.5rem", height: "2.25rem", borderRadius: "999rem", backgroundColor: "surfaceBg.pill", color: "common.black", fontWeight: 600, fontSize: "0.875rem" }}
            >
              {source ? <TokenLogo code={source.code} issuer={source.issuer} contract={source.contract} size="1.5rem" /> : null}
              {source?.code ?? "Token"}
              <KeyboardArrowDownRoundedIcon sx={{ fontSize: "1.125rem" }} />
            </ButtonBase>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: "0.375rem" }}>
            <Typography variant="caption" color="grey.200">
              {usd > 0 ? `≈ ${formatUsd(usd)}` : " "}
            </Typography>
            {source && (
              <Box sx={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <Typography variant="caption" color="grey.200">
                  Available {formatAmount(source.balance, 4)}
                </Typography>
                {[0.25, 0.5, 1].map((f) => (
                  <ButtonBase
                    key={f}
                    onClick={() => setAmount(String(Math.floor(source.balance * f * 1e6) / 1e6))}
                    sx={{ px: "0.375rem", height: "1.25rem", borderRadius: "0.375rem", fontSize: "0.6875rem", fontWeight: 600, color: "primary.main", backgroundColor: "overlay.white08" }}
                  >
                    {f === 1 ? "MAX" : `${f * 100}%`}
                  </ButtonBase>
                ))}
              </Box>
            )}
          </Box>
        </Box>
        <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)} slotProps={{ paper: { sx: { maxHeight: "20rem", minWidth: "15rem" } } }}>
          {sources.map((s) => (
            <MenuItem
              key={s.contract}
              selected={s.contract === srcKey}
              onClick={() => {
                setSrcKey(s.contract);
                setAmount("");
                setMenu(null);
              }}
              sx={{ gap: "0.625rem" }}
            >
              <TokenLogo code={s.code} issuer={s.issuer} contract={s.contract} size="1.5rem" />
              <Box sx={{ flex: 1 }}>{s.code}</Box>
              <Typography variant="caption" color="grey.200">
                {formatUsd(s.balance * s.price)}
              </Typography>
            </MenuItem>
          ))}
        </Menu>
      </Box>

      {/* Allocation */}
      {items.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
            {sectionLabel("Split")}
            <Segmented
              size="sm"
              value={mode}
              onChange={(m) => {
                if (m === "custom") setCustom(Object.fromEntries(items.map((i, k) => [i.id, Math.max(1, Math.round(weightPct(k)))])));
                setMode(m);
              }}
              options={[
                { value: "match", label: "Like them" },
                { value: "equal", label: "Equal" },
                { value: "custom", label: "Custom" },
              ]}
            />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.375rem", maxHeight: "21rem", overflowY: "auto", pr: "0.125rem" }}>
            {items.map((i, k) => (
              <Box key={i.id} sx={{ p: "0.625rem 0.75rem", borderRadius: "0.875rem", backgroundColor: "surfaceBg.softInset" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  <ItemIcon item={i} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "common.black" }} noWrap>
                      {i.title}
                    </Typography>
                    <Typography variant="caption" color="grey.200" noWrap component="div">
                      {i.apy != null ? `${i.apy.toFixed(2)}% APY · ` : ""}
                      {i.protocol.name}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600, color: "common.black" }}>{weightPct(k).toFixed(1)}%</Typography>
                    <Typography variant="caption" color="grey.200">
                      {usd > 0 ? formatUsd(allocs[k].usd) : "—"}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => onRemove(i.id)} aria-label={`Remove ${i.title}`} sx={{ color: "grey.200", ml: "-0.25rem" }}>
                    <CloseRoundedIcon sx={{ fontSize: "0.875rem" }} />
                  </IconButton>
                </Box>
                {mode === "custom" && (
                  <Slider
                    size="small"
                    min={0}
                    max={100}
                    value={custom[i.id] ?? 0}
                    onChange={(_, v) => setCustom((c) => ({ ...c, [i.id]: v as number }))}
                    aria-label={`Weight of ${i.title}`}
                    sx={{ mt: "0.25rem", py: "0.5rem", color: "primary.main" }}
                  />
                )}
              </Box>
            ))}
          </Box>
          {mode === "custom" && (
            <Typography variant="caption" color="grey.200">
              Sliders set relative weights; the split always adds up to 100%.
            </Typography>
          )}
        </Box>
      )}

      {/* Summary */}
      {items.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem", p: "0.875rem 1rem", borderRadius: "0.875rem", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}` }}>
          <Row label="Expected yield" value={estApy != null && usd > 0 ? `${estApy.toFixed(2)}% · ${formatUsd((usd * estApy) / 100)}/yr` : "—"} color={estApy ? "green.main" : undefined} />
          <Row label="Risk of this copy" value={risk ? <RiskPill small level={risk.level} /> : "—"} />
          <Row label="Transactions to sign" value={`about ${swaps + deposits}`} />
          <Row label="Slippage limit" value="1% per swap" />
        </Box>
      )}

      {!isConnected ? (
        <ConnectWalletButton />
      ) : (
        <Button variant="solid" color="primary" fullWidth disabled={!!blocker} onClick={openReview} sx={{ height: "3.125rem", textTransform: "none", fontSize: "0.9375rem" }}>
          {blocker ?? `Review copy · ${formatUsd(usd)}`}
        </Button>
      )}
      <Typography variant="caption" color="grey.200" sx={{ textAlign: "center" }}>
        Non-custodial: every step is a transaction you sign in your own wallet. Past results don&apos;t promise future ones.
      </Typography>

      <GlassDialog
        open={review.open}
        onClose={() => setReview({ open: false, plan: null, error: null })}
        title="Review your copy"
        subtitle={source ? `${formatAmount(n, 4)} ${source.code} (${formatUsd(usd)}) across ${items.length} position${items.length === 1 ? "" : "s"}` : undefined}
        primaryLabel={review.plan ? `Start · ${review.plan.length} transaction${review.plan.length === 1 ? "" : "s"}` : "Preparing…"}
        primaryDisabled={!review.plan?.length}
        onPrimary={start}
        maxWidth="32rem"
      >
        {review.error ? (
          <Typography color="error.main">{review.error}</Typography>
        ) : !review.plan ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem", py: "1.5rem", justifyContent: "center" }}>
            <CircularProgress size="1.25rem" />
            <Typography color="grey.200">Checking your trustlines…</Typography>
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {review.plan.map((p, k) => {
              const Icon = p.op === "trust" ? VerifiedUserOutlinedIcon : p.op === "swap" ? SwapHorizRoundedIcon : AccountBalanceOutlinedIcon;
              return (
                <Box key={p.key} sx={{ display: "flex", alignItems: "center", gap: "0.75rem", p: "0.625rem 0.75rem", borderRadius: "0.75rem", backgroundColor: "overlay.white04" }}>
                  <Typography variant="caption" color="grey.200" sx={{ width: "1rem" }}>
                    {k + 1}
                  </Typography>
                  <Icon sx={{ fontSize: "1.125rem", color: "primary.main" }} />
                  <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>{p.label}</Typography>
                </Box>
              );
            })}
            <Typography variant="caption" color="grey.200" sx={{ mt: "0.5rem" }}>
              Steps run one after another; each deposit uses what its swap actually delivered. If a step fails, the ones before it stay done and the rest don&apos;t start.
            </Typography>
          </Box>
        )}
      </GlassDialog>
      <TxDialog open={tx.open} title="Copying positions" steps={tx.steps} error={tx.error} onClose={() => setTx((t) => ({ ...t, open: false }))} />
    </SectionCard>
  );
}

function Row({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
      <Typography variant="caption" color="grey.200">
        {label}
      </Typography>
      <Typography component="div" sx={{ fontSize: "0.8125rem", fontWeight: 600, color: color ?? "common.black", whiteSpace: "nowrap" }}>
        {value}
      </Typography>
    </Box>
  );
}
