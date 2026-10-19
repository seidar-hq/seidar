"use client";

import { useEffect, useRef } from "react";

/**
 * Live Horizon account feed: opens an SSE stream to
 * `{base}/accounts/{address}/effects?cursor=now` and calls `onActivity`
 * (trailing-cooldown) whenever anything touches the account. EventSource
 * reconnects on its own after drops; the existing pollers stay as backup,
 * so SSE is strictly additive — never the only path.
 */
export function useHorizonSSE(
  base: string,
  address: string | null,
  onActivity: () => void,
  cooldownMs = 2000,
): void {
  const cbRef = useRef(onActivity);
  cbRef.current = onActivity;
  useEffect(() => {
    // Horizon only streams classic (G) accounts; smart accounts poll.
    if (!address || !address.startsWith("G")) return;
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${base}/accounts/${address}/effects?cursor=now`);
    } catch {
      return;
    }
    es.onmessage = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        try {
          cbRef.current();
        } catch {
          /* poller covers it */
        }
      }, cooldownMs);
    };
    // No explicit reconnect: EventSource retries with backoff by itself.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    es.onerror = () => {};
    return () => {
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [base, address, cooldownMs]);
}

export const HORIZON_MAINNET = "https://horizon.stellar.org";
export const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
