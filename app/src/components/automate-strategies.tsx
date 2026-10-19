"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TxModal, type TxSpec } from "./tx-modal";
import { automationFeeNote, automationFeeRow, useFees } from "@/lib/fees";
import { useSmartAccount } from "./smart-gate";
import {
  ActiveLine,
  AkCheck,
  AkChips,
  AkField,
  AkNote,
  AkPanel,
  AkSelect,
  codeOf,
  DEFAULT_SLIP_BPS,
  disableAutomation,
  enableAutomation,
  fmtNum,
  fmtPrice,
  pct,
  RatioBar,
  singlePair,
  toBase,
  useAutomation,
  useCrossPrice,
  usePositionView,
  useReserves,
  useTokens,
  useVenue,
  useVenueAccount,
  useVenueBlocked,
  useVenuePool,
  type Automation,
  type RuleSpec,
  NoSmartPositions,
} from "./automate-kit";

/* Hands-off strategies beyond Liquidation Protection (automate.tsx), laid
   out like DeFi Saver's: Automated Leverage Management, Stop Loss, Take
   Profit, Boost / Repay on Target Price, Collateral Switch. Each one installs
   guarded keeper rules on the active smart account (contracts/guard bounds
   every action on-chain) and registers it for the Seidar keeper. Ratios are
   health factors shown as %; prices are the venue's own (Blend pool oracle,
   XOXNO price aggregator) — the same numbers the guard checks. The venue is
   the page's (AutomationVenue): Blend's verified pool or an XOXNO account.
   There is no gas-price setting: Stellar fees are flat and the keeper pays
   them. */

type Kind = "leverage" | "stop_loss" | "take_profit" | "boost_price" | "repay_price" | "switch";


/* ---------------- shared panel state ---------------- */

function usePanelBase(kind: Kind, owner: string | null) {
  const { account } = useSmartAccount();
  const { cfg, automations, runs } = useAutomation(owner);
  const venue = useVenue();
  const pool = useVenuePool(cfg);
  const venueReason = useVenueBlocked(cfg);
  const { pos, loaded } = usePositionView(account, pool, useVenueAccount());
  const isX = venue === "xoxno";
  // XOXNO: the account being automated (an automation is per XOXNO account).
  const xoxno = isX && pos?.accountId ? { accountId: pos.accountId, hubId: pos.legs[0]?.hubId ?? 1, spokeId: pos.spokeId ?? 1 } : null;
  const [tab, setTab] = useState<"configure" | "history">("configure");
  const [txSpec, setTxSpec] = useState<TxSpec | null>(null);
  const tokens = useTokens();
  const feeBps = useFees()?.automationBps ?? null;
  const hasDebt = !!pos && pos.legs.some((l) => l.debt > 0);
  const hasColl = !!pos && pos.legs.some((l) => l.collateral > 0);
  const sameVenue = (a: Automation) =>
    a.account === account && a.pool === pool && (!xoxno || String(a.config.accountId ?? "") === xoxno.accountId);
  const active = automations.find((a) => a.kind === kind && sameVenue(a) && a.status === "active") ?? null;
  const ids = new Set(automations.filter((a) => a.kind === kind && sameVenue(a)).map((a) => a.id));
  const myRuns = runs.filter((r) => ids.has(r.automation_id));
  return {
    feeBps,
    owner,
    account,
    cfg,
    pool,
    pos,
    loaded,
    hasDebt,
    hasColl,
    tab,
    setTab,
    txSpec,
    setTxSpec,
    tokens,
    active,
    runs: myRuns,
    deployed: !!cfg?.deployed,
    venue,
    xoxno,
    venueReason,
  };
}
const venueName = (b: { venue: string }) => (b.venue === "xoxno" ? "XOXNO" : "Blend");
type Base = ReturnType<typeof usePanelBase>;

/** Why Enable can't run yet (null = it can). */
function blockedReason(b: Base, errors: string[]): string | null {
  if (!b.cfg) return "Loading…";
  if (!b.deployed) return "Automation contracts are not live on mainnet yet.";
  return b.venueReason ?? errors[0] ?? null;
}

function NeedsPosition({ b, needDebt, what }: { b: Base; needDebt: boolean; what: string }) {
  if (!b.owner) return <p className="lp-muted">Connect a wallet to set up {what}.</p>;
  if (!b.account) return <NoSmartPositions />;
  const msg = !b.loaded
      ? "Reading your position…"
      : !b.hasColl
        ? `This smart account has no ${venueName(b)} position to automate yet.`
        : needDebt && !b.hasDebt
          ? `${what} works on a borrow position — this account has no debt in the pool.`
          : null;
  if (!msg) return null;
  return (
    <div className="lp-empty">
      <p>{msg}</p>
      <div className="lp-empty-actions">
        {b.account && (
          <Link className="btn primary" href={`/markets/${b.venue}/create`}>
            Open a position
          </Link>
        )}
      </div>
    </div>
  );
}

function Footer({
  b,
  blocked,
  onEnable,
}: {
  b: Base;
  blocked: string | null;
  onEnable: () => void;
}) {
  return (
    <>
      <div className="lp-actions">
        {b.active ? (
          <button className="btn" onClick={() => disable(b)}>
            Disable automation
          </button>
        ) : (
          <button className="btn primary ak-enable" disabled={blocked != null} title={blocked ?? undefined} onClick={onEnable}>
            Enable Automation
          </button>
        )}
      </div>
      <TxModal spec={b.txSpec} onClose={() => b.setTxSpec(null)} />
    </>
  );
}

function disable(b: Base) {
  const a = b.active as Automation;
  if (!a || !b.owner) return;
  const owner = b.owner;
  b.setTxSpec({
    title: "Disable automation",
    context: `Smart account ${a.account.slice(0, 6)}…`,
    rows: [{ label: "Signatures", value: String(a.rules.length), hint: "Removes each keeper rule from your smart account." }],
    notes: ["Your position stays as it is; only the keeper's permission is removed."],
    confirmLabel: "Disable",
    execute: (onSteps) => disableAutomation(owner, a, onSteps),
  });
}

function openEnable(
  b: Base,
  o: {
    title: string;
    kind: Kind;
    collateral: string;
    debt: string;
    config: Record<string, unknown>;
    rules: RuleSpec[];
    rows: { label: string; value: string }[];
    notes: string[];
  },
) {
  if (!b.owner || !b.account || !b.pool) return;
  if (b.venue === "xoxno" && !b.xoxno) return;
  const { owner, account, pool } = b;
  // XOXNO runs every op through its controller: no token approve rules.
  const signatures = b.xoxno ? o.rules.filter((r) => r.action !== "Approve").length : o.rules.length;
  const where = b.xoxno ? `XOXNO account #${b.xoxno.accountId}` : "Blend pool";
  b.setTxSpec({
    title: o.title,
    context: `${where} · ${codeOf(b.tokens, o.collateral)}${o.debt ? ` / ${codeOf(b.tokens, o.debt)}` : ""}`,
    rows: [
      ...o.rows,
      { label: "Signatures", value: String(signatures) },
    ],
    serviceFee: automationFeeRow(b.feeBps),
    notes: o.notes,
    confirmLabel: "Enable",
    execute: async (onSteps) => {
      await enableAutomation(
        { owner, account, kind: o.kind, pool, collateral: o.collateral, debt: o.debt, config: o.config, rules: o.rules, tokens: b.tokens, xoxno: b.xoxno },
        onSteps,
      );
    },
  });
}

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const approve = (role: string, token: string): RuleSpec => ({
  role,
  target: token,
  action: "Approve",
  trigger: { kind: "always" },
  name: "seidar-approve",
});

/* ================= Automated Leverage Management ================= */

export function LeverageManagementPanel({ owner }: { owner: string | null }) {
  const b = usePanelBase("leverage", owner);
  const pair = singlePair(b.pos);
  const cf = pair?.coll.cf ?? 0.75;
  const lf = pair?.debt.lf ?? 1;
  /* Leverage L <-> ratio: collateral/debt = L/(L-1), health = that x cf x lf. */
  const levRatio = (L: number) => (L / (L - 1)) * cf * lf * 100;
  const [advanced, setAdvanced] = useState(false);
  const [lev, setLev] = useState<number | null>(2);
  const [safety, setSafety] = useState("");
  const [rb, setRb] = useState("");
  const [rt, setRt] = useState("");
  const [boostOn, setBoostOn] = useState(true);
  const [bo, setBo] = useState("");
  const [bt, setBt] = useState("");

  function applySimple(t: number) {
    setSafety(t.toFixed(2));
    setRb((t - 15).toFixed(2));
    setRt(t.toFixed(2));
    setBo((t + 15).toFixed(2));
    setBt(t.toFixed(2));
    setBoostOn(true);
  }
  // Defaults: 2x leverage for this position's factors (or the active config).
  useEffect(() => {
    const c = b.active?.config;
    if (c) {
      setRb((Number(c.triggerHf) * 100).toFixed(2));
      setRt((Number(c.targetHf) * 100).toFixed(2));
      setBoostOn(!!c.boostEnabled);
      setBo((Number(c.boostOver) * 100).toFixed(2));
      setBt((Number(c.boostTo) * 100).toFixed(2));
      setAdvanced(true);
      return;
    }
    if (!safety) applySimple(Math.min(Math.max(levRatio(2), 140), 280));
  }, [b.active?.id, cf, lf]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = { rb: num(rb), rt: num(rt), bo: num(bo), bt: num(bt) };
  const cur = b.pos?.health ?? null;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!(v.rb >= 105 && v.rb <= 295)) errors.push("Repay when the ratio falls below 105%–295% (the guard's bounds).");
  if (!(v.rt >= v.rb + 5)) errors.push("Repay to must be at least 5 points above the repay trigger.");
  if (boostOn) {
    if (!(v.bt >= 116)) errors.push("Boost to must be at least 116% (the guard keeps boosts above a 110% floor).");
    if (!(v.bt >= v.rb + 10)) errors.push("Boost to must sit at least 10 points above the repay trigger, or a boost would trigger a repay.");
    if (!(v.bo >= v.bt + 5)) errors.push("Boost when the ratio goes over must be at least 5 points above boost to.");
    if (!(v.rt <= v.bo - 5)) errors.push("Repay to must stay at least 5 points below the boost trigger, or a repay would trigger a boost.");
  }
  if (cur != null && cur < 99 && cur * 100 < v.rb) warnings.push(`Your ratio is ${pct(cur)} — a repay runs right after enabling.`);
  if (boostOn && cur != null && cur < 99 && cur * 100 > v.bo) warnings.push(`Your ratio is ${pct(cur)} — a boost runs right after enabling.`);
  if (v.rt - v.rb < 10 || (boostOn && v.bo - v.bt < 10))
    warnings.push("Narrow bands mean frequent small actions — each pays the network and swap fees.");
  const blocked = blockedReason(b, pair ? errors : ["Leverage management works on one collateral and one debt asset.", ...errors]);
  const locked = !!b.active;

  function enable() {
    if (!pair) return;
    const rules: RuleSpec[] = [
      { role: "repay", target: b.pool!, action: "Repay", trigger: { kind: "health_below", value: v.rb / 100 }, maxSlippageBps: DEFAULT_SLIP_BPS, name: "seidar-alm-repay" },
      approve("debt_approve", pair.debt.asset),
    ];
    if (boostOn)
      rules.push(
        {
          role: "boost",
          target: b.pool!,
          action: "Boost",
          trigger: { kind: "health_above", value: v.bo / 100 },
          minHf: Math.max(1.1, (v.bt / 100) * 0.95),
          maxSlippageBps: DEFAULT_SLIP_BPS,
          name: "seidar-alm-boost",
        },
        approve("coll_approve", pair.coll.asset),
      );
    openEnable(b, {
      title: "Enable Automated Leverage Management",
      kind: "leverage",
      collateral: pair.coll.asset,
      debt: pair.debt.asset,
      config: {
        triggerHf: v.rb / 100,
        targetHf: v.rt / 100,
        boostEnabled: boostOn,
        boostOver: v.bo / 100,
        boostTo: v.bt / 100,
        maxSlippageBps: DEFAULT_SLIP_BPS,
      },
      rules,
      rows: [
        { label: "Repay when ratio falls below", value: `${v.rb.toFixed(2)}%` },
        { label: "Repay to", value: `${v.rt.toFixed(2)}%` },
        ...(boostOn
          ? [
              { label: "Boost when ratio goes over", value: `${v.bo.toFixed(2)}%` },
              { label: "Boost to", value: `${v.bt.toFixed(2)}%` },
            ]
          : []),
        { label: "Current ratio", value: pct(cur) },
      ],
      notes: [
        `The keeper can only sell ${codeOf(b.tokens, pair.coll.asset)} to repay ${codeOf(b.tokens, pair.debt.asset)} below your trigger${
          boostOn ? `, and borrow ${codeOf(b.tokens, pair.debt.asset)} to add collateral above your boost trigger (never below ${pct(Math.max(1.1, (v.bt / 100) * 0.95))})` : ""
        } — enforced on-chain by the Seidar guard.`,
      ],
    });
  }

  const needs = !b.account || !b.hasColl || !b.hasDebt;
  return (
    <AkPanel
      title="Automated Leverage Management"
      desc="Automatically unwind (auto-Repay) your position when price drops and leverage up (auto-Boost) when price goes up. Both options can be configured separately."
      tab={b.tab}
      setTab={b.setTab}
      runs={b.runs}
    >
      {needs ? (
        <NeedsPosition b={b} needDebt what="Leverage management" />
      ) : (
        <div className="lp-config">
          {b.active && <ActiveLine a={b.active} />}
          <RatioBar
            current={cur}
            marks={[
              { value: v.rb / 100, tone: "trigger", label: "Repay below", drag: advanced && !locked ? (x) => setRb((x * 100).toFixed(2)) : undefined },
              { value: v.rt / 100, tone: "target", label: "Repay to" },
              ...(boostOn
                ? [
                    { value: v.bo / 100, tone: "trigger" as const, label: "Boost over", drag: advanced && !locked ? (x: number) => setBo((x * 100).toFixed(2)) : undefined },
                    ...(Math.abs(v.bt - v.rt) > 0.01 ? [{ value: v.bt / 100, tone: "target" as const, label: "Boost to" }] : []),
                  ]
                : []),
            ]}
          />
          <div className="lp-rule">
            <p>
              <span>Liquidation protection:</span>
              <br />
              If below <b>{Number.isFinite(v.rb) ? `${v.rb.toFixed(2)}%` : "—"}</b> repay to{" "}
              <b>{Number.isFinite(v.rt) ? `${v.rt.toFixed(2)}%` : "—"}</b>
            </p>
            {boostOn && (
              <p>
                <span>Leverage increase:</span>
                <br />
                If above <b>{Number.isFinite(v.bo) ? `${v.bo.toFixed(2)}%` : "—"}</b> boost to{" "}
                <b>{Number.isFinite(v.bt) ? `${v.bt.toFixed(2)}%` : "—"}</b>
              </p>
            )}
          </div>
          <div className="ak-grid">
            <AkField
              label="Keep the Safety Ratio at:"
              value={safety}
              suffix="%"
              disabled={advanced || locked}
              tone="good"
              onChange={(x) => {
                setSafety(x);
                setLev(null);
                const t = num(x);
                if (Number.isFinite(t)) {
                  setRb((t - 15).toFixed(2));
                  setRt(t.toFixed(2));
                  setBo((t + 15).toFixed(2));
                  setBt(t.toFixed(2));
                }
              }}
            />
            <div className={`ak-field ak-chips${advanced || locked ? " off" : ""}`}>
              <span className="ak-label">Target leverage:</span>
              <div>
                {[1.5, 2, 2.5].map((L) => (
                  <button
                    key={L}
                    type="button"
                    className={lev === L && !advanced ? "on" : ""}
                    disabled={advanced || locked || levRatio(L) < 120}
                    title={levRatio(L) < 120 ? `${L}x would put the ratio at ${levRatio(L).toFixed(0)}% — too close to liquidation` : `Ratio ${levRatio(L).toFixed(2)}%`}
                    onClick={() => {
                      setLev(L);
                      applySimple(levRatio(L));
                    }}
                  >
                    {L}x
                  </button>
                ))}
              </div>
            </div>
          </div>
          {!locked && (
            <AkCheck checked={advanced} onChange={setAdvanced}>
              Advanced
            </AkCheck>
          )}
          {(advanced || locked) && (
            <>
              <div className="ak-grid">
                <AkField label="If ratio falls below:" value={rb} onChange={locked ? undefined : setRb} suffix="%" tone="good" />
                <AkField label="Repay it to:" value={rt} onChange={locked ? undefined : setRt} suffix="%" tone="good" />
              </div>
              <AkCheck checked={boostOn} onChange={(x) => !locked && setBoostOn(x)}>
                Boost when price rises
              </AkCheck>
              {boostOn && (
                <div className="ak-grid">
                  <AkField label="If ratio goes over:" value={bo} onChange={locked ? undefined : setBo} suffix="%" tone="good" />
                  <AkField label="Boost it to:" value={bt} onChange={locked ? undefined : setBt} suffix="%" tone="good" />
                </div>
              )}
            </>
          )}
          {!locked && <Issues errors={errors} warnings={warnings} />}
          {!pair && (
            <AkNote tone="error">Automated Leverage Management can currently only be used for positions with one collateral and one debt asset.</AkNote>
          )}
          <AkNote tone="info">{automationFeeNote(b.feeBps)}</AkNote>
          <Footer b={b} blocked={blocked} onEnable={enable} />
        </div>
      )}
    </AkPanel>
  );
}

function Issues({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <ul className="lp-issues">
      {errors.map((m) => (
        <li key={m} className="bad">
          {m}
        </li>
      ))}
      {warnings.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}

/* ================= Stop Loss / Take Profit ================= */

export function ClosePanel({ owner, mode }: { owner: string | null; mode: "stop" | "take" }) {
  const kind: Kind = mode === "stop" ? "stop_loss" : "take_profit";
  const b = usePanelBase(kind, owner);
  const pair = singlePair(b.pos);
  const coll = pair?.coll.asset ?? null;
  const debt = pair?.debt.asset ?? null;
  const price = useCrossPrice(b.pool, coll, debt);
  const cc = codeOf(b.tokens, coll);
  const dc = codeOf(b.tokens, debt);
  const [trigger, setTrigger] = useState("");
  const [closeTo, setCloseTo] = useState<"collateral" | "debt" | null>(null);
  useEffect(() => {
    const c = b.active?.config;
    if (c) {
      setTrigger(String(c.price));
      setCloseTo(c.closeTo === "debt" ? "debt" : "collateral");
    }
  }, [b.active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = num(trigger);
  const health = b.pos?.health ?? null;
  // Single collateral/debt: the ratio scales with the collateral price.
  const ratioAt = health != null && price && Number.isFinite(t) ? health * (t / price) : null;
  const liqPrice = health != null && price ? price / health : null;
  const est =
    pair && Number.isFinite(t) && t > 0 && closeTo
      ? closeTo === "debt"
        ? pair.coll.collateral * t * 0.997 - pair.debt.debt
        : pair.coll.collateral - (pair.debt.debt / t) * 1.003
      : null;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!(t > 0)) errors.push(`Enter the ${cc} price that triggers the ${mode === "stop" ? "stop loss" : "take profit"}.`);
  else if (price) {
    if (mode === "stop" && t >= price) errors.push(`A stop loss needs a price below the current ${fmtPrice(price)} ${dc}.`);
    if (mode === "take" && t <= price) errors.push(`A take profit needs a price above the current ${fmtPrice(price)} ${dc}.`);
    if (mode === "stop" && liqPrice && t <= liqPrice * 1.03)
      warnings.push(`Liquidation happens at ~${fmtPrice(liqPrice)} ${dc} — a stop loss this low may come too late.`);
  }
  if (!closeTo) errors.push("Pick what to close to.");
  if (est != null && est <= 0) errors.push("At that price the position would not cover its debt.");
  const blocked = blockedReason(b, pair ? errors : ["This strategy works on one collateral and one debt asset.", ...errors]);
  const locked = !!b.active;
  const chips = mode === "stop" ? [-10, -20, -30] : [20, 50, 100];

  function enable() {
    if (!pair || !price || !closeTo) return;
    const dir = mode === "stop" ? "price_below" : "price_above";
    openEnable(b, {
      title: mode === "stop" ? "Enable Stop Loss" : "Enable Take Profit",
      kind,
      collateral: pair.coll.asset,
      debt: pair.debt.asset,
      config: { direction: mode === "stop" ? "under" : "over", price: t, closeTo, maxSlippageBps: DEFAULT_SLIP_BPS },
      rules: [
        {
          role: "close",
          target: b.pool!,
          action: "Close",
          trigger: { kind: dir, base: pair.coll.asset, quote: pair.debt.asset, value: t },
          oneShot: true,
          maxSlippageBps: DEFAULT_SLIP_BPS,
          name: mode === "stop" ? "seidar-stop-loss" : "seidar-take-profit",
        },
        approve("debt_approve", pair.debt.asset),
      ],
      rows: [
        { label: `Close when ${cc} is ${mode === "stop" ? "under" : "over"}`, value: `${fmtPrice(t)} ${dc}` },
        { label: "Current price", value: `${fmtPrice(price)} ${dc}` },
        { label: "Close to", value: closeTo === "debt" ? dc : cc },
        { label: "You receive (estimate)", value: est != null ? `~${fmtNum(est)} ${closeTo === "debt" ? dc : cc}` : "—" },
      ],
      notes: [
        `When the oracle price of ${cc} goes ${mode === "stop" ? "under" : "over"} ${fmtPrice(t)} ${dc}, the keeper repays all ${dc} debt with ${cc} collateral in one transaction${
          closeTo === "debt" ? ", selling all of it" : " and sends the remaining collateral to your smart account"
        }. It runs once; the guard requires the account to end debt-free.`,
      ],
    });
  }

  const needs = !b.account || !b.hasColl || !b.hasDebt;
  return (
    <AkPanel
      title={mode === "stop" ? "Stop Loss" : "Take Profit"}
      desc={
        mode === "stop"
          ? "Fully close your position once your collateral asset reaches the configured minimum price in case of long positions or debt asset reaches maximum price in case of short positions."
          : "Fully close your position once your collateral asset reaches the configured maximum price in case of long positions or debt asset reaches minimum price in case of short positions."
      }
      tab={b.tab}
      setTab={b.setTab}
      runs={b.runs}
    >
      {needs ? (
        <NeedsPosition b={b} needDebt what={mode === "stop" ? "Stop Loss" : "Take Profit"} />
      ) : (
        <div className="lp-config">
          {b.active && <ActiveLine a={b.active} />}
          <RatioBar current={health} marks={ratioAt != null ? [{ value: ratioAt, tone: "trigger", label: "Close at" }] : []} />
          <p className="lp-rule">
            Close if ratio {mode === "stop" ? "below" : "above"} <b>~{ratioAt != null ? pct(ratioAt) : "0%"}</b>
          </p>
          <div className="ak-grid">
            <AkSelect label="Collateral asset:" value={coll} options={coll ? [{ value: coll, label: cc, token: cc }] : []} onChange={() => {}} />
            <AkSelect label="Debt asset:" value={debt} options={debt ? [{ value: debt, label: dc, token: dc }] : []} onChange={() => {}} />
            <AkField
              label={`Price of ${cc} is ${mode === "stop" ? "under" : "over"}:`}
              value={trigger}
              onChange={locked ? undefined : setTrigger}
              suffix={dc}
              placeholder={price ? fmtPrice(price) : ""}
            />
            <AkSelect
              label="Close to:"
              value={closeTo}
              disabled={locked}
              options={[
                { value: "collateral", label: `${cc} (collateral)`, token: cc },
                { value: "debt", label: `${dc} (debt asset)`, token: dc },
              ]}
              onChange={setCloseTo}
            />
          </div>
          {est != null && est > 0 && (
            <AkNote tone="info">
              After this transaction is executed, ~{fmtNum(est)} {closeTo === "debt" ? dc : cc} will be sent to your account.
            </AkNote>
          )}
          {!locked && (
            <AkChips
              label={`${mode === "stop" ? "Stop Loss" : "Take Profit"} when ${cc} price ${mode === "stop" ? "drops" : "rises"} by:`}
              chips={chips.map((c) => ({ label: `${c > 0 ? "+" : ""}${c}%`, value: c }))}
              onPick={(c) => price && setTrigger(String(Number((price * (1 + c / 100)).toPrecision(6))))}
            />
          )}
          {!locked && <Issues errors={errors.filter((e) => !e.startsWith("Enter") || trigger !== "")} warnings={warnings} />}
          {!pair && (
            <AkNote tone="error">Stop Loss and Take Profit strategies can currently only be used for positions with one collateral and one debt asset.</AkNote>
          )}
          <AkNote tone="info">{automationFeeNote(b.feeBps)}</AkNote>
          <Footer b={b} blocked={blocked} onEnable={enable} />
        </div>
      )}
    </AkPanel>
  );
}

/* ================= Boost / Repay on Target Price ================= */

export function TargetPricePanel({ owner, mode }: { owner: string | null; mode: "boost" | "repay" }) {
  const kind: Kind = mode === "boost" ? "boost_price" : "repay_price";
  const b = usePanelBase(kind, owner);
  const pair = singlePair(b.pos);
  const coll = pair?.coll.asset ?? null;
  const debt = pair?.debt.asset ?? null;
  const price = useCrossPrice(b.pool, coll, debt);
  const cc = codeOf(b.tokens, coll);
  const dc = codeOf(b.tokens, debt);
  const [dir, setDir] = useState<"over" | "under">("over");
  const [trigger, setTrigger] = useState("");
  const [target, setTarget] = useState("");
  const [full, setFull] = useState(false);
  useEffect(() => {
    const c = b.active?.config;
    if (c) {
      setDir(c.direction === "under" ? "under" : "over");
      setTrigger(String(c.price));
      setTarget(c.targetHf != null ? (Number(c.targetHf) * 100).toFixed(2) : "");
      setFull(!!c.full);
    }
  }, [b.active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = num(trigger);
  const tg = num(target);
  const health = b.pos?.health ?? null;
  const ratioAt = health != null && price && t > 0 ? health * (t / price) : null;
  const liqPrice = health != null && price ? price / health : null;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!(t > 0)) errors.push(`Enter the ${cc} price that triggers the ${mode}.`);
  else if (price && ((dir === "over" && t <= price) || (dir === "under" && t >= price)))
    warnings.push(`${cc} is already ${dir} ${fmtPrice(t)} ${dc} — this runs right after enabling.`);
  if (mode === "boost") {
    if (!(tg >= 116)) errors.push("Boost it to must be at least 116% (the guard keeps boosts above a 110% floor).");
    else if (ratioAt != null && tg >= ratioAt * 100 - 5)
      errors.push(`At that price your ratio is ~${pct(ratioAt)} — boost to a ratio at least 5 points lower.`);
  } else if (!full) {
    if (!(tg > 0)) errors.push("Enter the ratio to repay to, or tick Repay full debt.");
    else if (ratioAt != null && tg <= ratioAt * 100 + 5)
      errors.push(`At that price your ratio is ~${pct(ratioAt)} — repay to a ratio at least 5 points higher.`);
  }
  const blocked = blockedReason(b, pair ? errors : ["This strategy works on one collateral and one debt asset.", ...errors]);
  const locked = !!b.active;

  function enable() {
    if (!pair) return;
    const trig = { kind: dir === "over" ? ("price_above" as const) : ("price_below" as const), base: pair.coll.asset, quote: pair.debt.asset, value: t };
    const rules: RuleSpec[] =
      mode === "boost"
        ? [
            { role: "boost", target: b.pool!, action: "Boost", trigger: trig, minHf: Math.max(1.1, (tg / 100) * 0.95), oneShot: true, maxSlippageBps: DEFAULT_SLIP_BPS, name: "seidar-boost-price" },
            approve("coll_approve", pair.coll.asset),
          ]
        : [
            { role: "repay", target: b.pool!, action: "Repay", trigger: trig, oneShot: true, maxSlippageBps: DEFAULT_SLIP_BPS, name: "seidar-repay-price" },
            approve("debt_approve", pair.debt.asset),
          ];
    openEnable(b, {
      title: mode === "boost" ? "Enable Boost on Target Price" : "Enable Repay on Target Price",
      kind,
      collateral: pair.coll.asset,
      debt: pair.debt.asset,
      config: { direction: dir, price: t, targetHf: full ? null : tg / 100, full: mode === "repay" && full, maxSlippageBps: DEFAULT_SLIP_BPS },
      rules,
      rows: [
        { label: `When ${cc} goes ${dir.toUpperCase()}`, value: `${fmtPrice(t)} ${dc}` },
        { label: "Current price", value: `${fmtPrice(price)} ${dc}` },
        { label: mode === "boost" ? "Boost it to" : "Repay it to", value: full ? "Full debt" : `${tg.toFixed(2)}%` },
      ],
      notes: [
        mode === "boost"
          ? `Once, when ${cc} goes ${dir} ${fmtPrice(t)} ${dc}, the keeper borrows ${dc}, buys ${cc} and adds it as collateral until your ratio is ${tg.toFixed(2)}% — never below ${pct(Math.max(1.1, (tg / 100) * 0.95))}, enforced on-chain.`
          : `Once, when ${cc} goes ${dir} ${fmtPrice(t)} ${dc}, the keeper sells ${cc} collateral to repay ${dc} ${full ? "until the debt is gone" : `until your ratio is ${tg.toFixed(2)}%`} — it can only raise your ratio, enforced on-chain.`,
      ],
    });
  }

  const needs = !b.account || !b.hasColl || !b.hasDebt;
  return (
    <AkPanel
      title={mode === "boost" ? "Boost on Target Price" : "Repay on Target Price"}
      desc={
        mode === "boost"
          ? "Increase leverage (apply Boost) on your position once the market price meets your configured threshold."
          : "Decrease leverage (apply Repay) on your position once the market price meets your configured threshold."
      }
      tab={b.tab}
      setTab={b.setTab}
      runs={b.runs}
    >
      {needs ? (
        <NeedsPosition b={b} needDebt what={mode === "boost" ? "Boost on Target Price" : "Repay on Target Price"} />
      ) : (
        <div className="lp-config">
          {b.active && <ActiveLine a={b.active} />}
          <RatioBar
            current={health}
            marks={[
              ...(ratioAt != null ? [{ value: ratioAt, tone: "trigger" as const, label: "Ratio at trigger" }] : []),
              ...(!full && tg > 0 ? [{ value: tg / 100, tone: "target" as const, label: "Target" }] : []),
            ]}
          />
          <div className="ak-grid">
            <AkSelect
              label="When price goes:"
              value={dir}
              disabled={locked}
              options={[
                { value: "over", label: "OVER" },
                { value: "under", label: "UNDER" },
              ]}
              onChange={setDir}
            />
            <div className="ak-quote">
              <span>
                Current price: <b>{fmtPrice(price)}</b> {dc}/{cc}
              </span>
              <span>
                Liquidation price: <b>{fmtPrice(liqPrice)}</b> {dc}/{cc}
              </span>
            </div>
            <AkField
              label={`Price of ${cc} is ${dir.toUpperCase()}:`}
              value={trigger}
              onChange={locked ? undefined : setTrigger}
              suffix={dc}
              placeholder={price ? fmtPrice(price) : ""}
            />
            <AkField
              label={mode === "boost" ? "Boost it to:" : "Repay it to:"}
              value={full ? "" : target}
              onChange={locked || full ? undefined : setTarget}
              suffix="%"
              disabled={full}
              tone="good"
            />
          </div>
          {mode === "repay" && (
            <AkCheck checked={full} onChange={(x) => !locked && setFull(x)}>
              Repay full debt{" "}
              <span className="ak-hint" title="Sell enough collateral to repay the whole debt; the rest of your collateral stays supplied.">
                ⓘ
              </span>
            </AkCheck>
          )}
          {!locked && <Issues errors={errors.filter((e) => !e.startsWith("Enter") || trigger !== "")} warnings={warnings} />}
          {!pair && (
            <AkNote tone="error">
              {mode === "boost" ? "Boost" : "Repay"} on Price strategy can currently only be used for positions with one collateral and one debt asset.
            </AkNote>
          )}
          <AkNote tone="info">{automationFeeNote(b.feeBps)}</AkNote>
          <Footer b={b} blocked={blocked} onEnable={enable} />
        </div>
      )}
    </AkPanel>
  );
}

/* ================= Collateral Switch ================= */

export function CollateralSwitchPanel({ owner }: { owner: string | null }) {
  const b = usePanelBase("switch", owner);
  const reserves = useReserves(b.pool, b.xoxno);
  const colls = (b.pos?.legs ?? []).filter((l) => l.collateral > 0);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [dir, setDir] = useState<"over" | "under">("over");
  const [trigger, setTrigger] = useState("");
  const [mode, setMode] = useState<"exact" | "all">("exact");
  const [amount, setAmount] = useState("");
  useEffect(() => {
    const c = b.active?.config;
    if (c) {
      setFrom(String(c.from));
      setTo(String(c.to));
      setDir(c.direction === "under" ? "under" : "over");
      setTrigger(String(c.price));
      setMode(c.amount === "all" ? "all" : "exact");
      setAmount(c.amountHuman != null ? String(c.amountHuman) : "");
      return;
    }
    if (!from && colls[0]) setFrom(colls[0].asset);
  }, [b.active?.id, colls.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const fromLeg = colls.find((l) => l.asset === from) ?? null;
  const targets = useMemo(() => reserves.filter((r) => r.asset !== from && r.cf > 0), [reserves, from]);
  useEffect(() => {
    if (to && !targets.some((r) => r.asset === to) && !b.active) setTo(null);
  }, [targets, to, b.active]);
  const toRes = targets.find((r) => r.asset === to) ?? null;
  const price = useCrossPrice(b.pool, from, to);
  const fc = codeOf(b.tokens, from);
  const tc = codeOf(b.tokens, to);
  const t = num(trigger);
  const amt = mode === "all" ? fromLeg?.collateral ?? 0 : num(amount);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!fromLeg) errors.push("Pick the collateral to switch from.");
  if (!toRes) errors.push("Pick the new collateral asset.");
  if (!(t > 0)) errors.push(`Enter the ${fc} price that triggers the switch.`);
  else if (price && ((dir === "over" && t <= price) || (dir === "under" && t >= price)))
    warnings.push(`${fc} is already ${dir} ${fmtPrice(t)} ${tc} — this runs right after enabling.`);
  if (mode === "exact" && !(amt > 0)) errors.push("Enter the amount to switch.");
  if (fromLeg && mode === "exact" && amt > fromLeg.collateral) errors.push(`You have ${fmtNum(fromLeg.collateral)} ${fc} collateral.`);
  const lowerCf = !!(fromLeg && toRes && toRes.cf < fromLeg.cf);
  const blocked = blockedReason(b, errors);
  const locked = !!b.active;

  function enable() {
    if (!fromLeg || !toRes) return;
    const base =
      mode === "all"
        ? ((BigInt(fromLeg.collateralBase) * BigInt(102)) / BigInt(100)).toString() // interest headroom
        : toBase(amount, fromLeg.decimals);
    if (!base) return;
    openEnable(b, {
      title: "Enable Collateral Switch",
      kind: "switch",
      collateral: fromLeg.asset,
      debt: toRes.asset,
      config: {
        from: fromLeg.asset,
        to: toRes.asset,
        direction: dir,
        price: t,
        amount: mode === "all" ? "all" : base,
        amountHuman: mode === "all" ? null : amt,
        maxSlippageBps: DEFAULT_SLIP_BPS,
      },
      rules: [
        {
          role: "switch",
          target: b.pool!,
          action: "Switch",
          trigger: { kind: dir === "over" ? "price_above" : "price_below", base: fromLeg.asset, quote: toRes.asset, value: t },
          asset: toRes.asset,
          maxAmount: base,
          minHf: b.hasDebt ? 1.1 : 1.05,
          oneShot: true,
          maxSlippageBps: DEFAULT_SLIP_BPS,
          name: "seidar-coll-switch",
        },
        approve("approve", toRes.asset),
      ],
      rows: [
        { label: `When ${fc} goes ${dir.toUpperCase()}`, value: `${fmtPrice(t)} ${tc}` },
        { label: "Switch", value: mode === "all" ? `All ${fc} collateral` : `${fmtNum(amt)} ${fc}` },
        { label: "Into", value: tc },
      ],
      notes: [
        `Once, when ${fc} goes ${dir} ${fmtPrice(t)} ${tc}, the keeper withdraws ${mode === "all" ? "all" : fmtNum(amt)} ${fc} collateral, swaps it to ${tc} and supplies it back as collateral in one transaction${
          b.hasDebt ? " — only if your ratio stays above 110%" : ""
        }, enforced on-chain.`,
      ],
    });
  }

  const needs = !b.account || !b.hasColl;
  return (
    <AkPanel
      title="Collateral Switch"
      desc="Automatically swap your current collateral to a different selected asset when the market price moves above or below your configured threshold."
      tab={b.tab}
      setTab={b.setTab}
      runs={b.runs}
    >
      {needs ? (
        <NeedsPosition b={b} needDebt={false} what="Collateral Switch" />
      ) : (
        <div className="lp-config">
          {b.active && <ActiveLine a={b.active} />}
          <h4 className="ak-sub">From collateral asset:</h4>
          <div className="ak-grid">
            <AkSelect
              label="From asset:"
              value={from}
              disabled={locked}
              options={colls.map((l) => ({ value: l.asset, label: codeOf(b.tokens, l.asset), token: codeOf(b.tokens, l.asset) }))}
              onChange={setFrom}
            />
            <div className="ak-quote">
              <span>
                Current price: <b>{fmtPrice(price)}</b> {to ? `${tc}/${fc}` : ""}
              </span>
            </div>
            <AkSelect
              label="When price goes"
              value={dir}
              disabled={locked}
              options={[
                { value: "over", label: "OVER" },
                { value: "under", label: "UNDER" },
              ]}
              onChange={setDir}
            />
            <AkSelect
              label="Amount to switch:"
              value={mode}
              disabled={locked}
              options={[
                { value: "exact", label: "Exact amount" },
                { value: "all", label: "All" },
              ]}
              onChange={setMode}
            />
            <AkField label={`Trigger price (${fc}):`} value={trigger} onChange={locked ? undefined : setTrigger} suffix={to ? tc : ""} />
            <AkField
              label="Amount to switch is:"
              value={mode === "all" ? fmtNum(fromLeg?.collateral ?? null) : amount}
              onChange={locked || mode === "all" ? undefined : setAmount}
              suffix={fc}
              disabled={mode === "all"}
            />
          </div>
          <h4 className="ak-sub">To new collateral asset:</h4>
          <div className="ak-grid">
            <AkSelect
              label="To asset:"
              value={to}
              disabled={locked}
              options={targets.map((r) => ({ value: r.asset, label: codeOf(b.tokens, r.asset), token: codeOf(b.tokens, r.asset) }))}
              onChange={setTo}
            />
          </div>
          {lowerCf && (
            <AkNote tone="warn">You are switching to an asset with a lower collateral factor which will affect your position&apos;s health.</AkNote>
          )}
          {!locked && <Issues errors={errors.filter((e) => !e.startsWith("Enter") || trigger !== "")} warnings={warnings} />}
          <AkNote tone="info">{automationFeeNote(b.feeBps)}</AkNote>
          <Footer b={b} blocked={blocked} onEnable={enable} />
        </div>
      )}
    </AkPanel>
  );
}
