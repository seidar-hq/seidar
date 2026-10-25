// Swap aggregator (Soroswap) + token registry + XDR submit + icon proxy.
// Ported verbatim from apps/app/src/lib/soroswap.ts and
// app/api/{swap/quote,swap/build,swap/send,swap/tokens,tx/send,icon}/route.ts.
// SOROSWAP_API_KEY stays server-side (services/api env, never the browser).

import { cacheGetEntry, cacheSet } from "@seidar/cache";
import { isTestnet, networkPassphrase, TESTNET } from "./net.js";
import { sorobanView } from "./rpc.js";
import { tokenMetas } from "./token-meta.js";
import { submitAndWait } from "./rpc.js";
import { invokeFor } from "./invoke.js";
import { aggregator, encodeRoutes, SMART_SWAP_PROTOCOLS, type RawTrade } from "./swap-route.js";
import { MAX_FEE_BPS, netOf, routerAddress, swapFeeBps } from "./fees.js";

export const SORO_BASE = "https://api.soroswap.finance";
export const soroNetwork = () => (isTestnet() ? "testnet" : "mainnet");
export const SORO_PROTOCOLS = ["soroswap", "phoenix", "aqua", "sdex", "sushi"];

const RPC_URL = process.env.RPC_URL?.trim() || "https://mainnet.sorobanrpc.com";


export function soroKey(): string | null {
  const k = process.env.SOROSWAP_API_KEY?.trim();
  return k ? k : null;
}

export async function soroPost(
  path: string,
  body: unknown,
  ms = 30000,
): Promise<unknown> {
  const key = soroKey();
  if (!key) throw new Error("no-api-key");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(
      `${SORO_BASE}${path}?network=${soroNetwork()}`,
      {
        method: "POST",
        signal: ctrl.signal,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const msg =
        (data as { message?: string } | null)?.message ?? `http ${r.status}`;
      const err = new Error(String(msg).slice(0, 200)) as Error & {
        status?: number;
      };
      err.status = r.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

export const isContract = (v: string) => /^C[A-Z2-7]{55}$/.test(v);
export const isAccount = (v: string) => /^G[A-Z2-7]{55}$/.test(v);

/**
 * Soroswap's API reports nonsense price impact for some routes (an SDEX
 * route for 50 USDC -> USTRY at the market rate came back as "300.94").
 * For SDEX routes, or any value outside [0, 100), measure it instead: the
 * value lost against market prices, (1 - out$ / in$), floored at 0. Null
 * when either price is unknown.
 */
async function sanitizeImpact(quote: Record<string, unknown>, assetIn: string, assetOut: string) {
  const raw = Number(quote.priceImpactPct);
  if (quote.platform !== "sdex" && Number.isFinite(raw) && raw >= 0 && raw < 100) return;
  quote.priceImpactPct = null;
  try {
    const amountIn = String(quote.amountIn ?? "");
    const amountOut = String(quote.amountOut ?? "");
    if (!/^\d+$/.test(amountIn) || !/^\d+$/.test(amountOut) || isTestnet()) return;
    const metas = await tokenMetas([assetIn, assetOut]);
    const mi = metas[assetIn];
    const mo = metas[assetOut];
    if (!mi || !mo) return;
    const { livePrices } = await import("./prices.js");
    const { prices } = await livePrices([mi.code, mo.code]);
    const pi = prices[mi.code.toUpperCase()];
    const po = prices[mo.code.toUpperCase()];
    if (!(pi != null && pi > 0 && po != null && po > 0)) return;
    const inUsd = (Number(amountIn) / 10 ** mi.decimals) * pi;
    const outUsd = (Number(amountOut) / 10 ** mo.decimals) * po;
    if (!(inUsd > 0)) return;
    quote.priceImpactPct = Math.max(0, (1 - outUsd / inUsd) * 100).toFixed(2);
  } catch {
    /* leave null */
  }
}

export async function quoteSwap(body: {
  assetIn?: string;
  assetOut?: string;
  amount?: string;
  tradeType?: string;
  slippageBps?: string;
  feeBps?: number | string;
  protocols?: unknown;
  /** Quote for a smart account: only routes Seidar can encode itself. */
  smart?: boolean;
}) {
  if (!soroKey()) return { status: 409, body: { ok: false, reason: "no-api-key" } };
  const assetIn = body?.assetIn ?? "";
  const assetOut = body?.assetOut ?? "";
  const amount = body?.amount ?? "";
  if (!isContract(assetIn) || !isContract(assetOut)) {
    return { status: 200, body: { ok: false, error: "assetIn/assetOut must be contract ids" } };
  }
  if (!/^\d+$/.test(amount) || BigInt(amount) <= BigInt(0)) {
    return { status: 200, body: { ok: false, error: "amount must be a positive base-unit integer" } };
  }
  const rawProto = Array.isArray(body?.protocols) ? body.protocols : null;
  const wantProto = (rawProto ?? []).filter(
    (p): p is string => typeof p === "string" && (SORO_PROTOCOLS as string[]).includes(p),
  );
  if (rawProto != null && rawProto.length > 0 && wantProto.length === 0) {
    return {
      status: 200,
      body: { ok: false, error: `protocols must be a non-empty subset of ${SORO_PROTOCOLS.join(", ")}` },
    };
  }
  const feeNum =
    typeof body?.feeBps === "number"
      ? body.feeBps
      : typeof body?.feeBps === "string" && /^\d+$/.test(body.feeBps)
        ? Number(body.feeBps)
        : NaN;
  const feeBps =
    Number.isFinite(feeNum) && feeNum > 0 && feeNum <= 1000 ? Math.floor(feeNum) : undefined;
  try {
    const quote = await soroPost("/quote", {
      assetIn,
      assetOut,
      amount,
      tradeType: body?.tradeType === "EXACT_OUT" ? "EXACT_OUT" : "EXACT_IN",
      protocols: body?.smart
        ? (wantProto.length > 0 ? wantProto : SORO_PROTOCOLS).filter((p) =>
            (SMART_SWAP_PROTOCOLS as readonly string[]).includes(p),
          )
        : wantProto.length > 0
          ? wantProto
          : SORO_PROTOCOLS,
      ...(body?.slippageBps ? { slippageBps: body.slippageBps } : {}),
      // The API's feeBps only lowers its quote (the built swap carries no
      // partner fee), so smart-account quotes leave it out: Seidar's fee is
      // taken by the Seidar router and reported below.
      ...(feeBps && !body?.smart ? { feeBps } : {}),
    });
    if (body?.smart) {
      const q = quote as { amountOut?: string; rawTrade?: RawTrade };
      const bps = swapFeeBps(feeBps);
      const net = (v: unknown) => (/^\d+$/.test(String(v)) ? netOf(BigInt(String(v)), bps).toString() : null);
      (quote as Record<string, unknown>).seidar = {
        feeBps: bps,
        router: routerAddress(),
        amountOutNet: net(q.amountOut),
        amountOutMinNet: net(q.rawTrade?.amountOutMin),
      };
    }
    await sanitizeImpact(quote as Record<string, unknown>, assetIn, assetOut);
    return { status: 200, body: { ok: true, quote } };
  } catch (e) {
    const status = (e as { status?: number })?.status;
    // No API path (always on testnet): a smart account can still swap on
    // the aggregator through the direct Soroswap pair, priced live.
    if (body?.smart && status === 400 && body?.tradeType !== "EXACT_OUT") {
      const q = await directQuote(assetIn, assetOut, amount, body?.slippageBps, feeBps).catch(() => null);
      if (q) return { status: 200, body: { ok: true, quote: q } };
    }
    const clean = e instanceof Error ? e.message : String(e).slice(0, 200);
    return {
      status: 200,
      body: {
        ok: false,
        error: status === 400 ? "No route found for this pair/amount." : clean.slice(0, 200),
      },
    };
  }
}

/** Quote in the Soroswap API's shape for a direct-pair aggregator trade. */
async function directQuote(assetIn: string, assetOut: string, amount: string, slippage: unknown, feeBps?: number) {
  const { directPairTrade } = await import("./aggregator-quote.js");
  const { out, raw } = await directPairTrade(assetIn, assetOut, BigInt(amount));
  if (out <= 0n) return null;
  const slip = /^\d+$/.test(String(slippage ?? "")) ? BigInt(String(slippage)) : 50n;
  const min = out - (out * slip) / 10_000n;
  const bps = swapFeeBps(feeBps);
  return {
    assetIn,
    assetOut,
    tradeType: "EXACT_IN",
    amountIn: amount,
    amountOut: out.toString(),
    otherAmountThreshold: min.toString(),
    priceImpactPct: null,
    platform: "aggregator",
    routePlan: [{ swapInfo: { protocol: "soroswap", path: [assetIn, assetOut] }, percent: "100.00" }],
    rawTrade: { ...raw, amountOutMin: min.toString() },
    seidar: { feeBps: bps, router: routerAddress(), amountOutNet: netOf(out, bps).toString(), amountOutMinNet: netOf(min, bps).toString() },
  };
}

/**
 * Smart-account swap, owner signs. With a Seidar router on this network:
 * router.swap (aggregator underneath, Seidar's fee off the output, the rest
 * >= the net minimum to the account). Otherwise the aggregator's
 * swap_exact_in directly. Routes are encoded from the quote (swap-route.ts).
 */
async function buildSmartSwap(quote: unknown, account: string, signer: string) {
  const q = quote as {
    tradeType?: string;
    assetIn?: string;
    assetOut?: string;
    amountIn?: string;
    rawTrade?: RawTrade;
    seidar?: { feeBps?: number };
  };
  if (q?.tradeType !== "EXACT_IN") throw new Error("Smart-account swaps sell an exact amount — switch to exact input.");
  if (!isContract(String(q.assetIn)) || !isContract(String(q.assetOut)) || !/^\d+$/.test(String(q.amountIn)))
    throw new Error("malformed quote");
  const minOut = String(q.rawTrade?.amountOutMin ?? "");
  if (!/^\d+$/.test(minOut)) throw new Error("quote has no minimum output");
  const sdk = await import("@stellar/stellar-sdk");
  const a = (x: string) => sdk.Address.fromString(x).toScVal();
  const i128 = (x: string) => sdk.nativeToScVal(BigInt(x), { type: "i128" });
  const routes = await encodeRoutes(q.rawTrade ?? {});
  const router = routerAddress();
  const op = router
    ? (() => {
        const want = Number(q.seidar?.feeBps);
        const bps = Number.isInteger(want) && want >= 0 && want <= MAX_FEE_BPS ? want : swapFeeBps();
        return new sdk.Contract(router).call(
          "swap",
          a(account),
          a(String(q.assetIn)),
          i128(String(q.amountIn)),
          a(String(q.assetOut)),
          i128(netOf(BigInt(minOut), bps).toString()),
          routes,
          sdk.nativeToScVal(bps, { type: "u32" }),
        );
      })()
    : new sdk.Contract(aggregator()).call(
        "swap_exact_in",
        a(account),
        a(String(q.assetIn)),
        i128(String(q.amountIn)),
        a(String(q.assetOut)),
        i128(minOut),
        routes,
        sdk.xdr.ScVal.scvVoid(),
      );
  return (await invokeFor({ from: account, signer, op })).xdr;
}

export async function buildSwap(body: { quote?: unknown; from?: string; to?: string; signer?: string }) {
  if (!soroKey()) return { status: 409, body: { ok: false, reason: "no-api-key" } };
  if (isContract(body?.from ?? "")) {
    const signer = String(body?.signer ?? "");
    if (body?.quote == null || !isAccount(signer))
      return { status: 200, body: { ok: false, error: "quote + owner wallet (signer) required" } };
    try {
      return { status: 200, body: { ok: true, xdr: await buildSmartSwap(body.quote, body.from!, signer) } };
    } catch (e) {
      return { status: 200, body: { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) } };
    }
  }
  const from = body?.from ?? "";
  const to = body?.to && isAccount(body.to) ? body.to : from;
  if (body?.quote == null || !isAccount(from) || !isAccount(to)) {
    return { status: 200, body: { ok: false, error: "quote + valid from/to Stellar addresses required" } };
  }
  try {
    const built = (await soroPost("/quote/build", { quote: body.quote, from, to })) as { xdr?: string };
    if (typeof built?.xdr !== "string" || !built.xdr) {
      return { status: 200, body: { ok: false, error: "aggregator returned no XDR" } };
    }
    return { status: 200, body: { ok: true, xdr: built.xdr } };
  } catch (e) {
    return {
      status: 200,
      body: { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) },
    };
  }
}

export async function sendSwap(body: { xdr?: string }) {
  if (!soroKey()) return { status: 409, body: { ok: false, reason: "no-api-key" } };
  if (typeof body?.xdr !== "string" || body.xdr.length < 16) {
    return { status: 200, body: { ok: false, error: "signed xdr required" } };
  }
  try {
    const res = await soroPost("/send", { xdr: body.xdr }, 100000);
    return { status: 200, body: { ok: true, result: res } };
  } catch (e) {
    return {
      status: 200,
      body: { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) },
    };
  }
}

export type SwapToken = {
  code: string;
  contract: string;
  decimals: number;
  name: string | null;
  issuer: string | null;
};

const LIST_URL = "https://raw.githubusercontent.com/soroswap/token-list/main/tokenList.json";
const PINNED: SwapToken[] = [
  {
    code: "XLM",
    contract: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
    decimals: 7,
    name: "Stellar Lumens",
    issuer: null,
  },
];
const TOKENS_TTL = 60 * 60 * 1000;

/** Testnet tokens: the Blend testnet pool's reserves, read from their contracts. */
async function testnetTokens(): Promise<SwapToken[]> {
  const list = (await sorobanView(TESTNET.blendPool, "get_reserve_list")) as string[];
  const metas = await tokenMetas(list);
  return list
    .filter((c) => metas[c])
    .map((c) => ({ code: metas[c].code, contract: c, decimals: metas[c].decimals, name: metas[c].name, issuer: null }));
}

export async function getSwapTokens() {
  if (isTestnet()) {
    try {
      return { status: 200, body: { ok: true, cached: false, updatedAt: Date.now(), tokens: await testnetTokens() } };
    } catch (e) {
      return { status: 200, body: { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e) } };
    }
  }
  const hit = await cacheGetEntry<{ at: number; tokens: SwapToken[] }>("tokens:registry").catch(() => null);
  if (hit && Date.now() - hit.value.at < TOKENS_TTL) {
    return { status: 200, body: { ok: true, cached: true, updatedAt: hit.value.at, tokens: hit.value.tokens } };
  }
  try {
    const r = await fetch(LIST_URL, { cache: "no-store" });
    if (!r.ok) throw new Error(`list http ${r.status}`);
    const data = await r.json();
    const assets: { code?: string; contract?: string; decimals?: number; name?: string; issuer?: string }[] =
      Array.isArray(data) ? data : (data.assets ?? []);
    const seen = new Set<string>(PINNED.map((t) => t.code));
    const tokens: SwapToken[] = [...PINNED];
    for (const a of assets) {
      if (typeof a?.code !== "string" || typeof a?.contract !== "string") continue;
      if (!/^C[A-Z2-7]{55}$/.test(a.contract)) continue;
      const code = a.code.toUpperCase();
      if (seen.has(code)) continue;
      seen.add(code);
      tokens.push({
        code,
        contract: a.contract,
        decimals: typeof a.decimals === "number" && a.decimals >= 0 && a.decimals <= 18 ? Math.floor(a.decimals) : 7,
        name: typeof a.name === "string" ? a.name : null,
        issuer: typeof a.issuer === "string" && a.issuer.startsWith("G") ? a.issuer : null,
      });
    }
    await cacheSet("tokens:registry", { at: Date.now(), tokens }, TOKENS_TTL).catch(() => {});
    return { status: 200, body: { ok: true, cached: false, updatedAt: Date.now(), tokens } };
  } catch (e) {
    if (hit) {
      return {
        status: 200,
        body: { ok: true, cached: true, stale: true, updatedAt: hit.value.at, tokens: hit.value.tokens },
      };
    }
    return { status: 200, body: { ok: false, error: String(e).slice(0, 160) } };
  }
}

/** Submit a user-signed Soroban XDR (vault deposits/withdrawals). Refuses unsigned. */
export async function sendTx(body: { xdr?: string }) {
  if (typeof body?.xdr !== "string" || body.xdr.length < 16) {
    return { status: 200, body: { ok: false, error: "signed xdr required" } };
  }
  try {
    const sdk = await import("@stellar/stellar-sdk");
    const parsed = sdk.TransactionBuilder.fromXDR(body.xdr, networkPassphrase());
    if (!(parsed instanceof sdk.Transaction)) {
      return { status: 200, body: { ok: false, error: "fee-bump envelopes unsupported" } };
    }
    // Waits for the ledger verdict: ok only on SUCCESS, never on PENDING.
    const r = await submitAndWait(body.xdr);
    if (r.ok) return { status: 200, body: { ok: true, hash: r.hash, status: "SUCCESS", returnValue: r.returnValue ?? null } };
    return { status: 200, body: { ok: false, hash: r.hash, error: r.error } };
  } catch (e) {
    return {
      status: 200,
      body: { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) },
    };
  }
}

const GATEWAYS = [
  "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://w3s.link/ipfs/",
];
const ICON_TTL = 24 * 60 * 60 * 1000;
const ICON_MISS_TTL = 10 * 60 * 1000;

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

/** Consistent icon fetch: CID in, image bytes out (gateway failover). */
export async function getIcon(cid: string): Promise<
  | { status: 400 | 502; body: { error: string } }
  | { status: 200; bytes: ArrayBuffer; type: string }
> {
  if (!/^[A-Za-z0-9]{10,100}$/.test(cid)) {
    return { status: 400, body: { error: "invalid cid" } };
  }
  const key = `icon:${cid}`;
  const hit = await cacheGetEntry<{ bytes: number[]; type: string }>(key).catch(() => null);
  if (hit && Date.now() - hit.at < ICON_TTL) {
    return { status: 200, bytes: new Uint8Array(hit.value.bytes).buffer as ArrayBuffer, type: hit.value.type };
  }
  // A recent miss answers at once instead of waiting on every gateway again.
  const missKey = `icon-miss:${cid}`;
  if (await cacheGetEntry<boolean>(missKey).catch(() => null)) return { status: 502, body: { error: "unavailable" } };
  // All gateways at once; the first valid image wins (one slow gateway
  // used to hold each icon for up to 12s before the next was tried).
  const one = async (g: string) => {
    const r = await fetchWithTimeout(`${g}${cid}`, 8000);
    if (!r.ok) throw new Error(`http ${r.status}`);
    const type = r.headers.get("content-type") ?? "image/png";
    if (!type.startsWith("image/")) throw new Error("not an image");
    const bytes = await r.arrayBuffer();
    if (bytes.byteLength < 200) throw new Error("too small");
    return { bytes, type };
  };
  try {
    const { bytes, type } = await Promise.any(GATEWAYS.map(one));
    await cacheSet(key, { bytes: [...new Uint8Array(bytes)], type }, ICON_TTL).catch(() => {});
    return { status: 200, bytes, type };
  } catch {
    await cacheSet(missKey, true, ICON_MISS_TTL).catch(() => {});
    return { status: 502, body: { error: "unavailable" } };
  }
}
