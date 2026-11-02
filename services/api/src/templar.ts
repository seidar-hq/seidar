// Templar Protocol (read-only): lending markets that run on NEAR and are reached from Stellar.
//   GET /templar/markets              the markets whose collateral AND borrow asset are Stellar tokens
//   GET /templar/positions?address=G  a Stellar wallet's Templar positions
//
// How Templar reaches Stellar: each market is an immutable NEAR contract pairing one collateral asset with
// one borrow asset. Stellar assets are held on NEAR through NEAR Intents (HOT's Omni bridge, token ids
// `nep245:v2_1.omni.hot.tg:1100_<base58>`, 1100 = HOT's id for Stellar; the base58 tail ends with the
// asset's Stellar contract id). A Stellar wallet acts through a NEAR "universal account" it controls with
// SEP-53 signed messages; its id is derived from the wallet address:
//     hex(sha256("G…"))[0..12] + ".user0.tmplr.near"
// (verified 2026-11-02 against the keys of 37 of Templar's 38 Stellar-keyed accounts). Market data and
// positions come from Templar's public backend API (api.templarfi.org/v1; docs at /docs). Writing needs a
// partner API key or a NEAR relayer, so Seidar shows Templar read-only and opens Templar's app for actions.

import { createHash } from "node:crypto";
import { withCache } from "@seidar/cache";

const API = "https://api.templarfi.org/v1";
export const TEMPLAR_APP = "https://app.templarfi.org";
const UA_REGISTRY = "user0.tmplr.near";
const HOT_STELLAR = /^nep245:v2_1\.omni\.hot\.tg:1100_([1-9A-HJ-NP-Za-km-z]+)$/;

async function get<T>(path: string, ms = 15_000): Promise<T | null> {
  try {
    const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(ms), headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- asset ids

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(s: string): Uint8Array | null {
  let n = 0n;
  for (const ch of s) {
    const i = B58.indexOf(ch);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 255n));
    n >>= 8n;
  }
  for (const ch of s) {
    if (ch !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/** Stellar contract id of a HOT-bridged Stellar asset (null for anything else). */
export async function stellarContractOf(assetId: string): Promise<string | null> {
  const m = HOT_STELLAR.exec(assetId.replace(/^nep245:intents\.near:/, ""));
  if (!m) return null;
  const b = base58(m[1]);
  if (!b || b.length < 32) return null;
  try {
    const { StrKey } = await import("@stellar/stellar-sdk");
    return StrKey.encodeContract(Buffer.from(b.subarray(b.length - 32)));
  } catch {
    return null;
  }
}

/** The NEAR universal account a Stellar wallet controls on Templar (whether or not it exists yet). */
export function universalAccountOf(stellarAddress: string): string {
  return `${createHash("sha256").update(stellarAddress).digest("hex").slice(0, 12)}.${UA_REGISTRY}`;
}

// ---------------------------------------------------------------- markets

type Dec = string;
type RateStrategy = { Piecewise?: { base: Dec; optimal: Dec; rate_1: Dec; rate_2: Dec } } & { Linear?: { base: Dec; top: Dec } } & Record<string, unknown>;
type RawMarket = {
  marketId: string;
  name: string;
  status: string;
  version?: string;
  collateralAsset: string;
  borrowAsset: string;
  supplyApy: number | null;
  borrowApy: number | null;
  totalSupply: string;
  totalSupplyUsd: number;
  totalBorrow: string;
  totalBorrowUsd: number;
  totalCollateral: string;
  totalCollateralUsd: number;
  availableLiquidity: string;
  availableLiquidityUsd: number;
  utilizationRate: number | null;
  borrowLiquidity?: { withdrawalQueueDepthUsd?: number; withdrawalQueueLength?: number; maxBorrowLimitUsd?: number | null };
  configuration: {
    borrow_mcr_maintenance: Dec;
    borrow_mcr_liquidation: Dec;
    borrow_asset_maximum_usage_ratio: Dec;
    liquidation_maximum_spread: Dec;
    borrow_interest_rate_strategy: RateStrategy;
    borrow_origination_fee?: { Flat?: Dec; Proportional?: Dec };
    supply_withdrawal_fee?: { fee?: { Flat?: Dec; Proportional?: Dec }; duration?: string };
    supply_range?: { minimum?: string | null; maximum?: string | null };
    borrow_range?: { minimum?: string | null; maximum?: string | null };
    borrow_maximum_duration_ms?: string | null;
    yield_weights?: { supply?: number; static?: Record<string, number> };
    price_oracle_configuration?: { account_id?: string; collateral_asset_decimals?: number; borrow_asset_decimals?: number; price_maximum_age_s?: number };
  };
};

export type TemplarAsset = { assetId: string; contract: string; symbol: string; name: string | null; decimals: number; priceUsd: number | null };

export type TemplarMarket = {
  id: string;
  name: string;
  status: string;
  version: string | null;
  collateral: TemplarAsset;
  borrow: TemplarAsset;
  /** Percent. */
  supplyApy: number | null;
  borrowApy: number | null;
  utilizationPct: number | null;
  totalSupplyUsd: number;
  totalBorrowUsd: number;
  collateralUsd: number;
  availableUsd: number;
  /** Percent of collateral value that can be borrowed (1 / maintenance MCR), and where liquidation starts. */
  maxLtvPct: number;
  liquidationLtvPct: number;
  mcrMaintenance: number;
  mcrLiquidation: number;
  maxUsagePct: number;
  liquidationPenaltyPct: number;
  originationFee: { kind: "flat" | "proportional"; value: number };
  withdrawalFee: { kind: "flat" | "proportional"; value: number; durationMs: number } | null;
  /** Share of borrower interest that goes to suppliers (the rest is protocol revenue), percent. */
  supplierSharePct: number | null;
  minSupply: number | null;
  maxBorrowDurationMs: number | null;
  priceMaxAgeS: number | null;
  oracle: string | null;
  withdrawalQueue: { length: number; depthUsd: number };
  /** Annual borrow rate (percent) at utilization 0..100, for the rate curve. */
  rateCurve: { kind: "piecewise" | "linear" | "other"; points: { u: number; rate: number }[]; kinkPct: number | null };
  appUrl: string;
};

const num = (v: unknown) => (v == null || v === "" ? NaN : Number(v));

function curve(s: RateStrategy): TemplarMarket["rateCurve"] {
  const pts = (f: (u: number) => number) => Array.from({ length: 101 }, (_, i) => ({ u: i, rate: f(i / 100) * 100 }));
  if (s.Piecewise) {
    const base = num(s.Piecewise.base);
    const opt = num(s.Piecewise.optimal);
    const r1 = num(s.Piecewise.rate_1);
    const r2 = num(s.Piecewise.rate_2);
    if ([base, opt, r1, r2].every(Number.isFinite))
      return { kind: "piecewise", kinkPct: opt * 100, points: pts((u) => (u <= opt ? base + r1 * u : base + r1 * opt + r2 * (u - opt))) };
  }
  if (s.Linear) {
    const base = num(s.Linear.base);
    const top = num(s.Linear.top);
    if (Number.isFinite(base) && Number.isFinite(top)) return { kind: "linear", kinkPct: null, points: pts((u) => base + (top - base) * u) };
  }
  return { kind: "other", kinkPct: null, points: [] };
}

const fee = (f?: { Flat?: Dec; Proportional?: Dec }) =>
  f?.Proportional != null ? { kind: "proportional" as const, value: num(f.Proportional) * 100 } : { kind: "flat" as const, value: num(f?.Flat ?? 0) };

type AssetMeta = { symbol: string; decimals: number };

async function loadMarkets(): Promise<{ ok: true; markets: TemplarMarket[]; excluded: string[]; assets: Record<string, AssetMeta> }> {
  const [list, assets] = await Promise.all([
    get<{ data?: RawMarket[] }>("/markets", 20_000),
    get<{ data?: { assetId: string; symbol: string; name: string; decimals: number }[] }>("/assets"),
  ]);
  if (!list?.data) throw new Error("templar markets unavailable");
  const meta = new Map((assets?.data ?? []).map((a) => [a.assetId, a]));
  const out: TemplarMarket[] = [];
  const excluded: string[] = [];
  for (const m of list.data) {
    const [cc, bc] = await Promise.all([stellarContractOf(m.collateralAsset), stellarContractOf(m.borrowAsset)]);
    // Only markets whose two assets are Stellar tokens: a Stellar wallet can't hold the others.
    if (!cc || !bc || m.status !== "active") {
      excluded.push(m.marketId);
      continue;
    }
    const c = m.configuration;
    const o = c.price_oracle_configuration ?? {};
    const cDec = o.collateral_asset_decimals ?? meta.get(m.collateralAsset)?.decimals ?? 7;
    const bDec = o.borrow_asset_decimals ?? meta.get(m.borrowAsset)?.decimals ?? 7;
    const px = (usd: number, raw: string, dec: number) => {
      const n = num(raw) / 10 ** dec;
      return n > 0 && usd > 0 ? usd / n : null;
    };
    const asset = (id: string, contract: string, dec: number, price: number | null, fallback: string): TemplarAsset => ({
      assetId: id,
      contract,
      symbol: meta.get(id)?.symbol ?? fallback,
      name: meta.get(id)?.name ?? null,
      decimals: dec,
      priceUsd: price,
    });
    const [cSym, bSym] = m.name.split("/");
    const mcrM = num(c.borrow_mcr_maintenance);
    const mcrL = num(c.borrow_mcr_liquidation);
    const w = c.yield_weights;
    const staticW = Object.values(w?.static ?? {}).reduce((s, x) => s + Number(x), 0);
    const minSupply = c.supply_range?.minimum != null ? num(c.supply_range.minimum) / 10 ** bDec : null;
    out.push({
      id: m.marketId,
      name: m.name,
      status: m.status,
      version: m.version ?? null,
      collateral: asset(m.collateralAsset, cc, cDec, px(m.totalCollateralUsd, m.totalCollateral, cDec), cSym ?? "?"),
      borrow: asset(m.borrowAsset, bc, bDec, px(m.totalSupplyUsd, m.totalSupply, bDec), bSym ?? "?"),
      supplyApy: m.supplyApy != null ? m.supplyApy * 100 : null,
      borrowApy: m.borrowApy != null ? m.borrowApy * 100 : null,
      utilizationPct: m.utilizationRate != null ? m.utilizationRate * 100 : null,
      totalSupplyUsd: m.totalSupplyUsd ?? 0,
      totalBorrowUsd: m.totalBorrowUsd ?? 0,
      collateralUsd: m.totalCollateralUsd ?? 0,
      availableUsd: m.availableLiquidityUsd ?? 0,
      maxLtvPct: mcrM > 0 ? 100 / mcrM : 0,
      liquidationLtvPct: mcrL > 0 ? 100 / mcrL : 0,
      mcrMaintenance: mcrM,
      mcrLiquidation: mcrL,
      maxUsagePct: num(c.borrow_asset_maximum_usage_ratio) * 100,
      liquidationPenaltyPct: num(c.liquidation_maximum_spread) * 100,
      originationFee: fee(c.borrow_origination_fee),
      withdrawalFee: c.supply_withdrawal_fee?.fee ? { ...fee(c.supply_withdrawal_fee.fee), durationMs: num(c.supply_withdrawal_fee.duration ?? 0) || 0 } : null,
      supplierSharePct: w?.supply ? (w.supply / (w.supply + staticW)) * 100 : null,
      minSupply: minSupply != null && Number.isFinite(minSupply) ? minSupply : null,
      maxBorrowDurationMs: c.borrow_maximum_duration_ms ? num(c.borrow_maximum_duration_ms) : null,
      priceMaxAgeS: o.price_maximum_age_s ?? null,
      oracle: o.account_id ?? null,
      withdrawalQueue: { length: m.borrowLiquidity?.withdrawalQueueLength ?? 0, depthUsd: m.borrowLiquidity?.withdrawalQueueDepthUsd ?? 0 },
      rateCurve: curve(c.borrow_interest_rate_strategy),
      appUrl: `${TEMPLAR_APP}/markets/${m.marketId}`,
    });
  }
  out.sort((a, b) => b.totalSupplyUsd + b.collateralUsd - (a.totalSupplyUsd + a.collateralUsd));
  // Every asset Templar knows (incl. unlisted markets' assets), for naming positions in those markets.
  const assetsOut: Record<string, AssetMeta> = {};
  for (const a of assets?.data ?? []) assetsOut[a.assetId.replace(/^nep245:intents\.near:/, "")] = { symbol: a.symbol, decimals: a.decimals };
  return { ok: true, markets: out, excluded, assets: assetsOut };
}

export async function templarMarkets() {
  const r = await withCache("templar:markets:v2", 120_000, loadMarkets, { swr: true });
  return r.value ?? { ok: false as const, error: "Templar's market data didn't load. Try again shortly.", markets: [] as TemplarMarket[], assets: {} as Record<string, AssetMeta> };
}

// ---------------------------------------------------------------- positions

type RawSupply = {
  marketId: string;
  assetId: string;
  apy: number | null;
  balance: string;
  balanceUsd: number;
  interestEarnedUsd?: number;
  pendingDepositsTotal?: string;
  withdrawalRequest?: { amount?: string; depth?: string; position?: number } | null;
};
type RawBorrow = {
  marketId: string;
  assetId: string;
  apy: number | null;
  debt: string;
  debtUsd: number;
  collateral: string;
  collateralAssetId: string;
  collateralUsd: number;
  collateralInFlight?: string;
  interestAccruedUsd?: number;
};
type RawPositions = {
  data?: {
    account: string;
    supplyPositions?: RawSupply[];
    borrowPositions?: RawBorrow[];
    health?: { healthFactor: number | null; totalCollateralUsd: number; totalBorrowUsd: number };
  };
};

export type TemplarPosition = {
  marketId: string;
  /** Listed in Seidar (both assets are Stellar tokens and the market is active). */
  listed: boolean;
  name: string;
  appUrl: string;
  supply: { contract: string | null; symbol: string; amount: number; usd: number; apy: number | null; earnedUsd: number; queuedWithdrawal: number | null } | null;
  borrow: {
    contract: string | null;
    symbol: string;
    amount: number;
    usd: number;
    apy: number | null;
    collateral: { contract: string | null; symbol: string; amount: number; usd: number };
    /** Collateral ratio over the liquidation ratio: below 1 the position can be liquidated. */
    healthFactor: number | null;
    /** Collateral price (USD) at which liquidation starts. */
    liquidationPrice: number | null;
  } | null;
};

export async function templarPositions(address: string) {
  if (!/^G[A-Z2-7]{55}$/.test(address)) return { status: 400, body: { ok: false, error: "invalid address" } };
  const account = universalAccountOf(address);
  const [raw, mk] = await Promise.all([get<RawPositions>(`/accounts/${account}/positions`), templarMarkets()]);
  if (!raw) return { status: 200, body: { ok: false, error: "Templar's positions didn't load. Try again shortly.", account } };
  const markets = new Map((mk.markets ?? []).map((m) => [m.id, m]));
  const d = raw.data;
  const byMarket = new Map<string, TemplarPosition>();
  const nameOf = (id: string) => markets.get(id)?.name ?? id.replace(/\.v1\.tmplr\.near$/, "");
  const entry = (id: string): TemplarPosition => {
    let p = byMarket.get(id);
    if (!p) {
      p = { marketId: id, listed: markets.has(id), name: nameOf(id), appUrl: `${TEMPLAR_APP}/markets/${id}`, supply: null, borrow: null };
      byMarket.set(id, p);
    }
    return p;
  };
  const amountOf = async (raw: string, assetId: string, m: TemplarMarket | undefined, side: "collateral" | "borrow") => {
    const a = mk.assets?.[assetId.replace(/^nep245:intents\.near:/, "")];
    const dec = m ? m[side].decimals : (a?.decimals ?? 7);
    return { amount: num(raw) / 10 ** dec, contract: await stellarContractOf(assetId), symbol: m?.[side].symbol ?? a?.symbol ?? "?" };
  };
  for (const s of d?.supplyPositions ?? []) {
    if (!(s.balanceUsd > 0.000001) && !(num(s.balance) > 1)) continue;
    const m = markets.get(s.marketId);
    const a = await amountOf(s.balance, s.assetId, m, "borrow");
    const q = s.withdrawalRequest?.amount ? num(s.withdrawalRequest.amount) / 10 ** (m?.borrow.decimals ?? mk.assets?.[s.assetId]?.decimals ?? 7) : null;
    entry(s.marketId).supply = { ...a, usd: s.balanceUsd ?? 0, apy: s.apy != null ? s.apy * 100 : null, earnedUsd: s.interestEarnedUsd ?? 0, queuedWithdrawal: q };
  }
  for (const b of d?.borrowPositions ?? []) {
    const m = markets.get(b.marketId);
    const debt = await amountOf(b.debt, b.assetId, m, "borrow");
    const coll = await amountOf(b.collateral, b.collateralAssetId, m, "collateral");
    if (!(b.debtUsd > 0.000001) && !(coll.amount > 0)) continue;
    const ratio = b.debtUsd > 0 ? b.collateralUsd / b.debtUsd : null;
    entry(b.marketId).borrow = {
      contract: debt.contract,
      symbol: debt.symbol,
      amount: debt.amount,
      usd: b.debtUsd ?? 0,
      apy: b.apy != null ? b.apy * 100 : null,
      collateral: { contract: coll.contract, symbol: coll.symbol, amount: coll.amount, usd: b.collateralUsd ?? 0 },
      healthFactor: ratio != null && m ? ratio / m.mcrLiquidation : null,
      liquidationPrice: m && coll.amount > 0 && b.debtUsd > 0 ? (b.debtUsd * m.mcrLiquidation) / coll.amount : null,
    };
  }
  const positions = [...byMarket.values()].sort((a, b) => (b.supply?.usd ?? 0) + (b.borrow?.collateral.usd ?? 0) - ((a.supply?.usd ?? 0) + (a.borrow?.collateral.usd ?? 0)));
  return {
    status: 200,
    body: {
      ok: true,
      account,
      positions,
      totals: {
        suppliedUsd: positions.reduce((s, p) => s + (p.supply?.usd ?? 0), 0),
        collateralUsd: positions.reduce((s, p) => s + (p.borrow?.collateral.usd ?? 0), 0),
        borrowedUsd: positions.reduce((s, p) => s + (p.borrow?.usd ?? 0), 0),
      },
      appUrl: `${TEMPLAR_APP}/borrow-supply/my-account`,
    },
  };
}
