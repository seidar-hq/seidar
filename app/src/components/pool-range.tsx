"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { explorerBase } from "@/lib/network";
import { signAndSend, toBase, type TxStep } from "@/lib/tx";
import { TxModal, type TxSpec } from "./tx-modal";
import { TokenIcon } from "./token-icon";
import { LiquidityChart, fmtPx } from "./pool-charts";
import { isSmartAddress, smartGate, useSmartAccount } from "./smart-gate";

/* Aqua concentrated pools: liquidity is a price RANGE. It earns trading
   fees only while the price sits inside it; once the price leaves, the
   range holds a single token and earns nothing until it is rebalanced
   (withdrawn and re-deposited around the current price). Every number
   here is read live from the pool contract (/api/dex/cl/*). */

export type ClPool = {
  tokens: string[];
  codes: string[];
  decimals: number[];
  tick: number;
  tickSpacing: number;
  price: number;
  bins: { lo: number; hi: number; liquidity: number }[];
};
export type ClPosition = {
  tickLower: number;
  tickUpper: number;
  priceLower: number;
  priceUpper: number;
  inRange: boolean;
  liquidity: string;
  amounts: string[];
  fees: string[];
};

const trim = (n: number) => (Number.isFinite(n) ? n.toFixed(7).replace(/\.?0+$/, "") || "0" : "0");
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 2 : 6 });

export function useClPool(pool: string, enabled: boolean) {
  const [info, setInfo] = useState<ClPool | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    apiFetch(`/api/dex/cl/pool?pool=${pool}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => !dead && d?.ok && setInfo(d as ClPool))
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [pool, enabled]);
  return info;
}

export function useClPositions(pool: string, account: string | null, enabled: boolean) {
  const [positions, setPositions] = useState<ClPosition[] | null>(null);
  const load = useCallback(() => {
    if (!enabled || !account) {
      setPositions(null);
      return;
    }
    apiFetch(`/api/dex/cl/positions?pool=${pool}&address=${account}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPositions(d?.ok ? (d.positions as ClPosition[]) : []))
      .catch(() => setPositions([]));
  }, [pool, account, enabled]);
  useEffect(() => {
    load();
    window.addEventListener("seidar:refresh", load);
    return () => window.removeEventListener("seidar:refresh", load);
  }, [load]);
  return { positions, reload: load };
}

async function buildAndSend(body: Record<string, unknown>, owner: string, step: TxStep, onSteps: () => void) {
  step.status = "building";
  onSteps();
  const r = await apiFetch("/api/dex/cl/build", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((x) => x.json());
  if (!r?.ok || !r.xdr) throw new Error(r?.error ?? "Could not build the transaction.");
  const sent = await signAndSend(r.xdr, owner, (st) => {
    step.status = st;
    onSteps();
  });
  step.status = "done";
  step.hash = sent.hash;
  onSteps();
  return r as { amounts?: string[] };
}

/** Range tab: distribution chart, the account's ranges, rebalance. */
export function ClRanges({ pool, info, account, owner }: { pool: string; info: ClPool; account: string | null; owner: string | null }) {
  const { positions, reload } = useClPositions(pool, account, true);
  const { smarts } = useSmartAccount();
  const gate = account && !isSmartAddress(account) ? smartGate(owner, smarts) : null;
  const [spec, setSpec] = useState<TxSpec | null>(null);
  const [b, q] = info.codes;
  const dec = info.decimals;
  const amt = (p: ClPosition, k: number) => Number(p.amounts[k] ?? 0) / 10 ** dec[k];
  const fee = (p: ClPosition, k: number) => Number(p.fees[k] ?? 0) / 10 ** dec[k];

  type Step = { label: string; body: () => Record<string, unknown>; after?: (r: { amounts?: string[] }) => void };
  function run(title: string, rows: TxSpec["rows"], steps: Step[], notes?: string[]) {
    if (!account || !owner) return;
    setSpec({
      title,
      code: b,
      context: `Aqua concentrated pool · ${b}/${q}`,
      rows: [...rows, { label: "Signatures", value: String(steps.length) }],
      notes,
      confirmLabel: steps.length > 1 ? "Start" : "Confirm",
      execute: async (onSteps) => {
        const st: TxStep[] = steps.map((s, i) => ({ key: `s${i}`, label: s.label, status: "queued" }));
        const push = () => onSteps(st.map((x) => ({ ...x })));
        push();
        try {
          for (let i = 0; i < steps.length; i++) steps[i].after?.(await buildAndSend(steps[i].body(), owner, st[i], push));
        } catch (e) {
          const cur = st.find((x) => x.status !== "done");
          if (cur) {
            cur.status = "failed";
            cur.error = e instanceof Error ? e.message : String(e);
          }
          push();
          throw e;
        } finally {
          reload();
          window.dispatchEvent(new Event("seidar:refresh"));
        }
      },
    });
  }

  function withdraw(p: ClPosition) {
    run(
      `Withdraw range ${fmtPx(p.priceLower)} – ${fmtPx(p.priceUpper)}`,
      [
        { label: "You receive", value: `${num(amt(p, 0))} ${b} + ${num(amt(p, 1))} ${q}` },
        { label: "Slippage guard", value: "1%" },
      ],
      [{ label: "Withdraw range", body: () => ({ pool, from: account, signer: owner, action: "cl_withdraw", tickLower: p.tickLower, tickUpper: p.tickUpper }) }],
    );
  }
  /** Same width (as a price ratio), re-centered on the live price. */
  function rebalance(p: ClPosition) {
    const half = Math.sqrt(p.priceUpper / p.priceLower);
    const lo = info.price / half;
    const hi = info.price * half;
    let got: string[] | null = null;
    run(
      "Rebalance range",
      [
        { label: "From", value: `${fmtPx(p.priceLower)} – ${fmtPx(p.priceUpper)} ${q}` },
        { label: "To", value: `${fmtPx(lo)} – ${fmtPx(hi)} ${q}`, hint: "Same width, centered on the live price." },
        { label: "Moves", value: `${num(amt(p, 0))} ${b} + ${num(amt(p, 1))} ${q}` },
      ],
      [
        {
          label: "Withdraw the old range",
          body: () => ({ pool, from: account, signer: owner, action: "cl_withdraw", tickLower: p.tickLower, tickUpper: p.tickUpper }),
          after: (r) => {
            got = r.amounts ?? null;
          },
        },
        {
          label: "Deposit around the price",
          body: () => {
            // What the withdrawal returned, less 1% so it fits the balance.
            const w = (got ?? p.amounts).map((x) => ((BigInt(x || "0") * BigInt(99)) / BigInt(100)).toString());
            return { pool, from: account, signer: owner, action: "cl_deposit", priceLower: lo, priceUpper: hi, amounts: w };
          },
        },
      ],
      [
        "A range one token-heavy after the price moved goes back in as far as the new range takes it; whatever doesn't fit stays in your account.",
      ],
    );
  }
  function claim() {
    const tot = [0, 1].map((k) => (positions ?? []).reduce((s, p) => s + fee(p, k), 0));
    run(
      "Claim trading fees",
      [{ label: "Fees", value: `${num(tot[0])} ${b} + ${num(tot[1])} ${q}` }],
      [{ label: "Claim fees", body: () => ({ pool, from: account, signer: owner, action: "cl_claim" }) }],
    );
  }

  const outCount = (positions ?? []).filter((p) => !p.inRange && BigInt(p.liquidity) > BigInt(0)).length;
  const feeTotal = (positions ?? []).reduce((s, p) => s + fee(p, 0) + fee(p, 1), 0);
  return (
    <div className="pr-wrap">
      <LiquidityChart
        bins={info.bins}
        price={info.price}
        base={b}
        quote={q}
        ranges={(positions ?? []).map((p) => ({ lo: p.priceLower, hi: p.priceUpper, inRange: p.inRange }))}
      />
      <div className="pr-explain">
        <b>How this pool works</b>
        <p>
          Liquidity sits in a price range you choose. It earns trading fees only while {b} trades inside that range; when the price
          leaves it, the range turns into a single token and stops earning. <b>Rebalance</b> moves it back around the current price.
        </p>
      </div>
      <div className="pr-head">
        <h4>Your ranges</h4>
        {positions && positions.length > 0 && (
          <button type="button" className="btn" disabled={!!gate || !(feeTotal > 0)} onClick={claim} title={gate ? "Fees are claimed from your smart account." : undefined}>
            Claim fees
          </button>
        )}
      </div>
      {outCount > 0 && (
        <p className="pr-alert">
          <i aria-hidden="true">!</i> {outCount} range{outCount > 1 ? "s are" : " is"} out of range and earning nothing — rebalance to put
          {outCount > 1 ? " them" : " it"} back to work.
        </p>
      )}
      {!account ? (
        <p className="pr-empty">Connect a wallet to see your ranges in this pool.</p>
      ) : positions == null ? (
        <p className="pr-empty">Reading your ranges…</p>
      ) : positions.length === 0 ? (
        <p className="pr-empty">
          {isSmartAddress(account) ? "No ranges in this pool yet — add one from the panel on the right." : "This wallet has no ranges in this pool."}
        </p>
      ) : (
        <div className="pr-list">
          {positions.map((p) => (
            <div key={`${p.tickLower}:${p.tickUpper}`} className="pr-row">
              <div>
                <span className={`pr-badge ${p.inRange ? "in" : "out"}`}>{p.inRange ? "In range" : "Out of range"}</span>
                <b>
                  {fmtPx(p.priceLower)} – {fmtPx(p.priceUpper)} <small>{q} per {b}</small>
                </b>
              </div>
              <div className="pr-amts">
                <span>
                  <TokenIcon symbol={b} size={16} /> {num(amt(p, 0))}
                </span>
                <span>
                  <TokenIcon symbol={q} size={16} /> {num(amt(p, 1))}
                </span>
                <small>
                  Fees {num(fee(p, 0))} {b} · {num(fee(p, 1))} {q}
                </small>
              </div>
              <div className="pr-acts">
                <button type="button" className="btn" disabled={!!gate} onClick={() => withdraw(p)}>
                  Withdraw
                </button>
                <button type="button" className={`btn${p.inRange ? "" : " primary"}`} disabled={!!gate} onClick={() => rebalance(p)}>
                  Rebalance
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {gate && positions && positions.length > 0 && (
        <p className="pr-empty">
          Seidar acts from your Smart Account. <button type="button" className="linkbtn" onClick={gate.run}>{gate.label}</button>
        </p>
      )}
      <TxModal spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}

/** Side panel: add a range at chosen prices. */
export function ClDeposit({
  pool,
  info,
  account,
  owner,
  bals,
}: {
  pool: string;
  info: ClPool;
  account: string | null;
  owner: string | null;
  bals: Record<string, number>;
}) {
  const [b, q] = info.codes;
  const { smarts } = useSmartAccount();
  const gate = !isSmartAddress(account) ? smartGate(owner, smarts) : null;
  const [width, setWidth] = useState<number | "custom">(10);
  const [lo, setLo] = useState("");
  const [hi, setHi] = useState("");
  const [amts, setAmts] = useState<string[]>(["", ""]);
  const [spec, setSpec] = useState<TxSpec | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pLo = width === "custom" ? Number(lo) : info.price * (1 - width / 100);
  const pHi = width === "custom" ? Number(hi) : info.price * (1 + width / 100);
  const below = pHi > 0 && pHi <= info.price; // range under the price: quote only
  const above = pLo > info.price; // above: base only
  function submit() {
    setErr(null);
    if (!(pLo > 0 && pHi > pLo)) return setErr("Pick a range: the upper price must be above the lower one.");
    const base = [toBase(amts[0] || "0", info.decimals[0]) ?? "0", toBase(amts[1] || "0", info.decimals[1]) ?? "0"];
    if (above) base[1] = "0";
    if (below) base[0] = "0";
    if (base.every((x) => x === "0")) return setErr(above ? `This range sits above the price: it takes ${b} only.` : below ? `This range sits below the price: it takes ${q} only.` : "Enter an amount.");
    if (!account || !owner) return;
    setSpec({
      title: `Add range ${fmtPx(pLo)} – ${fmtPx(pHi)}`,
      code: b,
      context: `Aqua concentrated pool · ${b}/${q}`,
      rows: [
        { label: "Range", value: `${fmtPx(pLo)} – ${fmtPx(pHi)} ${q}`, hint: `Live price ${fmtPx(info.price)}` },
        { label: "Up to", value: `${amts[0] || "0"} ${b} + ${amts[1] || "0"} ${q}`, hint: "The pool takes the ratio the range needs; the rest stays in your account." },
        { label: "Slippage guard", value: "1%" },
        { label: "Signatures", value: "1" },
      ],
      confirmLabel: "Add liquidity",
      execute: async (onSteps) => {
        const st: TxStep = { key: "dep", label: "Add range", status: "queued" };
        const push = () => onSteps([{ ...st }]);
        try {
          await buildAndSend({ pool, from: account, signer: owner, action: "cl_deposit", priceLower: pLo, priceUpper: pHi, amounts: base }, owner, st, push);
          setAmts(["", ""]);
        } catch (e) {
          st.status = "failed";
          st.error = e instanceof Error ? e.message : String(e);
          push();
          throw e;
        } finally {
          window.dispatchEvent(new Event("seidar:refresh"));
        }
      },
    });
  }
  return (
    <div className="pr-dep">
      <div className="pr-widths" role="group" aria-label="Range width">
        {([2, 5, 10, 25] as const).map((w) => (
          <button key={w} type="button" className={width === w ? "on" : ""} onClick={() => setWidth(w)}>
            ±{w}%
          </button>
        ))}
        <button
          type="button"
          className={width === "custom" ? "on" : ""}
          onClick={() => {
            setLo(trim(pLo));
            setHi(trim(pHi));
            setWidth("custom");
          }}
        >
          Custom
        </button>
      </div>
      <div className="pr-prices">
        <label>
          <span>Min price</span>
          {width === "custom" ? <input value={lo} inputMode="decimal" onChange={(e) => setLo(e.target.value.replace(/[^0-9.]/g, ""))} /> : <b>{fmtPx(pLo)}</b>}
          <small>{q} per {b}</small>
        </label>
        <label>
          <span>Max price</span>
          {width === "custom" ? <input value={hi} inputMode="decimal" onChange={(e) => setHi(e.target.value.replace(/[^0-9.]/g, ""))} /> : <b>{fmtPx(pHi)}</b>}
          <small>{q} per {b}</small>
        </label>
      </div>
      {[0, 1].map((k) => {
        const code = info.codes[k];
        const off = (k === 1 && above) || (k === 0 && below);
        return (
          <div key={code} className={`pd-box${off ? " pr-off" : ""}`}>
            <div className="pd-box-top">
              <span className="pd-tok">
                <TokenIcon symbol={code} size={22} /> {code}
              </span>
              <span className="pd-bal">
                {num(bals[code] ?? 0)} {code}{" "}
                <button type="button" className="pd-max" disabled={off || !((bals[code] ?? 0) > 0)} onClick={() => setAmts((a) => a.map((x, i) => (i === k ? trim(bals[code] ?? 0) : x)))}>
                  MAX
                </button>
              </span>
            </div>
            <input
              className="pd-amt"
              value={off ? "" : amts[k]}
              disabled={off}
              placeholder={off ? "Not used by this range" : "0.00"}
              inputMode="decimal"
              aria-label={`${code} amount`}
              onChange={(e) => setAmts((a) => a.map((x, i) => (i === k ? e.target.value.replace(/[^0-9.]/g, "") : x)))}
            />
          </div>
        );
      })}
      {err && <p className="qm-error">{err}</p>}
      <button type="button" className="btn primary pd-submit" onClick={gate ? gate.run : submit} disabled={!gate && !account}>
        {gate ? gate.label : "Add liquidity"}
      </button>
      <p className="pr-note">
        Narrow ranges earn more per dollar while the price stays inside, and need rebalancing more often.{" "}
        <a href={`${explorerBase()}/contract/${pool}`} target="_blank" rel="noreferrer">
          Pool contract ↗
        </a>
      </p>
      <TxModal spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}
