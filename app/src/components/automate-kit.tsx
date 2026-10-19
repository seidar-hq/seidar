"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { explorerTx, signAndSend, type TxStep } from "@/lib/tx";
import { TokenIcon } from "./token-icon";
import { smartGate, useSmartAccount } from "./smart-gate";

/* Shared pieces for the hands-off automation panels (automate.tsx,
   automate-strategies.tsx, the Exchange limit order).

   Every automation = keeper rules on the active smart account (OZ context
   rules guarded by contracts/guard, one owner signature each) + a row the
   keeper watches. Enabling signs each rule, then registers (the API checks
   the rules on chain); disabling removes each rule, then stops the row.
   Ratios are health factors shown as % (1.6667 = 166.67%), priced exactly
   like the guard: the Blend pool oracle, or for XOXNO the controller and
   XOXNO's price aggregator. The panels run on the venue of the page they sit
   on (AutomationVenue): on XOXNO every rule targets the XOXNO controller,
   carries the XOXNO account id, and needs no approve rule. */

export type AutoCfg = {
  deployed: boolean;
  /** Blend pools the flash-loan automations can run on now (status <= 1). */
  supportedPools: string[];
  /** Every Blend pool with its on-chain status (0-1 active, 2-3 on ice,
   *  4-5 frozen, 6 setup). */
  blendPools?: BlendPool[];
  keeper: string | null;
  router: string;
  ledger: number | null;
  /** XOXNO lending automations (mainnet). */
  xoxno?: { controller: string; supported: boolean };
};

export type BlendPool = { address: string; name: string; status: number | null };

/** Which lending venue the automation panels act on. */
export type Venue = "blend" | "xoxno";
const VenueCtx = createContext<{ venue: Venue; accountId: string | null; pool: string | null }>({
  venue: "blend",
  accountId: null,
  pool: null,
});
/** `accountId`: the XOXNO account the panels automate (null = the API's
 *  default: the smart account's first one with debt). `pool`: the Blend
 *  pool of the market page (null = the first pool automations run on). */
export function AutomationVenue({
  venue,
  accountId = null,
  pool = null,
  children,
}: {
  venue: Venue;
  accountId?: string | null;
  pool?: string | null;
  children: ReactNode;
}) {
  return <VenueCtx.Provider value={{ venue, accountId, pool }}>{children}</VenueCtx.Provider>;
}
export const useVenue = () => useContext(VenueCtx).venue;
export const useVenueAccount = () => useContext(VenueCtx).accountId;
/** The pool the venue's automations run on: the market page's Blend pool
 *  (else the first one that allows them), or the XOXNO controller. */
export function venuePool(cfg: AutoCfg | null, venue: Venue, pagePool: string | null = null): string | null {
  if (venue === "xoxno") return cfg?.xoxno?.supported ? cfg.xoxno.controller : null;
  return pagePool ?? cfg?.supportedPools[0] ?? null;
}
export function useVenuePool(cfg: AutoCfg | null): string | null {
  const { venue, pool } = useContext(VenueCtx);
  return venuePool(cfg, venue, pool);
}

/** Why a Blend pool's status stops the flash-loan automations (null = it doesn't). */
export function blendStatusNote(status: number | null | undefined): string | null {
  if (status == null) return "This market's status couldn't be read, so automations stay off until it is.";
  if (status <= 1) return null;
  const what = status <= 3 ? "on ice" : status <= 5 ? "frozen" : "still in setup";
  return `This market is ${what}: Blend blocks borrowing here, and these automations start with a flash loan, which Blend counts as borrowing. Your safety ratio alerts still run.`;
}

/** Why the venue can't automate yet (null = it can). */
export function venueBlocked(cfg: AutoCfg | null, venue: Venue, pagePool: string | null = null): string | null {
  if (venue === "xoxno" && cfg && !cfg.xoxno?.supported) return "XOXNO is mainnet only — turn Testnet mode off to automate it.";
  if (venue === "blend" && cfg) {
    const pool = venuePool(cfg, venue, pagePool);
    if (!pool) return "No Blend market allows these automations right now.";
    const info = cfg.blendPools?.find((p) => p.address === pool);
    if (info) return blendStatusNote(info.status);
  }
  return null;
}
export function useVenueBlocked(cfg: AutoCfg | null): string | null {
  const { venue, pool } = useContext(VenueCtx);
  return venueBlocked(cfg, venue, pool);
}

/**
 * The Blend pool a market page automates: of the market's pools (same-name
 * group, or every pool without a market), the one where the account holds
 * debt, else any position, else one that allows automations, else the first.
 */
export function useBlendAutoPool(cfg: AutoCfg | null, account: string | null, market: string | null) {
  const [legPools, setLegPools] = useState<{ debt: string[]; any: string[] }>({ debt: [], any: [] });
  useEffect(() => {
    if (!account) {
      setLegPools({ debt: [], any: [] });
      return;
    }
    let dead = false;
    apiFetch(`/api/positions?address=${account}&protocol=blend`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (dead || !d?.ok) return;
        const legs = (d.legs ?? []) as { pool?: string; borrowedUsd?: number; suppliedUsd?: number }[];
        const debt = [...new Set(legs.filter((l) => l.pool && (l.borrowedUsd ?? 0) > 0.01).map((l) => l.pool as string))];
        const any = [...new Set(legs.filter((l) => l.pool).map((l) => l.pool as string))];
        setLegPools({ debt, any });
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [account]);
  const all = cfg?.blendPools ?? [];
  const candidates = market ? all.filter((p) => p.name === market) : all;
  const pick =
    candidates.find((p) => legPools.debt.includes(p.address)) ??
    candidates.find((p) => legPools.any.includes(p.address)) ??
    candidates.find((p) => p.status != null && p.status <= 1) ??
    candidates[0] ??
    null;
  return { pool: pick, candidates, withPosition: candidates.filter((p) => legPools.any.includes(p.address)) };
}
export type Automation = {
  id: number;
  account: string;
  kind: string;
  pool: string;
  collateral: string;
  debt: string;
  config: Record<string, unknown>;
  rules: { id: number; role: string; target: string }[];
  status: string;
  last_check_at: string | null;
  last_health: string | null;
  last_note: string;
  created_at: string;
};
export type AutoRun = {
  id: number;
  automation_id: number;
  kind: string;
  health_before: string | null;
  health_after: string | null;
  tx_hash: string | null;
  status: string;
  note: string;
  created_at: string;
};
export type PosLeg = {
  asset: string;
  /** XOXNO: the liquidity hub the leg sits in. */
  hubId?: number;
  decimals: number;
  priceUsd: number;
  cf: number;
  lf: number;
  collateral: number;
  debt: number;
  collateralBase: string;
  debtBase: string;
};
export type PositionView = {
  pool: string;
  account: string;
  health: number | null;
  collateralUsd: number;
  debtUsd: number;
  legs: PosLeg[];
  /** XOXNO: the lending account (position NFT) and its risk spoke. */
  accountId?: string;
  spokeId?: number;
};
export type Tok = { code: string; contract: string; decimals: number };
export type Reserve = { asset: string; cf: number; lf: number; decimals: number };

/** A keeper rule as the API's /automation/rule/build expects it (+ role). */
export type RuleSpec = {
  role: string;
  target: string;
  action: "Repay" | "Boost" | "Close" | "Switch" | "Approve" | "Swap" | "Compound" | "LpExit";
  trigger:
    | { kind: "always" }
    | { kind: "health_below" | "health_above"; value: number }
    | { kind: "price_below" | "price_above"; base: string; quote: string; value: number };
  asset?: string;
  minHf?: number;
  maxAmount?: string;
  minRate?: string;
  maxSlippageBps?: number;
  oneShot?: boolean;
  /** Ledgers between two actions (Compound: at least 720). */
  cooldownLedgers?: number;
  validUntil?: number | null;
  /** XOXNO rules: the account id (set by enableAutomation). */
  xoxnoAccount?: string;
  name: string;
};

export const DEFAULT_SLIP_BPS = 200;

async function postJson<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const r = await apiFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await r.json()) as T;
}

/* ---------------- data hooks ---------------- */

export function useAutomation(owner: string | null) {
  const [cfg, setCfg] = useState<AutoCfg | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<AutoRun[]>([]);
  const reload = useCallback(async () => {
    try {
      const c = await apiFetch("/api/automation/config", { cache: "no-store" }).then((r) => r.json());
      if (c?.ok) setCfg(c as AutoCfg);
      if (!owner) return;
      const s = await apiFetch(`/api/automation/state?owner=${owner}`, { cache: "no-store" }).then((r) => r.json());
      if (s?.ok) {
        setAutomations(s.automations ?? []);
        setRuns(s.runs ?? []);
      }
    } catch {
      /* keep last */
    }
  }, [owner]);
  useEffect(() => {
    reload();
    const t = setInterval(reload, 30_000);
    window.addEventListener("seidar:refresh", reload);
    return () => {
      clearInterval(t);
      window.removeEventListener("seidar:refresh", reload);
    };
  }, [reload]);
  return { cfg, automations, runs, reload };
}

/** The account's Blend position as the guard prices it. */
export type XoxnoAccountRef = { accountId: string; spokeId: number; hubId: number; hasDebt: boolean };

export function usePositionView(account: string | null, pool: string | null, accountId?: string | null) {
  const [pos, setPos] = useState<PositionView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [xoxnoAccounts, setXoxnoAccounts] = useState<XoxnoAccountRef[]>([]);
  useEffect(() => {
    setPos(null);
    setLoaded(false);
    if (!account || !pool) return;
    let dead = false;
    const pick = accountId ? `&accountId=${accountId}` : "";
    const read = () =>
      apiFetch(`/api/automation/position?account=${account}&pool=${pool}${pick}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (dead) return;
          if (d?.ok) {
            setPos((d.position as PositionView | null) ?? null);
            setXoxnoAccounts((d.xoxnoAccounts as XoxnoAccountRef[] | undefined) ?? []);
          }
          setLoaded(true);
        })
        .catch(() => !dead && setLoaded(true));
    read();
    const t = setInterval(read, 60_000);
    window.addEventListener("seidar:refresh", read);
    return () => {
      dead = true;
      clearInterval(t);
      window.removeEventListener("seidar:refresh", read);
    };
  }, [account, pool, accountId]);
  return { pos, loaded, xoxnoAccounts };
}

let tokCache: Tok[] | null = null;
export function useTokens(): Tok[] {
  const [tokens, setTokens] = useState<Tok[]>(tokCache ?? []);
  useEffect(() => {
    if (tokCache) return;
    apiFetch("/api/swap/tokens", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) {
          tokCache = d.tokens as Tok[];
          setTokens(tokCache);
        }
      })
      .catch(() => {});
  }, []);
  return tokens;
}

export const codeOf = (tokens: Tok[], contract: string | null | undefined) =>
  tokens.find((t) => t.contract === contract)?.code ?? (contract ? `${contract.slice(0, 4)}…${contract.slice(-4)}` : "—");

/** Oracle price of base in quote (what a price trigger compares). */
export function useCrossPrice(pool: string | null, base: string | null, quote: string | null): number | null {
  const [px, setPx] = useState<number | null>(null);
  useEffect(() => {
    setPx(null);
    if (!pool || !base || !quote || base === quote) return;
    let dead = false;
    const read = () =>
      apiFetch(`/api/automation/price?pool=${pool}&base=${base}&quote=${quote}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => !dead && d?.ok && setPx(Number(d.price)))
        .catch(() => {});
    read();
    const t = setInterval(read, 60_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [pool, base, quote]);
  return px;
}

/** Switch targets: the pool's reserves (XOXNO: collateral assets of the
 *  account's spoke + hub). */
export function useReserves(pool: string | null, xoxno?: { spokeId?: number; hubId?: number } | null): Reserve[] {
  const [list, setList] = useState<Reserve[]>([]);
  const q = xoxno ? `&spoke=${xoxno.spokeId ?? 1}&hub=${xoxno.hubId ?? 1}` : "";
  useEffect(() => {
    if (!pool) return;
    apiFetch(`/api/automation/reserves?pool=${pool}${q}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d?.ok && setList(d.reserves as Reserve[]))
      .catch(() => {});
  }, [pool, q]);
  return list;
}

/** The one collateral + one debt leg, or null when the position has more. */
export function singlePair(pos: PositionView | null): { coll: PosLeg; debt: PosLeg } | null {
  if (!pos) return null;
  const colls = pos.legs.filter((l) => l.collateral > 0);
  const debts = pos.legs.filter((l) => l.debt > 0);
  if (colls.length !== 1 || debts.length !== 1) return null;
  return { coll: colls[0], debt: debts[0] };
}

/* ---------------- enable / disable ---------------- */

/** One server-built tx -> wallet signature -> confirmation, as a step. */
async function signStep(
  owner: string,
  all: TxStep[],
  onSteps: (s: TxStep[]) => void,
  label: string,
  build: () => Promise<{ ok?: boolean; xdr?: string; error?: string } & Record<string, unknown>>,
) {
  const step: TxStep = { key: `k${all.length}`, label, status: "building" };
  all.push(step);
  onSteps([...all]);
  const b = await build();
  if (!b?.ok || !b.xdr) {
    step.status = "failed";
    step.error = b?.error ?? "Could not build the transaction.";
    onSteps([...all]);
    throw new Error(step.error);
  }
  try {
    const r = await signAndSend(b.xdr, owner, (st) => {
      step.status = st;
      onSteps([...all]);
    });
    step.status = "done";
    step.hash = r.hash;
    onSteps([...all]);
    return b;
  } catch (e) {
    step.status = "failed";
    step.error = e instanceof Error ? e.message : String(e);
    onSteps([...all]);
    throw e;
  }
}

const ROLE_LABEL: Record<string, string> = {
  repay: "Allow repays on the pool",
  boost: "Allow boosts on the pool",
  close: "Allow closing the position",
  switch: "Allow the collateral switch",
  swap: "Allow the limit-order swap",
  lp_pool: "Allow claiming + depositing on the pool",
  lp_reward: "Allow moving claimed AQUA to be swapped",
  lp_exit: "Allow withdrawing from the pool",
  lp_share: "Allow burning the LP shares on exit",
};

/** Sign one keeper rule per spec, then register the automation. Returns its id. */
export async function enableAutomation(
  o: {
    owner: string;
    account: string;
    kind: string;
    pool: string;
    collateral: string;
    debt: string;
    config: Record<string, unknown>;
    rules: RuleSpec[];
    tokens: Tok[];
    /** XOXNO: the account to automate (pool = the XOXNO controller). */
    xoxno?: { accountId: string; hubId: number } | null;
  },
  onSteps: (s: TxStep[]) => void,
): Promise<number> {
  const all: TxStep[] = [];
  const ids: { id: number; role: string; target: string }[] = [];
  if (o.xoxno) {
    // XOXNO: the controller runs every op (no token approvals); each rule
    // is bound to this one XOXNO account.
    const x = o.xoxno;
    o = {
      ...o,
      rules: o.rules.filter((r) => r.action !== "Approve").map((r) => ({ ...r, target: o.pool, xoxnoAccount: x.accountId })),
      config: { ...o.config, protocol: "xoxno", accountId: x.accountId, hubId: x.hubId },
    };
  }
  for (const r of o.rules) {
    const { role, ...rule } = r;
    const label =
      ROLE_LABEL[role] ??
      (role === "lp_token" ? `Allow depositing ${codeOf(o.tokens, r.target)} into the pool` : `Allow ${codeOf(o.tokens, r.target)} approvals for the pool`);
    const b = await signStep(o.owner, all, onSteps, label, () =>
      postJson("/api/automation/rule/build", { owner: o.owner, account: o.account, rule: { pool: o.pool, ...rule } }),
    );
    const id = Number(b.ruleId);
    if (!Number.isInteger(id)) throw new Error("The rule was installed but its id could not be read — reload and retry.");
    ids.push({ id, role, target: r.target });
  }
  const reg = await postJson<{ ok?: boolean; error?: string; id?: number }>("/api/automation/register", {
    owner: o.owner,
    account: o.account,
    kind: o.kind,
    pool: o.pool,
    collateral: o.collateral,
    debt: o.debt,
    config: o.config,
    rules: ids,
  });
  if (!reg.ok) throw new Error(reg.error ?? "Could not register the automation.");
  try {
    window.dispatchEvent(new Event("seidar:refresh"));
  } catch {
    /* SSR */
  }
  return Number(reg.id);
}

/** Remove every keeper rule of an automation (owner-signed), then stop it. */
export async function disableAutomation(owner: string, a: Automation, onSteps: (s: TxStep[]) => void) {
  const all: TxStep[] = [];
  for (const r of a.rules) {
    await signStep(owner, all, onSteps, `Remove keeper rule #${r.id}`, () =>
      postJson("/api/automation/rule/remove", { owner, account: a.account, ruleId: r.id }),
    );
  }
  await postJson("/api/automation/status", { owner, id: a.id, status: "off" });
  try {
    window.dispatchEvent(new Event("seidar:refresh"));
  } catch {
    /* SSR */
  }
}

/* ---------------- formatting ---------------- */

export const pct = (hf: number | null | undefined, digits = 2) =>
  hf == null || !Number.isFinite(hf) ? "—" : hf >= 99 ? "∞" : `${(hf * 100).toFixed(digits)}%`;
export const fmtNum = (v: number | null | undefined, max = 4) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: max });
export const fmtPrice = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "--" : v.toLocaleString("en-US", { maximumSignificantDigits: 6 });
/** Decimal string -> base units (BigInt string), or null. */
export function toBase(v: string, decimals: number): string | null {
  const s = v.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [w, f = ""] = s.split(".");
  return (BigInt(w || "0") * BigInt(10) ** BigInt(decimals) + BigInt((f + "0".repeat(decimals)).slice(0, decimals) || "0")).toString();
}

/* ---------------- UI building blocks (DeFi Saver style) ---------------- */

/** Outlined row: label left, value input + suffix right. */
export function AkField({
  label,
  value,
  onChange,
  suffix,
  disabled,
  placeholder,
  tone,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  suffix?: string;
  disabled?: boolean;
  placeholder?: string;
  tone?: "good" | "bad";
}) {
  return (
    <label className={`ak-field${disabled ? " off" : ""}`}>
      <span className="ak-label">{label}</span>
      <input
        className={tone ? `ak-${tone}` : undefined}
        value={value}
        disabled={disabled || !onChange}
        inputMode="decimal"
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value.replace(/[^\d.]/g, ""))}
      />
      {suffix && <span className="ak-suffix">{suffix}</span>}
    </label>
  );
}

export function AkSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T | null;
  /** token: a symbol whose logo shows before the label. */
  options: { value: T; label: string; token?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const picked = options.find((o) => o.value === value);
  return (
    <div className={`ak-field ak-select${disabled ? " off" : ""}`} ref={ref}>
      <span className="ak-label">{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <b>
          {picked?.token && <TokenIcon symbol={picked.token} size={20} />}
          {picked?.label ?? "Select"}
        </b>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="ak-drop" role="listbox" aria-label={label}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={o.value === value ? "on" : ""}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.token && <TokenIcon symbol={o.token} size={20} />}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AkCheck({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="ak-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" />
      {children}
    </label>
  );
}

export function AkNote({ tone, children }: { tone: "error" | "info" | "warn"; children: ReactNode }) {
  return (
    <p className={`ak-note ak-${tone}`}>
      <i aria-hidden="true">{tone === "error" ? "–" : tone === "warn" ? "!" : "i"}</i>
      <span>{children}</span>
    </p>
  );
}

/** Main wallet active: nothing here to automate. Automations act on the
 *  smart account's positions, so point there (switch / create) instead of
 *  telling the user to go find a header control. */
export function NoSmartPositions({ what = "positions" }: { what?: string }) {
  const { owner, smarts } = useSmartAccount();
  const gate = smartGate(owner, smarts);
  return (
    <div className="lp-empty">
      <p>You have no {what} to automate yet.</p>
      <small className="lp-muted">
        {smarts.length > 0
          ? "Automations watch the positions in your Smart Account — switch to it to see what you can automate."
          : "Automations watch positions held in a Smart Account — create one, open a position from it, then automate it here."}
      </small>
      <div className="lp-empty-actions">
        <button type="button" className="btn primary" onClick={gate.run}>
          {gate.label}
        </button>
      </div>
    </div>
  );
}

/** Quick-pick chips row ("Stop Loss when XLM price drops by: -10% -20% -30%"). */
export function AkChips({
  label,
  chips,
  onPick,
}: {
  label: string;
  chips: { label: string; value: number }[];
  onPick: (v: number) => void;
}) {
  return (
    <div className="ak-field ak-chips">
      <span className="ak-label">{label}</span>
      <div>
        {chips.map((c) => (
          <button key={c.label} type="button" onClick={() => onPick(c.value)}>
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export type BarMark = { value: number; label?: string; tone?: "trigger" | "target"; drag?: (v: number) => void };

/** Ratio bar: liquidation (100%), owner markers, current ratio. Values are health factors. */
export function RatioBar({ current, marks = [] }: { current: number | null; marks?: BarMark[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const lo = 0.9;
  const finite = marks.map((m) => m.value).filter((v) => Number.isFinite(v));
  const hi = Math.max(2.4, ...finite.map((v) => v + 0.4), current != null && current < 99 ? Math.min(current, 8) * 1.1 : 0);
  const pctOf = (v: number) => Math.min(Math.max((v - lo) / (hi - lo), 0), 1) * 100;
  const pos = (v: number) => `${pctOf(v).toFixed(2)}%`;
  const lowTrig = Math.min(...marks.filter((m) => m.tone === "trigger").map((m) => m.value), 1.5);
  const gradient = `linear-gradient(90deg, var(--red) 0%, var(--red) ${pctOf(1)}%, var(--amber) ${pctOf(
    Number.isFinite(lowTrig) ? lowTrig : 1.5,
  )}%, var(--green) ${Math.min(100, pctOf(Number.isFinite(lowTrig) ? lowTrig : 1.5) + 8)}%, var(--green) 100%)`;
  const drag = (m: BarMark) => (e: React.PointerEvent) => {
    if (!m.drag || !ref.current) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = ref.current!.getBoundingClientRect();
      m.drag!(Math.round((lo + ((ev.clientX - r.left) / r.width) * (hi - lo)) * 10000) / 10000);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  const shown = current != null ? (current >= 99 ? hi : Math.min(current, hi)) : null;
  return (
    <div className="hb ak-bar" ref={ref}>
      <div className="hb-track" style={{ background: gradient }} />
      <span className="hb-mark hb-liq" style={{ left: pos(1) }} />
      <span className="hb-lbl hb-up hb-red" style={{ left: pos(1) }}>
        100%
      </span>
      {marks
        .filter((m) => Number.isFinite(m.value))
        .map((m, i) => (
          <span key={i}>
            <span
              className={`hb-mark ${m.tone === "target" ? "hb-target" : "hb-trigger"}${m.drag ? " drag" : ""}`}
              style={{ left: pos(m.value) }}
              onPointerDown={drag(m)}
              role={m.drag ? "slider" : undefined}
              aria-label={m.label}
              aria-valuenow={m.value}
            />
            <span className={`hb-lbl ${m.tone === "target" ? "hb-up" : "hb-down"}`} style={{ left: pos(m.value) }}>
              {pct(m.value)}
            </span>
          </span>
        ))}
      {shown != null && (
        <>
          <span className="hb-mark hb-current" style={{ left: pos(shown) }} />
          <span className="hb-lbl hb-up hb-strong" style={{ left: pos(shown) }}>
            {pct(current)}
            {current != null && current < 99 && current > hi ? "+" : ""}
          </span>
        </>
      )}
    </div>
  );
}

/** Panel shell: title, description, Configure / History tabs. */
export function AkPanel({
  title,
  desc,
  tab,
  setTab,
  runs,
  children,
}: {
  title: string;
  desc: string;
  tab: "configure" | "history";
  setTab: (t: "configure" | "history") => void;
  runs: AutoRun[];
  children: ReactNode;
}) {
  return (
    <div className="lp ak">
      <div className="lp-head ak-head">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
      <div className="lp-tabs" role="tablist">
        {(["configure", "history"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "configure" ? "Configure" : `History${runs.length ? ` (${runs.length})` : ""}`}
          </button>
        ))}
      </div>
      {tab === "history" ? <RunList runs={runs} /> : children}
    </div>
  );
}

export function RunList({ runs }: { runs: AutoRun[] }) {
  if (runs.length === 0)
    return <p className="lp-muted">No automated actions yet. Each one shows here with its transaction.</p>;
  return (
    <div className="lp-history">
      {runs.map((r) => (
        <div key={r.id} className={`lp-run st-${r.status}`}>
          <b>{r.status === "executed" ? "Executed" : "Attempt failed"}</b>
          {r.health_before != null && (
            <span>
              Ratio {pct(Number(r.health_before))} → {r.health_after != null ? pct(Number(r.health_after)) : "debt-free"}
            </span>
          )}
          <small>{new Date(r.created_at).toLocaleString()}</small>
          {r.note && <small className="lp-muted">{r.note}</small>}
          {r.tx_hash && (
            <a href={explorerTx(r.tx_hash)} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

/** Active-automation status line. */
export function ActiveLine({ a }: { a: Automation }) {
  return (
    <p className="lp-status">
      <span className="lp-dot" /> Active · last check {a.last_check_at ? new Date(a.last_check_at).toLocaleTimeString() : "pending"}
      {a.last_note ? ` · ${a.last_note}` : ""}
    </p>
  );
}
