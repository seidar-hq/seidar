"use client";

// Swap quotes and the receiving trustline check, shared by the Swap page and the asset page's
// Buy / Sell card so both behave the same.

import { useEffect, useRef, useState } from "react";
import { hasTrustline } from "@/lib/payment";
import { postJson } from "@/lib/tx";
import type { SwapToken } from "./TokenSelectDialog";

export type Quote = {
  amountIn: string;
  amountOut: string;
  otherAmountThreshold: string;
  priceImpactPct: string | null;
  platform: string;
  provider?: "soroswap" | "xoxno";
  routePlan?: { swapInfo?: { protocol?: string; path?: string[] }; percent?: string }[];
};

export const fromBase = (v: string, decimals: number) => Number(v) / 10 ** decimals;

const QUOTE_DEBOUNCE_MS = 700;
const QUOTE_MIN_INTERVAL_MS = 1_500;
const QUOTE_CACHE_MS = 15_000;

/**
 * Debounced quote for `base` units of `from` into `to`; refreshes every 30s while visible, and
 * immediately when the tab comes back. Hidden tabs do not poll the aggregator. Requests are
 * throttled and cached so typing does not hammer the aggregator's shared key.
 */
export function useSwapQuote(from: SwapToken | null, to: SwapToken | null, base: string | null, slippagePct: number, dexes: string[] = []) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quotePaused, setQuotePaused] = useState(false);
  const seq = useRef(0);
  const quoteCache = useRef(new Map<string, { at: number; quote: Quote }>());
  const lastQuoteAt = useRef(0);
  const retryAt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slipBad = !(slippagePct > 0 && slippagePct < 100);

  useEffect(() => {
    const id = ++seq.current;
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    if (!from || !to || !base || from.contract === to.contract || slipBad) {
      setQuote(null);
      setQuoteError(null);
      setQuoting(false);
      setQuotePaused(false);
      return;
    }
    const key = `${from.contract}|${to.contract}|${base}|${Math.round(slippagePct * 100)}|${[...dexes].sort().join("+")}`;
    const cached = quoteCache.current.get(key);
    if (cached && Date.now() - cached.at < QUOTE_CACHE_MS) {
      setQuote(cached.quote);
      setQuoteError(null);
      setQuoting(false);
      setQuotePaused(false);
      return;
    }
    setQuote(null);
    setQuoteError(null);
    setQuotePaused(false);
    const run = async () => {
      if (id !== seq.current) return;
      const wait = Math.max(retryAt.current - Date.now(), QUOTE_MIN_INTERVAL_MS - (Date.now() - lastQuoteAt.current));
      if (wait > 0) {
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => void run(), wait);
        return;
      }
      setQuoting(true);
      setQuotePaused(false);
      type QuoteResp = { ok?: boolean; quote?: Quote; error?: string; reason?: string; retryAfter?: number };
      lastQuoteAt.current = Date.now();
      const r: QuoteResp = await postJson<QuoteResp>("/api/swap/quote", {
        assetIn: from.contract,
        assetOut: to.contract,
        amount: base,
        slippageBps: String(Math.round(slippagePct * 100)),
        ...(dexes.length ? { protocols: dexes } : {}),
      }).catch((e): QuoteResp => ({ ok: false, error: e instanceof Error ? e.message : String(e) }));
      if (id !== seq.current) return;
      if (r.ok && r.quote) {
        quoteCache.current.set(key, { at: Date.now(), quote: r.quote });
        setQuote(r.quote);
        setQuoteError(null);
        setQuotePaused(false);
        setQuoting(false);
        return;
      }
      const message = r.reason === "no-api-key" ? "Swaps are not configured on this server." : (r.error ?? "No route found.");
      if (r.retryAfter != null || /rate.?limit|too many|429/i.test(message)) {
        const waitMs = Math.max(3_000, Number(r.retryAfter ?? 8) * 1_000);
        retryAt.current = Date.now() + waitMs;
        setQuoteError("Quote service is busy. Retrying shortly…");
        setQuotePaused(true);
        setQuoting(false);
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => void run(), waitMs);
        return;
      }
      setQuoting(false);
      setQuoteError(message);
    };
    const delay = Math.max(QUOTE_DEBOUNCE_MS, lastQuoteAt.current + QUOTE_MIN_INTERVAL_MS - Date.now());
    const t = setTimeout(() => void run(), delay);
    const tick = () => {
      if (document.visibilityState === "visible") void run();
    };
    const iv = setInterval(tick, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisibility);
      if (retryTimer.current) {
        clearTimeout(retryTimer.current);
        retryTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.contract, to?.contract, base, slippagePct, dexes.join(",")]);

  return { quote, quoteError, quoting, quotePaused };
}

/**
 * Whether `address` can receive `token` (a classic asset needs a trustline; XLM and Soroban-only
 * tokens never do). null means the network failed, which says nothing about the trustline: it keeps
 * retrying quietly, and after the second miss stops holding the button (callers check once more
 * before signing).
 */
export function useTrustline(address: string | null, token: { code: string; issuer: string | null } | null) {
  const [trust, setTrust] = useState<boolean | null>(true);
  const [checkingTrust, setCheckingTrust] = useState(false);
  useEffect(() => {
    if (!address || !token?.issuer) {
      setTrust(true);
      setCheckingTrust(false);
      return;
    }
    const { code, issuer } = token;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async (attempt: number) => {
      const v = await hasTrustline(address, code, issuer);
      if (!live) return;
      if (v !== null) {
        setTrust(v);
        setCheckingTrust(false);
        return;
      }
      if (attempt >= 1) setCheckingTrust(false);
      timer = setTimeout(() => void check(attempt + 1), attempt < 2 ? 2_000 : 15_000);
    };
    setTrust(null);
    setCheckingTrust(true);
    void check(0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, token?.code, token?.issuer]);
  return { trust, setTrust, checkingTrust };
}
