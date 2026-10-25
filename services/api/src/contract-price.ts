// USD price for any token contract. Majors come from the Reflector cascade
// (livePrices by code); anything Reflector doesn't carry (CETES, USTRY,
// TESOURO, long-tail) is priced off a Soroswap aggregator quote of one whole
// token into USDC, corrected for the quote's own price impact so thin books
// don't understate the mid. Quotes with >35% impact are rejected (no price
// beats a fake one). Cached 10 min in Redis.

import { cacheGet, cacheSet } from "@seidar/cache";
import { livePrices } from "./prices.js";
import { soroPost } from "./swap.js";
import { isListedToken, tokenMetas } from "./token-meta.js";
import { mapLimit } from "./rpc.js";

const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const TTL = 10 * 60_000;
const key = (c: string) => `prices:contract:${c}`;

async function dexQuoteUsd(contract: string, decimals: number): Promise<number | null> {
  if (contract === USDC) return 1;
  const hit = await cacheGet<number>(key(contract)).catch(() => null);
  if (hit != null && hit > 0) return hit;
  try {
    const amount = (BigInt(10) ** BigInt(decimals)).toString();
    const q = (await soroPost("/quote", {
      assetIn: contract,
      assetOut: USDC,
      amount,
      tradeType: "EXACT_IN",
      protocols: ["soroswap", "aqua", "phoenix", "sdex"],
    })) as { amountOut?: unknown; priceImpactPct?: unknown };
    const out = Number(q?.amountOut) / 1e7;
    const impact = Math.max(0, Number(q?.priceImpactPct) || 0);
    if (!(out > 0) || impact > 35) return null;
    const px = out / (1 - impact / 100);
    await cacheSet(key(contract), px, TTL).catch(() => {});
    return px;
  } catch {
    return null;
  }
}

/** Prices keyed by contract. Null = genuinely unpriceable right now. */
export async function pricesByContract(
  contracts: string[],
): Promise<{ prices: Record<string, number | null>; sources: Record<string, string> }> {
  const uniq = [...new Set(contracts)];
  const metas = await tokenMetas(uniq);
  const codes = uniq.map((c) => metas[c]?.code).filter((c): c is string => !!c);
  const { prices: byCode } = await livePrices(codes);
  const prices: Record<string, number | null> = {};
  const sources: Record<string, string> = {};
  const needQuote: string[] = [];
  for (const c of uniq) {
    const code = metas[c]?.code;
    // Oracle-by-ticker only for canonical contracts: a look-alike "USDC"
    // must earn its price from a real DEX quote, never inherit USDC's.
    const px = code && (await isListedToken(c)) ? byCode[code] : null;
    if (typeof px === "number" && px > 0) {
      prices[c] = px;
      sources[c] = "oracle";
    } else needQuote.push(c);
  }
  await mapLimit(needQuote, 4, async (c) => {
    const dec = metas[c]?.decimals;
    const q = dec != null ? await dexQuoteUsd(c, dec) : null;
    prices[c] = q;
    sources[c] = q != null ? "dex-quote" : "none";
  });
  return { prices, sources };
}
