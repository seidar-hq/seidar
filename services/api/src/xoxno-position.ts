// XOXNO lending account priced the way the Seidar guard prices it: the
// controller's own amounts and health factor, XOXNO's price aggregator
// (`quotes`, under XOXNO's staleness policy). Returned in blend-position's
// Position shape so the keeper's sizing and the UI's positionView work
// unchanged: prices are WAD (oracleDecimals 18), a collateral leg's `cf` is
// its liquidation threshold and every `lf` is 1 (XOXNO's health factor is
// sum(collateral x price x threshold) / sum(debt x price)).

import type { Leg, Position } from "./blend-position.js";
import { XOXNO_CONTROLLER } from "./lending.js";
import { sorobanView, sorobanViewRaw } from "./rpc.js";

export { XOXNO_CONTROLLER };
const WAD = 10n ** 18n;
/** XOXNO's swap quote server (route bytes for controller strategy ops). */
const QUOTE_URL = "https://stellar-swap.xoxno.com/api/v1/quote";

type Sdk = typeof import("@stellar/stellar-sdk");
type ScVal = import("@stellar/stellar-sdk").xdr.ScVal;

export const hubKey = (sdk: Sdk, asset: string, hubId: number): ScVal =>
  sdk.xdr.ScVal.scvMap([
    new sdk.xdr.ScMapEntry({ key: sdk.xdr.ScVal.scvSymbol("asset"), val: sdk.Address.fromString(asset).toScVal() }),
    new sdk.xdr.ScMapEntry({ key: sdk.xdr.ScVal.scvSymbol("hub_id"), val: sdk.nativeToScVal(hubId, { type: "u32" }) }),
  ]);

let aggregatorAddr: string | null = null;
export async function xoxnoAggregator(): Promise<string> {
  aggregatorAddr ??= String(await sorobanView(XOXNO_CONTROLLER, "price_aggregator", []));
  return aggregatorAddr;
}

/** USD prices (WAD per whole token) XOXNO itself would use; throws on an
 *  invalid / stale / deviating print, like the guard. */
export async function xoxnoPrices(assets: string[]): Promise<Map<string, bigint>> {
  const sdk = await import("@stellar/stellar-sdk");
  const agg = await xoxnoAggregator();
  const keys = assets.map((a) => sdk.xdr.ScVal.scvVec([sdk.xdr.ScVal.scvSymbol("Token"), sdk.Address.fromString(a).toScVal()]));
  const raw = await sorobanViewRaw(agg, "quotes", [sdk.xdr.ScVal.scvVec(keys)]);
  const out = new Map<string, bigint>();
  for (const e of raw.map() ?? []) {
    const k = sdk.scValToNative(e.key()) as [string, string];
    const q = sdk.scValToNative(e.val()) as { valid: boolean; stale: boolean; deviation: boolean; final_wad: bigint };
    if (!q.valid || q.stale || q.deviation || BigInt(q.final_wad) <= 0n) throw new Error(`XOXNO has no usable price for ${k[1]}`);
    out.set(k[1], BigInt(q.final_wad));
  }
  for (const a of assets) if (!out.has(a)) throw new Error(`XOXNO has no price for ${a}`);
  return out;
}

/** USD per whole token on XOXNO's aggregator for display: every asset it
 *  prices validly (a stale print still counts here — it's what XOXNO
 *  shows); assets it can't price are left out for the caller's fallback. */
export async function xoxnoDisplayPrices(assets: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!assets.length) return out;
  const sdk = await import("@stellar/stellar-sdk");
  const agg = await xoxnoAggregator();
  const keys = assets.map((a) => sdk.xdr.ScVal.scvVec([sdk.xdr.ScVal.scvSymbol("Token"), sdk.Address.fromString(a).toScVal()]));
  const raw = await sorobanViewRaw(agg, "quotes", [sdk.xdr.ScVal.scvVec(keys)]);
  for (const e of raw.map() ?? []) {
    const k = sdk.scValToNative(e.key()) as [string, string];
    const q = sdk.scValToNative(e.val()) as { valid: boolean; final_wad: bigint };
    const wad = BigInt(q.final_wad ?? 0);
    if (q.valid && wad > 0n) out.set(k[1], Number(wad / 10n ** 9n) / 1e9);
  }
  return out;
}

/** Price of `base` in `quote` on XOXNO's aggregator — the guard's trigger value. */
export async function xoxnoCross(base: string, quote: string): Promise<number> {
  const px = await xoxnoPrices([base, quote]);
  return Number((px.get(base)! * 10_000_000n) / px.get(quote)!) / 1e7;
}

export type XoxnoLeg = Leg & { hubId: number };
export type XoxnoPosition = Omit<Position, "legs"> & { accountId: number; spokeId: number; legs: XoxnoLeg[] };

/** The XOXNO account `accountId` (owned by `account`) as a Position. */
export async function xoxnoPosition(accountId: number, account: string): Promise<XoxnoPosition> {
  const sdk = await import("@stellar/stellar-sdk");
  const id = sdk.nativeToScVal(accountId, { type: "u64" });
  const [raw, attrs, hfRaw] = await Promise.all([
    sorobanViewRaw(XOXNO_CONTROLLER, "get_account_positions", [id]),
    sorobanView(XOXNO_CONTROLLER, "get_account_attributes", [id]) as Promise<{ spoke_id: number }>,
    sorobanView(XOXNO_CONTROLLER, "get_health_factor", [id]) as Promise<bigint>,
  ]);
  const [collMap, debtMap] = raw.vec() ?? [];
  type K = { asset: string; hubId: number; lt: number };
  const keys = (m: ScVal | undefined, withLt: boolean): K[] =>
    (m?.map() ?? []).map((e) => {
      const k = sdk.scValToNative(e.key()) as { asset: string; hub_id: number };
      const v = sdk.scValToNative(e.val()) as { liquidation_threshold?: number };
      return { asset: k.asset, hubId: Number(k.hub_id), lt: withLt ? Number(v.liquidation_threshold ?? 0) / 1e4 : 0 };
    });
  const colls = keys(collMap, true);
  const debts = keys(debtMap, false);
  const assets = [...new Set([...colls, ...debts].map((k) => k.asset))];
  const [prices, amounts, decimals] = await Promise.all([
    assets.length ? xoxnoPrices(assets) : Promise.resolve(new Map<string, bigint>()),
    Promise.all([
      ...colls.map((k) => sorobanView(XOXNO_CONTROLLER, "get_collateral_amount", [id, hubKey(sdk, k.asset, k.hubId)])),
      ...debts.map((k) => sorobanView(XOXNO_CONTROLLER, "get_borrow_amount", [id, hubKey(sdk, k.asset, k.hubId)])),
    ]) as Promise<bigint[]>,
    Promise.all(assets.map((a) => sorobanView(a, "decimals", []).then(Number))),
  ]);
  const dec = new Map(assets.map((a, i) => [a, decimals[i]]));
  const byAsset = new Map<string, XoxnoLeg>();
  const leg = (k: K): XoxnoLeg => {
    let l = byAsset.get(k.asset);
    if (!l) {
      const d = dec.get(k.asset) ?? 7;
      l = {
        asset: k.asset,
        hubId: k.hubId,
        index: byAsset.size,
        decimals: d,
        scalar: 10n ** BigInt(d),
        price: prices.get(k.asset) ?? 0n,
        cf: 0,
        lf: 1,
        dRate: 0n,
        collateral: 0n,
        debt: 0n,
      };
      byAsset.set(k.asset, l);
    }
    return l;
  };
  colls.forEach((k, i) => {
    const l = leg(k);
    l.collateral += BigInt(amounts[i]);
    l.cf = k.lt;
  });
  debts.forEach((k, i) => {
    leg(k).debt += BigInt(amounts[colls.length + i]);
  });
  const legs = [...byAsset.values()];
  let collEff = 0n;
  let collRaw = 0n;
  let debtRaw = 0n;
  for (const l of legs) {
    const cv = (l.price * l.collateral) / l.scalar;
    collRaw += cv;
    collEff += (cv * BigInt(Math.round(l.cf * 1e4))) / 10_000n;
    debtRaw += (l.price * l.debt) / l.scalar;
  }
  const hf = BigInt(hfRaw);
  return {
    pool: XOXNO_CONTROLLER,
    account,
    oracle: await xoxnoAggregator(),
    oracleDecimals: 18,
    legs,
    collEff,
    debtEff: debtRaw,
    collRaw,
    debtRaw,
    // The controller's own health factor (what the guard reads).
    health: debtRaw > 0n && hf < 2n ** 126n ? Number((hf * 10_000_000n) / WAD) / 1e7 : null,
    accountId,
    spokeId: Number(attrs.spoke_id),
  };
}

export type XQuote = { routeXdr: string; amountIn: bigint; amountOut: bigint; amountOutMin: bigint };

/** XOXNO route for a controller strategy op. Forward (`amountIn`) or
 *  reverse (`amountOut`: the input needed for at least that output). */
export async function xoxnoQuote(
  from: string,
  to: string,
  amount: { amountIn: bigint } | { amountOut: bigint },
  slippageBps: number,
): Promise<XQuote> {
  const qs = new URLSearchParams({ from, to, slippage: String(slippageBps / 10_000) });
  if ("amountIn" in amount) qs.set("amountIn", amount.amountIn.toString());
  else qs.set("amountOut", amount.amountOut.toString());
  const r = await fetch(`${QUOTE_URL}?${qs}`, { signal: AbortSignal.timeout(20_000) });
  const d = (await r.json()) as { routeXdr?: string; amountIn?: string; amountOut?: string; amountOutMin?: string; error?: string };
  if (!r.ok || !d.routeXdr) throw new Error(`XOXNO has no route ${from.slice(0, 4)}→${to.slice(0, 4)}${d.error ? `: ${d.error}` : ""}`);
  return {
    routeXdr: d.routeXdr,
    amountIn: BigInt(d.amountIn ?? "0"),
    amountOut: BigInt(d.amountOut ?? "0"),
    amountOutMin: BigInt(d.amountOutMin ?? d.amountOut ?? "0"),
  };
}
