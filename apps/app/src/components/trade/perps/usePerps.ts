"use client";

import { apiJson } from "@/lib/api";
import { useShared, useSharedMany } from "@/lib/useShared";

// Zenex perps data (through the Seidar API): market overview, candles and per-account state.

export type PerpsMarket = {
  market: { id: string; symbol: string; trading: string; vault: string; collateral: string; chartSymbol: string; decimals: number; status: number; statusLabel: string };
  price: { mid: number; bid: number; ask: number; at: number } | null;
  openInterest: { long: number; short: number; max: number };
  rates: { current?: { long: { fundingPerSec: string; borrowingPerSec: string }; short: { fundingPerSec: string; borrowingPerSec: string } } } | null;
  limits: {
    maxLeverage: number | null;
    initMargin: number;
    maintenanceMargin: number;
    minOrderNotional: number;
    minOrderMargin: number;
    minPositionNotional: number;
    maxPositionNotional: number;
    execFee: number;
    feeDominant: number;
    feeNonDominant: number;
    liqFee: number;
    impactScalar: number;
    maxImpactRate: number;
    capacityLong: number;
    capacityShort: number;
  };
  stats24h?: { high: number | null; low: number | null; changePct: number | null; volume: number };
};

export type PerpsPosition = {
  side: "long" | "short";
  notional: number;
  size: number;
  margin: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  pnl: number;
  pendingFunding: number;
  pendingBorrowing: number;
  equity: number;
  netPnl: number;
  netPnlPct: number;
  leverage: number;
  healthFactor: number | null;
  decreaseOrders: number[];
};

export type PerpsOrder = {
  id: number;
  side: "long" | "short";
  kind: number;
  label: string;
  notional: number | null;
  fullClose: boolean;
  margin: number;
  triggerPrice: number | null;
  priceBound: number | null;
  execFee: number;
  expirationLedger: number;
  status: string;
  placedAt: string;
  tx: string;
};

export type PerpsFill = { id: string; side: string; kind: string; orderId: number; price: number; notional: number; margin: number; pnl: number; fees: number; at: string; tx: string };
export type PerpsClosed = { id: string; side: string; openedAt: string; closedAt: string; reason: string; entryPrice: number; exitPrice: number; size: number; leverage: number; netPnl: number; margin: number };

export type PerpsAccount = {
  ok?: boolean;
  positions: PerpsPosition[];
  claimableCredit: number;
  openOrders: PerpsOrder[];
  orderHistory: PerpsOrder[];
  fills: PerpsFill[];
  closed: PerpsClosed[];
  indexed: boolean;
};

export function usePerpsMarket() {
  const { value, loading } = useShared<(PerpsMarket & { ok?: boolean }) | null>("zenex:market", () => apiJson("/api/zenex/market"), 5_000);
  return { market: value?.ok ? value : null, loading: loading && !value };
}

export function usePerpsAccounts(addresses: string[]) {
  const r = useSharedMany<PerpsAccount | null>(
    addresses.map((a) => `zenex:acct:${a}`),
    (k) => () => apiJson(`/api/zenex/account?address=${k.slice(11)}`, undefined, 60_000),
    15_000,
  );
  return { byAddress: r.values, loading: r.loading };
}

export type Candle = { t: number; o: number; h: number; l: number; c: number };

export const RESOLUTIONS = [
  { id: "15", label: "15m", span: 86400 },
  { id: "60", label: "1h", span: 4 * 86400 },
  { id: "240", label: "4h", span: 14 * 86400 },
  { id: "D", label: "1D", span: 120 * 86400 },
] as const;

export function useCandles(symbol: string | null, resolution: (typeof RESOLUTIONS)[number]) {
  // Align `to` to the minute so the shared cache key is stable between renders.
  const to = Math.floor(Date.now() / 60_000) * 60;
  const from = to - resolution.span;
  const { value, loading } = useShared<{ ok?: boolean; candles?: Candle[] } | null>(
    symbol ? `zenex:candles:${symbol}:${resolution.id}` : null,
    () => apiJson(`/api/zenex/candles?symbol=${symbol}&resolution=${resolution.id}&from=${from}&to=${to}`),
    30_000,
  );
  return { candles: value?.candles ?? [], loading: loading && !value };
}

/** Funding per hour, percent of notional (rates are 18-decimal fractions per second). */
export const hourlyPct = (perSec: string | undefined) => (perSec ? (Number(perSec) / 1e18) * 3600 * 100 : null);

export const fmtPx = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toFixed(5));

export type PerpsTrade = { id: string; side: string; kind: string; price: number; notional: number; at: string; tx: string };

export function usePerpsTrades() {
  const { value } = useShared<{ ok?: boolean; trades?: PerpsTrade[] } | null>("zenex:trades", () => apiJson("/api/zenex/trades?limit=40"), 30_000);
  return value?.trades ?? [];
}
