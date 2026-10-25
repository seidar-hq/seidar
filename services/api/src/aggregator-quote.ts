// A fresh Soroswap aggregator route for one swap, for server-side callers
// that execute it themselves (the keeper). The split across pools changes
// block to block, so callers quote again on every attempt and pass the
// encoded route straight into the contract call.
//
// Source: the Soroswap API (routes Seidar can encode: swap-route.ts). Where
// the API has no path — always on testnet, and during API outages or rate
// limits — a single direct Soroswap pair hop on the aggregator, priced live
// by the Soroswap router. The aggregator takes its protocol fee from the
// input first, so route legs carry amount − fee.

import type { xdr as Xdr } from "@stellar/stellar-sdk";
import { isTestnet, netEnv, netKey, TESTNET } from "./net.js";
import { sorobanView } from "./rpc.js";
import { quoteSwap } from "./swap.js";
import { aggregator, encodeRoutes, type RawTrade } from "./swap-route.js";

const soroswapRouter = () =>
  netEnv("SOROSWAP_ROUTER") ?? (isTestnet() ? TESTNET.soroswapRouter : "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH");

export type AggQuote = {
  /** Expected output (base units). */
  out: bigint;
  /** Vec<Route> for swap_exact_in. */
  routes: Xdr.ScVal;
  /** Human summary, e.g. "aqua" or "soroswap+aqua". */
  via: string;
};

const feeBps = new Map<string, bigint>();

/** The aggregator's protocol fee (config.protocol_bps), read once per network. */
export async function aggregatorFeeBps(): Promise<bigint> {
  const key = netKey("agg-fee");
  const hit = feeBps.get(key);
  if (hit != null) return hit;
  const cfg = (await sorobanView(aggregator(), "config", [])) as { protocol_bps: number };
  const bps = BigInt(cfg.protocol_bps);
  feeBps.set(key, bps);
  return bps;
}

/** A one-hop Soroswap pair trade on the aggregator, priced by the router. */
export async function directPairTrade(tokenIn: string, tokenOut: string, amount: bigint): Promise<{ out: bigint; raw: RawTrade }> {
  const sdk = await import("@stellar/stellar-sdk");
  const a = (x: string) => sdk.Address.fromString(x).toScVal();
  const net = amount - (amount * (await aggregatorFeeBps())) / 10_000n;
  const [pair, amounts] = await Promise.all([
    sorobanView(soroswapRouter(), "router_pair_for", [a(tokenIn), a(tokenOut)]) as Promise<string>,
    sorobanView(soroswapRouter(), "router_get_amounts_out", [
      sdk.nativeToScVal(net, { type: "i128" }),
      sdk.xdr.ScVal.scvVec([a(tokenIn), a(tokenOut)]),
    ]) as Promise<bigint[]>,
  ]);
  const raw: RawTrade = {
    amountIn: net.toString(),
    distribution: [{ share: net.toString(), hops: [{ protocol: "soroswap", poolId: String(pair), tokenIn, tokenOut }] }],
  };
  return { out: BigInt(amounts[amounts.length - 1]), raw };
}

async function directPair(tokenIn: string, tokenOut: string, amount: bigint): Promise<AggQuote> {
  const { out, raw } = await directPairTrade(tokenIn, tokenOut, amount);
  return { out, routes: await encodeRoutes(raw), via: "soroswap pair" };
}

/** Best route the aggregator can take for `amount` of tokenIn -> tokenOut now. */
export async function aggregatorQuote(tokenIn: string, tokenOut: string, amount: bigint): Promise<AggQuote> {
  if (amount <= 0n) throw new Error("amount must be positive");
  const r = await quoteSwap({ assetIn: tokenIn, assetOut: tokenOut, amount: amount.toString(), smart: true }).catch(() => null);
  const quote = (r?.body as { quote?: { amountIn?: string; amountOut?: string; rawTrade?: RawTrade } } | undefined)?.quote;
  if (quote?.rawTrade && quote.amountIn === amount.toString() && /^\d+$/.test(String(quote.amountOut))) {
    try {
      const protos = [...new Set((quote.rawTrade.distribution ?? []).flatMap((d) => (d.hops ?? []).map((h) => h.protocol)))];
      return { out: BigInt(String(quote.amountOut)), routes: await encodeRoutes(quote.rawTrade), via: protos.join("+") };
    } catch {
      // A hop Seidar doesn't encode: fall through to the direct pair.
    }
  }
  return directPair(tokenIn, tokenOut, amount);
}
