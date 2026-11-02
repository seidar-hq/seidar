"use client";

// Copying positions: the viewer pays with one token from their wallet; each chosen item gets its
// share of the amount, is swapped into the right asset on the Soroswap aggregator and, for
// positions, deposited the same way the Earn pages do it (same build endpoints). Every step is a
// separate transaction the wallet signs. A deposit uses what its swap actually delivered (the
// wallet's balance before vs after, read from Horizon), so nothing is guessed.

import { hasTrustline, buildTrustline } from "@/lib/payment";
import { postJson, refreshAfterTx, signAndSend, TxError, TxPending, readableError, toBase, type Signer, type TxStep } from "@/lib/tx";
import { WatchOnlyError } from "@/lib/wallets";
import { pushNote } from "@/components/layout/NotificationButton";
import { floorAmount, formatAmount } from "@/lib/format";
import type { Asset, CopyItem } from "./discoverData";

export type Source = { code: string; issuer: string | null; contract: string; decimals: number; price: number; balance: number };
export type Alloc = { item: CopyItem; usd: number };

type Leg = { asset: Asset; usd: number };

/** The assets an item needs and how much of the budget each gets. */
function legsOf(a: Alloc): Leg[] {
  if (a.item.kind === "lp") return a.item.legs.map((l) => ({ asset: l, usd: a.usd / 2 }));
  return [{ asset: a.item.asset, usd: a.usd }];
}

const same = (x: Asset, s: Source) => (x.contract && x.contract === s.contract) || (x.code === s.code && (x.issuer ?? null) === (s.issuer ?? null));

type Planned =
  | { key: string; label: string; op: "trust"; asset: Asset }
  | { key: string; label: string; op: "swap"; asset: Asset; amountIn: number; slot: string }
  | { key: string; label: string; op: "deposit"; alloc: Alloc; slots: string[]; direct: number[] };

/** Every transaction a copy needs, in order. Checks the viewer's trustlines (network reads). */
export async function planCopy(allocs: Alloc[], source: Source, address: string): Promise<Planned[]> {
  const steps: Planned[] = [];
  const trusted = new Set<string>();
  const needTrust = async (a: Asset) => {
    if (!a.issuer) return false;
    const k = `${a.code}:${a.issuer}`;
    if (trusted.has(k)) return false;
    trusted.add(k);
    const has = await hasTrustline(address, a.code, a.issuer);
    return has === false;
  };
  let n = 0;
  for (const al of allocs) {
    const legs = legsOf(al);
    const slots: string[] = [];
    const direct: number[] = [];
    for (const leg of legs) {
      const amountIn = leg.usd / source.price;
      if (same(leg.asset, source)) {
        slots.push("");
        direct.push(amountIn);
        continue;
      }
      if (await needTrust(leg.asset)) steps.push({ key: `t${n++}`, label: `Add ${leg.asset.code} trustline`, op: "trust", asset: leg.asset });
      const slot = `x${n}`;
      steps.push({ key: `s${n++}`, label: `Swap ${formatAmount(amountIn, 4)} ${source.code} → ${leg.asset.code}`, op: "swap", asset: leg.asset, amountIn, slot });
      slots.push(slot);
      direct.push(0);
    }
    if (al.item.kind !== "token") {
      const what = al.item.kind === "lend" ? `Supply ${al.item.asset.code} · ${al.item.subtitle}` : al.item.kind === "vault" ? `Deposit into ${al.item.title}` : `Add liquidity · ${al.item.title.replace(/ liquidity$/, "")}`;
      steps.push({ key: `d${n++}`, label: what, op: "deposit", alloc: al, slots, direct });
    }
  }
  return steps;
}

/** Wallet balance of a classic asset (or XLM) from Horizon; null for Soroban-only tokens. */
async function classicBalance(address: string, a: Asset): Promise<number | null> {
  const isXlm = !a.issuer && a.code.toUpperCase() === "XLM";
  if (!isXlm && !a.issuer) return null;
  try {
    const r = await fetch(`https://horizon.stellar.org/accounts/${address}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { balances?: { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string }[] };
    const b = j.balances?.find((x) => (isXlm ? x.asset_type === "native" : x.asset_code === a.code && x.asset_issuer === a.issuer));
    return b ? Number(b.balance) : 0;
  } catch {
    return null;
  }
}

type QuoteResp = { ok?: boolean; quote?: { amountOut: string; otherAmountThreshold: string }; error?: string };
const SLIPPAGE_BPS = 100;

/** Floors to the asset's decimals, as a base-unit string. */
const base = (v: number, decimals: number) => (v > 0 ? toBase(floorAmount(v, decimals), decimals) : null);

function depositBody(al: Alloc, amounts: number[], from: string): { path: string; body: unknown; kind: string } | null {
  const it = al.item;
  if (it.kind === "lend") {
    const m = it.market;
    const amount = base(amounts[0], it.asset.decimals);
    if (!amount || !m.contract) return null;
    const action = { action: "supply", asset: m.contract, amount };
    if (m.protocol === "blend") return { path: "/api/lending/build", body: { protocol: "blend", from, pool: m.pool, actions: [action] }, kind: "lending" };
    const spoke = m.xoxno?.spokes.find((s) => s.canSupply);
    return { path: "/api/lending/build", body: { protocol: "xoxno", from, actions: [action], xoxno: { hubId: m.xoxno?.hubId, spokeId: spoke?.spokeId } }, kind: "lending" };
  }
  if (it.kind === "vault") {
    const amount = base(amounts[0], it.vault.assetDecimals);
    if (!amount) return null;
    return { path: "/api/vaults/build", body: { protocol: it.vault.protocol, vault: it.vault.address, caller: from, slippageBps: 50, action: "deposit", amounts: [amount] }, kind: "vault" };
  }
  if (it.kind === "lp") {
    // Deposit at the pool's current ratio; what doesn't fit stays in the wallet.
    let [a0, a1] = amounts;
    const r = it.pool.reserves;
    const l0 = it.legs[0];
    const l1 = it.legs[1];
    const ratio =
      r && r.length === 2 && r[0].amount > 0 && r[1].amount > 0
        ? r[1].amount / 10 ** r[1].decimals / (r[0].amount / 10 ** r[0].decimals)
        : l0.price && l1.price
          ? l0.price / l1.price
          : null;
    if (ratio) {
      if (a1 > a0 * ratio) a1 = a0 * ratio;
      else a0 = a1 / ratio;
    }
    const b0 = base(a0, l0.decimals);
    const b1 = base(a1, l1.decimals);
    if (!b0 || !b1) return null;
    return { path: "/api/dex/liquidity/build", body: { protocol: it.pool.protocol, pool: it.pool.address, from, action: "deposit", amounts: [b0, b1], slippageBps: SLIPPAGE_BPS }, kind: "liquidity" };
  }
  return null;
}

export type CopyOutcome = { done: number; total: number; stopped: "failed" | "pending" | "unsigned" | null; error: string | null };

/** Runs a planned copy step by step; `onSteps` gets the progress list after every change. */
export async function runCopy(plan: Planned[], source: Source, signer: Signer, onSteps: (s: TxStep[]) => void): Promise<CopyOutcome> {
  const steps: TxStep[] = plan.map((p) => ({ key: p.key, label: p.label, status: "queued" }));
  const emit = () => onSteps(steps.map((s) => ({ ...s })));
  emit();
  const received = new Map<string, number>();
  const kinds = new Set<string>(["swap"]);
  let done = 0;

  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const st = steps[i];
    const set = (s: TxStep["status"]) => {
      st.status = s;
      emit();
    };
    set("building");
    try {
      let xdr: string;
      let after: (() => Promise<void>) | null = null;
      let meta: { kind: string; protocol: string } | undefined;
      if (p.op === "trust") {
        xdr = await buildTrustline(signer.address, p.asset.code, p.asset.issuer!);
        meta = { kind: "trustline", protocol: "stellar" };
      } else if (p.op === "swap") {
        const amount = base(p.amountIn, source.decimals);
        if (!amount || !p.asset.contract) throw new TxError("Amount too small to swap.");
        const q = await postJson<QuoteResp>("/api/swap/quote", { assetIn: source.contract, assetOut: p.asset.contract, amount, slippageBps: String(SLIPPAGE_BPS) });
        if (!q.ok || !q.quote) throw new TxError(q.error ?? `No swap route from ${source.code} to ${p.asset.code}.`);
        const b = await postJson<{ ok?: boolean; xdr?: string; error?: string }>("/api/swap/build", { quote: q.quote, from: signer.address });
        if (!b.ok || !b.xdr) throw new TxError(b.error ?? "Could not build the swap.");
        xdr = b.xdr;
        st.label = `Swap ${formatAmount(p.amountIn, 4)} ${source.code} → ~${formatAmount(Number(q.quote.amountOut) / 10 ** p.asset.decimals, 4)} ${p.asset.code}`;
        meta = { kind: "swap", protocol: "soroswap" };
        const minOut = Number(q.quote.otherAmountThreshold) / 10 ** p.asset.decimals;
        const before = await classicBalance(signer.address, p.asset);
        after = async () => {
          // What the swap delivered. Horizon can trail the ledger by a moment: retry briefly.
          let got = 0;
          for (let k = 0; k < 4 && before != null; k++) {
            const now = await classicBalance(signer.address, p.asset);
            if (now != null && now - before > 0) {
              got = now - before;
              break;
            }
            await new Promise((r) => setTimeout(r, 1500));
          }
          received.set(p.slot, got > 0 ? got : minOut);
        };
      } else {
        const amounts = p.slots.map((slot, k) => (slot ? (received.get(slot) ?? 0) : p.direct[k]));
        const d = depositBody(p.alloc, amounts, signer.address);
        if (!d) throw new TxError("Nothing to deposit: the amount is too small.");
        kinds.add(d.kind);
        let body: unknown = d.body;
        // Build endpoints may chain transactions (`next`); sign each in turn.
        for (let hop = 0; body && hop < 4; hop++) {
          const b = await postJson<{ ok?: boolean; xdr?: string; next?: unknown; error?: string }>(d.path, body);
          if (!b.ok || !b.xdr) throw new TxError(readableError(b.error ?? "Could not build the deposit."));
          const r = await signAndSend(b.xdr, signer, set, { kind: d.kind, protocol: p.alloc.item.protocol.id });
          st.hash = r.hash;
          body = b.next ?? null;
        }
        st.status = "done";
        emit();
        done++;
        continue;
      }
      st.xdr = xdr;
      const r = await signAndSend(xdr, signer, set, meta);
      st.hash = r.hash;
      if (after) await after();
      st.status = "done";
      emit();
      done++;
    } catch (e) {
      const outcome = (stopped: CopyOutcome["stopped"], error: string | null): CopyOutcome => {
        for (const k of kinds) refreshAfterTx(signer.address, k);
        return { done, total: plan.length, stopped, error };
      };
      if (e instanceof WatchOnlyError) {
        st.status = "unsigned";
        emit();
        return outcome("unsigned", null);
      }
      if (e instanceof TxPending) {
        st.status = "submitted";
        st.hash = e.hash;
        emit();
        return outcome("pending", "A transaction is still confirming; the rest of the copy was not started.");
      }
      st.status = "failed";
      st.error = e instanceof TxError ? e.message : readableError(e);
      st.hash = e instanceof TxError ? e.hash : null;
      emit();
      return outcome("failed", st.error);
    }
  }
  for (const k of kinds) refreshAfterTx(signer.address, k);
  void pushNote(signer.address, `Copy complete: ${done} transaction${done === 1 ? "" : "s"} confirmed.`);
  return { done, total: plan.length, stopped: null, error: null };
}
