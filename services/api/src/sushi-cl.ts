// Sushi V3 on Stellar: concentrated-liquidity positions are NFTs held by the
// NonfungiblePositionManager (SUSHI.positionManager). Interface read from the
// mainnet contract spec:
//   pool:  slot0() -> {sqrt_price_x96, tick}, tick_spacing(), fee(), token0/1()
//   PM:    mint(MintParams) -> (token_id, liquidity, amount0, amount1)
//          decrease_liquidity(DecreaseLiquidityParams) -> (amount0, amount1)
//          collect(CollectParams) -> (amount0, amount1)
//          get_user_positions_with_fees(owner, skip, take) -> [UserPositionInfo]
//          position_total(token_id, sqrt_price_x96) -> (amount0, amount1)
// Liquidity math is Uniswap v3's (exact TickMath in bigint), so deposit
// minimums are the amounts the pool will actually take, less slippage.
// Withdrawing is two transactions: decrease_liquidity, then collect.

import { sorobanView } from "./rpc.js";
import { invokeFor } from "./invoke.js";
import { tokenMetas } from "./token-meta.js";
import { pricesByContract } from "./contract-price.js";
import { SUSHI } from "./dex-onchain.js";

const isContract = (v: string) => /^C[A-Z2-7]{55}$/.test(v);
const isAccount = (v: string) => /^G[A-Z2-7]{55}$/.test(v);
const big = (v: unknown) => {
  try {
    return BigInt(String(v ?? "0"));
  } catch {
    return 0n;
  }
};
const err = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 220);

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
const Q96 = 1n << 96n;
const MAX_U256 = (1n << 256n) - 1n;
const MAX_U128 = (1n << 128n) - 1n;

const TICK_FACTORS: [bigint, bigint][] = [
  [0x2n, 0xfff97272373d413259a46990580e213an],
  [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
  [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
  [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
  [0x20n, 0xff973b41fa98c081472e6896dfb254c0n],
  [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
  [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n],
  [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
  [0x200n, 0xf987a7253ac413176f2b074cf7815e54n],
  [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
  [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n],
  [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
  [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n],
  [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
  [0x8000n, 0x31be135f97d08fd981231505542fcfa6n],
  [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
  [0x20000n, 0x5d6af8dedb81196699c329225ee604n],
  [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
  [0x80000n, 0x48a170391f7dc42444e8fa2n],
];

/** Uniswap v3 TickMath.getSqrtRatioAtTick (Q64.96). */
export function sqrtRatioAtTick(tick: number): bigint {
  const abs = BigInt(Math.abs(tick));
  let ratio = abs & 0x1n ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  for (const [bit, f] of TICK_FACTORS) if (abs & bit) ratio = (ratio * f) >> 128n;
  if (tick > 0) ratio = MAX_U256 / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

const liq0 = (a: bigint, b: bigint, amt: bigint) => (b > a ? (amt * ((a * b) / Q96)) / (b - a) : 0n);
const liq1 = (a: bigint, b: bigint, amt: bigint) => (b > a ? (amt * Q96) / (b - a) : 0n);

export function liquidityForAmounts(sp: bigint, sa: bigint, sb: bigint, a0: bigint, a1: bigint): bigint {
  if (sp <= sa) return liq0(sa, sb, a0);
  if (sp < sb) {
    const l0 = liq0(sp, sb, a0);
    const l1 = liq1(sa, sp, a1);
    return l0 < l1 ? l0 : l1;
  }
  return liq1(sa, sb, a1);
}

export function amountsForLiquidity(sp: bigint, sa: bigint, sb: bigint, l: bigint): [bigint, bigint] {
  const a0 = (x: bigint, y: bigint) => (l * Q96 * (y - x)) / y / x;
  const a1 = (x: bigint, y: bigint) => (l * (y - x)) / Q96;
  if (sp <= sa) return [a0(sa, sb), 0n];
  if (sp < sb) return [a0(sp, sb), a1(sa, sp)];
  return [0n, a1(sa, sb)];
}

export const tickPrice = (tick: number, dec0: number, dec1: number) => Math.pow(1.0001, tick) * 10 ** (dec0 - dec1);
export const priceTick = (price: number, dec0: number, dec1: number) => Math.log(price / 10 ** (dec0 - dec1)) / Math.log(1.0001);

function snap(t: number, spacing: number, up: boolean) {
  const lo = Math.ceil(MIN_TICK / spacing) * spacing;
  const hi = Math.floor(MAX_TICK / spacing) * spacing;
  const s = (up ? Math.ceil(t / spacing) : Math.floor(t / spacing)) * spacing;
  return Math.min(Math.max(s, lo), hi);
}

async function sdkMod() {
  return import("@stellar/stellar-sdk");
}

async function poolBase(pool: string) {
  const [t0, t1, slot0, spacing, fee] = await Promise.all([
    sorobanView(pool, "token0"),
    sorobanView(pool, "token1"),
    sorobanView(pool, "slot0") as Promise<{ sqrt_price_x96: unknown; tick: unknown }>,
    sorobanView(pool, "tick_spacing"),
    sorobanView(pool, "fee"),
  ]);
  const tokens = [String(t0), String(t1)];
  const metas = await tokenMetas(tokens);
  const decimals = tokens.map((t) => metas[t]?.decimals ?? 7);
  const codes = tokens.map((t) => metas[t]?.code ?? `${t.slice(0, 4)}…`);
  return {
    tokens,
    codes,
    decimals,
    tick: Number(slot0.tick),
    sqrtPrice: big(slot0.sqrt_price_x96),
    spacing: Number(spacing),
    fee: Number(fee),
  };
}

/** Pool view for the range form (same shape as the Aqua /dex/cl/pool answer). */
export async function sushiPool(pool: string) {
  if (!isContract(pool)) return { status: 400, body: { ok: false, error: "pool required" } };
  try {
    const b = await poolBase(pool);
    return {
      status: 200,
      body: {
        ok: true,
        tokens: b.tokens,
        codes: b.codes,
        decimals: b.decimals,
        tick: b.tick,
        tickSpacing: b.spacing,
        tickBounds: [snap(MIN_TICK, b.spacing, true), snap(MAX_TICK, b.spacing, false)],
        price: tickPrice(b.tick, b.decimals[0], b.decimals[1]),
        feeBps: b.fee / 100,
        bins: [],
      },
    };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}

type UserPositionInfo = {
  token_id: unknown;
  token0: unknown;
  token1: unknown;
  fee: unknown;
  tick_lower: unknown;
  tick_upper: unknown;
  liquidity: unknown;
  tokens_owed0: unknown;
  tokens_owed1: unknown;
};

async function userPositions(owner: string): Promise<UserPositionInfo[]> {
  const sdk = await sdkMod();
  const out: UserPositionInfo[] = [];
  for (let skip = 0; skip < 500; skip += 50) {
    const page = (await sorobanView(SUSHI.positionManager, "get_user_positions_with_fees", [
      sdk.Address.fromString(owner).toScVal(),
      sdk.nativeToScVal(skip, { type: "u32" }),
      sdk.nativeToScVal(50, { type: "u32" }),
    ])) as UserPositionInfo[];
    out.push(...(page ?? []));
    if (!page || page.length < 50) break;
  }
  return out;
}

/** One position as the UI shows it: range, in-range flag, amounts now, owed fees. */
async function describe(p: UserPositionInfo, b: Awaited<ReturnType<typeof poolBase>>) {
  const lo = Number(p.tick_lower);
  const hi = Number(p.tick_upper);
  const l = big(p.liquidity);
  const amounts = amountsForLiquidity(b.sqrtPrice, sqrtRatioAtTick(lo), sqrtRatioAtTick(hi), l);
  return {
    tokenId: Number(p.token_id),
    tickLower: lo,
    tickUpper: hi,
    priceLower: tickPrice(lo, b.decimals[0], b.decimals[1]),
    priceUpper: tickPrice(hi, b.decimals[0], b.decimals[1]),
    inRange: b.tick >= lo && b.tick < hi,
    liquidity: l.toString(),
    amounts: amounts.map(String),
    fees: [big(p.tokens_owed0).toString(), big(p.tokens_owed1).toString()],
  };
}

/** A user's Sushi positions in one pool (matched by token pair + fee tier). */
export async function sushiPositions(pool: string, address: string) {
  if (!isContract(pool) || !(isAccount(address) || isContract(address)))
    return { status: 400, body: { ok: false, error: "pool + address required" } };
  try {
    const [b, all] = await Promise.all([poolBase(pool), userPositions(address)]);
    const mine = all.filter((p) => String(p.token0) === b.tokens[0] && String(p.token1) === b.tokens[1] && Number(p.fee) === b.fee);
    const positions = [];
    for (const p of mine) {
      const d = await describe(p, b);
      if (big(d.liquidity) > 0n || d.fees.some((f) => big(f) > 0n)) positions.push(d);
    }
    return {
      status: 200,
      body: { ok: true, tokens: b.tokens, codes: b.codes, decimals: b.decimals, tick: b.tick, price: tickPrice(b.tick, b.decimals[0], b.decimals[1]), positions, rewards: null },
    };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}

/** Every Sushi position a user holds, valued, for /dex/positions. */
export async function sushiAllPositions(address: string) {
  const all = await userPositions(address);
  if (!all.length) return [];
  const sdk = await sdkMod();
  const factory = SUSHI.factory;
  const out = [];
  const bases = new Map<string, Awaited<ReturnType<typeof poolBase>> & { pool: string }>();
  for (const p of all) {
    const key = `${String(p.token0)}:${String(p.token1)}:${Number(p.fee)}`;
    let b = bases.get(key);
    if (!b) {
      const pool = String(
        await sorobanView(factory, "get_pool", [
          sdk.Address.fromString(String(p.token0)).toScVal(),
          sdk.Address.fromString(String(p.token1)).toScVal(),
          sdk.nativeToScVal(Number(p.fee), { type: "u32" }),
        ]),
      );
      b = { ...(await poolBase(pool)), pool };
      bases.set(key, b);
    }
    const d = await describe(p, b);
    if (big(d.liquidity) <= 0n && !d.fees.some((f) => big(f) > 0n)) continue;
    out.push({ ...d, pool: b.pool, tokens: b.tokens, codes: b.codes, decimals: b.decimals, feeBps: b.fee / 100 });
  }
  const px: Record<string, number | null> = (await pricesByContract([...new Set(out.flatMap((o) => o.tokens))]).catch(() => null))?.prices ?? {};
  return out.map((o) => {
    const legs = o.tokens.map((t, i) => ({ contract: t, code: o.codes[i], amount: Number(o.amounts[i]) / 10 ** o.decimals[i] }));
    const priced = legs.every((l) => l.amount === 0 || px[l.contract] != null);
    return {
      ...o,
      underlying: legs,
      valueUsd: priced ? legs.reduce((s, l) => s + l.amount * (px[l.contract] ?? 0), 0) : null,
    };
  });
}

/**
 * Builds from `from` (sushi only):
 *   cl_quote     {priceLower, priceUpper | full, amounts}: amounts the range would take (no tx)
 *   cl_deposit   {priceLower, priceUpper | full, amounts}: mint a new position NFT
 *   cl_withdraw  {tokenId, liquidity?}: decrease_liquidity, then (next) collect
 *   cl_collect   {tokenId}: collect owed tokens + fees
 */
export async function buildSushi(b: {
  pool?: string;
  from?: string;
  signer?: string;
  action?: string;
  full?: boolean;
  priceLower?: number;
  priceUpper?: number;
  tickLower?: number;
  tickUpper?: number;
  amounts?: string[];
  tokenId?: number;
  liquidity?: string;
  slippageBps?: number;
}) {
  const pool = String(b.pool ?? "");
  const from = String(b.from ?? "");
  const signer = b.signer ? String(b.signer) : undefined;
  if (!isContract(pool) || !(isAccount(from) || isContract(from) || b.action === "cl_quote"))
    return { status: 400, body: { ok: false, error: "pool + from required" } };
  const slip = BigInt(Math.min(500, Math.max(10, Math.round(Number(b.slippageBps ?? 100)))));
  const less = (x: bigint) => (x * (10_000n - slip)) / 10_000n;
  try {
    const sdk = await sdkMod();
    const addr = (x: string) => sdk.Address.fromString(x).toScVal();
    const u128 = (x: bigint) => sdk.nativeToScVal(x, { type: "u128" });
    const u64 = (x: bigint) => sdk.nativeToScVal(x, { type: "u64" });
    const u32 = (x: number) => sdk.nativeToScVal(x, { type: "u32" });
    const i32 = (x: number) => sdk.nativeToScVal(x, { type: "i32" });
    const struct = (f: Record<string, unknown>) =>
      sdk.xdr.ScVal.scvMap(
        Object.keys(f)
          .sort()
          .map((k) => new sdk.xdr.ScMapEntry({ key: sdk.xdr.ScVal.scvSymbol(k), val: f[k] as InstanceType<typeof sdk.xdr.ScVal> })),
      );
    const deadline = u64(BigInt(Math.floor(Date.now() / 1000) + 900));
    const pm = new sdk.Contract(SUSHI.positionManager);
    const base = await poolBase(pool);

    if (b.action === "cl_quote" || b.action === "cl_deposit") {
      let lo: number;
      let hi: number;
      if (b.full) {
        lo = snap(MIN_TICK, base.spacing, true);
        hi = snap(MAX_TICK, base.spacing, false);
      } else {
        lo = Number.isFinite(Number(b.tickLower)) && b.tickLower != null ? Number(b.tickLower) : priceTick(Number(b.priceLower), base.decimals[0], base.decimals[1]);
        hi = Number.isFinite(Number(b.tickUpper)) && b.tickUpper != null ? Number(b.tickUpper) : priceTick(Number(b.priceUpper), base.decimals[0], base.decimals[1]);
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { status: 200, body: { ok: false, error: "Pick a price range." } };
        lo = snap(lo, base.spacing, false);
        hi = snap(hi, base.spacing, true);
      }
      if (!(hi > lo)) return { status: 200, body: { ok: false, error: "The range's upper price must be above the lower price." } };
      // A zero amount on one side means "as much as the range needs" for quotes.
      const want = (b.amounts ?? []).map((x) => (/^\d+$/.test(String(x)) ? BigInt(x) : 0n));
      if (want.length !== 2 || want.every((x) => x <= 0n)) return { status: 200, body: { ok: false, error: "Enter an amount to deposit." } };
      const sa = sqrtRatioAtTick(lo);
      const sb = sqrtRatioAtTick(hi);
      const q = (x: bigint) => (b.action === "cl_quote" && x <= 0n ? MAX_U128 >> 8n : x);
      const l = liquidityForAmounts(base.sqrtPrice, sa, sb, q(want[0]), q(want[1]));
      const used = amountsForLiquidity(base.sqrtPrice, sa, sb, l);
      const range = { tickLower: lo, tickUpper: hi, priceLower: tickPrice(lo, base.decimals[0], base.decimals[1]), priceUpper: tickPrice(hi, base.decimals[0], base.decimals[1]) };
      if (b.action === "cl_quote") return { status: 200, body: { ok: true, used: used.map(String), liquidity: l.toString(), ...range } };
      if (l <= 0n)
        return { status: 200, body: { ok: false, error: "This range takes none of these amounts — add the token the range needs (below the price: the quote token; above: the base token)." } };
      const op = pm.call(
        "mint",
        struct({
          amount0_desired: u128(want[0]),
          amount0_min: u128(less(used[0])),
          amount1_desired: u128(want[1]),
          amount1_min: u128(less(used[1])),
          deadline,
          fee: u32(base.fee),
          recipient: addr(from),
          sender: addr(from),
          tick_lower: i32(lo),
          tick_upper: i32(hi),
          token0: addr(base.tokens[0]),
          token1: addr(base.tokens[1]),
        }),
      );
      const { xdr } = await invokeFor({ from, signer, op });
      return { status: 200, body: { ok: true, xdr, label: `Add liquidity ${base.codes.join("/")}`, used: used.map(String), ...range } };
    }

    const id = Number(b.tokenId);
    if (!Number.isInteger(id) || id < 0) return { status: 200, body: { ok: false, error: "Pick a position." } };
    if (b.action === "cl_withdraw") {
      const p = (await sorobanView(SUSHI.positionManager, "get_position_with_fees", [u32(id)])) as UserPositionInfo;
      if (String(p.token0) !== base.tokens[0] || String(p.token1) !== base.tokens[1] || Number(p.fee) !== base.fee)
        return { status: 200, body: { ok: false, error: "That position belongs to a different pool." } };
      const have = big(p.liquidity);
      let l = /^\d+$/.test(String(b.liquidity ?? "")) ? BigInt(String(b.liquidity)) : have;
      if (l > have) l = have;
      if (l <= 0n) return { status: 200, body: { ok: false, error: "This position has no liquidity left. Collect its tokens instead." } };
      const out = amountsForLiquidity(base.sqrtPrice, sqrtRatioAtTick(Number(p.tick_lower)), sqrtRatioAtTick(Number(p.tick_upper)), l);
      const op = pm.call(
        "decrease_liquidity",
        struct({ amount0_min: u128(less(out[0])), amount1_min: u128(less(out[1])), deadline, liquidity: u128(l), operator: addr(from), token_id: u32(id) }),
      );
      const { xdr } = await invokeFor({ from, signer, op });
      return {
        status: 200,
        body: { ok: true, xdr, label: `Remove liquidity #${id}`, amounts: out.map(String), next: { protocol: "sushi", pool, from, signer, action: "cl_collect", tokenId: id } },
      };
    }
    if (b.action === "cl_collect") {
      const op = pm.call("collect", struct({ amount0_max: u128(MAX_U128), amount1_max: u128(MAX_U128), operator: addr(from), recipient: addr(from), token_id: u32(id) }));
      const { xdr } = await invokeFor({ from, signer, op });
      return { status: 200, body: { ok: true, xdr, label: `Collect tokens #${id}`, next: null } };
    }
    return { status: 400, body: { ok: false, error: "unknown action" } };
  } catch (e) {
    const { humanizeSimError } = await import("./rpc.js");
    const m = err(e);
    return { status: 200, body: { ok: false, error: m.startsWith("Simulation failed") ? humanizeSimError(m) : m } };
  }
}
