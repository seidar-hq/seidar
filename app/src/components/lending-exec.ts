"use client";
// Shared lending execution for every surface that changes a lending position
// (protocol board, Create/Open position, Refinance):
//   planFor()  — token-unit actions -> LendingPlan (pool / XOXNO coordinates,
//                real decimals, "max" at the live position)
//   runChain() — lend leg -> swap -> lend leg on the swap's executed output.

import { apiFetch } from "@/lib/api";
import { runLending, toBase, type LendingPlan, type TxStep } from "@/lib/tx";
import { executeMarketSwap, type SwapToken } from "./exchange";

export type LendKind = "supply" | "withdraw" | "borrow" | "repay";
export type LendAct = { action: LendKind; code: string; tokens: number };

export interface LendCtx {
  protocol: "blend" | "xoxno";
  /** Account that holds the position and is the tx source. */
  address: string;
  /** Wallet key that signs (owner; equals address for a plain wallet). */
  signer: string;
  /** Pool contracts in scope (Blend); XOXNO uses poolKey "xoxno-hub-N". */
  poolAddrs: string[];
  poolKey: string | null;
  tokens: SwapToken[];
  /** Live position amounts in tokens, for "max" detection. */
  held: (code: string, kind: "supply" | "borrow") => number;
}

const tokenOf = (ctx: LendCtx, code: string) =>
  ctx.tokens.find((t) => t.code.toUpperCase() === code.toUpperCase()) ?? null;

export async function planFor(ctx: LendCtx, acts: LendAct[]): Promise<LendingPlan> {
  const actions = acts.map((a) => {
    const t = tokenOf(ctx, a.code);
    if (!t) throw new Error(`No token contract known for ${a.code}.`);
    const held = a.action === "withdraw" ? ctx.held(a.code, "supply") : a.action === "repay" ? ctx.held(a.code, "borrow") : 0;
    const isMax = held > 0 && a.tokens >= held * 0.999;
    const amount = isMax ? "max" : toBase(a.tokens.toFixed(Math.min(t.decimals, 9)), t.decimals);
    if (!amount) throw new Error("Amount rounds to zero — raise it.");
    return { action: a.action, asset: t.contract, amount };
  });
  if (ctx.protocol === "blend") {
    const pool = ctx.poolAddrs.find((p) => /^C[A-Z2-7]{55}$/.test(p));
    if (!pool) throw new Error("Pick a Blend pool first.");
    return { protocol: "blend", from: ctx.address, actions, pool };
  }
  const hubId = Number(/xoxno-hub-(\d+)/.exec(ctx.poolKey ?? ctx.poolAddrs[0] ?? "")?.[1] ?? 1);
  const [acctRes, mktRes] = await Promise.all([
    apiFetch(`/api/lending/xoxno/accounts?owner=${ctx.address}`, { cache: "no-store" }).then((r) => r.json()),
    apiFetch("/api/lending/xoxno/markets", { cache: "no-store" }).then((r) => r.json()),
  ]);
  type XAcct = { accountId: string; spokeId: number | null; supplied: { hubId: number }[]; borrow: { hubId: number }[] };
  type XAsset = { sac: string; hubId: number; spokes: { spokeId: number; canSupply: boolean; canOpenAccount: boolean }[] };
  const accounts: XAcct[] = acctRes?.ok ? acctRes.accounts : [];
  const assets: XAsset[] = mktRes?.ok ? mktRes.assets : [];
  const onHub = accounts.find((ac) => [...ac.supplied, ...ac.borrow].some((p) => p.hubId === hubId)) ?? accounts[0];
  const asset = assets.find((x) => x.sac === actions[0].asset && x.hubId === hubId);
  const spokeId =
    onHub?.spokeId ?? asset?.spokes.find((s) => s.canSupply && s.canOpenAccount)?.spokeId ?? asset?.spokes[0]?.spokeId;
  return {
    protocol: "xoxno",
    from: ctx.address,
    actions,
    xoxno: { accountId: onHub?.accountId, spokeId: spokeId ?? undefined, hubId },
  };
}

export async function runActs(ctx: LendCtx, acts: LendAct[], onSteps: (s: TxStep[]) => void) {
  await runLending(await planFor(ctx, acts), onSteps, ctx.signer);
}

/**
 * Swap-bridged position change: `first` lend leg, swap, then one lend leg of
 * kind `then` sized to the swap's executed output (x0.999 headroom).
 */
export async function runChain(
  ctx: LendCtx,
  opts: { first: LendAct[]; swap: { from: string; to: string; tokens: number }; then: LendKind },
  onSteps: (s: TxStep[]) => void,
) {
  const sellTok = tokenOf(ctx, opts.swap.from);
  const buyTok = tokenOf(ctx, opts.swap.to);
  if (!sellTok || !buyTok) throw new Error("Token contracts unavailable for this pair.");
  const all: TxStep[] = [];
  let seen: TxStep[] = [];
  await runLending(
    await planFor(ctx, opts.first),
    (s) => {
      seen = s;
      onSteps([...all, ...s]);
    },
    ctx.signer,
  );
  all.push(...seen);
  const swapStep: TxStep = { key: "swap", label: `Swap ${opts.swap.from} → ${opts.swap.to}`, status: "building" };
  all.push(swapStep);
  onSteps([...all]);
  let outTokens: number | null = null;
  try {
    const r = await executeMarketSwap({
      sellTok,
      buyTok,
      amountTokens: opts.swap.tokens.toFixed(Math.min(sellTok.decimals, 9)),
      from: ctx.address,
      signer: ctx.signer,
      slippageBps: "50",
      onStatus: (m: string) => {
        swapStep.status = /wallet/i.test(m) ? "signing" : /Submitting/i.test(m) ? "sending" : "building";
        onSteps([...all]);
      },
    });
    swapStep.status = "done";
    swapStep.hash = r.hash;
    outTokens = r.outTokens;
    onSteps([...all]);
  } catch (e) {
    swapStep.status = "failed";
    swapStep.error = e instanceof Error ? e.message : String(e);
    onSteps([...all]);
    throw e;
  }
  if (!(outTokens != null && outTokens > 0)) throw new Error("Swap returned no output.");
  await runLending(
    await planFor(ctx, [{ action: opts.then, code: opts.swap.to, tokens: outTokens * 0.999 }]),
    (s) => onSteps([...all, ...s.map((x) => ({ ...x, key: `f-${x.key}` }))]),
    ctx.signer,
  );
}
