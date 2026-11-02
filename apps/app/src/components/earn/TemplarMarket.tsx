"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha, styled, useTheme } from "@mui/material/styles";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { PlainCard } from "@/components/common/SectionCard";
import Shimmer from "@/components/common/Shimmer";
import TokenLogo, { PairLogos } from "@/components/common/TokenLogo";
import { formatAmount, formatUsd, shortAddress } from "@/lib/format";
import { useWallet, walletLabel } from "@/wallet/WalletContext";
import { Breadcrumbs, ContractRow, ProtocolBadge, StatCard } from "./EarnUI";
import { compactUsd, LEND_PROTOCOLS, pct, templarAppHref, useLendMarkets, useTemplarPositions, type Market, type TemplarMarketInfo, type TemplarPosition } from "./lendData";

// A Templar market, read-only: live rates, parameters and the connected portfolio's position. Templar's
// markets run on NEAR; Stellar wallets use them through a NEAR "universal account" they control by
// signing messages (services/api/src/templar.ts). Actions open Templar's own app.

const Layout = styled(Box)({
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "minmax(0, 1fr) 27rem",
  alignItems: "start",
  marginTop: "0.4rem",
  "@media (max-width: 75rem)": { gridTemplateColumns: "minmax(0, 1fr)" },
});
const Main = styled(PlainCard)({ display: "flex", flexDirection: "column", gap: "1.75rem", padding: "1.5rem", minWidth: 0 });
const Panel = styled(Box)(({ theme }) => ({
  borderRadius: "1.25rem",
  border: `0.0625rem solid ${theme.palette.overlay.white08}`,
  backgroundColor: theme.palette.grey[400],
  padding: "1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  minWidth: 0,
}));
const SideCard = styled(Box)(({ theme }) => ({
  borderRadius: "1.25rem",
  border: `0.0625rem solid ${theme.palette.overlay.white08}`,
  backgroundColor: theme.palette.surfaceBg.section,
  padding: "1.25rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.875rem",
}));

/**
 * Stellar assets NEAR Intents' public bridge carries (bridge.chaindefuser.com supported_tokens for
 * stellar:mainnet, checked 2026-11-02). Other collateral can't be brought from a Stellar wallet yet.
 */
const BRIDGEABLE = new Set(["CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA", "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"]);

/** Prices under $1 need more than cents to be useful (XLM ~$0.16). */
const priceUsd = (v: number) => (v >= 1 ? formatUsd(v) : `$${v.toPrecision(4)}`);

const healthColor = (h: number | null | undefined) => (h == null ? "common.black" : h < 1.1 ? "error.main" : h < 1.5 ? "orange.main" : "green.main");

const Tip = ({ text }: { text: string }) => (
  <Tooltip title={text} arrow placement="top">
    <InfoOutlinedIcon sx={{ fontSize: "0.875rem", color: "grey.200", cursor: "help", verticalAlign: "-0.125rem", ml: "0.25rem" }} />
  </Tooltip>
);

const duration = (ms: number) => {
  const h = ms / 3_600_000;
  return h >= 48 ? `${Math.round(h / 24)} days` : h >= 1 ? `${Math.round(h)} hours` : `${Math.round(ms / 60_000)} minutes`;
};

function ParamRow({ label, value, tip }: { label: string; value: React.ReactNode; tip: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", py: "0.625rem", borderBottom: (t) => `0.0625rem solid ${t.palette.overlay.white08}`, "&:last-of-type": { borderBottom: "none" } }}>
      <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>
        {label}
        <Tip text={tip} />
      </Typography>
      <Typography component="div" sx={{ fontSize: "0.875rem", fontWeight: 600, color: "common.black", textAlign: "right" }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Borrow and supply rate against utilization, with today's utilization and the kink marked. */
function RateCurve({ t }: { t: TemplarMarketInfo }) {
  const theme = useTheme();
  const share = (t.supplierSharePct ?? 100) / 100;
  const data = t.rateCurve.points.map((p) => ({ u: p.u, borrow: p.rate, supply: p.rate * (p.u / 100) * share }));
  if (data.length < 2) return <Typography sx={{ fontSize: "0.875rem", color: "grey.200" }}>Templar didn&apos;t publish this market&apos;s rate curve in a form Seidar can draw.</Typography>;
  const now = t.utilizationPct;
  return (
    <Box sx={{ height: "15rem", mx: "-0.5rem" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={theme.palette.overlay.white08} vertical={false} />
          <XAxis dataKey="u" type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} stroke={theme.palette.grey[200]} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v) => `${Number(v).toFixed(0)}%`} stroke={theme.palette.grey[200]} fontSize={11} tickLine={false} axisLine={false} width={44} />
          <ChartTooltip
            content={({ active, payload }) => {
              const d = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
              if (!d) return null;
              return (
                <Box sx={{ p: "0.5rem 0.75rem", borderRadius: "0.625rem", backgroundColor: "surfaceBg.main", border: `0.0625rem solid ${alpha("#fff", 0.08)}` }}>
                  <Typography variant="caption" sx={{ color: "grey.200", display: "block" }}>
                    At {d.u}% utilization
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#F5B83D", display: "block" }}>
                    Borrow {d.borrow.toFixed(2)}%
                  </Typography>
                  <Typography variant="caption" sx={{ color: "#17B26A", display: "block" }}>
                    Supply {d.supply.toFixed(2)}%
                  </Typography>
                </Box>
              );
            }}
          />
          {t.rateCurve.kinkPct != null && <ReferenceLine x={Math.round(t.rateCurve.kinkPct)} stroke={theme.palette.overlay.white20} strokeDasharray="4 4" label={{ value: "Kink", fill: theme.palette.grey[200], fontSize: 10, position: "insideTopLeft" }} />}
          {now != null && <ReferenceLine x={Math.round(now)} stroke={theme.palette.sidebar.primary} label={{ value: `Now ${now.toFixed(1)}%`, fill: theme.palette.primary.main, fontSize: 10, position: now < 15 ? "insideTopLeft" : "insideTopRight" }} />}
          <Line type="linear" dataKey="borrow" stroke="#F5B83D" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="supply" stroke="#17B26A" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

/** Loan-to-value now against the borrow limit and the liquidation point. */
function LtvBar({ ltv, max, liq }: { ltv: number; max: number; liq: number }) {
  const scale = Math.max(liq * 1.15, ltv * 1.05, 1);
  const at = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const color = ltv >= liq ? "#FF3B47" : ltv >= max ? "#FF7A45" : ltv >= max * 0.85 ? "#F5B83D" : "#17B26A";
  return (
    <Box>
      <Box sx={{ position: "relative", height: "0.5rem", borderRadius: "999rem", backgroundColor: "overlay.white08" }}>
        <Box sx={{ position: "absolute", inset: 0, width: at(ltv), borderRadius: "999rem", backgroundColor: color, transition: "width 400ms ease" }} />
        <Tooltip title={`Borrow limit: ${max.toFixed(1)}% LTV`} arrow>
          <Box sx={{ position: "absolute", left: at(max), top: "-0.25rem", bottom: "-0.25rem", width: "0.125rem", backgroundColor: "#F5B83D" }} />
        </Tooltip>
        <Tooltip title={`Liquidation at ${liq.toFixed(1)}% LTV`} arrow>
          <Box sx={{ position: "absolute", left: at(liq), top: "-0.25rem", bottom: "-0.25rem", width: "0.125rem", backgroundColor: "#FF3B47" }} />
        </Tooltip>
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: "0.5rem" }}>
        <Typography variant="caption" sx={{ color: "grey.200" }}>
          LTV now <b style={{ color: "inherit" }}>{ltv.toFixed(1)}%</b>
        </Typography>
        <Typography variant="caption" sx={{ color: "grey.200" }}>
          Limit {max.toFixed(1)}% · Liquidation {liq.toFixed(1)}%
        </Typography>
      </Box>
    </Box>
  );
}

function PositionView({ p, t, wallet }: { p: TemplarPosition; t: TemplarMarketInfo; wallet: string | null }) {
  const b = p.borrow;
  const s = p.supply;
  const ltv = b && b.collateral.usd > 0 ? (b.usd / b.collateral.usd) * 100 : null;
  return (
    <Panel>
      {wallet && <Typography sx={{ fontSize: "0.75rem", color: "grey.200", mt: "-0.25rem" }}>{wallet}</Typography>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: "1rem" }}>
        <Fig label="Supplying" value={s ? formatUsd(s.usd) : "—"} sub={s ? `${formatAmount(s.amount, 4)} ${s.symbol}${s.apy != null ? ` · ${s.apy.toFixed(2)}% APY` : ""}` : "Nothing lent here"} />
        <Fig label="Collateral" value={b ? formatUsd(b.collateral.usd) : "—"} sub={b ? `${formatAmount(b.collateral.amount, 4)} ${b.collateral.symbol}` : "None deposited"} />
        <Fig label="Borrowed" value={b && b.usd > 0 ? formatUsd(b.usd) : "—"} sub={b && b.usd > 0 ? `${formatAmount(b.amount, 4)} ${b.symbol}${b.apy != null ? ` · ${b.apy.toFixed(2)}% APR` : ""}` : "No debt"} color={b && b.usd > 0 ? "error.main" : undefined} />
        <Fig
          label="Health factor"
          value={b?.healthFactor != null ? b.healthFactor.toFixed(2) : "—"}
          sub={b?.liquidationPrice != null ? `Liquidated if ${b.collateral.symbol} < ${priceUsd(b.liquidationPrice)}` : "No loan"}
          color={healthColor(b?.healthFactor)}
        />
      </Box>
      {ltv != null && <LtvBar ltv={ltv} max={t.maxLtvPct} liq={t.liquidationLtvPct} />}
      {s && (s.earnedUsd > 0 || s.queuedWithdrawal) ? (
        <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
          {s.earnedUsd > 0 ? `Interest earned so far: ${formatUsd(s.earnedUsd)}.` : ""}
          {s.queuedWithdrawal ? ` Withdrawal of ${formatAmount(s.queuedWithdrawal, 4)} ${s.symbol} is waiting in Templar's queue.` : ""}
        </Typography>
      ) : null}
    </Panel>
  );
}

function Fig({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{label}</Typography>
      <Typography component="div" sx={{ fontSize: "1.25rem", fontWeight: 600, color: color ?? "common.black", lineHeight: 1.3 }} noWrap>
        {value}
      </Typography>
      {sub && (
        <Typography component="div" sx={{ fontSize: "0.75rem", color: "grey.200" }} noWrap>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

function OpenButton({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  return (
    <Button
      variant={primary ? "solid" : "outlined"}
      color="primary"
      fullWidth
      href={href}
      target="_blank"
      rel="noopener"
      endIcon={<OpenInNewRoundedIcon sx={{ fontSize: "1rem" }} />}
      sx={{ height: "3rem", textTransform: "none", fontSize: "0.9375rem", ...(primary ? {} : { color: "common.black", borderColor: (t) => t.palette.overlay.white16 }) }}
    >
      {label}
    </Button>
  );
}

export default function TemplarMarket() {
  const id = useSearchParams().get("pool") ?? "";
  const { markets, status } = useLendMarkets();
  const { portfolioAddresses, portfolioWallets, isConnected } = useWallet();
  const tp = useTemplarPositions(portfolioAddresses);
  const meta = LEND_PROTOCOLS.templar;

  const rows = markets.filter((m) => m.protocol === "templar" && m.pool === id);
  const coll = rows.find((m) => m.templarSide === "collateral") as Market | undefined;
  const bor = rows.find((m) => m.templarSide === "borrow") as Market | undefined;
  const t = rows[0]?.templar;

  const mine = useMemo(() => {
    const out: { wallet: string; p: TemplarPosition }[] = [];
    for (const a of portfolioAddresses) for (const p of tp.values[`templar:pos:${a}`]?.positions ?? []) if (p.marketId === id) out.push({ wallet: a, p });
    return out;
  }, [portfolioAddresses, tp.values, id]);
  const accountOf = (a: string) => tp.values[`templar:pos:${a}`]?.account ?? null;
  const posLoading = tp.loading && portfolioAddresses.some((a) => tp.values[`templar:pos:${a}`] == null);

  if (!t || !coll || !bor) {
    return (
      <Layout>
        <Main>
          <Breadcrumbs trail={[{ label: "Earn", href: "/earn" }, { label: "Lend & Borrow", href: "/earn/lending&borrow" }, { label: "Templar" }]} />
          {status.templar === "loading" ? (
            <Skeleton variant="rounded" animation="wave" height="20rem" />
          ) : (
            <Typography sx={{ color: "grey.200" }}>
              {status.templar === "failed" ? "Templar's market data didn't load. Reload to try again." : "This Templar market isn't listed in Seidar: only markets whose two assets are Stellar tokens are."}{" "}
              {id && (
                <Box component="a" href={templarAppHref(id)} target="_blank" rel="noopener" sx={{ color: "primary.main" }}>
                  Open it in Templar
                </Box>
              )}
            </Typography>
          )}
        </Main>
      </Layout>
    );
  }

  const canBringCollateral = BRIDGEABLE.has(t.collateral.contract);
  const nameOf = (a: string) => {
    const w = portfolioWallets.find((x) => x.address === a);
    return w ? walletLabel(w) : shortAddress(a);
  };

  return (
    <Layout>
      <Main>
        <Breadcrumbs
          trail={[
            { label: "Earn", href: "/earn" },
            { label: "Lend & Borrow", href: "/earn/lending&borrow" },
            { label: meta.name, href: "/earn/lending&borrow" },
            { label: bor.poolName },
          ]}
        />

        <Box sx={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <PairLogos legs={[coll, bor]} size="2.75rem" />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Templar market · borrow {bor.code} against {coll.code}</Typography>
            <Typography sx={{ fontSize: "1.75rem", fontWeight: 700, color: "common.black", lineHeight: 1.2 }}>{bor.poolName}</Typography>
          </Box>
          <ProtocolBadge name={meta.name} logo={meta.logo} />
          <Box component="span" sx={{ px: "0.75rem", height: "1.875rem", display: "inline-flex", alignItems: "center", borderRadius: "999rem", fontSize: "0.75rem", color: "grey.200", backgroundColor: "overlay.white08" }}>
            Runs on NEAR · Stellar assets via NEAR Intents
          </Box>
        </Box>

        <Box sx={{ p: "1rem 1.25rem", borderRadius: "1rem", backgroundColor: (th) => alpha(th.palette.sidebar.primary, 0.08), border: (th) => `0.0625rem solid ${alpha(th.palette.sidebar.primary, 0.3)}` }}>
          <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>
            <b>View-only in Seidar.</b> Rates, parameters and your position here are live from Templar. Supplying, borrowing and withdrawing happen in Templar&apos;s app, signed with the same Stellar
            wallet.
          </Typography>
        </Box>

        {/* ---------- my position ---------- */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black" }}>My Position</Typography>
          {!isConnected ? (
            <Typography sx={{ fontSize: "0.9375rem", color: "grey.200" }}>Connect a Stellar wallet to see your Templar position in this market.</Typography>
          ) : posLoading ? (
            <Shimmer on width="100%" height="7rem" />
          ) : mine.length ? (
            mine.map(({ wallet, p }) => <PositionView key={wallet} p={p} t={t} wallet={portfolioAddresses.length > 1 ? nameOf(wallet) : null} />)
          ) : (
            <Panel>
              <Typography sx={{ fontSize: "0.9375rem", color: "common.black" }}>No position in this market yet.</Typography>
              {portfolioAddresses.slice(0, 3).map((a) =>
                accountOf(a) ? (
                  <Typography key={a} sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
                    {portfolioAddresses.length > 1 ? `${nameOf(a)}: ` : ""}your Templar account is <b>{accountOf(a)}</b>
                    <Tip text="A NEAR account controlled only by this Stellar wallet's key (you approve each action by signing a message). Templar creates it the first time you use their app; its name is derived from your Stellar address." />
                  </Typography>
                ) : null,
              )}
            </Panel>
          )}
        </Box>

        {/* ---------- market ---------- */}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          <StatCard label={`${bor.code} supplied`} value={compactUsd(t.totalSupplyUsd)} />
          <StatCard label={`${bor.code} borrowed`} value={compactUsd(t.totalBorrowUsd)} />
          <StatCard label="Available to borrow" value={compactUsd(t.availableUsd)} />
          <StatCard label="Utilization" value={pct(t.utilizationPct, 1)} />
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: "1rem", mt: "-0.5rem" }}>
          <StatCard label="Supply APY" value={pct(t.supplyApy)} color="green.main" sub={`Paid to ${bor.code} lenders`} />
          <StatCard label="Borrow APR" value={pct(t.borrowApy)} color="#F5B83D" sub="Variable, set by utilization" />
          <StatCard label={`${coll.code} collateral`} value={compactUsd(t.collateralUsd)} sub="Backs loans, earns no interest" />
        </Box>

        <Box>
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black" }}>Interest rate</Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200", mb: "0.5rem" }}>
            Borrow rate (amber) and supply rate (green) by how much of the {bor.code} supply is lent out.
            {t.supplierSharePct != null && t.supplierSharePct < 100 ? ` Lenders receive ${t.supplierSharePct.toFixed(0)}% of the interest borrowers pay.` : ""}
          </Typography>
          <RateCurve t={t} />
        </Box>

        <Box>
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black", mb: "0.25rem" }}>Risk parameters</Typography>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200", mb: "0.5rem" }}>Fixed when the market was deployed: Templar markets have no admin and can&apos;t be changed or paused.</Typography>
          <Box>
            <ParamRow label="Borrow up to" value={`${t.maxLtvPct.toFixed(1)}% of collateral`} tip={`A loan may be at most this share of the collateral's value (collateral ratio ${(t.mcrMaintenance * 100).toFixed(1)}%).`} />
            <ParamRow label="Liquidation at" value={`${t.liquidationLtvPct.toFixed(1)}% LTV`} tip={`When the loan reaches this share of the collateral's value (ratio below ${(t.mcrLiquidation * 100).toFixed(1)}%), anyone may repay it and take collateral at a discount.`} />
            <ParamRow label="Liquidation discount (max)" value={`${t.liquidationPenaltyPct.toFixed(1)}%`} tip="The most a liquidator can buy collateral below its market price: effectively the liquidation penalty." />
            <ParamRow label="Origination fee" value={t.originationFee.kind === "proportional" ? `${t.originationFee.value.toFixed(2)}%` : t.originationFee.value > 0 ? `${formatAmount(t.originationFee.value / 10 ** t.borrow.decimals, 6)} ${bor.code}` : "None"} tip="A one-time fee added to each loan when it's taken." />
            <ParamRow
              label="Supply withdrawal fee"
              value={!t.withdrawalFee || t.withdrawalFee.value === 0 ? "None" : t.withdrawalFee.kind === "proportional" ? `${t.withdrawalFee.value.toFixed(2)}%${t.withdrawalFee.durationMs ? ` within ${duration(t.withdrawalFee.durationMs)}` : ""}` : `${formatAmount(t.withdrawalFee.value / 10 ** t.borrow.decimals, 6)} ${bor.code}`}
              tip="Charged on supply withdrawals made soon after depositing."
            />
            <ParamRow label="Lendable share of supply" value={`${t.maxUsagePct.toFixed(0)}%`} tip="At most this share of supplied funds can be borrowed; the rest stays available for withdrawals." />
            <ParamRow label="Minimum supply" value={t.minSupply != null ? `${formatAmount(t.minSupply, 4)} ${bor.code}` : "None"} tip="The smallest supply position this market accepts." />
            <ParamRow label="Loan term" value={t.maxBorrowDurationMs ? duration(t.maxBorrowDurationMs) : "Open-ended"} tip="If set, a loan becomes liquidatable after this long regardless of collateral." />
            <ParamRow label="Oracle freshness" value={t.priceMaxAgeS != null ? `${t.priceMaxAgeS} s` : "—"} tip="Borrowing and collateral withdrawals need a price newer than this; Templar's proxy oracle aggregates Pyth and RedStone." />
            <ParamRow
              label="Withdrawal queue"
              value={t.withdrawalQueue.length ? `${t.withdrawalQueue.length} waiting · ${compactUsd(t.withdrawalQueue.depthUsd)}` : "Empty"}
              tip="When most of the supply is lent out, withdrawals wait in a queue and are paid in order as borrowers repay."
            />
          </Box>
        </Box>

        <Box>
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 600, color: "common.black", mb: "0.5rem" }}>How it works from Stellar</Typography>
          <Box component="ol" sx={{ m: 0, pl: "1.25rem", display: "flex", flexDirection: "column", gap: "0.5rem", "& li": { fontSize: "0.875rem", color: "grey.200" }, "& b": { color: "common.black" } }}>
            <li>
              Your Stellar wallet controls a <b>Templar account on NEAR</b>. You approve every action by signing a message; no NEAR wallet or NEAR tokens are needed.
            </li>
            <li>
              Assets move between Stellar and that account through <b>NEAR Intents</b>: a payment to a deposit address with your personal memo. XLM and USDC are supported today.
            </li>
            <li>
              Lenders supply {bor.code} and earn the supply rate. Borrowers deposit {coll.code} and borrow {bor.code} up to {t.maxLtvPct.toFixed(0)}% of its value; the loan accrues the borrow rate.
            </li>
            {!canBringCollateral && (
              <li>
                <b>{coll.code} can&apos;t be sent from Stellar through NEAR Intents yet</b>, so borrowing here needs {coll.code} that is already on NEAR. Lending {bor.code} works from Stellar.
              </li>
            )}
          </Box>
        </Box>
      </Main>

      <Box sx={{ display: "flex", flexDirection: "column", gap: "1rem", position: { lg: "sticky" }, top: { lg: "6.5rem" } }}>
        <SideCard>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <TokenLogo code={bor.code} issuer={bor.issuer} contract={bor.contract} size="2.25rem" />
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: "common.black" }}>Lend {bor.code}</Typography>
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Earn the supply rate from borrowers</Typography>
            </Box>
            <Typography sx={{ fontSize: "1.25rem", fontWeight: 700, color: "green.main" }}>{pct(t.supplyApy)}</Typography>
          </Box>
          <OpenButton primary href={templarAppHref(t.id, "supply")} label={`Supply ${bor.code} on Templar`} />
        </SideCard>

        <SideCard>
          <Box sx={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <PairLogos legs={[coll, bor]} size="2rem" />
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: "common.black" }}>
                Borrow {bor.code} against {coll.code}
              </Typography>
              <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Up to {t.maxLtvPct.toFixed(0)}% of your collateral</Typography>
            </Box>
            <Typography sx={{ fontSize: "1.25rem", fontWeight: 700, color: "#F5B83D" }}>{pct(t.borrowApy)}</Typography>
          </Box>
          {!canBringCollateral && (
            <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>
              {coll.code} can&apos;t be brought from a Stellar wallet yet (NEAR Intents carries XLM and USDC).
            </Typography>
          )}
          <OpenButton href={templarAppHref(t.id, "borrow")} label={`Borrow on Templar`} />
        </SideCard>

        <SideCard>
          <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: "common.black" }}>Contracts</Typography>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <Box component="img" src={meta.logo} alt="" sx={{ width: "1.5rem", height: "1.5rem", borderRadius: "50%" }} />
              <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>Market (NEAR)</Typography>
            </Box>
            <Box component="a" href={`https://nearblocks.io/address/${t.id}`} target="_blank" rel="noreferrer" sx={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", height: "1.875rem", px: "0.75rem", borderRadius: "999rem", backgroundColor: "overlay.white08", fontSize: "0.75rem", color: "common.black", textDecoration: "none", maxWidth: "14rem", overflow: "hidden" }}>
              <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.id}
              </Box>
              <OpenInNewRoundedIcon sx={{ fontSize: "0.875rem", color: "grey.200", flexShrink: 0 }} />
            </Box>
          </Box>
          <ContractRow icon={<TokenLogo code={coll.code} issuer={coll.issuer} contract={coll.contract} size="1.5rem" />} label={coll.code} address={t.collateral.contract} />
          <ContractRow icon={<TokenLogo code={bor.code} issuer={bor.issuer} contract={bor.contract} size="1.5rem" />} label={bor.code} address={t.borrow.contract} />
          <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>
            Stellar contracts of the two assets; on NEAR they are held as NEAR Intents tokens. Data: api.templarfi.org.
          </Typography>
        </SideCard>
      </Box>
    </Layout>
  );
}
