"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { explorerTx } from "@/lib/tx";
import { TxModal, type TxSpec } from "./tx-modal";
import { automationFeeNote, automationFeeRow, useFees } from "@/lib/fees";
import { useSmartAccount } from "./smart-gate";
import {
  codeOf,
  disableAutomation,
  enableAutomation,
  pct,
  useAutomation,
  usePositionView,
  useTokens,
  useVenue,
  useVenueAccount,
  useVenueBlocked,
  useVenuePool,
  type Automation,
  NoSmartPositions,
} from "./automate-kit";

/* Liquidation Protection — hands-off, on-chain bounded.
   Works on the Blend position held by the active smart account (picked in
   the section header), or on XOXNO pages its XOXNO account. Enabling
   installs guarded keeper rules on that account (Blend: the pool + the debt
   token; XOXNO: the controller only); the Seidar guard (contracts/guard) only lets the keeper repay
   debt with collateral, only below the user's trigger, value-balanced,
   toward the target. Disable removes the rules. Everything shown is read
   back from chain + the keeper log.
   Values are Blend health factors, shown as the safety ratio (1.30 =
   130%) like every other automation panel: the bar marks liquidation at
   100%, the trigger and target (draggable) and the current ratio. */

type Leg = {
  protocol: string;
  code: string;
  pool?: string;
  suppliedUsd: number;
  borrowedUsd: number;
  supplyAmount?: number;
  borrowAmount?: number;
};
type SwapTok = { code: string; contract: string; decimals: number };

const PRESETS = [
  { id: "safe", label: "Conservative", trigger: 1.5, target: 1.8 },
  { id: "bal", label: "Balanced", trigger: 1.3, target: 1.6 },
  { id: "aggr", label: "Aggressive", trigger: 1.15, target: 1.4 },
] as const;
/* Guard install bounds (contracts/guard): trigger in (1.0, 3.0]. Seidar
   keeps a margin above liquidation and a minimum gap so a repay is
   meaningful. */
const MIN_TRIGGER = 1.05;
const MAX_TRIGGER = 2.95;
const MIN_GAP = 0.05;
const MAX_TARGET = 3;
const MIN_SLIP = 0.5;
const MAX_SLIP = 3;

/** Problems with a trigger/target/slippage choice; errors block enabling. */
export function protectionIssues(
  trigger: number,
  target: number,
  slip: number,
  health: number | null,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Number.isFinite(trigger) || trigger < MIN_TRIGGER)
    errors.push(`Repay below must be at least ${pct(MIN_TRIGGER)} — any closer to 100% leaves no room to act before liquidation.`);
  else if (trigger > MAX_TRIGGER) errors.push(`Repay below can be at most ${pct(MAX_TRIGGER)}.`);
  if (!Number.isFinite(target) || target > MAX_TARGET) errors.push(`Repay to can be at most ${pct(MAX_TARGET)}.`);
  else if (target < trigger + MIN_GAP)
    errors.push(`Repay to must be at least ${(MIN_GAP * 100).toFixed(0)} points above repay below.`);
  else if (target - trigger < 0.15)
    warnings.push("A narrow gap means small, frequent repays — each one pays network and swap fees.");
  if (!Number.isFinite(slip) || slip < MIN_SLIP || slip > MAX_SLIP)
    errors.push(`Max swap slippage must be between ${MIN_SLIP}% and ${MAX_SLIP}%.`);
  if (health != null && health < 99 && Number.isFinite(trigger) && health < trigger)
    warnings.push(`Your ratio is ${pct(health)}, already below ${pct(trigger)} — protection will act right after it's enabled.`);
  return { errors, warnings };
}
/* ---------------- Safety ratio bar ---------------- */

function HealthBar({
  current,
  trigger,
  target,
  onChange,
}: {
  current: number | null;
  trigger: number;
  target: number;
  onChange?: (v: { trigger: number; target: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lo = 0.9;
  const hi = Math.max(target + 0.6, 2.5, current != null && current < 99 ? Math.min(current, 8) * 1.12 : 0);
  const pos = (v: number) => `${(Math.min(Math.max((v - lo) / (hi - lo), 0), 1) * 100).toFixed(2)}%`;
  const at = (v: number) => Math.min(Math.max((v - lo) / (hi - lo), 0), 1) * 100;
  const gradient = `linear-gradient(90deg, var(--red) 0%, var(--red) ${at(1)}%, var(--amber) ${at(
    trigger,
  )}%, var(--green) ${Math.min(100, at(target) + 6)}%, var(--green) 100%)`;
  const drag = (which: "trigger" | "target") => (e: React.PointerEvent) => {
    if (!onChange || !ref.current) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = ref.current!.getBoundingClientRect();
      const v = Math.round((lo + ((ev.clientX - r.left) / r.width) * (hi - lo)) * 100) / 100;
      if (which === "trigger") onChange({ trigger: Math.min(Math.max(v, MIN_TRIGGER), target - 0.05), target });
      else onChange({ trigger, target: Math.max(Math.min(v, MAX_TARGET), trigger + 0.05) });
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  const shownCurrent = current != null ? (current >= 99 ? hi : Math.min(current, hi)) : null;
  return (
    <div className="hb" ref={ref}>
      <div className="hb-track" style={{ background: gradient }} />
      <span className="hb-mark hb-liq" style={{ left: pos(1) }} />
      <span className="hb-lbl hb-up hb-red" style={{ left: pos(1) }}>
        100%
      </span>
      <span
        className={`hb-mark hb-target${onChange ? " drag" : ""}`}
        style={{ left: pos(target) }}
        onPointerDown={drag("target")}
        role={onChange ? "slider" : undefined}
        aria-label="Target ratio"
        aria-valuenow={target}
      />
      <span className="hb-lbl hb-up" style={{ left: pos(target) }}>
        {pct(target)}
      </span>
      <span
        className={`hb-mark hb-trigger${onChange ? " drag" : ""}`}
        style={{ left: pos(trigger) }}
        onPointerDown={drag("trigger")}
        role={onChange ? "slider" : undefined}
        aria-label="Trigger ratio"
        aria-valuenow={trigger}
      />
      <span className="hb-bracket" style={{ left: pos(trigger), width: `calc(${pos(target)} - ${pos(trigger)})` }} />
      <span className="hb-lbl hb-down" style={{ left: pos(trigger) }}>
        {pct(trigger)}
      </span>
      {shownCurrent != null && (
        <>
          <span className="hb-mark hb-current" style={{ left: pos(shownCurrent) }} />
          {/* Above the bar (like RatioBar): the trigger label sits below. */}
          <span className="hb-lbl hb-up hb-strong" style={{ left: pos(shownCurrent) }}>
            {pct(current)}
            {current != null && current < 99 && current > hi ? "+" : ""}
          </span>
        </>
      )}
    </div>
  );
}

/* ---------------- Panel ---------------- */

export function LiquidationProtectionPanel({ owner }: { owner: string | null }) {
  const { account } = useSmartAccount();
  const { cfg, automations, runs } = useAutomation(owner);
  const [legs, setLegs] = useState<Leg[] | null>(null);
  const [health, setHealth] = useState<number | null>(null);
  const [tokens, setTokens] = useState<SwapTok[]>([]);
  const [poolName, setPoolName] = useState("");
  const [tab, setTab] = useState<"configure" | "history">("configure");
  const [preset, setPreset] = useState<string>("bal");
  const [trigger, setTrigger] = useState(1.3);
  const [target, setTarget] = useState(1.6);
  const [slip, setSlip] = useState(1.5);
  const [advanced, setAdvanced] = useState(false);
  const [txSpec, setTxSpec] = useState<TxSpec | null>(null);
  const feeBps = useFees()?.automationBps ?? null;

  const venue = useVenue();
  const isX = venue === "xoxno";
  const pool = useVenuePool(cfg);
  const venueReason = useVenueBlocked(cfg);
  const allTokens = useTokens();
  // XOXNO: the account's position as the guard prices it.
  const xView = usePositionView(isX ? account : null, isX ? pool : null, useVenueAccount());
  const xAcct = isX ? (xView.pos?.accountId ?? null) : null;
  const prot: Automation | null =
    automations.find(
      (a) =>
        a.kind === "protection" &&
        a.account === account &&
        a.pool === pool &&
        a.status === "active" &&
        (!isX || String(a.config.accountId ?? "") === xAcct),
    ) ?? null;

  useEffect(() => {
    apiFetch("/api/swap/tokens", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d?.ok && setTokens(d.tokens))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!pool || isX) return;
    apiFetch("/api/pools?protocol=blend", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const row = (d?.rows ?? []).find((x: { pool: string }) => x.pool === pool);
        if (row) setPoolName(row.poolName);
      })
      .catch(() => {});
  }, [pool, isX]);

  // XOXNO: legs + health from the guard-priced position view.
  useEffect(() => {
    if (!isX) return;
    if (!xView.loaded) {
      setLegs(null);
      setHealth(null);
      return;
    }
    const p = xView.pos;
    setLegs(
      (p?.legs ?? []).map((l) => ({
        protocol: "xoxno",
        code: codeOf(allTokens, l.asset),
        suppliedUsd: l.collateral * l.priceUsd,
        borrowedUsd: l.debt * l.priceUsd,
      })),
    );
    setHealth(p?.health ?? null);
  }, [isX, xView.pos, xView.loaded, allTokens]);

  // The active smart account's Blend position in the protectable pool.
  useEffect(() => {
    if (isX) return;
    if (!account) {
      setLegs(null);
      setHealth(null);
      return;
    }
    let dead = false;
    const read = () =>
      apiFetch(`/api/positions?address=${account}&protocol=blend`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (dead || !d?.ok) return;
          setLegs(((d.legs ?? []) as Leg[]).filter((l) => !pool || !l.pool || l.pool === pool));
          const hf = d.perProtocol?.blend?.healthFactor;
          setHealth(typeof hf === "number" ? hf : null);
        })
        .catch(() => {});
    read();
    window.addEventListener("seidar:refresh", read);
    return () => {
      dead = true;
      window.removeEventListener("seidar:refresh", read);
    };
  }, [account, pool, isX]);

  // Active protection: the bar shows its installed settings.
  useEffect(() => {
    if (!prot) return;
    setTrigger(Number(prot.config.triggerHf));
    setTarget(Number(prot.config.targetHf));
    setSlip(Number(prot.config.maxSlippageBps ?? 150) / 100);
  }, [prot?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const supplied = useMemo(() => (legs ?? []).filter((l) => l.suppliedUsd > 0.01), [legs]);
  const borrowed = useMemo(() => (legs ?? []).filter((l) => l.borrowedUsd > 0.01), [legs]);
  const collLeg = [...supplied].sort((a, b) => b.suppliedUsd - a.suppliedUsd)[0] ?? null;
  const debtLeg = [...borrowed].sort((a, b) => b.borrowedUsd - a.borrowedUsd)[0] ?? null;
  const hasPosition = !!collLeg && !!debtLeg;
  const showConfig = hasPosition || !!prot;
  const tok = (code: string) => tokens.find((t) => t.code.toUpperCase() === code.toUpperCase()) ?? null;
  const deployed = !!cfg?.deployed;
  const collCode = collLeg?.code ?? "collateral";
  const debtCode = debtLeg?.code ?? "debt";

  function pickPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    setPreset(id);
    setAdvanced(false);
    if (p) {
      setTrigger(p.trigger);
      setTarget(p.target);
    }
  }
  function onBarChange(v: { trigger: number; target: number }) {
    setTrigger(v.trigger);
    setTarget(v.target);
    setPreset("custom");
    setAdvanced(true);
  }

  const where = isX ? `XOXNO account #${xAcct ?? "—"}` : `Blend ${poolName || "pool"}`;
  function openEnable() {
    if (!account || !pool || !collLeg || !debtLeg || !owner) return;
    if (isX && !xAcct) return;
    const debt = tok(debtLeg.code);
    const coll = tok(collLeg.code);
    const slipBps = Math.round(slip * 100);
    setTxSpec({
      title: "Enable Liquidation Protection",
      context: `${where} · ${collLeg.code} / ${debtLeg.code}`,
      rows: [
        { label: "Repay when ratio is below", value: pct(trigger) },
        { label: "Repay until ratio is", value: pct(target) },
        { label: "Current ratio", value: pct(health) },
        { label: "Max swap slippage", value: `${slip.toFixed(1)}%` },
        isX
          ? { label: "Signatures", value: "1", hint: "One keeper rule on the XOXNO controller, bound to this account." }
          : { label: "Signatures", value: "2", hint: "Two keeper rules: the pool and the debt token." },
      ],
      serviceFee: automationFeeRow(feeBps),
      notes: [
        `The keeper can only sell ${collLeg.code} to repay ${debtLeg.code}, only below your trigger, and only if your ratio improves — enforced on-chain.`,
        automationFeeNote(feeBps),
      ],
      confirmLabel: "Enable",
      execute: async (onSteps) => {
        if (!debt || !coll) throw new Error("Unknown assets in the position.");
        await enableAutomation(
          {
            owner,
            account,
            kind: "protection",
            pool,
            collateral: coll.contract,
            debt: debt.contract,
            config: { triggerHf: trigger, targetHf: target, maxSlippageBps: slipBps },
            rules: [
              {
                role: "repay",
                target: pool,
                action: "Repay",
                trigger: { kind: "health_below", value: trigger },
                maxSlippageBps: slipBps,
                name: "seidar-protect",
              },
              { role: "debt_approve", target: debt.contract, action: "Approve", trigger: { kind: "always" }, name: "seidar-approve" },
            ],
            tokens: allTokens,
            xoxno: isX && xAcct ? { accountId: xAcct, hubId: xView.pos?.legs[0]?.hubId ?? 1 } : null,
          },
          onSteps,
        );
      },
    });
  }

  function openDisable() {
    if (!prot || !owner) return;
    const ownerKey = owner;
    setTxSpec({
      title: "Disable Liquidation Protection",
      context: where,
      rows: [{ label: "Signatures", value: String(prot.rules.length), hint: "Removes the keeper rules from your smart account." }],
      notes: ["Your position stays as it is; only the keeper's permission is removed."],
      confirmLabel: "Disable",
      execute: (onSteps) => disableAutomation(ownerKey, prot, onSteps),
    });
  }

  if (!owner) {
    return (
      <div className="lp">
        <div className="lp-head">
          <h3>Liquidation Protection</h3>
          <p>Connect a wallet to set up hands-off protection.</p>
        </div>
      </div>
    );
  }

  const protIds = new Set(automations.filter((a) => a.kind === "protection" && a.account === account).map((a) => a.id));
  const myRuns = runs.filter((r) => protIds.has(r.automation_id));
  const issues = protectionIssues(trigger, target, slip, health);
  const blocked = !deployed
    ? "Automation contracts are not live on mainnet yet."
    : (venueReason ?? issues.errors[0] ?? null);

  return (
    <div className="lp">
      <div className="lp-head">
        <div className="lp-titlerow">
          <h3>Liquidation Protection</h3>
          <div className="lp-tabs" role="tablist">
            {(["configure", "history"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t === "configure" ? "Configure" : `History${myRuns.length ? ` (${myRuns.length})` : ""}`}
              </button>
            ))}
          </div>
        </div>
        <p>
          Automatically repay your position to protect it from liquidation once its safety ratio drops below{" "}
          {Number.isFinite(trigger) ? pct(trigger) : "your trigger"}.
        </p>
      </div>

      {tab === "history" ? (
        <div className="lp-history">
          {myRuns.length === 0 ? (
            <p className="lp-muted">No protective actions yet. Each one shows here with its transaction.</p>
          ) : (
            myRuns.map((r) => (
              <div key={r.id} className={`lp-run st-${r.status}`}>
                <b>{r.status === "executed" ? "Repaid with collateral" : "Attempt failed"}</b>
                <span>
                  Ratio {pct(r.health_before != null ? Number(r.health_before) : null)} →{" "}
                  {pct(r.health_after != null ? Number(r.health_after) : null)}
                </span>
                <small>{new Date(r.created_at).toLocaleString()}</small>
                {r.note && <small className="lp-muted">{r.note}</small>}
                {r.tx_hash && (
                  <a href={explorerTx(r.tx_hash)} target="_blank" rel="noreferrer">
                    View transaction
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      ) : !account ? (
        <NoSmartPositions what="positions" />
      ) : account && !showConfig ? (
        <div className="lp-empty">
          <p>
            {legs == null
              ? "Reading your position…"
              : supplied.length > 0
                ? `No debt in ${isX ? "this XOXNO account" : `Blend ${poolName || "Fixed"}`} — protection watches a borrow position.`
                : `This smart account has no ${isX ? "XOXNO" : `Blend ${poolName || "Fixed"}`} position to protect yet.`}
          </p>
          <div className="lp-empty-actions">
            <Link className="btn primary" href={`/markets/${venue}/create`}>
              Open a position
            </Link>
          </div>
        </div>
      ) : null}

      {tab === "configure" && showConfig && (
        <div className="lp-config">
          {prot && (
            <p className="lp-status">
              <span className="lp-dot" /> Active · last check{" "}
              {prot.last_check_at ? new Date(prot.last_check_at).toLocaleTimeString() : "pending"}
              {prot.last_note ? ` · ${prot.last_note}` : ""}
            </p>
          )}
          <HealthBar
            current={health}
            trigger={Math.min(Math.max(Number.isFinite(trigger) ? trigger : MIN_TRIGGER, MIN_TRIGGER), MAX_TRIGGER)}
            target={Math.min(Math.max(Number.isFinite(target) ? target : MIN_TRIGGER + MIN_GAP, MIN_TRIGGER + MIN_GAP), MAX_TARGET)}
            onChange={prot ? undefined : onBarChange}
          />
          <p className="lp-rule">
            <span>Liquidation protection:</span> If below <b>{pct(trigger)}</b> repay to <b>{pct(target)}</b>
          </p>
          {!prot && (
            <>
              <div className="lp-presets" role="radiogroup">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    role="radio"
                    aria-checked={preset === p.id && !advanced}
                    className={`lp-preset${preset === p.id && !advanced ? " on" : ""}`}
                    onClick={() => pickPreset(p.id)}
                  >
                    <b>{p.label}</b>
                    <small>
                      {pct(p.trigger, 0)} → {pct(p.target, 0)}
                    </small>
                  </button>
                ))}
                <button className={`lp-preset${advanced ? " on" : ""}`} onClick={() => setAdvanced((v) => !v)}>
                  <b>Advanced</b>
                  <small>Exact values</small>
                </button>
              </div>
              {advanced && (
                <div className="lp-form">
                  <label>
                    <span>
                      Repay below (%) <small>{pct(MIN_TRIGGER, 0)}–{pct(MAX_TRIGGER, 0)}</small>
                    </span>
                    <input
                      type="number"
                      step="1"
                      min={MIN_TRIGGER * 100}
                      max={MAX_TRIGGER * 100}
                      value={Number.isFinite(trigger) ? Number((trigger * 100).toFixed(2)) : ""}
                      onChange={(e) => onBarChange({ trigger: e.target.value === "" ? NaN : Number(e.target.value) / 100, target })}
                    />
                  </label>
                  <label>
                    <span>
                      Repay to (%) <small>up to {pct(MAX_TARGET, 0)}</small>
                    </span>
                    <input
                      type="number"
                      step="1"
                      min={(MIN_TRIGGER + MIN_GAP) * 100}
                      max={MAX_TARGET * 100}
                      value={Number.isFinite(target) ? Number((target * 100).toFixed(2)) : ""}
                      onChange={(e) => onBarChange({ trigger, target: e.target.value === "" ? NaN : Number(e.target.value) / 100 })}
                    />
                  </label>
                  <label>
                    <span>
                      Max swap slippage (%) <small>{MIN_SLIP}–{MAX_SLIP}%</small>
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      min={MIN_SLIP}
                      max={MAX_SLIP}
                      value={Number.isFinite(slip) ? slip : ""}
                      onChange={(e) => setSlip(e.target.value === "" ? NaN : Number(e.target.value))}
                    />
                  </label>
                </div>
              )}
              {(issues.errors.length > 0 || issues.warnings.length > 0) && (
                <ul className="lp-issues">
                  {issues.errors.map((m) => (
                    <li key={m} className="bad">
                      {m}
                    </li>
                  ))}
                  {issues.warnings.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
            </>
          )}
          <p className="lp-info">
            Once your safety ratio drops below {pct(trigger)}, Seidar sells {collCode} to repay {debtCode} in one
            transaction until the ratio is back at {pct(target)}. Your smart account never needs your signature at that
            moment — the keeper can only act inside these limits, enforced on-chain.
          </p>
          <p className="lp-info">{automationFeeNote(feeBps)}</p>
          <div className="lp-actions">
            {prot ? (
              <button className="btn" onClick={openDisable}>
                Disable automation
              </button>
            ) : (
              <button
                className="btn primary"
                disabled={blocked != null}
                title={blocked ?? undefined}
                onClick={openEnable}
              >
                Enable automation
              </button>
            )}
          </div>
        </div>
      )}
      <TxModal spec={txSpec} onClose={() => setTxSpec(null)} />
    </div>
  );
}

/* Manage card "Automations" tab: every active automation on the active
   smart account, in plain words. */
const KIND_NAME: Record<string, string> = {
  protection: "Liquidation Protection",
  leverage: "Automated Leverage Management",
  stop_loss: "Stop Loss",
  take_profit: "Take Profit",
  boost_price: "Boost on Target Price",
  repay_price: "Repay on Target Price",
  switch: "Collateral Switch",
  limit: "Limit order",
  lp_compound: "Auto-compound AQUA rewards",
  lp_exit: "LP stop loss",
};

function summary(a: Automation, code: (c: string) => string): string {
  const c = a.config;
  const n = (k: string) => Number(c[k]);
  switch (a.kind) {
    case "protection":
      return `Repay below ${pct(n("triggerHf"))} → ${pct(n("targetHf"))}`;
    case "leverage":
      return `Repay below ${pct(n("triggerHf"))} → ${pct(n("targetHf"))}${c.boostEnabled ? ` · boost over ${pct(n("boostOver"))} → ${pct(n("boostTo"))}` : ""}`;
    case "stop_loss":
    case "take_profit":
      return `Close when ${code(a.collateral)} is ${c.direction} ${c.price} ${code(a.debt)} · to ${c.closeTo === "debt" ? code(a.debt) : code(a.collateral)}`;
    case "boost_price":
    case "repay_price":
      return `When ${code(a.collateral)} goes ${c.direction} ${c.price} ${code(a.debt)} → ${c.full ? "repay all debt" : pct(n("targetHf"))}`;
    case "switch":
      return `${code(String(c.from))} → ${code(String(c.to))} when price goes ${c.direction} ${c.price}`;
    case "limit":
      return `Sell ${c.sellCode} for ${c.buyCode} at ≥ ${c.limitPrice ?? "your limit"}`;
    case "lp_compound":
      return `Compound when rewards reach ${c.minRewardUsd ?? 1}`;
    case "lp_exit":
      return `Exit when ${c.baseCode ?? "price"} goes ${c.direction} ${c.price} ${c.quoteCode ?? ""}`;
    default:
      return a.kind;
  }
}

export function AutomationSummary({ owner, onSetup }: { owner: string | null; onSetup: () => void }) {
  const { account } = useSmartAccount();
  const { automations, cfg } = useAutomation(owner);
  const tokens = useTokens();
  const mine = automations.filter((a) => a.status === "active" && a.account === account);
  if (mine.length === 0)
    return (
      <div className="as-empty">
        <p>{cfg == null ? "Checking automations…" : "No automation on this smart account yet."}</p>
        <button type="button" className="btn" onClick={onSetup}>
          Set up automation
        </button>
      </div>
    );
  return (
    <div className="as-list">
      {mine.map((a) => (
        <div key={a.id} className="as-row">
          <div>
            <b>{KIND_NAME[a.kind] ?? a.kind}</b>
            <small>{summary(a, (c) => codeOf(tokens, c))}</small>
          </div>
          <span className="as-live">
            <span className="lp-dot" /> Active
          </span>
          <small className="as-check">
            Last check {a.last_check_at ? new Date(a.last_check_at).toLocaleTimeString() : "pending"}
            {a.last_health != null ? ` · ratio ${pct(Number(a.last_health))}` : ""}
            {a.last_note ? ` · ${a.last_note}` : ""}
          </small>
        </div>
      ))}
      <button type="button" className="btn" onClick={onSetup}>
        Manage automation
      </button>
    </div>
  );
}
