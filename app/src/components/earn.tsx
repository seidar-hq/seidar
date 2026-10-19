"use client";
import { accountLabel } from "@/lib/account-names";
import { explorerBase } from "@/lib/network";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  filterVaults,
  sortVaults,
  paginate,
  type VaultRow,
  type VaultSortKey,
  type SortDir,
} from "@seidar/vaults";
import { TokenIcon } from "./token-icon";
import { LoadingMark } from "./loading";
import { useTxActive } from "./shell";
import { apiFetch } from "@/lib/api";
import { signAndSend, type TxStep } from "@/lib/tx";
import { TxModal, type TxSpec } from "./tx-modal";
import { isSmartAddress, smartGate, useSmartAccount } from "./smart-gate";

/* ------------------------------------------------------------------ */
/* Earn: Smart Savings vault browser (Stellar only). DeFindex indexed  */
/* live, Upshift curated + on-chain verified, Untangled pending.       */
/* ------------------------------------------------------------------ */

type Detail = {
  protocol: string;
  address: string;
  name: string;
  symbol: string;
  assets?: { address: string; code: string; strategies: { address: string; name: string; paused: boolean }[] }[];
  feesBps?: { vaultFee?: number; platformFee?: number; performanceFee?: number };
  sharePrice: number | null;
  tvlUsd: number;
  apyPct: number | null;
  ownApy7d: number | null;
  ownApy30d: number | null;
  depositors?: number | null;
  curator?: string;
  withdrawalDays?: number | null;
  rewardApr?: number | null;
  manager?: string | null;
  appUrl: string;
};

const PROTO_STYLE: Record<string, { label: string; color: string }> = {
  defindex: { label: "DeFindex", color: "#57c36b" },
  upshift: { label: "Upshift", color: "#5b8cff" },
  untangled: { label: "Untangled", color: "#f5a524" },
};

function fmtUsd(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function fmtApy(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}%`;
}

/** Short address, or the owner's name for one of their smart accounts. */
function shortAddr(a: string) {
  return a && a.length > 9 ? accountLabel(a) : a;
}

/* Single-choice dropdown in the same look as EvMultiSelect (custom menu,
   never the native <select>): the picked option carries the check. */
export function EvSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
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
    <div className="ev-multi" ref={ref}>
      <button type="button" className="ev-trigger" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={label}>
        <span>{picked?.label ?? label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="ev-menu" role="listbox" aria-label={label}>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={on}
                className={`ev-option ev-opt${on ? " on" : ""}`}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span>{o.label}</span>
                {on && (
                  <svg className="ev-tick" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Checkbox multi-select with logos (protocols: letter badges, tokens:
   TokenIcon). Empty selection means all. */
export function EvMultiSelect({
  label,
  allLabel,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  allLabel: string;
  options: { value: string; label: string; icon: ReactNode }[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);
  const title =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selected`;
  return (
    <div className="ev-multi" ref={ref}>
      {" "}
      <button
        type="button"
        className="ev-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Filter by ${label}`}
      >
        {" "}
        <span>{title}</span>{" "}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>{" "}
      </button>{" "}
      {open && (
        <div className="ev-menu" role="listbox" aria-label={`Filter by ${label}`}>
          {" "}
          {options.map((o) => {
            const checked = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={checked}
                className="ev-option ev-opt"
                onClick={() => onToggle(o.value)}
              >
                {" "}
                {o.icon} <span>{o.label}</span>{" "}
                <span
                  className={`ev-check${checked ? " on" : ""}`}
                  aria-hidden="true"
                >
                  {" "}
                  {checked && (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}{" "}
                </span>{" "}
              </button>
            );
          })}{" "}
          {selected.length > 0 && (
            <div className="ev-menu-foot">
              {" "}
              <button type="button" onClick={() => { onClear(); setOpen(false); }}>
                Clear
              </button>{" "}
            </div>
          )}{" "}
        </div>
      )}{" "}
    </div>
  );
}

/** Connected owner wallet (shell owns the connection; event + mirror). */
function useOwnerAddress() {
  const [a, setA] = useState<string | null>(null);
  useEffect(() => {
    function onW(e: Event) {
      const v = (e as CustomEvent<string | null>).detail;
      setA(typeof v === "string" && /^G[A-Z2-7]{55}$/.test(v) ? v : null);
    }
    window.addEventListener("seidar:wallet", onW);
    try {
      const raw = window.localStorage.getItem("seidar.wallet");
      if (raw) {
        const v = JSON.parse(raw);
        if (typeof v === "string") setA(v);
      }
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener("seidar:wallet", onW);
  }, []);
  return a;
}

/** Token amount -> base-unit integer string, exact (floors, never floats). */
function toBaseUnits(amount: string, decimals: number): string | null {
  const clean = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const [i, f = ""] = clean.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  const s = ((i.replace(/^0+/, "") || "0") + frac).replace(/^0+(?=\d)/, "");
  if (s === "" || !/^\d+$/.test(s)) return null;
  return s;
}

async function postJson(path: string, body: unknown, ms = 60000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return r.json();
  } finally {
    clearTimeout(t);
  }
}

/* Deposit / withdraw modal: build unsigned -> wallet sign -> submit. */
function VaultModal({
  row,
  mode,
  onClose,
}: {
  row: VaultRow;
  mode: "deposit" | "withdraw";
  onClose: () => void;
}) {
  const owner = useOwnerAddress();
  const active = useTxActive(owner) ?? owner;
  const { smarts } = useSmartAccount();
  // Vault actions run from the smart account; the main wallet only funds it.
  const gate = !isSmartAddress(active) ? smartGate(owner, smarts) : null;
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /* Deposit/withdraw confirm + result go through the shared popup. */
  const [confirm, setConfirm] = useState<TxSpec | null>(null);
  const landed = useRef(false);
  function submit() {
    if (busy) return;
    setStatus(null);
    setDone(null);
    const exec = active ?? owner;
    if (!exec) {
      setStatus("Connect a wallet to continue.");
      return;
    }
    const base = toBaseUnits(amount, row.assetDecimals);
    if (base == null || BigInt(base) <= BigInt(0)) {
      setStatus("Enter an amount above 0.");
      return;
    }
    const verb = mode === "deposit" ? "Deposit" : "Withdraw";
    landed.current = false;
    setConfirm({
      title: `${verb}: ${amount} ${row.assetCode}`,
      code: row.assetCode,
      amount,
      context: `${row.name} · ${row.protocol === "defindex" ? "DeFindex" : "Upshift"}`,
      rows: [
        { label: verb, value: `${amount} ${row.assetCode}` },
        { label: "Vault APY", value: row.apyPct != null ? `${row.apyPct.toFixed(2)}%` : "n/a" },
        { label: "From", value: shortAddr(exec), hint: "Your smart account" },
        { label: "Slippage guard", value: "0.5%" },
        { label: "Signatures", value: "1" },
      ],
      confirmLabel: verb,
      execute: async (onSteps) => {
        const step: TxStep = { key: "v", label: `${verb} ${row.assetCode}`, status: "building" };
        onSteps([{ ...step }]);
        setBusy(true);
        try {
          const b = await postJson("/api/vaults/build", {
            protocol: row.protocol,
            vault: row.address,
            action: mode === "deposit" ? "deposit" : "withdraw",
            caller: exec,
            signer: owner ?? undefined,
            amounts: [base],
            slippageBps: 50,
          });
          if (!b?.ok || typeof b.xdr !== "string")
            throw new Error(String(b?.error ?? "Build failed - is the active account funded?"));
          const sent = await signAndSend(b.xdr, owner ?? exec, (st) => {
            step.status = st;
            onSteps([{ ...step }]);
          });
          step.status = "done";
          step.hash = sent.hash;
          onSteps([{ ...step }]);
          landed.current = true;
          window.dispatchEvent(new Event("seidar:refresh"));
        } catch (e) {
          step.status = "failed";
          step.error = e instanceof Error ? e.message : String(e);
          step.hash = (e as { hash?: string | null })?.hash ?? null;
          onSteps([{ ...step }]);
          throw e;
        } finally {
          setBusy(false);
        }
      },
    });
  }

  if (confirm)
    return (
      <TxModal
        spec={confirm}
        onClose={() => {
          setConfirm(null);
          if (landed.current) onClose();
        }}
      />
    );

  return (
    <div
      className="mv-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      {" "}
      <div className="mv-modal" role="dialog" aria-modal="true" aria-label={`${mode} ${row.name}`}>
        {" "}
        <div className="mv-head">
          {" "}
          <h3>
            {mode === "deposit" ? "Deposit into" : "Withdraw from"} {row.name}
          </h3>{" "}
          <button
            type="button"
            className="mv-x"
            onClick={() => !busy && onClose()}
            aria-label="Close"
          >
            ×
          </button>{" "}
        </div>{" "}
        <p className="mv-info">
          Signing as {active ? shortAddr(active) : "—"} · {row.assetCode} ·{" "}
          {row.apyPct != null ? `${row.apyPct.toFixed(2)}% APY` : "APY n/a"}
        </p>{" "}
        <input
          className="mv-addr"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          inputMode="decimal"
          placeholder={`Amount in ${row.assetCode}`}
          aria-label="Amount"
        />{" "}
        {status && (
          <p className="x-status" role="status">
            {status}
          </p>
        )}{" "}
        {done && (
          <p className="mv-note">
            Submitted ·{" "}
            <a
              href={`${explorerBase()}/tx/${done}`}
              target="_blank"
              rel="noreferrer"
            >
              {String(done).slice(0, 8)}… view
            </a>
          </p>
        )}{" "}
        <button
          type="button"
          className="btn primary mv-go"
          disabled={busy}
          onClick={gate ? gate.run : submit}
        >
          {" "}
          {gate ? gate.label : busy ? "Working…" : mode === "deposit" ? "Deposit" : "Withdraw"}{" "}
        </button>{" "}
      </div>{" "}
    </div>
  );
}

export function EarnView({ only }: { only?: "defindex" | "upshift" }) {
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [protoFilter, setProtoFilter] = useState<string[]>(only ? [only] : []);
  const [tokenFilter, setTokenFilter] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<VaultSortKey>("apy");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    row: VaultRow;
    mode: "deposit" | "withdraw";
  } | null>(null);

  /* Accounts: owner signs, active account transacts. */
  const owner = useOwnerAddress();
  const active = useTxActive(owner) ?? owner;

  type EarnPosition = {
    protocol: string;
    vault: string;
    name: string;
    shares: string;
    underlying: { asset: string; amount: string }[];
  };
  const [positions, setPositions] = useState<EarnPosition[]>([]);

  type EarnStrat = {
    id: number | string;
    kind: string;
    status: string;
    params: Record<string, unknown>;
    attempts: number;
    last_note: string;
  };
  const [strats, setStrats] = useState<EarnStrat[]>([]);
  const [watches, setWatches] = useState<
    {
      protocol: string;
      vault: string;
      thresholdPp: number;
      lastNotifiedAt?: string | null;
    }[]
  >([]);

  async function loadPositions(acct: string | null) {
    if (!acct) {
      setPositions([]);
      return;
    }
    try {
      const d = await apiFetch(
        `/api/vaults/positions?address=${acct}`,
        { cache: "no-store" },
      ).then((r) => r.json());
      if (d?.ok && Array.isArray(d.positions)) setPositions(d.positions);
    } catch {
      /* keep last */
    }
  }

  async function loadStrats(own: string | null) {
    if (!own) {
      setStrats([]);
      return;
    }
    try {
      const d = await apiFetch(`/api/strategies?wallet=${own}`, {
        cache: "no-store",
      }).then((r) => r.json());
      if (d?.ok && Array.isArray(d.strategies))
        setStrats(
          (d.strategies as EarnStrat[]).filter((s) => s.kind === "earn"),
        );
    } catch {
      /* keep last */
    }
  }

  async function loadWatches(own: string | null) {
    if (!own) {
      setWatches([]);
      return;
    }
    try {
      const d = await apiFetch(`/api/vaults/watches?wallet=${own}`, {
        cache: "no-store",
      }).then((r) => r.json());
      if (d?.ok && Array.isArray(d.watches)) setWatches(d.watches);
    } catch {
      /* keep last */
    }
  }

  useEffect(() => {
    loadPositions(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  useEffect(() => {
    loadStrats(owner);
    loadWatches(owner);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  /** Patch an earn strategy (status/params/attempts/note). */
  async function patchEarn(
    id: number | string,
    upd: Record<string, unknown>,
  ) {
    if (!owner) return;
    setStrats((prev) =>
      prev.map((s) =>
        String(s.id) === String(id) ? { ...s, ...upd } : s,
      ),
    );
    if (typeof id === "number") {
      try {
        const r = await apiFetch("/api/strategies", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet: owner, id, ...upd }),
        });
        const d = await r.json();
        if (d?.ok && d.strategy) {
          setStrats((prev) =>
            prev.map((s) =>
              String(s.id) === String(id) ? (d.strategy as EarnStrat) : s,
            ),
          );
        }
      } catch {
        /* optimistic state stands */
      }
    }
  }

  /** Execute one earn run: build deposit -> wallet sign -> submit. */
  async function runEarnDeposit(s: EarnStrat): Promise<boolean> {
    const p = s.params;
    const exec = active ?? owner;
    if (!exec) {
      await patchEarn(s.id, { last_note: "Connect a wallet to execute." });
      return false;
    }
    const row = rows.find(
      (r) =>
        r.protocol === String(p.protocol ?? "") &&
        r.address === String(p.vault ?? ""),
    );
    const dec = row?.assetDecimals ?? 7;
    const base = toBaseUnits(String(p.amount ?? ""), dec);
    if (base == null || BigInt(base) <= BigInt(0)) {
      await patchEarn(s.id, {
        status: "failed",
        attempts: s.attempts + 1,
        last_note: "Bad stored amount - recreate the plan.",
      });
      return false;
    }
    await patchEarn(s.id, {
      status: "executing",
      last_note: "Building deposit…",
    });
    try {
      const b = await postJson("/api/vaults/build", {
        protocol: String(p.protocol ?? ""),
        vault: String(p.vault ?? ""),
        action: "deposit",
        caller: exec,
        signer: owner ?? undefined,
        amounts: [base],
        slippageBps: 50,
      });
      if (!b?.ok || typeof b.xdr !== "string")
        throw new Error(String(b?.error ?? "Deposit build failed."));
      await patchEarn(s.id, { last_note: "Approve in your wallet…" });
      const snd = await signAndSend(b.xdr, owner ?? exec);
      const left =
        p.runsLeft == null ? null : Math.max(0, Number(p.runsLeft) - 1);
      const next = {
        ...p,
        runsLeft: left,
        nextAt: Date.now() + Number(p.intervalSec || 86400) * 1000,
      };
      if (left === 0) {
        await patchEarn(s.id, {
          status: "completed",
          params: next,
          last_note: `Deposit filled${snd.hash ? ` · ${String(snd.hash).slice(0, 8)}…` : ""}. Plan complete.`,
        });
      } else {
        await patchEarn(s.id, {
          params: next,
          last_note: `Deposit filled${snd.hash ? ` · ${String(snd.hash).slice(0, 8)}…` : ""}.`,
        });
      }
      loadPositions(exec);
      return true;
    } catch (e) {
      await patchEarn(s.id, {
        status: "failed",
        attempts: s.attempts + 1,
        last_note: String(e instanceof Error ? e.message : e).slice(0, 200),
      });
      return false;
    }
  }

  /** APY-exit run: withdraw the full position, then close the plan. */
  async function runEarnExit(s: EarnStrat, apyNow: number): Promise<boolean> {
    const p = s.params;
    const exec = active ?? owner;
    if (!exec) return false;
    const pos = positions.find(
      (x) =>
        x.protocol === String(p.protocol ?? "") &&
        x.vault === String(p.vault ?? ""),
    );
    if (!pos || !(BigInt(pos.shares || "0") > BigInt(0))) {
      await patchEarn(s.id, {
        status: "completed",
        last_note: `APY ${apyNow}% below floor - nothing held, plan closed.`,
      });
      return true;
    }
    await patchEarn(s.id, {
      status: "executing",
      last_note: `APY ${apyNow}% below floor - exiting…`,
    });
    try {
      const b = await postJson("/api/vaults/build", {
        protocol: String(p.protocol ?? ""),
        vault: String(p.vault ?? ""),
        action: "withdraw-shares",
        caller: exec,
        signer: owner ?? undefined,
        shares: pos.shares,
        slippageBps: 50,
      });
      if (!b?.ok || typeof b.xdr !== "string")
        throw new Error(String(b?.error ?? "Exit build failed."));
      const snd = await signAndSend(b.xdr, owner ?? exec);
      await patchEarn(s.id, {
        status: "executed",
        last_note: `Exited at APY ${apyNow}%${snd.hash ? ` · ${String(snd.hash).slice(0, 8)}…` : ""}.`,
      });
      loadPositions(exec);
      return true;
    } catch (e) {
      await patchEarn(s.id, {
        status: "failed",
        attempts: s.attempts + 1,
        last_note: String(e instanceof Error ? e.message : e).slice(0, 200),
      });
      return false;
    }
  }

  const [dcaAmount, setDcaAmount] = useState("");
  const [dcaInterval, setDcaInterval] = useState("86400");
  const [dcaRuns, setDcaRuns] = useState("10");
  const [dcaExitFloor, setDcaExitFloor] = useState("");
  const [dcaBusy, setDcaBusy] = useState(false);
  const [dcaMsg, setDcaMsg] = useState<string | null>(null);

  async function createEarnPlan(row: VaultRow) {
    if (dcaBusy) return;
    setDcaMsg(null);
    if (!owner) {
      setDcaMsg("Connect a wallet to automate.");
      return;
    }
    const base = toBaseUnits(dcaAmount, row.assetDecimals);
    if (base == null || BigInt(base) <= BigInt(0)) {
      setDcaMsg("Enter an amount above 0.");
      return;
    }
    const runs = dcaRuns.trim() === "" ? null : Math.max(1, Math.floor(Number(dcaRuns) || 0));
    if (dcaRuns.trim() !== "" && !(runs != null && runs > 0)) {
      setDcaMsg("Runs must be a positive integer (or empty for open-ended).");
      return;
    }
    const floor =
      dcaExitFloor.trim() === "" ? null : Number(dcaExitFloor);
    if (floor != null && !(floor > 0)) {
      setDcaMsg("APY exit floor must be above 0 (or empty).");
      return;
    }
    setDcaBusy(true);
    try {
      const d = await postJson(
        "/api/strategies",
        {
          wallet: owner,
          kind: "earn",
          params: {
            protocol: row.protocol,
            vault: row.address,
            vaultName: row.name,
            assetCode: row.assetCode,
            assetDecimals: row.assetDecimals,
            amount: dcaAmount.trim(),
            intervalSec: Number(dcaInterval) || 86400,
            runsLeft: runs,
            nextAt: Date.now(),
            ...(floor != null ? { exitBelowApy: floor } : {}),
          },
        },
        25000,
      );
      if (!d?.ok || !d.strategy) throw new Error("Plan store failed.");
      setStrats((prev) => [d.strategy, ...prev]);
      setDcaMsg("Plan armed - first run is due now (sign each run in your wallet).");
      setDcaAmount("");
    } catch (e) {
      setDcaMsg(String(e instanceof Error ? e.message : e).slice(0, 160));
    } finally {
      setDcaBusy(false);
    }
  }

  async function cancelEarn(id: number | string) {
    if (!owner) return;
    setStrats((prev) =>
      prev.map((s) =>
        String(s.id) === String(id) ? { ...s, status: "cancelled" } : s,
      ),
    );
    try {
      await apiFetch("/api/strategies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: owner, id, status: "cancelled" }),
      });
    } catch {
      /* optimistic stands */
    }
  }

  async function toggleWatch(row: VaultRow) {
    if (!owner) return;
    const key = `${row.protocol}:${row.address}`;
    const watched = watches.some((w) => `${w.protocol}:${w.vault}` === key);
    setWatches((prev) =>
      watched
        ? prev.filter((w) => `${w.protocol}:${w.vault}` !== key)
        : [...prev, { protocol: row.protocol, vault: row.address, thresholdPp: 2 }],
    );
    try {
      if (watched) {
        await apiFetch("/api/vaults/watches", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: owner,
            protocol: row.protocol,
            vault: row.address,
          }),
        });
      } else {
        await postJson("/api/vaults/watches", {
          wallet: owner,
          protocol: row.protocol,
          vault: row.address,
          thresholdPp: 2,
        });
      }
    } catch {
      /* optimistic stands */
    }
  }

  /* Earn monitor: deposit schedules + APY exits + watch alerts. Runs while
     the app is open; every run still needs the user's wallet signature. */
  const runRefEarn = useRef(false);
  const lastTryEarn = useRef(new Map<string, number>());
  useEffect(() => {
    let cancelled = false;
    const LIVE = ["active", "triggered", "failed"];
    async function evaluate() {
      if (runRefEarn.current || cancelled) return;
      if (!owner) return;
      const live = strats.filter((s) => LIVE.includes(s.status));
      if (live.length === 0 && watches.length === 0) return;
      runRefEarn.current = true;
      try {
        const apyByVault: Record<string, number> = {};
        for (const r of rows) {
          if (r.apyPct != null)
            apyByVault[`${r.protocol}:${r.address}`] = r.apyPct;
        }
        const now = Date.now();
        for (const s of live) {
          if (cancelled) return;
          const last = lastTryEarn.current.get(String(s.id)) ?? 0;
          if (now - last < 60000) continue;
          lastTryEarn.current.set(String(s.id), now);
          const p = s.params;
          const key = `${String(p.protocol ?? "")}:${String(p.vault ?? "")}`;
          const floor =
            typeof p.exitBelowApy === "number" ||
            (typeof p.exitBelowApy === "string" && p.exitBelowApy !== "")
              ? Number(p.exitBelowApy)
              : null;
          const liveApy = apyByVault[key];
          if (floor != null && floor > 0 && liveApy != null && liveApy < floor) {
            await runEarnExit(s, liveApy);
            continue;
          }
          if (p.runsLeft != null && Number(p.runsLeft) <= 0) {
            await patchEarn(s.id, {
              status: "completed",
              last_note: "All runs filled.",
            });
            continue;
          }
          if (typeof p.nextAt !== "number" || (p.nextAt as number) > now)
            continue;
          await runEarnDeposit(s);
        }
        // Watch alerts: live APY vs 24h-ago snapshot, threshold-gated,
        // one notification per 24h per watch.
        for (const w of watches) {
          if (cancelled) return;
          try {
            const liveRow = rows.find(
              (r) => r.protocol === w.protocol && r.address === w.vault,
            );
            const liveApy = liveRow?.apyPct;
            if (liveApy == null) continue;
            const d = await apiFetch(
              `/api/vaults/snapshots?protocol=${w.protocol}&address=${w.vault}&days=7`,
              { cache: "no-store" },
            ).then((r) => r.json());
            const series: { t: number; v: number }[] = Array.isArray(
              (d as { apy?: unknown })?.apy,
            )
              ? ((d as { apy: { t: unknown; v: unknown }[] }).apy
                  .map((p) => ({ t: Number(p.t), v: Number(p.v) }))
                  .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v)))
              : [];
            if (series.length === 0) continue;
            const cutoff = now - 24 * 3600_000;
            const baseline =
              [...series].reverse().find((p) => p.t <= cutoff) ?? series[0];
            if (baseline.v - liveApy < w.thresholdPp) continue;
            const lastN = w.lastNotifiedAt ? Date.parse(w.lastNotifiedAt) : 0;
            if (Number.isFinite(lastN) && now - lastN < 24 * 3600_000) continue;
            const name = liveRow?.name ?? shortAddr(w.vault);
            await postJson("/api/notifications", {
              wallet: owner,
              text: `${name} APY fell ${baseline.v.toFixed(2)}% to ${liveApy.toFixed(2)}% (drop over ${(w.thresholdPp).toFixed(0)}pp watch).`,
            });
            await apiFetch("/api/vaults/watches", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                wallet: owner,
                protocol: w.protocol,
                vault: w.vault,
              }),
            });
            setWatches((prev) =>
              prev.map((x) =>
                x.protocol === w.protocol && x.vault === w.vault
                  ? { ...x, lastNotifiedAt: new Date(now).toISOString() }
                  : x,
              ),
            );
            window.dispatchEvent(new Event("seidar:refresh-notes"));
          } catch {
            /* next watch */
          }
        }
      } finally {
        runRefEarn.current = false;
      }
    }
    evaluate();
    const t = setInterval(evaluate, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, rows, strats, watches]);

  /* Protocol-pinned sections (/markets/defindex, /markets/upshift)
     always show their own vaults, even though the shared fetcher serves
     every protocol. */
  useEffect(() => {
    if (only) {
      setProtoFilter([only]);
      setPage(1);
    }
  }, [only]);

  useEffect(() => {
    let cancelled = false;
    let first = true;
    async function load() {
      if (first) {
        first = false;
        setLoading(true);
      }
      setError(null);
      try {
        const d = await apiFetch(
          `/api/vaults${only ? `?protocol=${only}` : ""}`,
          { cache: "no-store" },
        ).then((r) => r.json());
        if (!cancelled && d?.ok && Array.isArray(d.rows)) {
          setRows(d.rows as VaultRow[]);
        } else if (!cancelled) {
          setError("Vault feed unreachable — retry in a bit.");
        }
      } catch {
        if (!cancelled) setError("Vault feed unreachable — retry in a bit.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    window.addEventListener("seidar:refresh", load);
    // Poll every 5 minutes so Options/counts track newly indexed vaults.
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.removeEventListener("seidar:refresh", load);
      clearInterval(id);
    };
  }, [only]);

  // Deep link (Earn opportunities): open one vault's deposit modal once rows load.
  useEffect(() => {
    if (rows.length === 0) return;
    try {
      const raw = window.localStorage.getItem("seidar.openVault");
      if (!raw) return;
      const want = JSON.parse(raw) as { protocol?: string; address?: string; mode?: string };
      const row = rows.find((r) => r.protocol === want.protocol && r.address === want.address);
      if (!row) return;
      window.localStorage.removeItem("seidar.openVault");
      setModal({ row, mode: want.mode === "withdraw" ? "withdraw" : "deposit" });
    } catch {
      /* stays on the list */
    }
  }, [rows]);

  const protocols = useMemo(
    () => [...new Set(rows.map((r) => r.protocol))].sort(),
    [rows],
  );
  const tokens = useMemo(
    () => [...new Set(rows.map((r) => r.assetCode))].sort(),
    [rows],
  );

  function toggleProto(v: string) {
    setProtoFilter((prev) =>
      prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v],
    );
    setPage(1);
  }
  function toggleToken(v: string) {
    setTokenFilter((prev) =>
      prev.includes(v) ? prev.filter((s) => s !== v) : [...prev, v],
    );
    setPage(1);
  }

  const visible = useMemo(() => {
    const filtered = filterVaults(rows, {
      protocols: protoFilter as VaultRow["protocol"][],
      tokens: tokenFilter,
    });
    return sortVaults(filtered, sortKey, sortDir);
  }, [rows, protoFilter, tokenFilter, sortKey, sortDir]);

  const paged = useMemo(
    () => paginate(visible, page, perPage),
    [visible, page, perPage],
  );

  // Clamp page when filters shrink the list.
  useEffect(() => {
    if (page > paged.totalPages) setPage(paged.totalPages);
  }, [page, paged.totalPages]);

  function toggleSort(key: VaultSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
    setPage(1);
  }

  async function toggleExpand(r: VaultRow) {
    const key = `${r.protocol}:${r.address}`;
    if (expanded === key) {
      setExpanded(null);
      return;
    }
    setExpanded(key);
    if (details[key] || detailLoading === key) return;
    setDetailLoading(key);
    try {
      const d = await apiFetch(
        `/api/vaults/detail?protocol=${r.protocol}&address=${r.address}`,
        { cache: "no-store" },
      ).then((x) => x.json());
      if (d?.ok && d.detail) {
        setDetails((prev) => ({ ...prev, [key]: d.detail as Detail }));
      }
    } catch {
      /* row stays collapsed-informative */
    } finally {
      setDetailLoading((cur) => (cur === key ? null : cur));
    }
  }

  function sortBtn(key: VaultSortKey, label: string) {
    const active = sortKey === key;
    return (
      <button
        type="button"
        className={`ev-sort${active ? " active" : ""}`}
        onClick={() => toggleSort(key)}
        aria-label={`Sort by ${label}`}
      >
        {" "}
        {label}{" "}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{
            transform: active && sortDir === "asc" ? "rotate(180deg)" : undefined,
            opacity: active ? 1 : 0.45,
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>{" "}
      </button>
    );
  }

  const hero =
    only === "upshift"
      ? {
          eyebrow: "WELCOME TO UPSHIFT VAULTS",
          title: (
            <>
              Earn yield on your <em>tokens</em> via curated{" "}
              <em>Upshift</em> vaults.
            </>
          ),
        }
      : {
          eyebrow: "WELCOME TO SMART SAVINGS",
          title: (
            <>
              Earn yield on your <em>tokens</em> via curated selection of{" "}
              <em>protocols</em>.
            </>
          ),
        };

  return (
    <div className="ev-wrap">
      {" "}
      <div className="ev-hero">
        {" "}
        <p className="ev-eyebrow">{hero.eyebrow}</p> <h1>{hero.title}</h1>{" "}
      </div>{" "}
      <div className="ev-filters">
        {" "}
        {!only && (
          <EvMultiSelect
            label="protocols"
            allLabel="All protocols"
            options={protocols.map((p) => ({
              value: p,
              label: PROTO_STYLE[p]?.label ?? p,
              icon: (
                <span
                  className="ev-opt-badge"
                  style={{
                    background: PROTO_STYLE[p]?.color ?? "#8a8a91",
                  }}
                  aria-hidden="true"
                >
                  {(PROTO_STYLE[p]?.label ?? p).slice(0, 1)}
                </span>
              ),
            }))}
            selected={protoFilter}
            onToggle={toggleProto}
            onClear={() => {
              setProtoFilter([]);
              setPage(1);
            }}
          />
        )}{" "}
        <EvMultiSelect
          label="tokens"
          allLabel="All tokens"
          options={tokens.map((t) => ({
            value: t,
            label: t,
            icon: <TokenIcon symbol={t} size={20} />,
          }))}
          selected={tokenFilter}
          onToggle={toggleToken}
          onClear={() => {
            setTokenFilter([]);
            setPage(1);
          }}
        />{" "}
      </div>{" "}
      {active && positions.length > 0 && (
        <div className="pf-card proto-overview">
          {" "}
          <small className="proto-kicker">YOUR VAULT POSITIONS</small>{" "}
          {positions.map((p) => (
            <div key={`${p.protocol}:${p.vault}`} className="ev-pos-row">
              {" "}
              <span>
                <b>{p.name}</b> <small>{p.protocol}</small>
              </span>{" "}
              <span className="ev-pos-shares">{p.shares} shares</span>{" "}
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const row = rows.find(
                    (r) => r.protocol === p.protocol && r.address === p.vault,
                  );
                  if (row) setModal({ row, mode: "withdraw" });
                }}
              >
                Withdraw
              </button>{" "}
            </div>
          ))}{" "}
        </div>
      )}{" "}
      <div className="ev-cols" role="row">
        {" "}
        <span>{sortBtn("protocol", "Protocol")}</span>{" "}
        <span>{sortBtn("token", "Token")}</span>{" "}
        <span>{sortBtn("apy", "APY")}</span>{" "}
        <span>{sortBtn("tvl", "Pool size")}</span>{" "}
        <span>{sortBtn("liquidity", "Liquidity")}</span>{" "}
        <span aria-hidden="true" />{" "}
      </div>{" "}
      <p className="ev-count">
        Options{" "}
        <span className="ev-count-n">{visible.length}</span>{" "}
      </p>{" "}
      {loading && (
        <p className="pf-empty load-row">
          <LoadingMark size={16} /> Loading live vaults…
        </p>
      )}{" "}
      {error && !loading && <p className="proto-warn">{error}</p>}{" "}
      {!loading && !error && paged.rows.length === 0 && (
        <p className="pf-empty">No vaults match these filters.</p>
      )}{" "}
      {paged.rows.map((r) => {
        const key = `${r.protocol}:${r.address}`;
        const open = expanded === key;
        const det = details[key];
        const style = PROTO_STYLE[r.protocol] ?? {
          label: r.protocol,
          color: "#8a8a91",
        };
        return (
          <div key={key} className={`ev-row${open ? " open" : ""}`}>
            {" "}
            <button
              type="button"
              className="ev-main"
              onClick={() => toggleExpand(r)}
              aria-expanded={open}
            >
              {" "}
              <span className="ev-proto">
                {" "}
                <span
                  className="ev-badge"
                  style={{ background: style.color }}
                  aria-hidden="true"
                >
                  {style.label.slice(0, 1)}
                </span>{" "}
                <span className="ev-names">
                  {" "}
                  <b>{r.name}</b> <small>{style.label} vault</small>{" "}
                </span>{" "}
              </span>{" "}
              <span className="ev-token">
                {" "}
                <TokenIcon symbol={r.assetCode} size={24} />{" "}
                <b>{r.assetCode}</b>{" "}
              </span>{" "}
              <span className="ev-apy">
                {" "}
                <b>{fmtApy(r.apyPct)}</b>{" "}
                {r.apySource === "snapshot" && (
                  <small className="ev-verified" title="APY verified from our snapshots">
                    verified
                  </small>
                )}{" "}
              </span>{" "}
              <span className="ev-num">
                <b>{fmtUsd(r.tvlUsd)}</b>
              </span>{" "}
              <span className="ev-num">
                <b>{fmtUsd(r.liquidityUsd)}</b>
              </span>{" "}
              <span className="ev-chev" aria-hidden="true">
                {" "}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transform: open ? "rotate(180deg)" : undefined }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>{" "}
              </span>{" "}
            </button>{" "}
            {open && (
              <div className="ev-detail">
                {" "}
                {detailLoading === key && !det && (
                  <p className="load-row">
                    <LoadingMark size={14} /> Loading vault details…
                  </p>
                )}{" "}
                {det ? (
                  <>
                    {" "}
                    <div className="ev-grid">
                      {" "}
                      <div>
                        <span>Share price</span>
                        <b>
                          {det.sharePrice != null
                            ? det.sharePrice.toLocaleString("en-US", {
                                maximumFractionDigits: 6,
                              })
                            : "—"}
                        </b>
                      </div>{" "}
                      <div>
                        <span>APY 7d (own calc)</span>
                        <b>{fmtApy(det.ownApy7d)}</b>
                      </div>{" "}
                      <div>
                        <span>APY 30d (own calc)</span>
                        <b>{fmtApy(det.ownApy30d)}</b>
                      </div>{" "}
                      <div>
                        <span>Fees</span>
                        <b>
                          {det.feesBps
                            ? `${((det.feesBps.vaultFee ?? 0) / 100).toFixed(2)}% vault`
                              + (det.feesBps.performanceFee
                                ? ` · ${(det.feesBps.performanceFee / 100).toFixed(0)}% perf`
                                : "")
                            : "—"}
                        </b>
                      </div>{" "}
                      <div>
                        <span>Depositors</span>
                        <b>{det.depositors ?? "—"}</b>
                      </div>{" "}
                      <div>
                        <span>Withdrawal</span>
                        <b>
                          {det.withdrawalDays != null
                            ? `${det.withdrawalDays} days`
                            : det.curator
                              ? det.curator
                              : "—"}
                        </b>
                      </div>{" "}
                    </div>{" "}
                    {det.assets?.flatMap((a) => a.strategies ?? []).length ? (
                      <ul className="ev-strats">
                        {det.assets.flatMap((a) =>
                          (a.strategies ?? []).map((s) => (
                            <li key={s.address}>
                              <span>{s.name || shortAddr(s.address)}</span>
                              {s.paused && <em>paused</em>}
                            </li>
                          )),
                        )}
                      </ul>
                    ) : null}{" "}
                    <div className="ev-links">
                      {" "}
                      <a
                        href={`${explorerBase()}/contract/${r.address}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Contract {shortAddr(r.address)}
                      </a>{" "}
                      <a href={det.appUrl} target="_blank" rel="noreferrer">
                        Open in {style.label}
                      </a>{" "}
                    </div>{" "}
                    <div className="ev-actions">
                      {" "}
                      <button
                        type="button"
                        className="btn primary"
                        disabled={!active}
                        onClick={() => setModal({ row: r, mode: "deposit" })}
                      >
                        Deposit
                      </button>{" "}
                      <button
                        type="button"
                        className="btn"
                        disabled={!active}
                        onClick={() => setModal({ row: r, mode: "withdraw" })}
                      >
                        Withdraw
                      </button>{" "}
                      <button
                        type="button"
                        className="btn"
                        disabled={!owner}
                        onClick={() => toggleWatch(r)}
                        title="Alert me on APY drops of 2pp+"
                      >
                        {watches.some(
                          (w) =>
                            w.protocol === r.protocol && w.vault === r.address,
                        )
                          ? "Watching"
                          : "Watch APY"}
                      </button>{" "}
                    </div>{" "}
                    <div className="ev-auto">
                      {" "}
                      <small className="proto-kicker">AUTOMATE</small>{" "}
                      <div className="ev-form">
                        {" "}
                        <input
                          value={dcaAmount}
                          onChange={(e) =>
                            setDcaAmount(e.target.value.replace(/[^0-9.]/g, ""))
                          }
                          inputMode="decimal"
                          placeholder={`Amount ${r.assetCode}/run`}
                          aria-label="DCA amount per run"
                        />{" "}
                        <select
                          value={dcaInterval}
                          onChange={(e) => setDcaInterval(e.target.value)}
                          aria-label="DCA interval"
                        >
                          <option value="86400">Daily</option>
                          <option value="604800">Weekly</option>
                        </select>{" "}
                        <input
                          value={dcaRuns}
                          onChange={(e) =>
                            setDcaRuns(e.target.value.replace(/[^0-9]/g, ""))
                          }
                          inputMode="numeric"
                          placeholder="Runs (empty = open)"
                          aria-label="Number of runs"
                        />{" "}
                        <input
                          value={dcaExitFloor}
                          onChange={(e) =>
                            setDcaExitFloor(
                              e.target.value.replace(/[^0-9.]/g, ""),
                            )
                          }
                          inputMode="decimal"
                          placeholder="Exit if APY below % (optional)"
                          aria-label="APY exit floor"
                        />{" "}
                        <button
                          type="button"
                          className="btn"
                          disabled={dcaBusy || !owner}
                          onClick={() => createEarnPlan(r)}
                        >
                          {dcaBusy ? "Working…" : "Start DCA"}
                        </button>{" "}
                      </div>{" "}
                      {dcaMsg && <p className="mv-note">{dcaMsg}</p>}{" "}
                      {strats.filter(
                        (s) =>
                          String(s.params.protocol ?? "") === r.protocol &&
                          String(s.params.vault ?? "") === r.address &&
                          ["active", "triggered", "failed", "executing"].includes(
                            s.status,
                          ),
                      ).map((s) => (
                        <div key={String(s.id)} className="ev-plan">
                          {" "}
                          <span>
                            DCA {String(s.params.amount ?? "?")} {r.assetCode}/run
                            · {s.status}
                            {s.last_note ? ` · ${s.last_note}` : ""}
                          </span>{" "}
                          <button type="button" onClick={() => cancelEarn(s.id)}>
                            Cancel
                          </button>{" "}
                        </div>
                      ))}{" "}
                    </div>{" "}
                  </>
                ) : (
                  detailLoading !== key && (
                    <p>
                      Details need a DeFindex API key for this vault — discovery
                      data above stays live.
                    </p>
                  )
                )}{" "}
              </div>
            )}{" "}
          </div>
        );
      })}{" "}
      <div className="ev-pager">
        {" "}
        <button
          type="button"
          className="btn"
          disabled={paged.page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </button>{" "}
        <span className="ev-page">
          Page {paged.page} of {paged.totalPages}
        </span>{" "}
        <button
          type="button"
          className="btn"
          disabled={paged.page >= paged.totalPages}
          onClick={() => setPage((p) => Math.min(paged.totalPages, p + 1))}
        >
          Next
        </button>{" "}
        <label className="ev-perpage">
          {" "}
          Show{" "}
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value) || 20);
              setPage(1);
            }}
            aria-label="Rows per page"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>{" "}
        </label>{" "}
      </div>{" "}
      {modal && (
        <VaultModal
          row={modal.row}
          mode={modal.mode}
          onClose={() => setModal(null)}
        />
      )}{" "}
    </div>
  );
}
