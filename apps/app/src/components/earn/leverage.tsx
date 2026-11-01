"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import TokenLogo from "@/components/common/TokenLogo";
import { apiJson } from "@/lib/api";
import { useShared } from "@/lib/useShared";
import { toBase } from "@/lib/tx";
import type { DetailRow } from "./ActionCard";
import { pct, type Market } from "./lendData";

// Leverage, long or short the selected asset:
// - Long X: deposit X as collateral, borrow another asset (a stablecoin by default), swap it into
//   more X and supply that too. Gains when X rises against the debt.
// - Short X: deposit another asset (a stablecoin by default) as collateral, borrow X, swap it into
//   more collateral and supply that. Gains when X falls against the collateral.
// Either way the contracts see a (collateral, debt) pair, so both directions run on the same paths:
// - XOXNO (controller `multiply`, one transaction): the wallet deposits the collateral, XOXNO
//   flash-borrows the debt, swaps it into more collateral and supplies it all in a new position
//   (position mode long / short).
// - Blend: one transaction through Seidar's leverage contract (contracts/leverage: a Blend flash
//   loan whose callback swaps the borrow into collateral) once the API has it configured; until
//   then a loop of transactions the API builds one after another (/lending/blend/leverage).
// Either way the finished position's health is held at MIN_HEALTH (as on the pools page, pools.ts).

export const MIN_HEALTH = 1.3;
export const SLIPPAGE_BPS = 50;
/** Blend loop: intermediate rounds may dip to this health (matches the API). */
const LOOP_MIN_HEALTH = 1.1;
const LOOP_MAX_ROUNDS = 8;

/** Highest leverage that keeps health = ltv x L / (L - 1) at the floor, rounded down to 0.1x. */
export const maxLeverage = (ltv: number) => (ltv > 0 && ltv < MIN_HEALTH ? Math.floor((1 / (1 - ltv / MIN_HEALTH)) * 10) / 10 : 1);

/** Borrow rounds a Blend loop takes to reach leverage L (same rule as the API, at oracle prices). */
function loopRounds(ltv: number, L: number): number {
  let coll = 1;
  let debt = 0;
  let n = 0;
  const target = L - 1;
  while (debt < target - 1e-6 && n < LOOP_MAX_ROUNDS) {
    const cap = (coll * ltv) / LOOP_MIN_HEALTH - debt;
    if (cap <= 1e-6) break;
    const b = Math.min(target - debt, cap);
    if (n > 0 && b < (target - debt) / 50) break;
    debt += b;
    coll += b;
    n++;
  }
  return n;
}

export type LevSide = "long" | "short";

/** A place to open the position (an XOXNO spoke, or the Blend pool itself) and the assets to pair with there. */
type Spoke = { spokeId: number; spokeName: string; options: Market[] };

/** Collateral factor of `c` at a venue: XOXNO quotes it per spoke, Blend per pool (c_factor). */
const collLtv = (c: Market, spokeId: number) =>
  c.protocol === "blend" ? (c.ltvPct ?? 0) / 100 : (c.xoxno?.spokes.find((s) => s.spokeId === spokeId)?.ltvBps ?? 0) / 10_000;
/** Pair LTV: Blend also weighs the debt by 1 / l_factor. */
const pairLtv = (c: Market, d: Market, spokeId: number) => collLtv(c, spokeId) * (d.protocol === "blend" ? (d.lFactor ?? 0) : 1);
const priced = (x: Market) => !!x.contract && (x.priceUsd ?? 0) > 0;
const pairOk = (c: Market, d: Market, spokeId: number) => maxLeverage(pairLtv(c, d, spokeId)) > 1.1;

/**
 * Venues where `m` can be longed (m is the collateral; options are what to borrow) or shorted
 * (m is the debt; options are what to post as collateral).
 */
export function leverageSpokes(m: Market | undefined, markets: Market[], side: LevSide = "long"): Spoke[] {
  if (!m || !priced(m)) return [];
  if (m.protocol === "blend") {
    // On-ice / frozen pools keep the tab (blocked by actionBlock with the reason), like Borrow does.
    const peers = markets.filter((x) => x.protocol === "blend" && x.pool === m.pool && x.contract !== m.contract && priced(x));
    const options =
      side === "long"
        ? m.canCollateral && (m.ltvPct ?? 0) > 0
          ? peers.filter((x) => x.canBorrow && pairOk(m, x, 0))
          : []
        : m.canBorrow
          ? peers.filter((x) => x.canCollateral && (x.ltvPct ?? 0) > 0 && pairOk(x, m, 0))
          : [];
    return options.length ? [{ spokeId: 0, spokeName: m.poolName, options }] : [];
  }
  if (!m.xoxno) return [];
  const peers = markets.filter((x) => x.protocol === "xoxno" && x.contract !== m.contract && priced(x));
  return m.xoxno.spokes
    .filter((s) => (side === "long" ? s.canBeCollateral !== false && s.ltvBps > 0 : s.canBorrow))
    .map((s) => ({
      spokeId: s.spokeId,
      spokeName: s.spokeName,
      options: peers.filter((x) => {
        const p = x.xoxno?.spokes.find((q) => q.spokeId === s.spokeId);
        if (!p) return false;
        return side === "long" ? p.canBorrow && pairOk(m, x, s.spokeId) : p.canBeCollateral !== false && p.ltvBps > 0 && pairOk(x, m, s.spokeId);
      }),
    }))
    .filter((s) => s.options.length > 0);
}

/** Can `m` be leveraged either way here? */
export const canLeverage = (m: Market, markets: Market[]) => leverageSpokes(m, markets, "long").length > 0 || leverageSpokes(m, markets, "short").length > 0;

export function useLeverage(m: Market | undefined, markets: Market[], balOf: (x: Market) => number, active: boolean, side: LevSide) {
  const spokes = useMemo(() => leverageSpokes(m, markets, side), [m, markets, side]);
  const [spokeId, setSpokeId] = useState<number | null>(null);
  const [otherKey, setOtherKey] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [lev, setLev] = useState(2);
  const blend = m?.protocol === "blend";
  const cfg = useShared<{ oneStep?: boolean } | null>("lev:blend", () => apiJson("/api/lending/blend/leverage", undefined, 60_000), 600_000);
  const oneStep = blend && cfg.value?.oneStep === true;

  const spoke = spokes.find((s) => s.spokeId === spokeId) ?? spokes[0] ?? null;
  // The other leg defaults to a dollar stablecoin: long X against USDC, or short X with USDC collateral.
  const other = spoke?.options.find((d) => d.key === otherKey) ?? spoke?.options.find((d) => d.code === "USDC") ?? spoke?.options[0] ?? null;
  const coll = side === "long" ? (m ?? null) : other;
  const debt = side === "long" ? other : (m ?? null);
  const ltv = spoke && coll && debt ? pairLtv(coll, debt, spoke.spokeId) : 0;
  const walletBal = coll ? balOf(coll) : 0;
  const maxLev = spoke ? maxLeverage(ltv) : 1;
  const L = Math.min(Math.max(lev, 1.1), maxLev);

  useEffect(() => {
    if (!active) setAmount("");
  }, [active]);
  // The amount is in the deposit asset: switching it (long <-> short, another collateral) starts over.
  useEffect(() => setAmount(""), [coll?.key]);
  useEffect(() => {
    if (lev > maxLev) setLev(Math.max(1.1, Math.floor(Math.min(2, maxLev) * 10) / 10));
  }, [lev, maxLev]);

  const n = Number(amount || 0);
  const pc = coll?.priceUsd ?? null;
  const pd = debt?.priceUsd ?? null;
  const depositUsd = pc != null ? n * pc : null;
  const debtUsd = depositUsd != null ? depositUsd * (L - 1) : null;
  const debtAmount = debtUsd != null && pd ? debtUsd / pd : null;
  const health = spoke ? (ltv * L) / (L - 1) : null;
  const netApy =
    coll?.supplyApy != null && debt?.borrowApy != null ? coll.supplyApy * L - debt.borrowApy * (L - 1) : null;
  const rounds = blend && ltv ? loopRounds(ltv, L) : 0;

  const blocker = (() => {
    if (!m || !spoke || !coll || !debt)
      return side === "long"
        ? blend
          ? `Nothing in this pool can be borrowed against ${m?.code ?? "it"}`
          : `No XOXNO spoke lets you long ${m?.code ?? "this asset"}`
        : blend
          ? `${m?.code ?? "This asset"} can't be borrowed against anything in this pool`
          : `No XOXNO spoke lets you short ${m?.code ?? "this asset"}`;
    if (pc == null || pd == null) return "Prices unavailable right now";
    if (!(n > 0)) return "Enter an amount";
    if (n > walletBal + 1e-9) return `Insufficient ${coll.code} balance`;
    if (!(debtAmount && debtAmount > 0)) return "Enter an amount";
    return null;
  })();

  const path = blend ? "/api/lending/blend/leverage" : "/api/lending/xoxno/multiply";
  const body = (from: string) => {
    if (!m || !spoke || !coll || !debt || !debtAmount) return null;
    const deposit = toBase(amount, coll.decimals) ?? "0";
    if (blend)
      return { protocol: "blend", from, pool: m.pool, collateral: coll.contract, debt: debt.contract, deposit, leverage: Math.round(L * 10) / 10, slippageBps: SLIPPAGE_BPS };
    return {
      from,
      side,
      spokeId: spoke.spokeId,
      collateral: coll.contract,
      debt: debt.contract,
      deposit,
      debtAmount: toBase(debtAmount.toFixed(debt.decimals), debt.decimals) ?? "0",
      slippageBps: SLIPPAGE_BPS,
    };
  };

  const details: DetailRow[] = [];
  if (m && spoke && coll && debt) {
    // Position, borrow, health and net APY show as "after" values on the My Position card.
    details.push({ label: blend ? "Effective LTV" : `${coll.code} max LTV`, value: pct(ltv * 100, 0) });
    details.push({ label: "Swap slippage", value: pct(SLIPPAGE_BPS / 100, 1) });
    if (blend) details.push({ label: "Transactions", value: oneStep ? "1" : rounds ? `about ${rounds * 2 + 1}` : "N/A" });
  }

  // The finished trade at oracle prices (null until an amount is entered).
  const preview =
    m && spoke && coll && debt && n > 0 && depositUsd != null && debtUsd != null && debtAmount != null
      ? { added: n * L, addedUsd: depositUsd * L, debtAmount, debtUsd, health, netApy }
      : null;

  return {
    side,
    spokes,
    spoke,
    setSpokeId,
    coll,
    debt,
    other,
    setOtherKey,
    collLtv: spoke && coll ? collLtv(coll, spoke.spokeId) : 0,
    walletBal,
    amount,
    setAmount,
    lev: L,
    setLev,
    maxLev,
    blocker,
    body,
    path,
    blend,
    oneStep,
    details,
    preview,
    available: spokes.length > 0,
  };
}

export const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <ButtonBase
    onClick={onClick}
    sx={{
      display: "flex",
      alignItems: "center",
      gap: "0.375rem",
      height: "2.25rem",
      px: "0.75rem",
      borderRadius: "999rem",
      fontSize: "0.8125rem",
      color: on ? "sidebar.white" : "common.black",
      backgroundColor: on ? "sidebar.primary" : "overlay.white08",
    }}
  >
    {children}
  </ButtonBase>
);

/** "XLM LTV 76%" beside a spoke's name on its chip. */
export const SpokeLtv = ({ on, code, pct: v }: { on: boolean; code: string; pct: number }) => (
  <Box component="span" sx={{ color: on ? "sidebar.white" : "grey.200", opacity: on ? 0.75 : 1 }}>
    {code} LTV {v.toFixed(0)}%
  </Box>
);

/** Spoke + borrow asset + leverage slider, shown under the deposit amount. */
export function LeverageFields({ lv }: { lv: ReturnType<typeof useLeverage> }) {
  if (!lv.spoke) return null;
  return (
    <>
      {!lv.blend && lv.spokes.length > 1 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>XOXNO spoke</Typography>
          <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {lv.spokes.map((s) => (
              <Chip key={s.spokeId} on={lv.spoke?.spokeId === s.spokeId} onClick={() => lv.setSpokeId(s.spokeId)}>
                {s.spokeName}
                {lv.coll && <SpokeLtv on={lv.spoke?.spokeId === s.spokeId} code={lv.coll.code} pct={collLtv(lv.coll, s.spokeId) * 100} />}
              </Chip>
            ))}
          </Box>
        </Box>
      )}
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>{lv.side === "long" ? "Borrow to loop" : "Collateral to deposit"}</Typography>
        <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {lv.spoke.options.map((d) => (
            <Chip key={d.key} on={lv.other?.key === d.key} onClick={() => lv.setOtherKey(d.key)}>
              <TokenLogo code={d.code} issuer={d.issuer} contract={d.contract} size="1.125rem" />
              {d.code}
              {lv.side === "long" ? (d.borrowApy != null ? ` · ${pct(d.borrowApy)}` : "") : d.supplyApy != null ? ` · ${pct(d.supplyApy)}` : ""}
            </Chip>
          ))}
        </Box>
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.25rem", p: "0.75rem 1rem", borderRadius: "0.875rem", backgroundColor: "overlay.white04" }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Typography sx={{ fontSize: "0.875rem", color: "common.black" }}>Leverage</Typography>
          <Typography sx={{ fontSize: "1rem", fontWeight: 600, color: "common.black" }}>{lv.lev.toFixed(1)}x</Typography>
        </Box>
        <Slider
          value={lv.lev}
          min={1.1}
          max={lv.maxLev}
          step={0.1}
          onChange={(_, v) => lv.setLev(v as number)}
          marks={[
            { value: 1.1, label: "1.1x" },
            { value: lv.maxLev, label: `${lv.maxLev.toFixed(1)}x` },
          ]}
          sx={{ mx: "0.5rem", width: "auto", "& .MuiSlider-markLabel": { fontSize: "0.75rem", color: "grey.200" } }}
        />
      </Box>
    </>
  );
}
