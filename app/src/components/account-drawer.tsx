"use client";
import { explorerBase, networkPassphrase } from "@/lib/network";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { accountName, setAccountNames, useAccountNames } from "@/lib/account-names";
import { signAndSend, toBase, type TxStep } from "@/lib/tx";
import { TokenIcon } from "./token-icon";
import { TxModal, type TxSpec } from "./tx-modal";

/* Smart account drawer (opened from the navbar account menu): the account
   as a wallet — balances, Fund (wallet -> account), Withdraw (account ->
   wallet), address + explorer, and "use for transactions". Opened with
   window event "seidar:open-account" { detail: { address, owner } }. */

type Bal = { code: string; issuer: string | null; balance: number; contract: string };
type Mode = "fund" | "withdraw";

/** Keep this much XLM in the wallet for its reserve + fees when funding. */
const WALLET_XLM_FLOOR = 2.5;

const fmt = (n: number, d = 4) => n.toLocaleString("en-US", { maximumFractionDigits: d });
const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  return (await apiFetch(path, { cache: "no-store", ...init }).then((r) => r.json())) as T;
}

/** Stellar Asset Contract id for a classic asset (native XLM included). */
async function sacFor(code: string, issuer: string | null): Promise<string> {
  const sdk = await import("@stellar/stellar-sdk");
  const asset = code === "XLM" && !issuer ? sdk.Asset.native() : new sdk.Asset(code, issuer!);
  return asset.contractId(networkPassphrase());
}

export function AccountDrawer({ activeAccount }: { activeAccount: string | null }) {
  const [target, setTarget] = useState<{ address: string; owner: string } | null>(null);
  const [walletBals, setWalletBals] = useState<Bal[]>([]);
  const [acctBals, setAcctBals] = useState<Bal[] | null>(null);
  const [prices, setPrices] = useState<Record<string, number | null>>({});
  const [mode, setMode] = useState<Mode>("fund");
  const [code, setCode] = useState("XLM");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [spec, setSpec] = useState<TxSpec | null>(null);
  const [copied, setCopied] = useState(false);
  /** Rename: draft name while editing, null otherwise. */
  const [naming, setNaming] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);
  useAccountNames();

  useEffect(() => {
    function onOpen(e: Event) {
      const d = (e as CustomEvent<{ address?: string; owner?: string }>).detail;
      if (d?.address && d.owner) {
        setTarget({ address: d.address, owner: d.owner });
        setMode("fund");
        setAmount("");
        setErr(null);
        setNaming(null);
      }
    }
    window.addEventListener("seidar:open-account", onOpen);
    return () => window.removeEventListener("seidar:open-account", onOpen);
  }, []);

  const load = useCallback(async () => {
    if (!target) return;
    try {
      const w = await json<{ ok?: boolean; balances?: Omit<Bal, "contract">[] }>(`/api/balances?address=${target.owner}`);
      const wb: Bal[] = await Promise.all(
        (w.balances ?? []).map(async (b) => ({ ...b, contract: await sacFor(b.code, b.issuer) })),
      );
      setWalletBals(wb);
      const extra = wb.map((b) => b.contract).join(",");
      const a = await json<{ ok?: boolean; balances?: Bal[] }>(`/api/balances?address=${target.address}&tokens=${extra}`);
      setAcctBals(a.ok ? (a.balances ?? []) : []);
      const codes = [...new Set([...wb, ...(a.balances ?? [])].map((b) => b.code))];
      if (codes.length) {
        const p = await json<{ ok?: boolean; prices?: Record<string, number | null> }>(`/api/prices?codes=${codes.join(",")}`);
        if (p.ok) setPrices(p.prices ?? {});
      }
    } catch {
      /* keep last */
    }
  }, [target]);
  useEffect(() => {
    if (!target) return;
    setAcctBals(null);
    load();
    window.addEventListener("seidar:refresh", load);
    return () => window.removeEventListener("seidar:refresh", load);
  }, [target, load]);
  useEffect(() => {
    if (!target) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !spec) setTarget(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [target, spec]);

  const source = mode === "fund" ? walletBals : (acctBals ?? []);
  const options = useMemo(() => source.filter((b) => b.balance > 0), [source]);
  useEffect(() => {
    if (options.length && !options.some((o) => o.code === code)) setCode(options[0].code);
  }, [options, code]);
  const picked = options.find((o) => o.code === code) ?? null;
  const max = picked
    ? Math.max(0, picked.balance - (mode === "fund" && picked.code === "XLM" ? WALLET_XLM_FLOOR : 0))
    : 0;
  const total = (acctBals ?? []).reduce((s, b) => s + b.balance * (prices[b.code] ?? 0), 0);
  const unpriced = (acctBals ?? []).some((b) => prices[b.code] == null);

  if (!target) return null;
  const isActive = activeAccount === target.address;
  const tgt = target;

  function review() {
    setErr(null);
    const n = Number(amount);
    if (!picked) return setErr(mode === "fund" ? "Your wallet holds nothing to fund with." : "This account holds nothing yet.");
    if (!(n > 0)) return setErr("Enter an amount above 0.");
    if (n > max + 1e-9)
      return setErr(
        mode === "fund" && picked.code === "XLM"
          ? `Max ${fmt(max)} XLM — ${WALLET_XLM_FLOOR} XLM stays in your wallet for its reserve and fees.`
          : `Max ${fmt(max)} ${picked.code}.`,
      );
    const base = toBase(amount, 7);
    if (!base) return setErr("Amount has too many decimals.");
    const noTrustline =
      mode === "withdraw" && picked.code !== "XLM" && !walletBals.some((b) => b.contract === picked.contract);
    const verb = mode === "fund" ? "Fund" : "Withdraw";
    const usd = prices[picked.code] != null ? n * (prices[picked.code] as number) : null;
    const pc = picked;
    setSpec({
      title: `${verb}: ${amount} ${pc.code}`,
      code: pc.code,
      amount,
      context: mode === "fund" ? "Wallet → smart account" : "Smart account → wallet",
      rows: [
        { label: "Amount", value: `${amount} ${pc.code}`, sub: usd != null ? fmtUsd(usd) : undefined },
        { label: "From", value: shortAddress(mode === "fund" ? tgt.owner : tgt.address) },
        { label: "To", value: shortAddress(mode === "fund" ? tgt.address : tgt.owner) },
        { label: "Signatures", value: "1" },
      ],
      notes: noTrustline
        ? [`Your wallet shows no ${pc.code} balance — if it has no ${pc.code} trustline, add one in your wallet first or the transfer fails.`]
        : undefined,
      confirmLabel: verb,
      execute: async (onSteps) => {
        const step: TxStep = { key: "t", label: `${verb} ${pc.code}`, status: "building" };
        onSteps([{ ...step }]);
        try {
          const b = await json<{ ok?: boolean; xdr?: string; error?: string }>("/api/automation/account/transfer", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              owner: tgt.owner,
              account: tgt.address,
              token: pc.contract,
              amount: base,
              direction: mode === "fund" ? "in" : "out",
            }),
          });
          if (!b.ok || !b.xdr) throw new Error(b.error ?? "Could not build the transfer.");
          const sent = await signAndSend(b.xdr, tgt.owner, (st) => {
            step.status = st;
            onSteps([{ ...step }]);
          });
          step.status = "done";
          step.hash = sent.hash;
          onSteps([{ ...step }]);
          setAmount("");
          window.dispatchEvent(new Event("seidar:refresh"));
        } catch (e) {
          step.status = "failed";
          step.error = e instanceof Error ? e.message : String(e);
          step.hash = (e as { hash?: string | null })?.hash ?? null;
          onSteps([{ ...step }]);
          throw e;
        }
      },
    });
  }

  async function saveName() {
    if (naming == null) return;
    const name = naming.trim().slice(0, 32);
    try {
      const r = await json<{ ok?: boolean; name?: string; error?: string }>("/api/smart-account/name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ owner: tgt.owner, address: tgt.address, name }),
      });
      if (!r.ok) throw new Error(r.error ?? "Couldn't save the name.");
      setAccountNames({ [tgt.address]: r.name ?? name });
      setNaming(null);
      setNameErr(null);
    } catch (e) {
      setNameErr(e instanceof Error ? e.message : "Couldn't save the name.");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(tgt.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div className="ad-overlay" onMouseDown={() => !spec && setTarget(null)} />
      <aside className="ad" role="dialog" aria-label="Smart account">
        <div className="ad-head">
          <div className="ad-ident">
            <small>Smart account{isActive ? " · active" : ""}</small>
            {naming != null ? (
              <form
                className="ad-name-edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveName();
                }}
              >
                <input
                  value={naming}
                  maxLength={32}
                  autoFocus
                  placeholder="Account name"
                  onChange={(e) => setNaming(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setNaming(null);
                  }}
                />
                <button type="submit">Save</button>
              </form>
            ) : (
              <div className="ad-name">
                <b>{accountName(tgt.address) ?? shortAddress(tgt.address)}</b>
                <button
                  type="button"
                  className="ad-rename"
                  aria-label="Rename account"
                  title="Rename"
                  onClick={() => {
                    setNameErr(null);
                    setNaming(accountName(tgt.address) ?? "");
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
              </div>
            )}
            <button type="button" className="ad-addr" onClick={copy} title={`Copy ${tgt.address}`}>
              {copied ? "Copied ✓" : shortAddress(tgt.address)}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
            </button>
            {nameErr && <small className="ad-name-err">{nameErr}</small>}
          </div>
          <button type="button" className="ad-x" aria-label="Close" onClick={() => setTarget(null)}>
            ×
          </button>
        </div>

        <div className="ad-total">
          <span>Total value</span>
          <b>{acctBals == null ? "…" : fmtUsd(total)}</b>
          {unpriced && <small>Some assets have no live price and aren&apos;t counted.</small>}
        </div>

        <div className="ad-quick">
          {!isActive && (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("seidar:set-active-account", { detail: tgt.address }));
                // The dashboard follows the tx account into the smart wallet.
                window.dispatchEvent(new CustomEvent("seidar:set-view-scope", { detail: tgt.address }));
              }}
            >
              Use for transactions
            </button>
          )}
          <a className="btn" href={`${explorerBase()}/contract/${tgt.address}`} target="_blank" rel="noreferrer">
            View on explorer
          </a>
        </div>

        <div className="ad-tabs" role="tablist">
          {(["fund", "withdraw"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? "on" : ""}
              onClick={() => {
                setMode(m);
                setAmount("");
                setErr(null);
              }}
            >
              {m === "fund" ? "Fund" : "Withdraw"}
            </button>
          ))}
        </div>
        <div className="ad-form">
          <p className="ad-hint">
            {mode === "fund"
              ? "Move assets from your wallet into this smart account. Everything in Seidar runs from it."
              : "Send assets back to your wallet."}
          </p>
          {options.length === 0 ? (
            <p className="ad-hint">{mode === "fund" ? "Your wallet holds nothing to fund with." : "Nothing to withdraw yet."}</p>
          ) : (
            <>
              <div className="ad-chips">
                {options.map((o) => (
                  <button key={o.contract} type="button" className={o.code === code ? "on" : ""} onClick={() => setCode(o.code)}>
                    <TokenIcon symbol={o.code} size={16} /> {o.code}
                  </button>
                ))}
              </div>
              <div className="ad-amount">
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  aria-label="Amount"
                />
                <button type="button" onClick={() => setAmount(max > 0 ? String(Math.floor(max * 1e7) / 1e7) : "")}>
                  Max
                </button>
              </div>
              <small className="ad-avail">
                Available: {fmt(max)} {code}
                {mode === "fund" && code === "XLM" ? ` (${WALLET_XLM_FLOOR} XLM kept for your wallet's reserve)` : ""}
              </small>
              {err && <p className="ad-err">{err}</p>}
              <button type="button" className="btn primary ad-go" onClick={review}>
                {mode === "fund" ? "Review funding" : "Review withdrawal"}
              </button>
            </>
          )}
        </div>

        <div className="ad-list">
          <h4>Balances</h4>
          {acctBals == null ? (
            <p className="ad-hint">Loading…</p>
          ) : acctBals.length === 0 ? (
            <p className="ad-hint">Empty — fund it to get started.</p>
          ) : (
            acctBals.map((b) => (
              <div key={b.contract} className="ad-row">
                <TokenIcon symbol={b.code} size={26} />
                <div>
                  <b>{b.code}</b>
                  <small>{prices[b.code] != null ? fmtUsd(b.balance * (prices[b.code] as number)) : "No price"}</small>
                </div>
                <span>{fmt(b.balance)}</span>
              </div>
            ))
          )}
        </div>
        <p className="ad-foot">
          Owner {shortAddress(tgt.owner)} · only your wallet can move funds; automation keepers act only inside rules you
          enable.
        </p>
      </aside>
      <TxModal spec={spec} onClose={() => setSpec(null)} />
    </>
  );
}
