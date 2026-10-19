"use client";

/* Refinance > Vaults and Pools: move a position from one vault (or pool)
   to another. Soroban runs one contract call per transaction, so a move is
   a short chain of owner-signed steps on the smart account — withdraw,
   swap when the assets differ, deposit — each confirmed on-chain before the
   next. Amounts carried forward are what the account actually received
   (balance read after each step), never the quote; funds sit in the smart
   account between steps, so a stopped move loses nothing. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { signAndSend, toBase, type TxStep } from "@/lib/tx";
import { executeMarketSwap, type SwapToken } from "./exchange";
import { LoadingMark } from "./loading";
import { ProtoMark } from "./proto-mark";
import { useTxActive } from "./shell";
import { isSmartAddress, smartGate, useSmartAccount } from "./smart-gate";
import { TokenIcon } from "./token-icon";
import { TxModal, type TxSpec } from "./tx-modal";

const fmtUsd = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(2)}K` : `$${v.toFixed(2)}`;
const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(2)}%`);
const trim = (n: number) => (n >= 1 ? n.toFixed(4) : n.toFixed(7)).replace(/\.?0+$/, "") || "0";
const venue = (p: string) => ({ defindex: "DeFindex", upshift: "Upshift", soroswap: "Soroswap", aqua: "Aqua", phoenix: "Phoenix" })[p] ?? p;

async function postJson(path: string, body: unknown) {
  const r = await apiFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}
/** The smart account's raw balance of each token (base units). */
async function rawBalances(account: string, tokens: string[]): Promise<Record<string, bigint>> {
  const d = await apiFetch(`/api/balances?address=${account}&tokens=${tokens.join(",")}`, { cache: "no-store" }).then((r) => r.json());
  const out: Record<string, bigint> = {};
  for (const t of tokens) out[t] = BigInt(0);
  for (const b of (d?.balances ?? []) as { contract?: string; raw?: string }[])
    if (b.contract && b.contract in out && b.raw && /^\d+$/.test(b.raw)) out[b.contract] = BigInt(b.raw);
  return out;
}
/** One owner-signed step: build on the API, sign, confirm. */
async function signedStep(owner: string, steps: TxStep[], i: number, onSteps: (s: TxStep[]) => void, build: () => Promise<{ ok?: boolean; xdr?: string; error?: string }>) {
  steps[i].status = "building";
  onSteps([...steps]);
  const b = await build();
  if (!b?.ok || typeof b.xdr !== "string") throw new Error(String(b?.error ?? "Could not build the transaction."));
  const sent = await signAndSend(b.xdr, owner, (st) => {
    steps[i].status = st;
    onSteps([...steps]);
  });
  steps[i].status = "done";
  steps[i].hash = sent.hash;
  onSteps([...steps]);
}
function useSwapTokens(): SwapToken[] {
  const [t, setT] = useState<SwapToken[]>([]);
  useEffect(() => {
    apiFetch("/api/swap/tokens", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d?.ok && setT(d.tokens as SwapToken[]))
      .catch(() => {});
  }, []);
  return t;
}
function useActiveSmart() {
  const { owner, smarts } = useSmartAccount();
  const active = useTxActive(owner) ?? owner;
  const gate = !isSmartAddress(active) ? smartGate(owner, smarts) : null;
  return { owner, active, gate };
}

/* ================= Vault -> vault ================= */

type VaultRow = { protocol: string; address: string; name: string; asset: string; assetCode: string; assetDecimals: number; apyPct: number | null; tvlUsd: number | null };
type VaultPos = { protocol: string; vault: string; name: string; shares: string; underlying?: { amount: string }[]; valueUsd: number | null };

export function VaultMove() {
  const { owner, active, gate } = useActiveSmart();
  const tokens = useSwapTokens();
  const [vaults, setVaults] = useState<VaultRow[] | null>(null);
  const [pos, setPos] = useState<VaultPos[] | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [part, setPart] = useState(100);
  const [spec, setSpec] = useState<TxSpec | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/vaults", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setVaults(d?.ok ? (d.rows as VaultRow[]) : []))
      .catch(() => setVaults([]));
  }, []);
  const load = useCallback(() => {
    if (!active) return setPos([]);
    setPos(null);
    apiFetch(`/api/vaults/positions?address=${active}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPos(d?.ok ? (d.positions as VaultPos[]) : []))
      .catch(() => setPos([]));
  }, [active]);
  useEffect(() => {
    load();
    window.addEventListener("seidar:refresh", load);
    return () => window.removeEventListener("seidar:refresh", load);
  }, [load]);

  const src = (pos ?? []).find((p) => p.vault === from) ?? null;
  const srcRow = (vaults ?? []).find((v) => v.address === from) ?? null;
  const dst = (vaults ?? []).find((v) => v.address === to) ?? null;
  const srcAmt = src?.underlying?.[0] ? Number(src.underlying[0].amount) / 10 ** (srcRow?.assetDecimals ?? 7) : 0;
  const moveAmt = (srcAmt * part) / 100;
  const swapNeeded = !!srcRow && !!dst && srcRow.asset !== dst.asset;
  const targets = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (vaults ?? [])
      .filter((v) => v.address !== from && (!n || `${v.name} ${v.assetCode}`.toLowerCase().includes(n)))
      .sort((a, b) => (b.apyPct ?? -1) - (a.apyPct ?? -1))
      .slice(0, 40);
  }, [vaults, from, q]);

  function start() {
    setErr(null);
    if (!owner || !active || !src || !srcRow || !dst) return;
    if (!(moveAmt > 0)) return setErr("Nothing to move.");
    const sell = tokens.find((t) => t.contract === srcRow.asset);
    const buy = tokens.find((t) => t.contract === dst.asset);
    if (swapNeeded && (!sell || !buy)) return setErr(`No swap route registered for ${srcRow.assetCode} → ${dst.assetCode}.`);
    const all = part >= 100;
    const labels = [`Withdraw ${trim(moveAmt)} ${srcRow.assetCode} from ${srcRow.name}`, ...(swapNeeded ? [`Swap ${srcRow.assetCode} → ${dst.assetCode}`] : []), `Deposit into ${dst.name}`];
    setSpec({
      title: `Move to ${dst.name}`,
      code: dst.assetCode,
      amount: `${trim(moveAmt)} ${srcRow.assetCode}`,
      context: `${venue(srcRow.protocol)} → ${venue(dst.protocol)}`,
      rows: [
        { label: "From", value: `${srcRow.name} · ${pct(srcRow.apyPct)}` },
        { label: "To", value: `${dst.name} · ${pct(dst.apyPct)}` },
        { label: "Amount", value: `${trim(moveAmt)} ${srcRow.assetCode}` },
        { label: "Steps", value: String(labels.length), hint: "One signature each, confirmed before the next." },
      ],
      notes: [
        "Each step carries forward what your smart account actually received.",
        ...(swapNeeded ? ["The swap routes through Soroswap · Aqua with a 0.5% slippage guard."] : []),
        "If you stop between steps, the funds wait in your smart account.",
      ],
      confirmLabel: "Start move",
      execute: async (onSteps) => {
        const steps: TxStep[] = labels.map((label, i) => ({ key: `m${i}`, label, status: "queued" }));
        onSteps([...steps]);
        let i = 0;
        const fail = (e: unknown) => {
          steps[i].status = "failed";
          steps[i].error = e instanceof Error ? e.message : String(e);
          onSteps([...steps]);
          throw e;
        };
        try {
          const b0 = await rawBalances(active, [srcRow.asset]);
          await signedStep(owner, steps, i, onSteps, () =>
            postJson("/api/vaults/build", {
              protocol: srcRow.protocol,
              vault: srcRow.address,
              action: all ? "withdraw-shares" : "withdraw",
              caller: active,
              signer: owner,
              amounts: [toBase(trim(moveAmt), srcRow.assetDecimals)],
              shares: all ? src.shares : undefined,
              slippageBps: 50,
            }),
          );
          let got = (await rawBalances(active, [srcRow.asset]))[srcRow.asset] - b0[srcRow.asset];
          if (got <= BigInt(0)) throw new Error("The withdrawal returned nothing to the account.");
          let depositAsset = srcRow.asset;
          if (swapNeeded) {
            i++;
            steps[i].status = "building";
            onSteps([...steps]);
            const before = (await rawBalances(active, [dst.asset]))[dst.asset];
            const r = await executeMarketSwap({
              sellTok: sell!,
              buyTok: buy!,
              amountTokens: trim(Number(got) / 10 ** sell!.decimals),
              from: active,
              signer: owner,
              slippageBps: "50",
              onStatus: (s) => {
                steps[i].status = /approve/i.test(s) ? "signing" : /submitting/i.test(s) ? "sending" : "building";
                onSteps([...steps]);
              },
            });
            steps[i].status = "done";
            steps[i].hash = r.hash;
            onSteps([...steps]);
            got = (await rawBalances(active, [dst.asset]))[dst.asset] - before;
            if (got <= BigInt(0)) throw new Error("The swap returned nothing to the account.");
            depositAsset = dst.asset;
          }
          void depositAsset;
          i++;
          await signedStep(owner, steps, i, onSteps, () =>
            postJson("/api/vaults/build", {
              protocol: dst.protocol,
              vault: dst.address,
              action: "deposit",
              caller: active,
              signer: owner,
              amounts: [got.toString()],
              slippageBps: 50,
            }),
          );
          window.dispatchEvent(new Event("seidar:refresh"));
        } catch (e) {
          fail(e);
        }
      },
    });
  }

  if (!active) return <p className="pf-empty">Connect a wallet to move vault deposits.</p>;
  return (
    <div className="rm">
      <div className="rm-col">
        <h3 className="rm-h">From</h3>
        {pos === null ? (
          <p className="pf-empty load-row">
            <LoadingMark size={14} /> Reading your vault deposits…
          </p>
        ) : pos.length === 0 ? (
          <p className="pf-empty">{isSmartAddress(active) ? "This smart account has no vault deposits." : "Switch to your smart account — vault deposits move from it."}</p>
        ) : (
          pos.map((p) => {
            const row = (vaults ?? []).find((v) => v.address === p.vault);
            return (
              <button key={p.vault} type="button" className={`rm-card${from === p.vault ? " on" : ""}`} onClick={() => (setFrom(p.vault), setTo(null))}>
                <span className="posx-badged">
                  <TokenIcon symbol={row?.assetCode ?? "USDC"} size={30} />
                  <span className="posx-badge">
                    <ProtoMark id={p.protocol} size={14} />
                  </span>
                </span>
                <span className="rm-card-main">
                  <b>{p.name}</b>
                  <small>
                    {venue(p.protocol)} · {pct(row?.apyPct)} APY
                  </small>
                </span>
                <b>{fmtUsd(p.valueUsd)}</b>
              </button>
            );
          })
        )}
      </div>
      <div className="rm-col">
        <h3 className="rm-h">To</h3>
        {!src ? (
          <p className="pf-empty">Pick the deposit to move.</p>
        ) : (
          <>
            <input className="rm-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vaults…" aria-label="Search target vaults" />
            <div className="rm-list">
              {targets.map((v) => {
                const d = v.apyPct != null && srcRow?.apyPct != null ? v.apyPct - srcRow.apyPct : null;
                return (
                  <button key={v.address} type="button" className={`rm-card${to === v.address ? " on" : ""}`} onClick={() => setTo(v.address)}>
                    <span className="posx-badged">
                      <TokenIcon symbol={v.assetCode} size={30} />
                      <span className="posx-badge">
                        <ProtoMark id={v.protocol} size={14} />
                      </span>
                    </span>
                    <span className="rm-card-main">
                      <b>{v.name}</b>
                      <small>
                        {venue(v.protocol)} · {v.assetCode} · TVL {fmtUsd(v.tvlUsd)}
                      </small>
                    </span>
                    <span className="rm-apy">
                      <b>{pct(v.apyPct)}</b>
                      {d != null && <small className={d >= 0 ? "up" : "down"}>{`${d >= 0 ? "+" : ""}${d.toFixed(2)}%`}</small>}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      <aside className="rm-side">
        <h3 className="rm-h">Move</h3>
        {!src || !dst || !srcRow ? (
          <p className="pf-empty">Pick a deposit and where it goes.</p>
        ) : (
          <>
            <div className="rm-route">
              <span>{srcRow.name}</span>
              <span aria-hidden="true">→</span>
              <span>{dst.name}</span>
            </div>
            <div className="tabs rm-parts">
              {[25, 50, 75, 100].map((p) => (
                <button key={p} type="button" className={`tab${part === p ? " active" : ""}`} onClick={() => setPart(p)}>
                  {p === 100 ? "All" : `${p}%`}
                </button>
              ))}
            </div>
            <div className="pd-meta">
              <div>
                <span>Amount</span>
                <b>
                  {trim(moveAmt)} {srcRow.assetCode}
                </b>
              </div>
              <div>
                <span>APY</span>
                <b>
                  {pct(srcRow.apyPct)} → <span className="rm-apy-to">{pct(dst.apyPct)}</span>
                </b>
              </div>
              <div>
                <span>Steps</span>
                <b>{swapNeeded ? "Withdraw · Swap · Deposit" : "Withdraw · Deposit"}</b>
              </div>
            </div>
            {err && <p className="qm-error">{err}</p>}
            <button type="button" className="btn primary pd-submit" onClick={gate ? gate.run : start}>
              {gate ? gate.label : "Review move"}
            </button>
          </>
        )}
      </aside>
      <TxModal spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}

/* ================= Pool -> pool ================= */

type LpPos = { protocol: string; pool: string; pair: string; shares: string; underlying: { contract: string; code: string; amount: number }[]; valueUsd: number | null };
type DexRow = { protocol: string; address: string; pair: string; assets: { contract: string; code: string }[]; tvlUsd: number | null; feeBps: number | null; poolType: string | null };
const MOVABLE = ["soroswap", "aqua", "phoenix"];

export function PoolMove() {
  const { owner, active, gate } = useActiveSmart();
  const tokens = useSwapTokens();
  const [pos, setPos] = useState<LpPos[] | null>(null);
  const [pools, setPools] = useState<DexRow[]>([]);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [part, setPart] = useState(100);
  const [spec, setSpec] = useState<TxSpec | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    for (const v of MOVABLE)
      apiFetch(`/api/dex/pools?protocol=${v}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => !dead && d?.ok && setPools((p) => [...p.filter((x) => x.protocol !== v), ...(d.rows as DexRow[])]))
        .catch(() => {});
    return () => {
      dead = true;
    };
  }, []);
  const load = useCallback(() => {
    if (!active) return setPos([]);
    setPos(null);
    apiFetch(`/api/dex/positions?address=${active}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPos(d?.ok ? (d.positions as LpPos[]) : []))
      .catch(() => setPos([]));
  }, [active]);
  useEffect(() => {
    load();
    window.addEventListener("seidar:refresh", load);
    return () => window.removeEventListener("seidar:refresh", load);
  }, [load]);

  const src = (pos ?? []).find((p) => p.pool === from) ?? null;
  const dst = pools.find((p) => p.address === to) ?? null;
  const targets = useMemo(() => {
    const n = q.trim().toLowerCase();
    return pools
      .filter((p) => p.address !== from && p.assets.length === 2 && (p.tvlUsd ?? 0) > 0 && (!n || `${p.pair} ${p.protocol}`.toLowerCase().includes(n)))
      .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))
      .slice(0, 40);
  }, [pools, from, q]);

  async function start() {
    setErr(null);
    if (!owner || !active || !src || !dst) return;
    const tok = (c: string) => tokens.find((t) => t.contract === c);
    const target = dst.assets.map((a) => a.contract);
    const srcToks = src.underlying.map((u) => u.contract);
    const missing = [...srcToks, ...target].filter((c) => !tok(c));
    if (missing.length) return setErr("A token in these pools has no swap route registered — move it manually.");
    const prices = await apiFetch(`/api/prices?codes=${[...new Set([...src.underlying.map((u) => u.code), ...dst.assets.map((a) => a.code)])].join(",")}`)
      .then((r) => r.json())
      .then((d) => (d?.prices ?? {}) as Record<string, number | null>)
      .catch(() => ({}) as Record<string, number | null>);
    const px = (c: string) => prices[(tok(c)?.code ?? "").toUpperCase()] ?? null;
    if ([...srcToks, ...target].some((c) => px(c) == null)) return setErr("A token here has no live price, so the deposit can't be balanced.");
    const all = part >= 100;
    const shares = all ? src.shares : ((BigInt(src.shares) * BigInt(part)) / BigInt(100)).toString();
    const labels = [`Remove ${part}% of ${src.pair} liquidity`, "Swap into the target pair", `Add liquidity to ${dst.pair} (${venue(dst.protocol)})`];
    setSpec({
      title: `Move liquidity to ${dst.pair}`,
      code: dst.assets[0].code,
      amount: `${part}% of ${src.pair}`,
      context: `${venue(src.protocol)} → ${venue(dst.protocol)}`,
      rows: [
        { label: "From", value: `${src.pair} · ${venue(src.protocol)}` },
        { label: "To", value: `${dst.pair} · ${venue(dst.protocol)}` },
        { label: "Moving", value: `${part}% · ~${fmtUsd(src.valueUsd != null ? (src.valueUsd * part) / 100 : null)}` },
        { label: "Steps", value: "Remove · Swap(s) · Add", hint: "One signature each, confirmed before the next." },
      ],
      notes: [
        "Tokens the target pool doesn't use are swapped in, then the two sides are balanced by value before adding.",
        "Swaps route through Soroswap · Aqua with a 0.5% slippage guard; any dust left after the deposit stays in your smart account.",
      ],
      confirmLabel: "Start move",
      execute: async (onSteps) => {
        const steps: TxStep[] = labels.map((label, i) => ({ key: `p${i}`, label, status: "queued" }));
        onSteps([...steps]);
        let i = 0;
        try {
          const watch = [...new Set([...srcToks, ...target])];
          const base = await rawBalances(active, watch);
          await signedStep(owner, steps, i, onSteps, () =>
            postJson("/api/dex/liquidity/build", { protocol: src.protocol, pool: src.pool, from: active, signer: owner, action: "withdraw", shares }),
          );
          /* Swaps: everything that isn't a target token goes to the lighter
             target side, then the heavier side tops up the lighter one so
             both carry equal value. */
          i++;
          steps[i].status = "building";
          onSteps([...steps]);
          const delta = async () => {
            const now = await rawBalances(active, watch);
            const d: Record<string, bigint> = {};
            for (const c of watch) d[c] = now[c] - base[c];
            return d;
          };
          const human = (c: string, v: bigint) => Number(v) / 10 ** (tok(c)!.decimals);
          const swap = async (sell: string, buy: string, amount: bigint) => {
            if (amount <= BigInt(0)) return;
            await executeMarketSwap({
              sellTok: tok(sell)!,
              buyTok: tok(buy)!,
              amountTokens: trim(human(sell, amount)),
              from: active,
              signer: owner,
              slippageBps: "50",
              onStatus: (s) => {
                steps[i].status = /approve/i.test(s) ? "signing" : /submitting/i.test(s) ? "sending" : "building";
                onSteps([...steps]);
              },
            });
          };
          let d = await delta();
          for (const c of srcToks.filter((c) => !target.includes(c))) {
            const val = (t: string) => human(t, d[t] > BigInt(0) ? d[t] : BigInt(0)) * px(t)!;
            const lighter = val(target[0]) <= val(target[1]) ? target[0] : target[1];
            await swap(c, lighter, d[c]);
            d = await delta();
          }
          const v0 = human(target[0], d[target[0]] > BigInt(0) ? d[target[0]] : BigInt(0)) * px(target[0])!;
          const v1 = human(target[1], d[target[1]] > BigInt(0) ? d[target[1]] : BigInt(0)) * px(target[1])!;
          if (Math.abs(v0 - v1) / Math.max(v0 + v1, 1e-9) > 0.02) {
            const [heavy, light, vh, vl] = v0 > v1 ? [target[0], target[1], v0, v1] : [target[1], target[0], v1, v0];
            const usd = (vh - vl) / 2;
            const amt = BigInt(Math.floor((usd / px(heavy)!) * 10 ** tok(heavy)!.decimals));
            await swap(heavy, light, amt);
            d = await delta();
          }
          steps[i].status = "done";
          onSteps([...steps]);
          i++;
          const amounts = target.map((c) => (d[c] > BigInt(0) ? d[c] : BigInt(0)).toString());
          if (amounts.every((a) => a === "0")) throw new Error("Nothing arrived to add — the funds are in your smart account.");
          await signedStep(owner, steps, i, onSteps, () =>
            postJson("/api/dex/liquidity/build", { protocol: dst.protocol, pool: dst.address, from: active, signer: owner, action: "deposit", amounts }),
          );
          window.dispatchEvent(new Event("seidar:refresh"));
        } catch (e) {
          steps[i].status = "failed";
          steps[i].error = e instanceof Error ? e.message : String(e);
          onSteps([...steps]);
          throw e;
        }
      },
    });
  }

  if (!active) return <p className="pf-empty">Connect a wallet to move liquidity.</p>;
  return (
    <div className="rm">
      <div className="rm-col">
        <h3 className="rm-h">From</h3>
        {pos === null ? (
          <p className="pf-empty load-row">
            <LoadingMark size={14} /> Reading your liquidity positions…
          </p>
        ) : pos.length === 0 ? (
          <p className="pf-empty">{isSmartAddress(active) ? "This smart account has no liquidity positions." : "Switch to your smart account — liquidity moves from it."}</p>
        ) : (
          pos.map((p) => (
            <button key={p.pool} type="button" className={`rm-card${from === p.pool ? " on" : ""}`} onClick={() => (setFrom(p.pool), setTo(null))}>
              <span className="mh-stack">
                {p.underlying.map((u) => (
                  <TokenIcon key={u.contract} symbol={u.code} size={26} />
                ))}
              </span>
              <span className="rm-card-main">
                <b>{p.pair}</b>
                <small>{venue(p.protocol)}</small>
              </span>
              <b>{fmtUsd(p.valueUsd)}</b>
            </button>
          ))
        )}
      </div>
      <div className="rm-col">
        <h3 className="rm-h">To</h3>
        {!src ? (
          <p className="pf-empty">Pick the position to move.</p>
        ) : (
          <>
            <input className="rm-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pair or venue…" aria-label="Search target pools" />
            <div className="rm-list">
              {targets.map((p) => (
                <button key={p.address} type="button" className={`rm-card${to === p.address ? " on" : ""}`} onClick={() => setTo(p.address)}>
                  <span className="mh-stack">
                    {p.assets.map((a) => (
                      <TokenIcon key={a.contract} symbol={a.code} size={26} />
                    ))}
                  </span>
                  <span className="rm-card-main">
                    <b>{p.pair}</b>
                    <small>
                      <ProtoMark id={p.protocol} size={12} /> {venue(p.protocol)} · fee {p.feeBps != null ? `${(p.feeBps / 100).toFixed(2)}%` : "—"}
                    </small>
                  </span>
                  <b>{fmtUsd(p.tvlUsd)}</b>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <aside className="rm-side">
        <h3 className="rm-h">Move</h3>
        {!src || !dst ? (
          <p className="pf-empty">Pick a position and where it goes.</p>
        ) : (
          <>
            <div className="rm-route">
              <span>{src.pair}</span>
              <span aria-hidden="true">→</span>
              <span>{dst.pair}</span>
            </div>
            <div className="tabs rm-parts">
              {[25, 50, 75, 100].map((p) => (
                <button key={p} type="button" className={`tab${part === p ? " active" : ""}`} onClick={() => setPart(p)}>
                  {p === 100 ? "All" : `${p}%`}
                </button>
              ))}
            </div>
            <div className="pd-meta">
              <div>
                <span>Moving</span>
                <b>~{fmtUsd(src.valueUsd != null ? (src.valueUsd * part) / 100 : null)}</b>
              </div>
              <div>
                <span>Venue</span>
                <b>
                  {venue(src.protocol)} → {venue(dst.protocol)}
                </b>
              </div>
              <div>
                <span>Steps</span>
                <b>Remove · Swap · Add</b>
              </div>
            </div>
            {err && <p className="qm-error">{err}</p>}
            <button type="button" className="btn primary pd-submit" onClick={gate ? gate.run : start}>
              {gate ? gate.label : "Review move"}
            </button>
          </>
        )}
      </aside>
      <TxModal spec={spec} onClose={() => setSpec(null)} />
    </div>
  );
}
