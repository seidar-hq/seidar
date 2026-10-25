// Soroswap aggregator call built by Seidar (not the Soroswap API), so the
// swapping account can be a smart account. The Soroswap API's /quote/build
// only targets G accounts and simulates from them (it fails unless the
// signer holds the input), so smart-account swaps encode the quote's
// rawTrade into the aggregator's own types:
//
//   swap_exact_in(user, token_in, amount_in, token_out, min_out,
//                 routes: Vec<Route { amount_in, hops: Vec<Hop> }>,
//                 partner: Option<Partner>)
//   Hop = Soroswap{pair,token_in,token_out} | Aqua{steps,token_in}
// Only hop types verified byte-for-byte against the aggregator API are
// encoded. Phoenix (Phoenix{pool,token_in,token_out}) is left out: the
// aggregator returned no Phoenix routes to verify against (2026-10-15), and
// an unverified encoding must never move funds.
//
// Interface read from the mainnet contract (stellar contract info interface).
// Encoding is checked byte-for-byte against the API's own build in
// test/swap-route.test.ts.

import type { xdr as Xdr } from "@stellar/stellar-sdk";
import { isTestnet, TESTNET } from "./net.js";

/** Soroswap aggregator (swap_exact_in). Testnet: Seidar's deploy of the
 *  same WASM (net.ts TESTNET.aggregator). */
export const aggregator = () => (isTestnet() ? TESTNET.aggregator : "CARVQXFP4JF5ELLXUMQ6DALR346YVGBMQOHB4ENA7SSVXAYABXLBDDC4");

/** Protocols whose hops Seidar encodes (SDEX needs a classic account). */
export const SMART_SWAP_PROTOCOLS = ["soroswap", "aqua"] as const;

type RawHop = {
  poolId: string;
  protocol: string;
  tokenIn: string;
  tokenOut: string;
  poolHash?: string;
};
type RawRoute = { protocol_id?: string; share?: string; hops?: RawHop[] };
export type RawTrade = { amountIn?: string; amountOutMin?: string; distribution?: RawRoute[] };

type Sdk = typeof import("@stellar/stellar-sdk");

function struct(sdk: Sdk, fields: Record<string, Xdr.ScVal>): Xdr.ScVal {
  // contracttype structs are maps with symbol keys in sorted order.
  return sdk.xdr.ScVal.scvMap(
    Object.keys(fields)
      .sort()
      .map((k) => new sdk.xdr.ScMapEntry({ key: sdk.xdr.ScVal.scvSymbol(k), val: fields[k] })),
  );
}

function variant(sdk: Sdk, name: string, value: Xdr.ScVal): Xdr.ScVal {
  return sdk.xdr.ScVal.scvVec([sdk.xdr.ScVal.scvSymbol(name), value]);
}

/** Contract ids compare by raw bytes (Aqua pools key on the sorted pair). */
function byContractBytes(sdk: Sdk) {
  return (a: string, b: string) => Buffer.compare(sdk.StrKey.decodeContract(a), sdk.StrKey.decodeContract(b));
}

function aquaStep(sdk: Sdk, h: RawHop): Xdr.ScVal {
  if (!h.poolHash || !/^[0-9a-f]{64}$/i.test(h.poolHash)) throw new Error("aqua hop without pool hash");
  const a = (x: string) => sdk.Address.fromString(x).toScVal();
  const pair = [h.tokenIn, h.tokenOut].sort(byContractBytes(sdk));
  return sdk.xdr.ScVal.scvVec([
    sdk.xdr.ScVal.scvVec(pair.map(a)),
    sdk.xdr.ScVal.scvBytes(Buffer.from(h.poolHash, "hex")),
    a(h.tokenOut),
  ]);
}

/** Consecutive Aqua hops travel as ONE Aqua hop with several steps. */
function encodeHops(sdk: Sdk, hops: RawHop[]): Xdr.ScVal[] {
  const out: Xdr.ScVal[] = [];
  for (let i = 0; i < hops.length; ) {
    if (hops[i].protocol !== "aqua") {
      out.push(encodeHop(sdk, hops[i++]));
      continue;
    }
    const tokenIn = hops[i].tokenIn;
    const steps: Xdr.ScVal[] = [];
    while (i < hops.length && hops[i].protocol === "aqua") steps.push(aquaStep(sdk, hops[i++]));
    out.push(
      variant(
        sdk,
        "Aqua",
        struct(sdk, { steps: sdk.xdr.ScVal.scvVec(steps), token_in: sdk.Address.fromString(tokenIn).toScVal() }),
      ),
    );
  }
  return out;
}

function encodeHop(sdk: Sdk, h: RawHop): Xdr.ScVal {
  const a = (x: string) => sdk.Address.fromString(x).toScVal();
  switch (h.protocol) {
    case "soroswap":
      return variant(sdk, "Soroswap", struct(sdk, { pair: a(h.poolId), token_in: a(h.tokenIn), token_out: a(h.tokenOut) }));
    default:
      throw new Error(`route uses ${h.protocol}, which smart-account swaps don't support yet`);
  }
}

/** Vec<Route> for swap_exact_in from a Soroswap quote's rawTrade. */
export async function encodeRoutes(raw: RawTrade): Promise<Xdr.ScVal> {
  const sdk = await import("@stellar/stellar-sdk");
  const routes = (raw.distribution ?? []).map((r) => {
    if (!r.share || !/^\d+$/.test(r.share) || !r.hops?.length) throw new Error("malformed route in quote");
    return struct(sdk, {
      amount_in: sdk.nativeToScVal(BigInt(r.share), { type: "i128" }),
      hops: sdk.xdr.ScVal.scvVec(encodeHops(sdk, r.hops)),
    });
  });
  if (routes.length === 0) throw new Error("quote has no routes");
  return sdk.xdr.ScVal.scvVec(routes);
}
