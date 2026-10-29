"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Link from "@mui/material/Link";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import { styled, useTheme } from "@mui/material/styles";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import DataTable, { type Column } from "@/components/common/DataTable";
import { PlainCard } from "@/components/common/SectionCard";
import Tabs from "@/components/common/Tabs";
import TokenLogo, { PairLogos } from "@/components/common/TokenLogo";
import TxDialog from "@/components/tx/TxDialog";
import { apiJson } from "@/lib/api";
import { formatAmount, formatUsd, shortAddress } from "@/lib/format";
import { explorerTx, postJson, runBuilt, toBase, type TxStep } from "@/lib/tx";
import { useShared } from "@/lib/useShared";
import { usePortfolio } from "@/portfolio/usePortfolio";
import { useBalances } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";
import Shimmer from "@/components/common/Shimmer";
import { AmountBox } from "./ActionCard";
import { Breadcrumbs, ContractRow, ProtocolBadge, StatCard } from "./EarnUI";
import { compactUsd, pct } from "./lendData";
import PoolRange, { type ClInfo, type RangeValue } from "./PoolRange";
import { feeText, isConcentrated, poolTypeLabel, usePools, venueMeta, type Pool, type PoolLeg } from "./poolData";

const Main = styled(PlainCard)({ display: "flex", flexDirection: "column", gap: "1.5rem", padding: "1.5rem", minWidth: 0, marginTop: "0.4rem" });
const Inset = styled(Box)(({ theme }) => ({
  borderRadius: "1rem",
  backgroundColor: theme.palette.grey[400],
  border: `0.0625rem solid ${theme.palette.overlay.white08}`,
  padding: "1.25rem",
}));

type Trade = { type: string; time: number | null; account: string | null; tx: string | null; legs: { code: string; amount: number }[] };
type ClPos = {
  tokenId?: number;
  tickLower: number;
  tickUpper: number;
  priceLower: number;
  priceUpper: number;
  inRange: boolean;
  liquidity: string;
  amounts: string[];
  fees: string[];
};

const ref = (l: PoolLeg) => (!l.issuer && l.code.toUpperCase() === "XLM" ? "native" : l.issuer ? `${l.code}:${l.issuer}` : null);
const fmtPx = (v: number) => (v >= 1000 ? formatAmount(v, 2) : v >= 1 ? v.toFixed(4) : v.toPrecision(4));

function ChartCard({ pool, history, prices }: { pool: Pool; history: { t: number; tvlUsd: number; volumeUsd: number }[]; prices: { t: number; px: number }[] }) {
  const theme = useTheme();
  const hasVolume = history.length > 0;
  const [mode, setMode] = useState<string>(hasVolume ? "volume" : "price");
  const [days, setDays] = useState(30);
  useEffect(() => setMode(hasVolume ? "volume" : "price"), [hasVolume]);
  const cut = Date.now() - days * 86400_000;
  const vol = history.filter((p) => p.t >= cut);
  const last = mode === "volume" ? vol.reduce((s, p) => s + p.volumeUsd, 0) : prices[prices.length - 1]?.px;
  const fmtDay = (t: number) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
  return (
    <Inset sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
        <Box>
          <Typography sx={{ fontSize: "1.375rem", fontWeight: 600, color: "common.black" }}>
            {mode === "volume" ? compactUsd(last as number) : last != null ? `${fmtPx(last as number)} ${pool.legs[1]?.code}` : "—"}
          </Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
            {mode === "volume" ? `Volume, past ${days} days` : `${pool.legs[0]?.code} price in ${pool.legs[1]?.code}`}
          </Typography>
        </Box>
        <Tabs
          tabs={[
            { id: "volume", label: "Volume", padding: "0 0.75rem", disabled: !hasVolume },
            { id: "price", label: "Price", padding: "0 0.75rem" },
          ]}
          activeTab={mode}
          setActiveTab={(id) => (id !== "volume" || hasVolume) && setMode(id)}
          isPathProvided={false}
        />
      </Box>
      <Box sx={{ height: "16rem" }}>
        {mode === "volume" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={vol} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="t" tickFormatter={fmtDay} tick={{ fill: theme.palette.grey[200], fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis orientation="right" tickFormatter={(v) => compactUsd(v)} tick={{ fill: theme.palette.grey[200], fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
              <ChartTooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v) => [compactUsd(Number(v)), "Volume"]} labelFormatter={(t) => fmtDay(Number(t))} contentStyle={{ background: "#1F1F1F", border: "1px solid #323232", borderRadius: 12 }} />
              <Bar dataKey="volumeUsd" fill={theme.palette.sidebar.purple100} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : prices.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={prices} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="poolPx" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.palette.sidebar.purple100} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={theme.palette.sidebar.purple100} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" tickFormatter={fmtDay} tick={{ fill: theme.palette.grey[200], fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={32} />
              <YAxis orientation="right" domain={["auto", "auto"]} tickFormatter={(v) => fmtPx(Number(v))} tick={{ fill: theme.palette.grey[200], fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
              <ChartTooltip formatter={(v) => [fmtPx(Number(v)), "Price"]} labelFormatter={(t) => new Date(Number(t)).toLocaleString()} contentStyle={{ background: "#1F1F1F", border: "1px solid #323232", borderRadius: 12 }} />
              <Area type="monotone" dataKey="px" stroke={theme.palette.sidebar.purple100} strokeWidth={2} fill="url(#poolPx)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Typography sx={{ color: "grey.200", fontSize: "0.875rem" }}>No price history for this pair on Stellar&apos;s trade feed.</Typography>
          </Box>
        )}
      </Box>
      {mode === "volume" && (
        <Box sx={{ display: "flex", gap: "0.375rem" }}>
          {[7, 30].map((d) => (
            <ButtonBase
              key={d}
              onClick={() => setDays(d)}
              sx={{ height: "1.75rem", px: "0.625rem", borderRadius: "999rem", fontSize: "0.75rem", color: days === d ? "sidebar.white" : "grey.200", backgroundColor: days === d ? "sidebar.primary" : "overlay.white04" }}
            >
              {d}d
            </ButtonBase>
          ))}
        </Box>
      )}
    </Inset>
  );
}

/** Placeholder for the user's liquidity while it loads. */
function PositionShimmer() {
  return (
    <Inset sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <Shimmer on width="8rem" height="0.875rem" />
      <Box sx={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <Shimmer on width="6rem" height="1.75rem" />
        <Shimmer on width="6rem" height="1.75rem" />
      </Box>
    </Inset>
  );
}

export default function PoolPage() {
  const params = useSearchParams();
  const router = useRouter();
  const protocol = params.get("protocol") ?? "";
  const address = params.get("pool") ?? "";
  const { activeWallet, isConnected, openConnectModal } = useWallet();
  const me = activeWallet?.address ?? null;
  const { pools, loading } = usePools();
  const pool = pools.find((p) => p.protocol === protocol && p.address === address);
  const cl = pool ? isConcentrated(pool) : protocol === "sushi";
  const meta = venueMeta(protocol);
  const [tab, setTab] = useState<string>(params.get("tab") === "withdraw" ? "withdraw" : params.get("tab") === "transactions" ? "transactions" : "supply");
  const [flip, setFlip] = useState(false);
  const [amounts, setAmounts] = useState(["", ""]);
  const [range, setRange] = useState<RangeValue>({ full: true, lower: null, upper: null });
  const [pctOut, setPctOut] = useState(100);
  const [tx, setTx] = useState<{ open: boolean; title: string; steps: TxStep[]; error: string | null }>({ open: false, title: "", steps: [], error: null });

  const legs = pool?.legs ?? [];
  const { byAddress, refreshing: balRefreshing } = useBalances(me ? [me] : []);
  const balLoading = !!me && ((byAddress[me]?.loading ?? true) || balRefreshing);
  const bal = (l: PoolLeg | undefined): number | null => {
    if (!l || !me) return null;
    const hit = byAddress[me]?.tokens.find((t) => t.code === l.code && (t.issuer ?? null) === (l.issuer ?? null));
    if (hit) return hit.amount;
    return ref(l) ? 0 : null; // Soroban-only tokens: not in the Horizon balance list.
  };

  const codes = legs.map((l) => l.code.toUpperCase());
  const priceResp = useShared<{ prices?: Record<string, number | null> } | null>(codes.length ? `prices:${[...codes].sort().join(",")}` : null, () => apiJson(`/api/prices?codes=${codes.join(",")}`), 120_000);
  const usd = (i: number) => priceResp.value?.prices?.[codes[i]] ?? null;

  const history = useShared<{ points?: { t: number; tvlUsd: number; volumeUsd: number }[] } | null>(
    pool ? `poolhist:${protocol}:${address}` : null,
    () => apiJson(`/api/dex/pool/history?protocol=${protocol}&pool=${address}`, undefined, 60_000),
    600_000,
  ).value?.points ?? [];
  const a = legs[0] ? ref(legs[0]) : null;
  const b = legs[1] ? ref(legs[1]) : null;
  const priceHist = useShared<{ ok?: boolean; points?: { t: number; px: number }[] } | null>(
    a && b ? `pair:${a}:${b}:30d` : null,
    () => apiJson(`/api/prices/chart?asset=${encodeURIComponent(a!)}&counter=${encodeURIComponent(b!)}&range=30d`),
    300_000,
  ).value;
  const prices = priceHist?.ok ? (priceHist.points ?? []) : [];
  const trades = useShared<{ trades?: Trade[] } | null>(
    pool && tab === "transactions" ? `pooltrades:${protocol}:${address}` : null,
    () => apiJson(`/api/dex/pool/trades?protocol=${protocol}&pool=${address}&tokens=${legs.map((l) => l.contract).join(",")}&limit=40`, undefined, 90_000),
    60_000,
  );

  const clInfo = useShared<ClInfo | null>(
    pool && cl ? `clpool:${protocol}:${address}` : null,
    () => apiJson(`/api/dex/cl/pool?protocol=${protocol}&pool=${address}`, undefined, 60_000),
    60_000,
  ).value;
  const clPosResp = useShared<{ ok?: boolean; positions?: ClPos[]; rewards?: string | null } | null>(
    pool && cl && me ? `clpos:${protocol}:${address}:${me}` : null,
    () => apiJson(`/api/dex/cl/positions?protocol=${protocol}&pool=${address}&address=${me}`, undefined, 60_000),
    60_000,
  );
  const clPos = clPosResp.value;

  const portfolio = usePortfolio(me ? [me] : []);
  const myLp = portfolio.supplied.find((r) => r.kind === "lp" && r.protocol === protocol && r.pool === address);
  // Shimmer, not stale figures, while the position is first fetched or updating after a transaction.
  const lpBusy = portfolio.lpRefreshing || (cl && clPosResp.refreshing);

  // Pool price: token0 in token1 (reserves for share pools, the live tick for concentrated ones).
  const res = pool?.reserves ?? [];
  const reservePx = res.length === 2 && res[0].amount > 0 ? res[1].amount / 10 ** res[1].decimals / (res[0].amount / 10 ** res[0].decimals) : null;
  const spot = clInfo?.ok ? clInfo.price : reservePx;

  // Paired amount: share pools follow the reserve ratio; ranges ask the venue (cl_quote).
  const [quoteSide, setQuoteSide] = useState<number | null>(null);
  useEffect(() => {
    if (!pool || !cl || quoteSide == null) return;
    const v = amounts[quoteSide];
    if (!v || !(Number(v) > 0) || (!range.full && !(range.lower && range.upper && range.upper > range.lower))) return;
    const t = setTimeout(async () => {
      const want = [0, 1].map((i) => (i === quoteSide ? (toBase(v, legs[i].decimals) ?? "0") : "0"));
      const r = await postJson<{ ok?: boolean; used?: string[] }>("/api/dex/cl/build", {
        protocol,
        pool: address,
        action: "cl_quote",
        full: range.full,
        priceLower: range.lower,
        priceUpper: range.upper,
        amounts: want,
      }).catch(() => null);
      if (r?.ok && r.used) {
        const other = 1 - quoteSide;
        const n = Number(r.used[other]) / 10 ** legs[other].decimals;
        setAmounts((cur) => {
          const next = [...cur];
          next[other] = n > 0 ? String(Number(n.toFixed(Math.min(7, legs[other].decimals)))) : "0";
          return next;
        });
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amounts[quoteSide ?? 0], quoteSide, range.full, range.lower, range.upper, pool?.address]);

  const setLeg = (i: number, v: string) => {
    setQuoteSide(i);
    setAmounts((cur) => {
      const next = [...cur];
      next[i] = v;
      if (!cl && reservePx && v && Number(v) > 0) next[1 - i] = String(Number((i === 0 ? Number(v) * reservePx : Number(v) / reservePx).toFixed(7)));
      return next;
    });
  };

  if (!pool) {
    return (
      <Main>
        <Breadcrumbs trail={[{ label: "Earn", href: "/earn" }, { label: "Pools", href: "/earn/pools" }, { label: "Pool" }]} />
        <Typography color="grey.200">{loading ? "Loading pool…" : "Pool not found. Pick one from Pools."}</Typography>
      </Main>
    );
  }

  const run = async (title: string, path: string, body: unknown) => {
    if (!activeWallet) return;
    setTx({ open: true, title, steps: [{ key: "s0", label: title, status: "building" }], error: null });
    try {
      const r = await runBuilt(path, body, activeWallet, (steps) => setTx((t) => ({ ...t, steps })));
      if (!r.unsigned) setAmounts(["", ""]);
    } catch (e) {
      setTx((t) => ({ ...t, error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const baseAmts = amounts.map((v, i) => toBase(v || "0", legs[i]?.decimals ?? 7) ?? "0");
  const over = legs.some((l, i) => {
    const b0 = bal(l);
    return b0 != null && Number(amounts[i] || 0) > b0 + 1e-9;
  });
  const supplyBlock = !isConnected
    ? null
    : !amounts.some((v) => Number(v) > 0)
      ? "Enter an amount"
      : over
        ? "Insufficient balance"
        : cl && !range.full && !(range.lower && range.upper && range.upper > range.lower)
          ? "Set a valid range"
          : null;

  const deposit = () =>
    cl
      ? run(`Add liquidity · ${pool.pair}`, "/api/dex/cl/build", {
          protocol,
          pool: address,
          from: activeWallet!.address,
          action: "cl_deposit",
          full: range.full,
          priceLower: range.lower,
          priceUpper: range.upper,
          amounts: baseAmts,
          slippageBps: 100,
        })
      : run(`Add liquidity · ${pool.pair}`, "/api/dex/liquidity/build", { protocol, pool: address, from: activeWallet!.address, action: "deposit", amounts: baseAmts, slippageBps: 100 });

  const priceLabel = spot
    ? flip
      ? `1 ${legs[1]?.code} = ${fmtPx(1 / spot)} ${legs[0]?.code}${usd(1) != null ? ` (${formatUsd(usd(1)!)})` : ""}`
      : `1 ${legs[0]?.code} = ${fmtPx(spot)} ${legs[1]?.code}${usd(0) != null ? ` (${formatUsd(usd(0)!)})` : ""}`
    : null;
  const vol24 = pool.volume24hUsd ?? (pool.volume7dUsd != null ? pool.volume7dUsd / 7 : null);
  const fees24 = vol24 != null && pool.feeBps != null ? (vol24 * pool.feeBps) / 10_000 : null;

  const tradeCols: Column<Trade>[] = [
    { id: "time", header: "Time", cell: (t) => <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>{t.time ? new Date(t.time).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—"}</Typography> },
    { id: "type", header: "Type", cell: (t) => <Typography sx={{ fontSize: "0.875rem", color: "common.black", textTransform: "capitalize" }}>{t.type.replace(/_/g, " ")}</Typography> },
    {
      id: "legs",
      header: "Amounts",
      cell: (t) =>
        t.legs.length ? (
          <Box>
            {t.legs.map((l, i) => (
              <Typography key={i} sx={{ fontSize: "0.8125rem", color: l.amount < 0 ? "error.main" : "green.main" }}>
                {l.amount > 0 ? "+" : ""}
                {formatAmount(l.amount, 4)} {l.code}
              </Typography>
            ))}
          </Box>
        ) : (
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>—</Typography>
        ),
    },
    { id: "account", header: "Account", cell: (t) => <Typography sx={{ fontSize: "0.875rem", color: "primary.main" }}>{t.account ? shortAddress(t.account) : "—"}</Typography> },
    {
      id: "tx",
      header: "Transaction",
      cell: (t) =>
        t.tx ? (
          <Link href={explorerTx(t.tx)} target="_blank" rel="noreferrer" sx={{ fontSize: "0.875rem" }}>
            {t.tx.slice(0, 6)}…{t.tx.slice(-4)}
          </Link>
        ) : null,
    },
  ];

  const clPositions = clPos?.ok ? (clPos.positions ?? []) : [];

  return (
    <Main>
      <Breadcrumbs
        trail={[
          { label: "Earn", href: "/earn" },
          { label: "Pools", href: "/earn/pools" },
          { label: meta.name, href: "/earn/pools" },
          { label: `${pool.pair} ${feeText(pool.feeBps)}` },
        ]}
      />
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
        <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <ProtocolBadge name={meta.name} logo={meta.logo} />
          <ProtocolBadge name={poolTypeLabel(pool.poolType)} />
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <PairLogos legs={legs} size="3rem" />
          <Typography sx={{ fontSize: "1.75rem", fontWeight: 700, color: "common.black" }}>
            {legs.map((l) => l.code).join(" / ")} {feeText(pool.feeBps)}
          </Typography>
          {priceLabel && (
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", height: "2.25rem", pl: "0.875rem", pr: "0.375rem", borderRadius: "999rem", backgroundColor: "overlay.white05", border: (t) => `0.0625rem solid ${t.palette.overlay.white08}` }}>
              <Typography sx={{ fontSize: "0.8125rem", color: "common.black", whiteSpace: "nowrap" }}>{priceLabel}</Typography>
              <ButtonBase onClick={() => setFlip((f) => !f)} sx={{ display: "flex", alignItems: "center", gap: "0.25rem", height: "1.75rem", px: "0.625rem", borderRadius: "999rem", backgroundColor: "overlay.white08", fontSize: "0.75rem", color: "common.black", whiteSpace: "nowrap" }}>
                <SwapHorizRoundedIcon sx={{ fontSize: "1rem" }} />
                Switch the value
              </ButtonBase>
            </Box>
          )}
        </Box>
        <Box>
          <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>TVL</Typography>
          <Typography sx={{ fontSize: "2rem", fontWeight: 700, color: "common.black" }}>{compactUsd(pool.tvlUsd)}</Typography>
        </Box>
      </Box>

      <ChartCard pool={pool} history={history} prices={prices} />

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
        <StatCard
          label="Total APY"
          value={pct(pool.apyPct)}
          color="green.main"
          sub={pool.rewardsApyPct ? `Fees ${pct(pool.feeApyPct)} · Rewards ${pct(pool.rewardsApyPct)}` : undefined}
        />
        <StatCard label="TVL" value={compactUsd(pool.tvlUsd)} />
        <StatCard label={pool.volume24hUsd != null ? "24H Volume" : "Volume (7d avg/day)"} value={compactUsd(vol24)} />
        <StatCard label="24H Fees" value={compactUsd(fees24)} />
      </Box>

      <Box sx={{ alignSelf: "flex-start" }}>
        <Tabs
          tabs={[
            { id: "supply", label: "Supply", padding: "0 0.875rem" },
            { id: "withdraw", label: "Withdraw", padding: "0 0.875rem" },
            { id: "transactions", label: "Transactions", padding: "0 0.875rem" },
          ]}
          activeTab={tab}
          setActiveTab={(id) => {
            setTab(id);
            router.replace(`/earn/pools/view?protocol=${protocol}&pool=${address}&tab=${id}`, { scroll: false });
          }}
          isPathProvided={false}
        />
      </Box>

      {tab === "supply" && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <PairLogos legs={legs} size="1.75rem" />
            <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "common.black" }}>{pool.pair}</Typography>
          </Box>
          {cl &&
            (clInfo?.ok ? (
              <PoolRange info={clInfo} history={prices} value={range} onChange={setRange} />
            ) : (
              <Typography sx={{ color: "grey.200", fontSize: "0.875rem" }}>{clInfo ? "This pool's range data is unavailable right now." : "Loading the pool's price and ticks…"}</Typography>
            ))}
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: "1rem" }}>
            {legs.slice(0, 2).map((l, i) => (
              <AmountBox
                key={l.contract}
                label={`Amount of ${l.code}`}
                token={l}
                amount={amounts[i]}
                onAmount={(v) => setLeg(i, v)}
                balance={bal(l)}
                balanceLoading={balLoading}
                price={usd(i)}
                onMax={bal(l) ? () => setLeg(i, String(Number(bal(l)!.toFixed(7)))) : undefined}
              />
            ))}
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: "1rem", alignItems: "center" }}>
            <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
              {cl ? "The second amount follows your range at the live price." : "Deposits follow the pool's reserve ratio."} Up to 1% slippage protection.
            </Typography>
            <Button
              variant="solid"
              color="primary"
              disabled={!!supplyBlock}
              onClick={() => (isConnected ? void deposit() : void openConnectModal())}
              sx={{ height: "3.25rem", borderRadius: "999rem", fontWeight: 600, textTransform: "uppercase" }}
            >
              {!isConnected ? "Connect wallet" : (supplyBlock ?? "Add Liquidity")}
            </Button>
          </Box>
        </Box>
      )}

      {tab === "withdraw" && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {!isConnected ? (
            <Typography sx={{ color: "grey.200" }}>Connect a wallet to see your liquidity.</Typography>
          ) : cl ? (
            clPos == null ? (
              <PositionShimmer />
            ) : clPositions.length === 0 ? (
              <Typography sx={{ color: "grey.200" }}>You have no position in this pool.</Typography>
            ) : (
              clPositions.map((p, i) => (
                <Inset key={p.tokenId ?? `${p.tickLower}:${p.tickUpper}`} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                    <Typography sx={{ fontSize: "0.9375rem", fontWeight: 600, color: "common.black" }}>
                      {p.tokenId != null ? `Position #${p.tokenId}` : `Range ${i + 1}`} ·{" "}
                      <Box component="span" sx={{ color: p.inRange ? "green.main" : "orange.main" }}>{p.inRange ? "In range" : "Out of range"}</Box>
                    </Typography>
                    <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
                      {fmtPx(p.priceLower)} → {p.priceUpper > 1e30 ? "∞" : fmtPx(p.priceUpper)} {legs[1]?.code} per {legs[0]?.code}
                    </Typography>
                    <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>
                      <Shimmer on={lpBusy} width="9rem">
                        {p.amounts.map((x, k) => `${formatAmount(Number(x) / 10 ** (legs[k]?.decimals ?? 7), 4)} ${legs[k]?.code}`).join(" + ")}
                      </Shimmer>
                    </Typography>
                    {p.fees.some((f) => Number(f) > 0) && (
                      <Typography sx={{ fontSize: "0.8125rem", color: "green.main" }}>
                        Fees: {p.fees.map((x, k) => `${formatAmount(Number(x) / 10 ** (legs[k]?.decimals ?? 7), 6)} ${legs[k]?.code}`).join(" + ")}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: "flex", gap: "0.5rem" }}>
                    <Button
                      variant="outlined"
                      color="cancel"
                      disabled={!p.fees.some((f) => Number(f) > 0)}
                      onClick={() =>
                        void run(`Collect fees · ${pool.pair}`, "/api/dex/cl/build", protocol === "sushi"
                          ? { protocol, pool: address, from: me, action: "cl_collect", tokenId: p.tokenId }
                          : { protocol, pool: address, from: me, action: "cl_claim" })
                      }
                      sx={{ borderRadius: "999rem", height: "2.75rem" }}
                    >
                      Collect fees
                    </Button>
                    <Button
                      variant="solid"
                      color="primary"
                      disabled={Number(p.liquidity) <= 0}
                      onClick={() =>
                        void run(`Remove liquidity · ${pool.pair}`, "/api/dex/cl/build", protocol === "sushi"
                          ? { protocol, pool: address, from: me, action: "cl_withdraw", tokenId: p.tokenId }
                          : { protocol, pool: address, from: me, action: "cl_withdraw", tickLower: p.tickLower, tickUpper: p.tickUpper })
                      }
                      sx={{ borderRadius: "999rem", height: "2.75rem" }}
                    >
                      Remove
                    </Button>
                  </Box>
                </Inset>
              ))
            )
          ) : !myLp?.shares ? (
            portfolio.lpLoading || lpBusy ? (
              <PositionShimmer />
            ) : (
              <Typography sx={{ color: "grey.200" }}>You have no liquidity in this pool.</Typography>
            )
          ) : (
            <Inset sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>
                Your liquidity ·{" "}
                <Shimmer on={lpBusy} width="4rem" height="0.875rem">
                  {formatUsd(myLp.usd)}
                </Shimmer>
              </Typography>
              <Box sx={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                {(myLp.legs ?? []).map((l) => (
                  <Box key={l.code} sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <TokenLogo code={l.code} issuer={l.issuer} size="1.75rem" />
                    <Typography sx={{ color: "common.black" }}>
                      <Shimmer on={lpBusy} width="5rem">{`${formatAmount(l.amount, 4)} ${l.code}`}</Shimmer>
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Typography sx={{ fontSize: "1.5rem", fontWeight: 600, color: "common.black" }}>{pctOut}%</Typography>
              <Slider value={pctOut} min={1} max={100} onChange={(_, v) => setPctOut(v as number)} />
              <Box sx={{ display: "flex", gap: "0.5rem" }}>
                {[25, 50, 75, 100].map((v) => (
                  <ButtonBase key={v} onClick={() => setPctOut(v)} sx={{ height: "2rem", px: "0.875rem", borderRadius: "999rem", fontSize: "0.8125rem", color: pctOut === v ? "sidebar.white" : "common.black", backgroundColor: pctOut === v ? "sidebar.primary" : "overlay.white08" }}>
                    {v}%
                  </ButtonBase>
                ))}
              </Box>
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
                You receive about {(myLp.legs ?? []).map((l) => `${formatAmount((l.amount * pctOut) / 100, 4)} ${l.code}`).join(" + ")}.
              </Typography>
              <Box sx={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                <Button
                  variant="solid"
                  color="primary"
                  onClick={() =>
                    void run(`Remove liquidity · ${pool.pair}`, "/api/dex/liquidity/build", {
                      protocol,
                      pool: address,
                      from: me,
                      action: "withdraw",
                      shares: ((BigInt(myLp.shares!) * BigInt(pctOut)) / BigInt(100)).toString(),
                      slippageBps: 100,
                    })
                  }
                  sx={{ height: "3rem", borderRadius: "999rem", px: "2rem", fontWeight: 600, textTransform: "uppercase" }}
                >
                  Remove liquidity
                </Button>
                {protocol === "aqua" && (
                  <Button
                    variant="outlined"
                    color="cancel"
                    onClick={() => void run(`Claim AQUA rewards · ${pool.pair}`, "/api/dex/liquidity/build", { protocol, pool: address, from: me, action: "claim" })}
                    sx={{ height: "3rem", borderRadius: "999rem", px: "1.5rem" }}
                  >
                    Claim AQUA rewards
                  </Button>
                )}
              </Box>
            </Inset>
          )}
        </Box>
      )}

      {tab === "transactions" && (
        <DataTable columns={tradeCols} rows={trades.value?.trades ?? []} isLoading={trades.loading} emptyDataText="No recent trades in this pool" getRowId={(t, i) => `${t.tx}:${i}`} pageSize={10} />
      )}

      <Inset sx={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
        <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: "common.black" }}>Stellar Network</Typography>
        <ContractRow icon={<PairLogos legs={legs} size="1.5rem" />} label={`${pool.pair} pool`} address={pool.address} />
        {legs.map((l) => (
          <ContractRow key={l.contract} icon={<TokenLogo code={l.code} issuer={l.issuer} contract={l.contract} size="1.5rem" />} label={l.code} address={l.contract} />
        ))}
      </Inset>
      <TxDialog open={tx.open} title={tx.title} steps={tx.steps} error={tx.error} onClose={() => setTx((t) => ({ ...t, open: false }))} />
    </Main>
  );
}
