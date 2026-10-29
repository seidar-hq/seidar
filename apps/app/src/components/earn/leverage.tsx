"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";
import TokenLogo from "@/components/common/TokenLogo";
import { formatAmount, formatUsd } from "@/lib/format";
import { toBase } from "@/lib/tx";
import type { DetailRow } from "./ActionCard";
import { pct, type Market } from "./lendData";

// Leverage on XOXNO (controller `multiply`, one transaction): the wallet deposits the market's
// asset, XOXNO flash-borrows the debt asset, swaps it into more of the deposit asset and supplies
// it all as collateral in a new account. Health floor matches the pools page (pools.ts): 1.3.

export const MIN_HEALTH = 1.3;
export const SLIPPAGE_BPS = 50;

/** Highest leverage that keeps health = ltv x L / (L - 1) at the floor, rounded down to 0.1x. */
export const maxLeverage = (ltv: number) => (ltv > 0 && ltv < MIN_HEALTH ? Math.floor((1 / (1 - ltv / MIN_HEALTH)) * 10) / 10 : 1);

type Spoke = { spokeId: number; spokeName: string; ltv: number; debts: Market[] };

/** Spokes where `m` can be collateral, each with the other XOXNO assets it can borrow. */
export function leverageSpokes(m: Market | undefined, markets: Market[]): Spoke[] {
  if (!m?.xoxno || !m.contract) return [];
  return m.xoxno.spokes
    .filter((s) => s.canBeCollateral !== false && s.ltvBps > 0)
    .map((s) => ({
      spokeId: s.spokeId,
      spokeName: s.spokeName,
      ltv: s.ltvBps / 10_000,
      debts: markets.filter(
        (x) => x.protocol === "xoxno" && x.contract && x.contract !== m.contract && (x.priceUsd ?? 0) > 0 && x.xoxno?.spokes.some((p) => p.spokeId === s.spokeId && p.canBorrow),
      ),
    }))
    .filter((s) => s.debts.length > 0 && maxLeverage(s.ltv) > 1.1);
}

export function useLeverage(m: Market | undefined, markets: Market[], walletBal: number, active: boolean) {
  const spokes = useMemo(() => leverageSpokes(m, markets), [m, markets]);
  const [spokeId, setSpokeId] = useState<number | null>(null);
  const [debtKey, setDebtKey] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [lev, setLev] = useState(2);

  const spoke = spokes.find((s) => s.spokeId === spokeId) ?? spokes[0] ?? null;
  // Default borrow: a dollar stablecoin when there is one (a classic "long" of the deposit asset).
  const debt = spoke?.debts.find((d) => d.key === debtKey) ?? spoke?.debts.find((d) => d.code === "USDC") ?? spoke?.debts[0] ?? null;
  const maxLev = spoke ? maxLeverage(spoke.ltv) : 1;
  const L = Math.min(Math.max(lev, 1.1), maxLev);

  useEffect(() => {
    if (!active) setAmount("");
  }, [active]);
  useEffect(() => {
    if (lev > maxLev) setLev(Math.max(1.1, Math.floor(Math.min(2, maxLev) * 10) / 10));
  }, [lev, maxLev]);

  const n = Number(amount || 0);
  const pc = m?.priceUsd ?? null;
  const pd = debt?.priceUsd ?? null;
  const depositUsd = pc != null ? n * pc : null;
  const debtUsd = depositUsd != null ? depositUsd * (L - 1) : null;
  const debtAmount = debtUsd != null && pd ? debtUsd / pd : null;
  const health = spoke ? (spoke.ltv * L) / (L - 1) : null;
  const netApy =
    m?.supplyApy != null && debt?.borrowApy != null ? m.supplyApy * L - debt.borrowApy * (L - 1) : null;

  const blocker = (() => {
    if (!m || !spoke || !debt) return "No XOXNO spoke offers leverage on this asset";
    if (pc == null || pd == null) return "Prices unavailable right now";
    if (!(n > 0)) return "Enter an amount";
    if (n > walletBal + 1e-9) return `Insufficient ${m.code} balance`;
    if (!(debtAmount && debtAmount > 0)) return "Enter an amount";
    return null;
  })();

  const body = (from: string) =>
    m && spoke && debt && debtAmount
      ? {
          from,
          spokeId: spoke.spokeId,
          collateral: m.contract,
          debt: debt.contract,
          deposit: toBase(amount, m.decimals) ?? "0",
          debtAmount: toBase(debtAmount.toFixed(debt.decimals), debt.decimals) ?? "0",
          slippageBps: SLIPPAGE_BPS,
        }
      : null;

  const details: DetailRow[] = [];
  if (m && spoke && debt) {
    details.push({ label: "Position", value: depositUsd != null && n > 0 ? `≈ ${formatAmount(n * L, 4)} ${m.code} (${formatUsd(depositUsd * L)})` : "—" });
    details.push({ label: "Borrowed", value: debtAmount != null && n > 0 ? `${formatAmount(debtAmount, 4)} ${debt.code}` : "—" });
    details.push({ label: "Health (est.)", value: health != null ? health.toFixed(2) : "—", color: health != null && health < 1.5 ? "orange.main" : "green.main" });
    details.push({ label: "Net APY (est.)", value: netApy != null ? pct(netApy) : "—", color: netApy != null && netApy < 0 ? "error.main" : "green.main" });
    details.push({ label: "Max LTV", value: pct(spoke.ltv * 100, 0) });
    details.push({ label: "Swap slippage", value: pct(SLIPPAGE_BPS / 100, 1) });
  }

  return { spokes, spoke, setSpokeId, debt, setDebtKey, amount, setAmount, lev: L, setLev, maxLev, blocker, body, details, available: spokes.length > 0 };
}

const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
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

/** Spoke + borrow asset + leverage slider, shown under the deposit amount. */
export function LeverageFields({ lv }: { lv: ReturnType<typeof useLeverage> }) {
  if (!lv.spoke) return null;
  return (
    <>
      {lv.spokes.length > 1 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>XOXNO spoke</Typography>
          <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {lv.spokes.map((s) => (
              <Chip key={s.spokeId} on={lv.spoke?.spokeId === s.spokeId} onClick={() => lv.setSpokeId(s.spokeId)}>
                {s.spokeName} · LTV {(s.ltv * 100).toFixed(0)}%
              </Chip>
            ))}
          </Box>
        </Box>
      )}
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <Typography sx={{ fontSize: "0.8125rem", color: "grey.200" }}>Borrow to loop</Typography>
        <Box sx={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {lv.spoke.debts.map((d) => (
            <Chip key={d.key} on={lv.debt?.key === d.key} onClick={() => lv.setDebtKey(d.key)}>
              <TokenLogo code={d.code} issuer={d.issuer} contract={d.contract} size="1.125rem" />
              {d.code}
              {d.borrowApy != null ? ` · ${pct(d.borrowApy)}` : ""}
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
        <Typography sx={{ fontSize: "0.75rem", color: "grey.200" }}>
          Max {lv.maxLev.toFixed(1)}x keeps health at {MIN_HEALTH} or above. Opens a new XOXNO account; if the price of what you borrowed rises against your collateral, the position can be liquidated.
        </Typography>
      </Box>
    </>
  );
}
