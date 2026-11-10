// Swap aggregators (Soroswap + XOXNO) + token registry + XDR submit + icon proxy.
// Ported verbatim from apps/app/src/lib/soroswap.ts and
// app/api/{swap/quote,swap/build,swap/send,swap/tokens,tx/send,icon}/route.ts.
// SOROSWAP_API_KEY stays server-side (services/api env, never the browser).

import { recordSubmitted, type TxMeta } from "./analytics.js";
import { cacheGetEntry, cacheSet, singleFlight } from "@seidar/cache";
import { isTestnet, networkPassphrase, TESTNET } from "./net.js";
import { sorobanView } from "./rpc.js";
import { tokenMetas } from "./token-meta.js";
import { submitAndWait } from "./rpc.js";
import { invokeFor } from "./invoke.js";
import { aggregator, encodeRoutes, SMART_SWAP_PROTOCOLS, type RawTrade } from "./swap-route.js";
import { MAX_FEE_BPS, netOf, routerAddress, swapFeeBps } from "./fees.js";
import { routeUsesCurve } from "./xoxno-route.js";

export const SORO_BASE = "https://api.soroswap.finance";
export const soroNetwork = () => (isTestnet() ? "testnet" : "mainnet");
export const SORO_PROTOCOLS = ["soroswap", "phoenix", "aqua", "sdex", "sushi"];

export const XOXNO_BASE = (process.env.XOXNO_QUOTE_URL?.trim() || "https://stellar-swap.xoxno.com").replace(/\/+$/, "");
export const XOXNO_ROUTER =
  process.env.XOXNO_ROUTER?.trim() || "CCVENFSVCBYDHVOACFZXMNNYVOZ3LKXPZYU5LUI4N7KTXOKRVYD7F3TR";

export const DEFAULT_XOXNO_REFERRAL_ID = 2;

export function xoxnoReferralId(): number {
  const raw = process.env.XOXNO_REFERRAL_ID?.trim();
  if (!raw) return DEFAULT_XOXNO_REFERRAL_ID;
  if (!/^\d+$/.test(raw)) throw new Error("XOXNO_REFERRAL_ID must be an unsigned integer");
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 0 || id > 0xffffffff)
    throw new Error("XOXNO_REFERRAL_ID must be between 0 and 4294967295");
  return id;
}

type XoxnoHop = {
  dex?: string;
  address?: string;
  from?: string;
  to?: string;
  amountIn?: string;
  amountOut?: string;
};

type XoxnoPath = { splitPpm?: number; swaps?: XoxnoHop[] };

type XoxnoRaw = {
  platform?: string;
  amountIn?: string;
  amountOut?: string;
  amountOutMin?: string;
  priceImpact?: number;
  routeXdr?: string;
  paths?: XoxnoPath[];
  hops?: XoxnoHop[];
  feeBps?: number;
  feeAmount?: string;
  feeOnInput?: boolean;
  snapshot?: unknown;
};

type RoutePlanEntry = { swapInfo: { protocol: string; path: string[] }; percent?: string };

const XOXNO_DEX: Record<string, string> = {
  Soroswap: "soroswap",
  Aquarius: "aqua",
  Phoenix: "phoenix",
  Sushi: "sushi",
  CometDex: "comet",
  Curve: "curve",
};

const xoxnoDex = (dex: unknown) => XOXNO_DEX[String(dex)] ?? String(dex ?? "").toLowerCase();

async function xoxnoGet(params: Record<string, unknown>, ms = 12_000): Promise<unknown> {
  const u = new URL(`${XOXNO_BASE}/api/v1/quote`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(u, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const msg =
        (data as { error?: string; message?: string } | null)?.error ??
        (data as { error?: string; message?: string } | null)?.message ??
        `http ${r.status}`;
      const err = new Error(String(msg).slice(0, 200)) as Error & { status?: number };
      err.status = r.status;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

export async function xoxnoQuote(input: {
  assetIn: string;
  assetOut: string;
  amount: string;
  slippageBps?: string;
  referralId: number;
}): Promise<Record<string, unknown>> {
  const slip = /^\d+$/.test(String(input.slippageBps ?? "")) ? Number(input.slippageBps) : 50;
  const raw = (await xoxnoGet({
    from: input.assetIn,
    to: input.assetOut,
    amountIn: input.amount,
    slippage: Math.min(Math.max(slip, 1), 9_999) / 10_000,
    includePaths: true,
    platform: "aggregator",
    referralId: input.referralId,
    fresh: true,
  })) as XoxnoRaw;

  const amountOut = typeof raw.amountOut === "string" && /^\d+$/.test(raw.amountOut) ? BigInt(raw.amountOut) : 0n;
  const minOut = typeof raw.amountOutMin === "string" && /^\d+$/.test(raw.amountOutMin) ? BigInt(raw.amountOutMin) : 0n;
  const routeXdr = typeof raw.routeXdr === "string" ? raw.routeXdr : "";
  if (raw.platform !== "aggregator" || !routeXdr) throw new Error("XOXNO returned an incomplete quote");
  if (raw.amountIn !== input.amount) throw new Error("XOXNO changed the input amount");
  if (amountOut <= 0n || minOut <= 0n) throw new Error("XOXNO returned an incomplete quote");
  if (await routeUsesCurve(routeXdr)) throw new Error("XOXNO route uses Curve, which its router cannot execute yet.");

  const { verifyStellarRouteBytes } = await import("@xoxno/sdk-js/stellar-lending");
  const route = verifyStellarRouteBytes(routeXdr, {
    tokenIn: input.assetIn,
    tokenOut: input.assetOut,
    minOut: minOut.toString(),
    amountIn: input.amount,
  });
  if (route.referralId !== input.referralId) throw new Error("XOXNO returned an unexpected referral id");

  const routePlan: RoutePlanEntry[] = [];
  for (const p of Array.isArray(raw.paths) ? raw.paths : []) {
    const percent = typeof p.splitPpm === "number" ? (p.splitPpm / 10_000).toFixed(2) : undefined;
    for (const s of Array.isArray(p.swaps) ? p.swaps : []) {
      routePlan.push({
        swapInfo: { protocol: xoxnoDex(s.dex), path: [String(s.from ?? ""), String(s.to ?? "")] },
        ...(percent ? { percent } : {}),
      });
    }
  }
  if (!routePlan.length && Array.isArray(raw.hops)) {
    for (const s of raw.hops) {
      routePlan.push({
        swapInfo: { protocol: xoxnoDex(s.dex), path: [String(s.from ?? ""), String(s.to ?? "")] },
      });
    }
  }

  const feeBps = Number.isInteger(raw.feeBps) ? Number(raw.feeBps) : 0;
  return {
    provider: "xoxno",
    platform: "aggregator",
    tradeType: "EXACT_IN",
    assetIn: input.assetIn,
    assetOut: input.assetOut,
    amountIn: input.amount,
    amountOut: amountOut.toString(),
    otherAmountThreshold: minOut.toString(),
    // XOXNO reports impact as a fraction (0.0178 = 1.78%), measured live on 2026-11-10: USDC->XLM
    // gave 0.0004 at $10, 0.0178 at $100k and 0.2886 at $2M. Seidar's field is a percent.
    priceImpactPct:
      typeof raw.priceImpact === "number" && Number.isFinite(raw.priceImpact)
        ? Math.max(0, raw.priceImpact * 100).toFixed(2)
        : null,
    routePlan,
    feeBps,
    xoxno: {
      routeXdr,
      referralId: input.referralId,
      router: XOXNO_ROUTER,
      feeBps,
      feeAmount: typeof raw.feeAmount === "string" && /^\d+$/.test(raw.feeAmount) ? raw.feeAmount : null,
      feeOnInput: typeof raw.feeOnInput === "boolean" ? raw.feeOnInput : null,
      snapshot: raw.snapshot ?? null,
    },
  };
}

const RPC_URL = process.env.RPC_URL?.trim() || "https://mainnet.sorobanrpc.com";

/** Identical quotes are shared for a few seconds: tabs and retries must not
 *  spend the aggregator's shared API-key budget. */
const QUOTE_TTL_MS = 5_000;
/** When Soroswap itself answers 429, stop calling it for a few seconds. */
const SORO_COOLDOWN_MS = 5_000;
let soroCooldownUntil = 0;


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

const quoteOut = (q: Record<string, unknown> | null): bigint | null => {
  const v = q?.amountOut;
  const s = typeof v === "string" ? v : typeof v === "number" && Number.isSafeInteger(v) ? String(v) : "";
  return /^\d+$/.test(s) ? BigInt(s) : null;
};

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
  const key = soroKey();
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
  const tradeType = body?.tradeType === "EXACT_OUT" ? "EXACT_OUT" : "EXACT_IN";
  const protocols = body?.smart
    ? (wantProto.length > 0 ? wantProto : SORO_PROTOCOLS).filter((p) =>
        (SMART_SWAP_PROTOCOLS as readonly string[]).includes(p),
      )
    : wantProto.length > 0
      ? wantProto
      : SORO_PROTOCOLS;
  const referralId = xoxnoReferralId();
  const xoxnoEligible =
    !isTestnet() &&
    !body?.smart &&
    tradeType === "EXACT_IN" &&
    (rawProto == null || rawProto.length === 0);
  if (!key && !xoxnoEligible) return { status: 409, body: { ok: false, reason: "no-api-key" } };
  const quoteKey = `swap:quote:v2:${JSON.stringify([
    soroNetwork(),
    assetIn,
    assetOut,
    amount,
    tradeType,
    body?.slippageBps ?? "",
    [...protocols].sort(),
    feeBps ?? null,
    !!body?.smart,
    xoxnoEligible ? referralId : null,
  ])}`;
  const cached = await cacheGetEntry<unknown>(quoteKey).catch(() => null);
  if (cached && Date.now() - cached.at < QUOTE_TTL_MS) {
    return { status: 200, body: { ok: true, quote: cached.value } };
  }
  const cooldown = soroCooldownUntil - Date.now();
  if (cooldown > 0 && !xoxnoEligible) {
    return {
      status: 200,
      body: {
        ok: false,
        error: "Quote service is busy. Retrying shortly.",
        retryAfter: Math.ceil(cooldown / 1000),
      },
    };
  }

  try {
    const load = async () => {
      const soroLoad = (async () => {
        if (!key) throw Object.assign(new Error("no-api-key"), { status: 409 });
        if (soroCooldownUntil > Date.now())
          throw Object.assign(new Error("Quote service is busy. Retrying shortly."), {
            status: 429,
            cooldown: true,
          });
        const quote = (await soroPost("/quote", {
          assetIn,
          assetOut,
          amount,
          tradeType,
          protocols,
          ...(body?.slippageBps ? { slippageBps: body.slippageBps } : {}),
          // The API's feeBps only lowers its quote (the built swap carries no
          // partner fee), so smart-account quotes leave it out: Seidar's fee is
          // taken by the Seidar router and reported below.
          ...(feeBps && !body?.smart ? { feeBps } : {}),
        })) as Record<string, unknown>;
        quote.provider = "soroswap";
        if (body?.smart) {
          const q = quote as { amountOut?: string; rawTrade?: RawTrade };
          const bps = swapFeeBps(feeBps);
          const net = (v: unknown) => (/^\d+$/.test(String(v)) ? netOf(BigInt(String(v)), bps).toString() : null);
          quote.seidar = {
            feeBps: bps,
            router: routerAddress(),
            amountOutNet: net(q.amountOut),
            amountOutMinNet: net(q.rawTrade?.amountOutMin),
          };
        }
        await sanitizeImpact(quote, assetIn, assetOut);
        return quote;
      })();
      const xoxnoLoad = xoxnoEligible
        ? xoxnoQuote({
            assetIn,
            assetOut,
            amount,
            slippageBps: body?.slippageBps,
            referralId,
          })
        : Promise.reject(Object.assign(new Error("XOXNO not available for this quote"), { status: 409 }));
      const [soroRes, xoxnoRes] = await Promise.allSettled([soroLoad, xoxnoLoad]);
      const soroQuote = soroRes.status === "fulfilled" ? soroRes.value : null;
      const xoxno = xoxnoRes.status === "fulfilled" ? xoxnoRes.value : null;
      const soroErr = soroRes.status === "rejected" ? soroRes.reason : null;
      const xoxnoErr = xoxnoRes.status === "rejected" ? xoxnoRes.reason : null;
      const soroStatus = (soroErr as { status?: number; cooldown?: boolean } | null)?.status;
      if (soroStatus === 429 && !(soroErr as { cooldown?: boolean } | null)?.cooldown)
        soroCooldownUntil = Date.now() + SORO_COOLDOWN_MS;
      let chosen = soroQuote;
      if (xoxno && (!soroQuote || (quoteOut(xoxno) ?? 0n) > (quoteOut(soroQuote) ?? 0n))) chosen = xoxno;
      if (!chosen) {
        if (soroStatus === 400 || soroStatus === 429) throw soroErr;
        if (xoxnoEligible && xoxnoErr) throw xoxnoErr;
        throw soroErr ?? xoxnoErr ?? new Error("No route found for this pair/amount.");
      }
      await cacheSet(quoteKey, chosen, QUOTE_TTL_MS).catch(() => {});
      return chosen;
    };
    const quote = await singleFlight(`flight:${quoteKey}`, load);
    return { status: 200, body: { ok: true, quote } };
  } catch (e) {
    const status = (e as { status?: number })?.status;
    // No API path (always on testnet): a smart account can still swap on
    // the aggregator through the direct Soroswap pair, priced live.
    if (body?.smart && status === 400 && body?.tradeType !== "EXACT_OUT") {
      const q = await directQuote(assetIn, assetOut, amount, body?.slippageBps, feeBps).catch(() => null);
      if (q) return { status: 200, body: { ok: true, quote: q } };
    }
    if (status === 429) {
      if (!(e as { cooldown?: boolean }).cooldown) soroCooldownUntil = Date.now() + SORO_COOLDOWN_MS;
      const retryAfter = Math.max(1, Math.ceil((soroCooldownUntil - Date.now()) / 1000));
      return {
        status: 200,
        body: {
          ok: false,
          error: "Quote service is busy. Retrying shortly.",
          retryAfter,
        },
      };
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
    provider: "soroswap",
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

async function buildXoxnoSwap(quote: unknown, from: string, signer?: string) {
  const q = quote as {
    tradeType?: string;
    assetIn?: string;
    assetOut?: string;
    amountIn?: string;
    otherAmountThreshold?: string;
    xoxno?: { routeXdr?: string };
  };
  if (q?.tradeType !== "EXACT_IN") throw new Error("XOXNO swaps sell an exact amount - switch to exact input.");
  const assetIn = String(q.assetIn ?? "");
  const assetOut = String(q.assetOut ?? "");
  const amountIn = String(q.amountIn ?? "");
  const minOut = String(q.otherAmountThreshold ?? "");
  const routeXdr = String(q.xoxno?.routeXdr ?? "");
  if (!isContract(assetIn) || !isContract(assetOut)) throw new Error("malformed XOXNO quote");
  if (!/^\d+$/.test(amountIn) || BigInt(amountIn) <= 0n) throw new Error("malformed XOXNO quote");
  if (!/^\d+$/.test(minOut) || BigInt(minOut) <= 0n) throw new Error("malformed XOXNO quote");
  if (!routeXdr) throw new Error("XOXNO quote has no route");
  if (await routeUsesCurve(routeXdr)) throw new Error("XOXNO route uses Curve, which its router cannot execute yet.");
  const { verifyStellarRouteBytes } = await import("@xoxno/sdk-js/stellar-lending");
  const route = verifyStellarRouteBytes(routeXdr, { tokenIn: assetIn, tokenOut: assetOut, minOut, amountIn });
  if (route.referralId !== xoxnoReferralId())
    throw new Error("XOXNO quote is out of date - refresh and try again.");
  const sdk = await import("@stellar/stellar-sdk");
  const op = new sdk.Contract(XOXNO_ROUTER).call(
    "execute_strategy",
    sdk.Address.fromString(from).toScVal(),
    sdk.nativeToScVal(BigInt(amountIn), { type: "i128" }),
    sdk.xdr.ScVal.scvBytes(Buffer.from(routeXdr, "base64")),
  );
  return (await invokeFor({ from, signer, op, authMode: "record_allow_nonroot" })).xdr;
}

export async function buildSwap(body: { quote?: unknown; from?: string; to?: string; signer?: string }) {
  const quote = body?.quote as { provider?: string; xoxno?: { routeXdr?: string } } | null;
  const from = body?.from ?? "";
  if (quote?.provider === "xoxno" || quote?.xoxno?.routeXdr) {
    // A smart account (C...) swaps as itself; its owner wallet (signer) is the source and signs.
    const signer = body?.signer ? String(body.signer) : undefined;
    if (!isAccount(from) && !(isContract(from) && signer && isAccount(signer)))
      return { status: 200, body: { ok: false, error: "XOXNO swaps need a wallet, or a smart account + its owner wallet (signer)" } };
    if (body?.to && body.to !== from)
      return { status: 200, body: { ok: false, error: "XOXNO swaps send output to the signing wallet" } };
    try {
      return { status: 200, body: { ok: true, xdr: await buildXoxnoSwap(quote, from, signer) } };
    } catch (e) {
      return {
        status: 200,
        body: { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) },
      };
    }
  }
  if (isContract(from)) {
    const signer = String(body?.signer ?? "");
    if (body?.quote == null || !isAccount(signer))
      return { status: 200, body: { ok: false, error: "quote + owner wallet (signer) required" } };
    try {
      return { status: 200, body: { ok: true, xdr: await buildSmartSwap(body.quote, from, signer) } };
    } catch (e) {
      return { status: 200, body: { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) } };
    }
  }
  if (!soroKey()) return { status: 409, body: { ok: false, reason: "no-api-key" } };
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

/** Submit a user-signed XDR (every in-app action). Refuses unsigned. Successes feed the public analytics. */
export async function sendTx(body: { xdr?: string; meta?: TxMeta }) {
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
    if (r.ok) {
      if (r.hash) recordSubmitted(r.hash, parsed.source, body.meta);
      return { status: 200, body: { ok: true, hash: r.hash, status: "SUCCESS", returnValue: r.returnValue ?? null } };
    }
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
