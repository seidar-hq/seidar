// Blend position snapshot priced by the pool's own oracle — the numbers the
// Seidar guard sees on-chain (Blend-exact effective values). Shared by the
// automation UI endpoint (/automation/position) and the keeper's sizing.

import { sorobanView } from "./rpc.js";

const SCALAR_7 = 10_000_000n;
const SCALAR_12 = 1_000_000_000_000n;
const big = (v: unknown) => BigInt(String(v ?? "0"));

type ReserveRaw = {
  config: { c_factor: number; l_factor: number; decimals: number; index: number };
  data: { b_rate: bigint; d_rate: bigint };
  scalar: bigint;
};

export type Leg = {
  asset: string;
  index: number;
  decimals: number;
  scalar: bigint;
  /** Oracle price (oracle decimals). */
  price: bigint;
  cf: number;
  lf: number;
  /** Blend debt rate (12 decimals). */
  dRate: bigint;
  /** Underlying token amounts (base units). */
  collateral: bigint;
  debt: bigint;
};

export type Position = {
  pool: string;
  account: string;
  oracle: string;
  oracleDecimals: number;
  legs: Leg[];
  /** Effective values (oracle units): collateral x cf, debt / lf. */
  collEff: bigint;
  debtEff: bigint;
  /** Raw values (oracle units). */
  collRaw: bigint;
  debtRaw: bigint;
  /** Blend health factor; null when debt-free. */
  health: number | null;
};

const entries = (m: unknown): [number, bigint][] =>
  m instanceof Map
    ? [...m.entries()].map(([k, v]) => [Number(k), big(v)])
    : Object.entries((m as Record<string, unknown>) ?? {}).map(([k, v]) => [Number(k), big(v)]);

export async function oraclePrice(oracle: string, asset: string): Promise<bigint> {
  const sdk = await import("@stellar/stellar-sdk");
  const pd = (await sorobanView(oracle, "lastprice", [
    sdk.xdr.ScVal.scvVec([sdk.xdr.ScVal.scvSymbol("Stellar"), sdk.Address.fromString(asset).toScVal()]),
  ])) as { price: bigint } | null;
  if (!pd) throw new Error(`no oracle price for ${asset}`);
  return big(pd.price);
}

export async function poolOracle(pool: string): Promise<string> {
  const cfg = (await sorobanView(pool, "get_config")) as { oracle: string };
  return cfg.oracle;
}

/** Price of `base` in `quote` by the pool oracle — exactly the guard's trigger value (7 decimals). */
export async function crossPrice(pool: string, base: string, quote: string): Promise<number> {
  const oracle = await poolOracle(pool);
  const [pb, pq] = await Promise.all([oraclePrice(oracle, base), oraclePrice(oracle, quote)]);
  return Number((pb * SCALAR_7) / pq) / 1e7;
}

export async function blendPosition(pool: string, account: string): Promise<Position> {
  const sdk = await import("@stellar/stellar-sdk");
  const a = (x: string) => sdk.Address.fromString(x).toScVal();
  const [oracle, list, pos] = await Promise.all([
    poolOracle(pool),
    sorobanView(pool, "get_reserve_list") as Promise<string[]>,
    sorobanView(pool, "get_positions", [a(account)]) as Promise<{ collateral: unknown; liabilities: unknown }>,
  ]);
  const oracleDecimals = Number(await sorobanView(oracle, "decimals").catch(() => 14));
  const coll = new Map(entries(pos.collateral));
  const debt = new Map(entries(pos.liabilities));
  const idxs = [...new Set([...coll.keys(), ...debt.keys()])].filter(
    (i) => (coll.get(i) ?? 0n) > 0n || (debt.get(i) ?? 0n) > 0n,
  );
  const legs: Leg[] = [];
  let collEff = 0n;
  let debtEff = 0n;
  let collRaw = 0n;
  let debtRaw = 0n;
  for (const i of idxs) {
    const asset = list[i];
    const [r, px] = await Promise.all([
      sorobanView(pool, "get_reserve", [a(asset)]) as Promise<ReserveRaw>,
      oraclePrice(oracle, asset),
    ]);
    const scalar = big(r.scalar);
    const c = ((coll.get(i) ?? 0n) * big(r.data.b_rate)) / SCALAR_12;
    const dTok = debt.get(i) ?? 0n;
    const d = dTok > 0n ? (dTok * big(r.data.d_rate) + SCALAR_12 - 1n) / SCALAR_12 : 0n;
    const cf = BigInt(r.config.c_factor);
    const lf = BigInt(r.config.l_factor);
    collEff += (px * ((c * cf) / SCALAR_7)) / scalar;
    if (lf > 0n) debtEff += (px * ((d * SCALAR_7) / lf)) / scalar;
    collRaw += (px * c) / scalar;
    debtRaw += (px * d) / scalar;
    legs.push({
      asset,
      index: i,
      decimals: r.config.decimals,
      scalar,
      price: px,
      cf: Number(cf) / 1e7,
      lf: Number(lf) / 1e7,
      dRate: big(r.data.d_rate),
      collateral: c,
      debt: d,
    });
  }
  return {
    pool,
    account,
    oracle,
    oracleDecimals,
    legs,
    collEff,
    debtEff,
    collRaw,
    debtRaw,
    health: debtEff > 0n ? Number((collEff * SCALAR_7) / debtEff) / 1e7 : null,
  };
}

/** Reserve factors (cf, lf) for an asset in a pool. */
export async function reserveFactors(pool: string, asset: string): Promise<{ cf: number; lf: number; decimals: number }> {
  const sdk = await import("@stellar/stellar-sdk");
  const r = (await sorobanView(pool, "get_reserve", [sdk.Address.fromString(asset).toScVal()])) as ReserveRaw;
  return { cf: r.config.c_factor / 1e7, lf: r.config.l_factor / 1e7, decimals: r.config.decimals };
}

/** JSON-safe view for the UI. */
export function positionView(p: Position) {
  const unit = 10 ** p.oracleDecimals;
  return {
    pool: p.pool,
    account: p.account,
    health: p.health,
    collateralUsd: Number(p.collRaw) / unit,
    debtUsd: Number(p.debtRaw) / unit,
    legs: p.legs.map((l) => ({
      asset: l.asset,
      decimals: l.decimals,
      priceUsd: Number(l.price) / unit,
      cf: l.cf,
      lf: l.lf,
      collateral: Number(l.collateral) / 10 ** l.decimals,
      debt: Number(l.debt) / 10 ** l.decimals,
      collateralBase: l.collateral.toString(),
      debtBase: l.debt.toString(),
    })),
  };
}

/**
 * Most of `debtAsset` (base units) the account can borrow in one Blend
 * submit and keep health >= `minHealth`, counting `add` as collateral
 * supplied in that same submit. Uses the pool's oracle and reserve factors,
 * exactly as Blend checks health. 0 when there is no room.
 */
export async function borrowCapacity(
  pool: string,
  account: string,
  debtAsset: string,
  minHealth: number,
  add?: { asset: string; amount: bigint },
): Promise<bigint> {
  const sdk = await import("@stellar/stellar-sdk");
  const a = (x: string) => sdk.Address.fromString(x).toScVal();
  const p = await blendPosition(pool, account);
  let collEff = p.collEff;
  if (add && add.amount > 0n) {
    const [r, px] = await Promise.all([
      sorobanView(pool, "get_reserve", [a(add.asset)]) as Promise<ReserveRaw>,
      oraclePrice(p.oracle, add.asset),
    ]);
    collEff += (px * ((add.amount * BigInt(r.config.c_factor)) / SCALAR_7)) / big(r.scalar);
  }
  const floor = BigInt(Math.ceil(minHealth * 1e7));
  const roomEff = (collEff * SCALAR_7) / floor - p.debtEff;
  if (roomEff <= 0n) return 0n;
  const [r, px] = await Promise.all([
    sorobanView(pool, "get_reserve", [a(debtAsset)]) as Promise<ReserveRaw>,
    oraclePrice(p.oracle, debtAsset),
  ]);
  const lf = BigInt(r.config.l_factor);
  if (px <= 0n || lf <= 0n) return 0n;
  // debtEff = px * (d * SCALAR_7 / lf) / scalar  =>  d = eff * scalar * lf / (px * SCALAR_7)
  return (roomEff * big(r.scalar) * lf) / (px * SCALAR_7);
}
