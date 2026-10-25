// Aqua concentrated-liquidity pools: range positions (tick_lower, tick_upper)
// instead of pool shares. Reads the pool (price, tick, liquidity by price),
// a user's ranges (amounts, uncollected fees, in / out of range) and builds
// range deposit / withdraw / fee-claim calls from the active account.
//
// Interface verified on mainnet (CBBMQB… XLM/USDC): get_slot0 -> {sqrt_price_x96,
// tick}, get_tick_spacing, get_tick_bounds, get_user_position_snapshot(user)
// -> {ranges[{tick_lower, tick_upper}], ..}, get_position(user, lo, hi) ->
// {liquidity, tokens_owed_0/1, ..}, estimate_deposit_position(lo, hi, amounts)
// -> (used amounts, liquidity), deposit_position(sender, lo, hi, amounts,
// min_liquidity), estimate_withdraw_position(owner, lo, hi, liquidity) ->
// amounts, withdraw_position(owner, lo, hi, liquidity, min_amounts),
// get_all_position_fees / claim_all_position_fees(owner).
// Price convention (Uniswap v3): token0 priced in token1 = 1.0001^tick x
// 10^(dec0 - dec1).

import { sorobanView } from "./rpc.js";
import { invokeFor } from "./invoke.js";
import { tokenMetas } from "./token-meta.js";

const isContract = (v: string) => /^C[A-Z2-7]{55}$/.test(v);
const isAccount = (v: string) => /^G[A-Z2-7]{55}$/.test(v);
const big = (v: unknown) => BigInt(String(v ?? "0"));
const err = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 220);

async function sdkMod() {
  return import("@stellar/stellar-sdk");
}

export const tickPrice = (tick: number, dec0: number, dec1: number) => Math.pow(1.0001, tick) * 10 ** (dec0 - dec1);
export const priceTick = (price: number, dec0: number, dec1: number) =>
  Math.log(price / 10 ** (dec0 - dec1)) / Math.log(1.0001);

async function poolBase(pool: string) {
  const [tokens, slot0, spacing, bounds] = await Promise.all([
    sorobanView(pool, "get_tokens") as Promise<string[]>,
    sorobanView(pool, "get_slot0") as Promise<{ tick: unknown; sqrt_price_x96: unknown }>,
    sorobanView(pool, "get_tick_spacing"),
    (sorobanView(pool, "get_tick_bounds") as Promise<unknown[]>).catch(() => null),
  ]);
  const toks = tokens.map(String);
  const metas = await tokenMetas(toks);
  const decs = toks.map((t) => metas[t]?.decimals ?? 7);
  const codes = toks.map((t) => metas[t]?.code ?? `${t.slice(0, 4)}…`);
  return {
    tokens: toks,
    codes,
    decimals: decs,
    tick: Number(slot0.tick),
    spacing: Number(spacing),
    bounds: Array.isArray(bounds) ? [Number(bounds[0]), Number(bounds[1])] : null,
  };
}

/** Is `pool` an Aqua concentrated pool (answers get_slot0)? */
export async function isAquaCl(pool: string): Promise<boolean> {
  try {
    await sorobanView(pool, "get_tick_spacing");
    return true;
  } catch {
    return false;
  }
}

/**
 * Pool view: live tick + price, spacing, and liquidity by price — Aqua's
 * per-tick liquidity_net map (amm-api) summed into active liquidity per
 * range, bucketed around the current price for a distribution chart.
 */
export async function clPool(pool: string) {
  if (!isContract(pool)) return { status: 400, body: { ok: false, error: "pool required" } };
  try {
    const b = await poolBase(pool);
    const price = tickPrice(b.tick, b.decimals[0], b.decimals[1]);
    let bins: { lo: number; hi: number; liquidity: number }[] = [];
    try {
      const r = await fetch(`https://amm-api.aqua.network/pools/${pool}/`, { cache: "no-store" });
      const j = (await r.json()) as { tick_map?: Record<string, string> };
      const net = Object.entries(j.tick_map ?? {})
        .map(([t, v]) => [Number(t), Number(v)] as const)
        .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v))
        .sort((x, y) => x[0] - y[0]);
      // Active liquidity between consecutive initialized ticks.
      const segs: { lo: number; hi: number; liq: number }[] = [];
      let liq = 0;
      for (let i = 0; i < net.length - 1; i++) {
        liq += net[i][1];
        segs.push({ lo: net[i][0], hi: net[i + 1][0], liq: Math.max(0, liq) });
      }
      // ±60% around the current price in 48 equal-tick buckets.
      const span = Math.round(Math.log(1.6) / Math.log(1.0001));
      const lo = b.tick - span;
      const hi = b.tick + span;
      const n = 48;
      const w = (hi - lo) / n;
      bins = Array.from({ length: n }, (_, k) => {
        const a = lo + k * w;
        const z = a + w;
        // Tick-weighted average liquidity over the bucket.
        let acc = 0;
        for (const s of segs) {
          const o = Math.min(z, s.hi) - Math.max(a, s.lo);
          if (o > 0) acc += s.liq * o;
        }
        return { lo: tickPrice(a, b.decimals[0], b.decimals[1]), hi: tickPrice(z, b.decimals[0], b.decimals[1]), liquidity: acc / w };
      });
    } catch {
      bins = [];
    }
    return {
      status: 200,
      body: {
        ok: true,
        tokens: b.tokens,
        codes: b.codes,
        decimals: b.decimals,
        tick: b.tick,
        tickSpacing: b.spacing,
        tickBounds: b.bounds,
        price,
        bins,
      },
    };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}

/** A user's ranges: liquidity, token amounts if withdrawn now, owed fees. */
export async function clPositions(pool: string, address: string) {
  if (!isContract(pool) || !(isAccount(address) || isContract(address)))
    return { status: 400, body: { ok: false, error: "pool + address required" } };
  try {
    const sdk = await sdkMod();
    const who = sdk.Address.fromString(address).toScVal();
    const i32 = (x: number) => sdk.nativeToScVal(x, { type: "i32" });
    const u128 = (x: bigint) => sdk.nativeToScVal(x, { type: "u128" });
    const [b, snap] = await Promise.all([
      poolBase(pool),
      sorobanView(pool, "get_user_position_snapshot", [who]) as Promise<{ ranges?: { tick_lower: unknown; tick_upper: unknown }[] }>,
    ]);
    const ranges = (snap?.ranges ?? []).map((r) => ({ lo: Number(r.tick_lower), hi: Number(r.tick_upper) }));
    const positions = [];
    for (const r of ranges) {
      const p = (await sorobanView(pool, "get_position", [who, i32(r.lo), i32(r.hi)])) as {
        liquidity: unknown;
        tokens_owed_0: unknown;
        tokens_owed_1: unknown;
      };
      const liquidity = big(p.liquidity);
      if (liquidity <= 0n && big(p.tokens_owed_0) <= 0n && big(p.tokens_owed_1) <= 0n) continue;
      const [amounts, fees] = await Promise.all([
        liquidity > 0n
          ? (sorobanView(pool, "estimate_withdraw_position", [who, i32(r.lo), i32(r.hi), u128(liquidity)]) as Promise<unknown[]>)
          : Promise.resolve([0, 0]),
        (sorobanView(pool, "get_position_fees", [who, i32(r.lo), i32(r.hi)]) as Promise<unknown[]>).catch(() => [p.tokens_owed_0, p.tokens_owed_1]),
      ]);
      positions.push({
        tickLower: r.lo,
        tickUpper: r.hi,
        priceLower: tickPrice(r.lo, b.decimals[0], b.decimals[1]),
        priceUpper: tickPrice(r.hi, b.decimals[0], b.decimals[1]),
        inRange: b.tick >= r.lo && b.tick < r.hi,
        liquidity: liquidity.toString(),
        amounts: amounts.map((x) => big(x).toString()),
        fees: fees.map((x) => big(x).toString()),
      });
    }
    let rewards: string | null = null;
    try {
      rewards = String(big(await sorobanView(pool, "get_user_reward", [who])));
    } catch {
      rewards = null;
    }
    return {
      status: 200,
      body: { ok: true, tokens: b.tokens, codes: b.codes, decimals: b.decimals, tick: b.tick, price: tickPrice(b.tick, b.decimals[0], b.decimals[1]), positions, rewards },
    };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}

/** Snap a tick to the pool's spacing, inside its bounds. */
function snap(t: number, spacing: number, bounds: number[] | null, up: boolean) {
  let s = (up ? Math.ceil(t / spacing) : Math.floor(t / spacing)) * spacing;
  if (bounds) s = Math.min(Math.max(s, Math.ceil(bounds[0] / spacing) * spacing), Math.floor(bounds[1] / spacing) * spacing);
  return s;
}

/**
 * Build a range call from `from` (smart account + owner signer):
 *   cl_deposit  {priceLower, priceUpper | tickLower, tickUpper, amounts}
 *   cl_withdraw {tickLower, tickUpper, liquidity?}  (default: all of it)
 *   cl_claim    all uncollected trading fees across the user's ranges
 */
export async function buildCl(b: {
  pool?: string;
  from?: string;
  signer?: string;
  action?: string;
  tickLower?: number;
  tickUpper?: number;
  priceLower?: number;
  priceUpper?: number;
  amounts?: string[];
  liquidity?: string;
  slippageBps?: number;
}) {
  const pool = String(b.pool ?? "");
  const from = String(b.from ?? "");
  const signer = b.signer ? String(b.signer) : undefined;
  if (!isContract(pool) || !(isAccount(from) || isContract(from)))
    return { status: 400, body: { ok: false, error: "pool + from required" } };
  const slip = BigInt(Math.min(500, Math.max(10, Math.round(Number(b.slippageBps ?? 100)))));
  const less = (x: bigint) => (x * (10_000n - slip)) / 10_000n;
  try {
    const sdk = await sdkMod();
    const a = (x: string) => sdk.Address.fromString(x).toScVal();
    const i32 = (x: number) => sdk.nativeToScVal(x, { type: "i32" });
    const u128 = (x: bigint) => sdk.nativeToScVal(x, { type: "u128" });
    const vec = (xs: bigint[]) => sdk.xdr.ScVal.scvVec(xs.map(u128));
    const c = new sdk.Contract(pool);
    let op: unknown;
    let detail: Record<string, unknown> = {};
    if (b.action === "cl_claim") {
      op = c.call("claim_all_position_fees", a(from));
    } else {
      const base = await poolBase(pool);
      let lo = Number(b.tickLower);
      let hi = Number(b.tickUpper);
      if (b.action === "cl_deposit" && Number(b.priceLower) > 0 && Number(b.priceUpper) > 0) {
        lo = priceTick(Number(b.priceLower), base.decimals[0], base.decimals[1]);
        hi = priceTick(Number(b.priceUpper), base.decimals[0], base.decimals[1]);
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { status: 200, body: { ok: false, error: "Pick a price range." } };
      lo = snap(lo, base.spacing, base.bounds, false);
      hi = snap(hi, base.spacing, base.bounds, true);
      if (!(hi > lo)) return { status: 200, body: { ok: false, error: "The range's upper price must be above the lower price." } };
      if (b.action === "cl_deposit") {
        const amts = (b.amounts ?? []).map((x) => (/^\d+$/.test(String(x)) ? BigInt(x) : 0n));
        if (amts.length !== 2 || amts.every((x) => x <= 0n)) return { status: 200, body: { ok: false, error: "Enter an amount to deposit." } };
        const est = (await sorobanView(pool, "estimate_deposit_position", [i32(lo), i32(hi), vec(amts)])) as unknown[];
        const used = (est[0] as unknown[]).map(big);
        const liq = big(est[1]);
        if (liq <= 0n)
          return { status: 200, body: { ok: false, error: "This range takes none of these amounts — add the token the range needs (below the price: the quote token; above: the base token)." } };
        op = c.call("deposit_position", a(from), i32(lo), i32(hi), vec(amts), u128(less(liq)));
        detail = { used: used.map(String), liquidity: liq.toString() };
      } else if (b.action === "cl_withdraw") {
        const pos = (await sorobanView(pool, "get_position", [a(from), i32(lo), i32(hi)])) as { liquidity: unknown };
        const have = big(pos.liquidity);
        let liq = /^\d+$/.test(String(b.liquidity ?? "")) ? BigInt(String(b.liquidity)) : have;
        if (liq > have) liq = have;
        if (liq <= 0n) return { status: 200, body: { ok: false, error: "No liquidity in this range to withdraw." } };
        const out = ((await sorobanView(pool, "estimate_withdraw_position", [a(from), i32(lo), i32(hi), u128(liq)])) as unknown[]).map(big);
        op = c.call("withdraw_position", a(from), i32(lo), i32(hi), u128(liq), vec(out.map(less)));
        detail = { amounts: out.map(String) };
      } else return { status: 400, body: { ok: false, error: "unknown action" } };
      detail = { ...detail, tickLower: lo, tickUpper: hi };
    }
    const { xdr } = await invokeFor({ from, signer, op });
    return { status: 200, body: { ok: true, xdr, ...detail } };
  } catch (e) {
    const { humanizeSimError } = await import("./rpc.js");
    const m = err(e);
    return { status: 200, body: { ok: false, error: m.startsWith("Simulation failed") ? humanizeSimError(m) : m } };
  }
}
