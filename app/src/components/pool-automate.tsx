"use client";

/* Pool page > Automate (Aqua pools): hands-off automations on the smart
   account's liquidity, bounded on-chain by the Seidar guard
   (contracts/guard Compound / LpExit, contracts/SECURITY.md):
     Auto-compound  claim the pool's AQUA rewards, swap them into the pool's
                    tokens and deposit them back, once they're worth the
                    owner's minimum, at most once per the owner's interval.
     LP stop loss   withdraw all the liquidity once the oracle price crosses
                    the owner's level (one-shot); minimums are pro-rata. */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { automationFeeNote, automationFeeRow, useFees } from "@/lib/fees";
import { TxModal, type TxSpec } from "./tx-modal";
import { useSmartAccount } from "./smart-gate";
import { TokenIcon } from "./token-icon";
import {
  ActiveLine,
  AkChips,
  AkField,
  AkNote,
  AkPanel,
  AkSelect,
  codeOf,
  disableAutomation,
  enableAutomation,
  fmtPrice,
  useAutomation,
  useTokens,
  type Automation,
  type RuleSpec,
} from "./automate-kit";

/** Reflector's Stellar feed (base USDC): the oracle LP rules price with. */
const LP_ORACLE = "CALI2BYU2JE6WVRUFYTS6MSBNEHGJ35P4AVCZYF3B6QOE3QKOB2PLE6M";
const AQUA = "CAUIKL3IYGMERDRUN6YSCLWVAKIFG5Q4YJHUKM4S4NJZQIA3BAS6OJPK";
const STABLE = new Set(["USDC", "EURC", "PYUSD", "USDT0", "USDGLO", "OUSD", "USDY", "USTRY", "CETES"]);
const INTERVALS = [
  { value: "720", label: "Every hour" },
  { value: "4320", label: "Every 6 hours" },
  { value: "17280", label: "Every day" },
];

type PoolInfo = { tokens: string[]; shareToken: string };
type Lp = { shares: string; underlying: string[]; rewards: string | null };

function usePoolBase(pool: string, kind: "lp_compound" | "lp_exit") {
  const { owner, account } = useSmartAccount();
  const { cfg, automations, runs } = useAutomation(owner);
  const tokens = useTokens();
  const feeBps = useFees()?.automationBps ?? null;
  const [info, setInfo] = useState<PoolInfo | null>(null);
  const [lp, setLp] = useState<Lp | null>(null);
  const [tab, setTab] = useState<"configure" | "history">("configure");
  const [spec, setSpec] = useState<TxSpec | null>(null);
  useEffect(() => {
    apiFetch(`/api/dex/aqua/pool?pool=${pool}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d?.ok && setInfo({ tokens: d.tokens, shareToken: d.shareToken }))
      .catch(() => {});
  }, [pool]);
  useEffect(() => {
    if (!account) return setLp(null);
    const load = () =>
      apiFetch(`/api/dex/position?protocol=aqua&pool=${pool}&address=${account}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => setLp(d?.ok ? d : null))
        .catch(() => setLp(null));
    load();
    window.addEventListener("seidar:refresh", load);
    return () => window.removeEventListener("seidar:refresh", load);
  }, [account, pool]);
  const active = automations.find((a) => a.kind === kind && a.account === account && a.pool === pool && a.status === "active") ?? null;
  const ids = new Set(automations.filter((a) => a.kind === kind && a.account === account && a.pool === pool).map((a) => a.id));
  const hasLp = !!lp && BigInt(lp.shares || "0") > BigInt(0);
  const blocked = !owner
    ? "Connect a wallet."
    : !account
      ? "You have no liquidity to automate yet — automations watch the liquidity in your Smart Account."
      : !cfg
        ? "Loading…"
        : !cfg.deployed
          ? "Automation contracts are not live on mainnet yet."
          : !info
            ? "Reading the pool…"
            : !hasLp
              ? "Add liquidity to this pool from your smart account first."
              : null;
  return { owner, account, cfg, tokens, feeBps, info, lp, hasLp, tab, setTab, spec, setSpec, active, runs: runs.filter((r) => ids.has(r.automation_id)), blocked };
}
type Base = ReturnType<typeof usePoolBase>;

function disable(b: Base) {
  const a = b.active as Automation;
  if (!a || !b.owner) return;
  const owner = b.owner;
  b.setSpec({
    title: "Disable automation",
    context: "Aqua pool",
    rows: [{ label: "Signatures", value: String(a.rules.length), hint: "Removes each keeper rule from your smart account." }],
    notes: ["Your liquidity stays as it is; only the keeper's permission is removed."],
    confirmLabel: "Disable",
    execute: (onSteps) => disableAutomation(owner, a, onSteps),
  });
}

function Footer({ b, blocked, onEnable }: { b: Base; blocked: string | null; onEnable: () => void }) {
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
      <TxModal spec={b.spec} onClose={() => b.setSpec(null)} />
    </>
  );
}

/* ================= Auto-compound ================= */

function CompoundPanel({ pool, pair }: { pool: string; pair: string }) {
  const b = usePoolBase(pool, "lp_compound");
  const [minUsd, setMinUsd] = useState("5");
  const [every, setEvery] = useState("17280");
  const [slip, setSlip] = useState("1.5");
  useEffect(() => {
    const c = b.active?.config;
    if (c) {
      setMinUsd(String(c.minRewardUsd ?? 5));
      setEvery(String(c.cooldownLedgers ?? 17280));
      setSlip(String(Number(c.maxSlippageBps ?? 150) / 100));
    }
  }, [b.active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = b.lp?.rewards != null ? Number(b.lp.rewards) / 1e7 : null;
  const min = Number(minUsd);
  const slipBps = Math.round(Number(slip) * 100);
  const errors: string[] = [];
  if (!(min >= 1)) errors.push("Compound at $1 of rewards or more — smaller runs lose most of it to swap costs.");
  if (!(slipBps >= 10 && slipBps <= 300)) errors.push("Max swap slippage must be between 0.1% and 3%.");
  const blocked = b.blocked ?? errors[0] ?? null;
  const locked = !!b.active;
  const others = (b.info?.tokens ?? []).filter((t) => t !== AQUA);

  function enable() {
    if (!b.owner || !b.account || !b.info) return;
    const common = {
      action: "Compound" as const,
      trigger: { kind: "always" as const },
      asset: LP_ORACLE,
      maxSlippageBps: slipBps,
      cooldownLedgers: Number(every),
      name: "seidar-lp-compound",
    };
    const rules: (RuleSpec & { role: string })[] = [
      { ...common, role: "lp_pool", target: pool },
      { ...common, role: "lp_reward", target: AQUA },
      ...others.map((t) => ({ ...common, role: "lp_token", target: t })),
    ];
    const owner = b.owner;
    const account = b.account;
    const info = b.info;
    b.setSpec({
      title: "Enable auto-compound",
      context: `${pair} · Aqua`,
      rows: [
        { label: "Compound when rewards reach", value: `$${min}` },
        { label: "At most", value: INTERVALS.find((i) => i.value === every)?.label.toLowerCase() ?? "" },
        { label: "Max swap slippage", value: `${slip}%` },
        { label: "Signatures", value: String(rules.length), hint: "Keeper rules: the pool, AQUA and each pool token." },
      ],
      serviceFee: automationFeeRow(b.feeBps),
      notes: [
        "The keeper can only claim this pool's AQUA, swap what it just claimed into the pool's tokens and deposit them back into the same pool — your LP shares must grow, enforced on-chain.",
        automationFeeNote(b.feeBps),
      ],
      confirmLabel: "Enable",
      execute: async (onSteps) => {
        await enableAutomation(
          {
            owner,
            account,
            kind: "lp_compound",
            pool,
            collateral: info.tokens[0],
            debt: info.tokens[1] ?? info.tokens[0],
            config: { minRewardUsd: min, cooldownLedgers: Number(every), maxSlippageBps: slipBps },
            rules,
            tokens: b.tokens,
          },
          onSteps,
        );
      },
    });
  }

  return (
    <AkPanel
      title="Auto-compound AQUA rewards"
      desc="Claim this pool's AQUA rewards, swap them into the pool's tokens and add them back as liquidity — your position grows without you signing each time."
      tab={b.tab}
      setTab={b.setTab}
      runs={b.runs}
    >
      <div className="lp-config">
        {b.active && <ActiveLine a={b.active} />}
        <div className="lp-rule">
          <span>Pending rewards:</span>{" "}
          <b className="pa-reward">
            <TokenIcon symbol="AQUA" size={16} /> {pending != null ? pending.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"} AQUA
          </b>
          {others.length > 0 && <> → swapped into {others.map((t) => codeOf(b.tokens, t)).join(" + ")} and deposited</>}
        </div>
        <div className="ak-grid">
          <AkField label="Compound when rewards reach:" value={minUsd} onChange={locked ? undefined : setMinUsd} suffix="USD" tone="good" />
          <AkSelect label="At most:" value={every} disabled={locked} options={INTERVALS} onChange={setEvery} />
          <AkField label="Max swap slippage:" value={slip} onChange={locked ? undefined : setSlip} suffix="%" />
        </div>
        {!locked && errors.length > 0 && (
          <ul className="lp-issues">
            {errors.map((m) => (
              <li key={m} className="bad">
                {m}
              </li>
            ))}
          </ul>
        )}
        <AkNote tone="info">{automationFeeNote(b.feeBps)}</AkNote>
        <Footer b={b} blocked={blocked} onEnable={enable} />
      </div>
    </AkPanel>
  );
}

/* ================= LP stop loss ================= */

function ExitPanel({ pool, pair }: { pool: string; pair: string }) {
  const b = usePoolBase(pool, "lp_exit");
  const toks = b.info?.tokens ?? [];
  const code = (c: string) => codeOf(b.tokens, c);
  // Default: price of the volatile token in the stable one.
  const defBase = toks.find((t) => !STABLE.has(code(t))) ?? toks[0] ?? null;
  const defQuote = toks.find((t) => t !== defBase) ?? null;
  const [base, setBase] = useState<string | null>(null);
  const [dir, setDir] = useState<"under" | "over">("under");
  const [trigger, setTrigger] = useState("");
  const [slip, setSlip] = useState("1.5");
  const [price, setPrice] = useState<number | null>(null);
  const [priceErr, setPriceErr] = useState<string | null>(null);
  const b0 = base ?? defBase;
  const q0 = b0 ? toks.find((t) => t !== b0) ?? defQuote : null;
  useEffect(() => {
    const c = b.active?.config;
    if (c) {
      setBase(String(c.base));
      setDir(c.direction === "over" ? "over" : "under");
      setTrigger(String(c.price));
      setSlip(String(Number(c.maxSlippageBps ?? 150) / 100));
    }
  }, [b.active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!b0 || !q0) return;
    setPrice(null);
    setPriceErr(null);
    let dead = false;
    // A dropped request (API restart, RPC hiccup) retries; a missing
    // Reflector feed is final and says which token has none.
    const load = (tries: number) =>
      apiFetch(`/api/dex/lp-price?base=${b0}&quote=${q0}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (dead) return;
          if (d?.ok) return setPrice(Number(d.price));
          if (d?.error === "no-feed" && Array.isArray(d.missing)) {
            const names = (d.missing as string[]).map(code).join(" and ");
            return setPriceErr(`Reflector, the oracle the guard checks on-chain, has no price feed for ${names} — so a stop loss can't watch this pool.`);
          }
          throw new Error(String(d?.error ?? "no price"));
        })
        .catch(() => {
          if (dead) return;
          if (tries > 0) setTimeout(() => !dead && load(tries - 1), 1500);
          else setPriceErr("Couldn't read the oracle price right now — reload the page to try again.");
        });
    load(3);
    return () => {
      dead = true;
    };
  }, [b0, q0]); // eslint-disable-line react-hooks/exhaustive-deps
  const t = Number(trigger);
  const slipBps = Math.round(Number(slip) * 100);
  const errors: string[] = [];
  if (priceErr) errors.push(priceErr);
  if (!(t > 0)) errors.push(`Enter the ${b0 ? code(b0) : ""} price that triggers the exit.`);
  else if (price != null && ((dir === "under" && t >= price) || (dir === "over" && t <= price)))
    errors.push(`${b0 ? code(b0) : ""} is already ${dir} ${fmtPrice(t)} — pick a level the price hasn't reached.`);
  if (!(slipBps >= 10 && slipBps <= 300)) errors.push("Max slippage must be between 0.1% and 3%.");
  const blocked = b.blocked ?? errors[0] ?? null;
  const locked = !!b.active;

  function enable() {
    if (!b.owner || !b.account || !b.info || !b0 || !q0) return;
    const common = {
      action: "LpExit" as const,
      trigger: { kind: dir === "under" ? ("price_below" as const) : ("price_above" as const), base: b0, quote: q0, value: t },
      asset: LP_ORACLE,
      maxSlippageBps: slipBps,
      oneShot: true,
      name: "seidar-lp-exit",
    };
    const rules: (RuleSpec & { role: string })[] = [
      { ...common, role: "lp_exit", target: pool },
      { ...common, role: "lp_share", target: b.info.shareToken },
    ];
    const owner = b.owner;
    const account = b.account;
    const info = b.info;
    b.setSpec({
      title: "Enable LP stop loss",
      context: `${pair} · Aqua`,
      rows: [
        { label: `Exit when ${code(b0)} goes ${dir}`, value: `${fmtPrice(t)} ${code(q0)}` },
        { label: "Current price", value: `${fmtPrice(price)} ${code(q0)}` },
        { label: "Max slippage", value: `${slip}%` },
        { label: "Signatures", value: "2", hint: "Keeper rules: the pool and its LP share token." },
      ],
      notes: [
        "Once, when the oracle price crosses your level, the keeper withdraws all your liquidity to your smart account — each token at least its pro-rata share minus your slippage, enforced on-chain.",
      ],
      confirmLabel: "Enable",
      execute: async (onSteps) => {
        await enableAutomation(
          {
            owner,
            account,
            kind: "lp_exit",
            pool,
            collateral: info.tokens[0],
            debt: info.tokens[1] ?? info.tokens[0],
            config: { base: b0, quote: q0, baseCode: code(b0), quoteCode: code(q0), price: t, direction: dir, maxSlippageBps: slipBps },
            rules,
            tokens: b.tokens,
          },
          onSteps,
        );
      },
    });
  }

  const chips = dir === "under" ? [-5, -10, -20] : [10, 25, 50];
  return (
    <AkPanel
      title="LP stop loss"
      desc="Withdraw all your liquidity from this pool once a token's price crosses your level — the tokens come back to your smart account."
      tab={b.tab}
      setTab={b.setTab}
      runs={b.runs}
    >
      <div className="lp-config">
        {b.active && <ActiveLine a={b.active} />}
        <div className="ak-grid">
          <AkSelect
            label="Watch price of:"
            value={b0}
            disabled={locked}
            options={toks.map((x) => ({ value: x, label: code(x), token: code(x) }))}
            onChange={(v) => {
              setBase(v);
              setTrigger("");
            }}
          />
          <div className="ak-quote">
            <span>
              Current price: <b>{fmtPrice(price)}</b> {q0 ? code(q0) : ""}
            </span>
            <span>Reflector oracle</span>
          </div>
          <AkSelect
            label="Exit when price goes:"
            value={dir}
            disabled={locked}
            options={[
              { value: "under", label: "UNDER" },
              { value: "over", label: "OVER" },
            ]}
            onChange={(v) => {
              setDir(v);
              setTrigger("");
            }}
          />
          <AkField
            label={`Price of ${b0 ? code(b0) : ""} is ${dir.toUpperCase()}:`}
            value={trigger}
            onChange={locked ? undefined : setTrigger}
            suffix={q0 ? code(q0) : ""}
            placeholder={price ? fmtPrice(price) : ""}
          />
          <AkField label="Max slippage:" value={slip} onChange={locked ? undefined : setSlip} suffix="%" />
        </div>
        {!locked && price != null && (
          <AkChips
            label={`Exit when ${b0 ? code(b0) : ""} ${dir === "under" ? "drops" : "rises"} by:`}
            chips={chips.map((c) => ({ label: `${c > 0 ? "+" : ""}${c}%`, value: c }))}
            onPick={(c) => setTrigger(String(Number((price * (1 + c / 100)).toPrecision(6))))}
          />
        )}
        {!locked && errors.filter((e) => !e.startsWith("Enter") || trigger !== "").length > 0 && (
          <ul className="lp-issues">
            {errors
              .filter((e) => !e.startsWith("Enter") || trigger !== "")
              .map((m) => (
                <li key={m} className="bad">
                  {m}
                </li>
              ))}
          </ul>
        )}
        <AkNote tone="info">No Seidar fee on an exit: nothing is swapped. The keeper pays the network fee.</AkNote>
        <Footer b={b} blocked={blocked} onEnable={enable} />
      </div>
    </AkPanel>
  );
}

/* ================= Section ================= */

const STRATS = [
  {
    id: "compound",
    name: "Auto-compound rewards",
    icon: (
      <>
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </>
    ),
  },
  {
    id: "exit",
    name: "LP stop loss",
    icon: (
      <>
        <polyline points="3 5 9 11 13 8 21 16" />
        <line x1="3" y1="20" x2="21" y2="20" />
      </>
    ),
  },
] as const;

export function PoolAutomate({ pool, pair }: { pool: string; pair: string }) {
  const [picked, setPicked] = useState<"compound" | "exit">("compound");
  return (
    <div className="at-grid pa-grid">
      <div className="at-list" role="tablist" aria-label="Pool automations">
        {STRATS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={picked === s.id}
            className={`at-item${picked === s.id ? " active" : ""}`}
            onClick={() => setPicked(s.id)}
          >
            <span className="at-ico" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {s.icon}
              </svg>
            </span>
            {s.name}
          </button>
        ))}
      </div>
      <div className="at-main lp-host">
        {picked === "compound" ? <CompoundPanel key="c" pool={pool} pair={pair} /> : <ExitPanel key="e" pool={pool} pair={pair} />}
      </div>
    </div>
  );
}
