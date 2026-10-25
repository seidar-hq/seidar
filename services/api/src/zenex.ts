// Zenex perps (the Stellar perps venue), wired by hand against the contracts (no SDK install):
//   reads   Zenex public data API (config, tickers, TradingView-UDF candles, rates, market trades,
//           observations, account orders / fills / lifecycles; price + config routes are
//           origin-restricted, so they're read here) + on-chain market state and positions;
//   writes  direct market-contract calls built and simulated here, signed by the wallet:
//           create_order (open / close / decrease / add + withdraw margin / take profit / stop loss),
//           cancel_order, claim_credit, create_vault_order (deposit / redeem), cancel_vault_order.
// Orders are created on-chain and filled by Zenex keepers (immediate fills need signed Chainlink
// reports, which only the hosted relay has). Units follow the contracts: amounts in settlement-token
// atomic units, prices and rates as 18-decimal fixed point. Position math mirrors zenex-sdk-js
// (positionPnl, pendingFunding / pendingBorrowing, positionEquity, liquidationPrice).

import { withCache } from "@seidar/cache";
import { buildInvoke, sorobanView } from "./rpc.js";

const API = "https://api.zenex.trade";
const SCALAR = 10n ** 18n;
const FULL_CLOSE = 2n ** 127n - 1n;
const isAddr = (v: string) => /^[GC][A-Z2-7]{55}$/.test(v);
const err = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 220);

export const ORDER_KIND = { MarketIncrease: 0, LimitIncrease: 1, StopIncrease: 2, MarketDecrease: 3, LimitDecrease: 4, StopDecrease: 5 } as const;
export const MARKET_STATUS = ["Active", "On ice", "Frozen", "Delisted", "Retired"] as const;

type MarketCfg = {
  id: string;
  trading: string;
  vault: string;
  collateral: string;
  feedId: string;
  udfSymbol: string;
  chartSymbol: string;
  collateralDecimals: number;
  vaultDecimalsOffset: number;
};

async function getJson<T>(path: string, ms = 15_000): Promise<T> {
  const r = await fetch(API + path, { signal: AbortSignal.timeout(ms), headers: { accept: "application/json" } });
  const body = (await r.json().catch(() => null)) as T | { error?: { message?: string } } | null;
  if (!r.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? `Zenex API ${r.status}`);
  return body as T;
}

export async function zenexConfig(): Promise<{ markets: MarketCfg[]; contracts: { router: string } }> {
  const out = await withCache("zenex:config", 10 * 60_000, () => getJson<{ markets: MarketCfg[]; contracts: { router: string } }>("/v1/config"), { swr: true });
  if (!out.value) throw new Error("Zenex configuration is unavailable");
  return out.value;
}

async function marketCfg(id?: string): Promise<MarketCfg> {
  const c = await zenexConfig();
  const m = c.markets.find((x) => x.id === (id || c.markets[0]?.id));
  if (!m) throw new Error("Unknown Zenex market");
  return m;
}

type Ticker = { marketId: string; price: string; bid: string; ask: string; observationsTimestamp: number };

/** Display bid / ask / mid (18-dec strings) per market; 5s cache. */
export async function zenexTickers(): Promise<Ticker[]> {
  const out = await withCache("zenex:tickers", 5_000, () => getJson<{ data: Ticker[] }>("/v1/prices/tickers").then((r) => r.data));
  return out.value ?? [];
}

const toNum = (v: bigint, decimals: number) => Number(v) / 10 ** decimals;
const px = (v: bigint) => Number(v) / 1e18;
const big = (v: unknown) => {
  try {
    return BigInt(String(v ?? "0"));
  } catch {
    return 0n;
  }
};
const mulDivFloor = (a: bigint, b: bigint, d: bigint) => {
  const p = a * b;
  return p >= 0n ? p / d : -((-p + d - 1n) / d);
};
const mulDivCeil = (a: bigint, b: bigint, d: bigint) => {
  const p = a * b;
  return p >= 0n ? (p + d - 1n) / d : -(-p / d);
};

type Pair = { long: bigint; short: bigint };
type MarketState = {
  config: Record<string, bigint>;
  data: { funding_idx: Pair; borrowing_idx: Pair; notional: Pair; margin: Pair; tokens: Pair; funding_rate: bigint; credit_pool: bigint; accrued_at: bigint };
  status: number;
};

const pairOf = (v: unknown): Pair => ({ long: big((v as Record<string, unknown>)?.long), short: big((v as Record<string, unknown>)?.short) });

/** On-chain market config, accrual data and status; 15s cache. */
async function marketState(m: MarketCfg): Promise<MarketState> {
  const out = await withCache(`zenex:state:${m.trading}`, 15_000, async () => {
    const [config, data, status] = await Promise.all([
      sorobanView(m.trading, "get_config") as Promise<Record<string, unknown>>,
      sorobanView(m.trading, "get_market_data") as Promise<Record<string, unknown>>,
      sorobanView(m.trading, "get_status"),
    ]);
    // Bigints don't survive the JSON cache: keep decimal strings, revive below.
    return {
      config: Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v)])),
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === "object" && v ? Object.fromEntries(Object.entries(v as object).map(([a, b]) => [a, String(b)])) : String(v)])),
      status: Number(status),
    };
  });
  const v = out.value as { config: Record<string, string>; data: Record<string, unknown>; status: number } | null;
  if (!v) throw new Error("Zenex market state is unavailable");
  const d = v.data;
  return {
    config: Object.fromEntries(Object.entries(v.config).map(([k, s]) => [k, big(s)])),
    data: {
      funding_idx: pairOf(d.funding_idx),
      borrowing_idx: pairOf(d.borrowing_idx),
      notional: pairOf(d.notional),
      margin: pairOf(d.margin),
      tokens: pairOf(d.tokens),
      funding_rate: big(d.funding_rate),
      credit_pool: big(d.credit_pool),
      accrued_at: big(d.accrued_at),
    },
    status: v.status,
  };
}

/** Market overview for the trade page: prices, status, open interest, rates, limits. */
export async function zenexMarket(id?: string) {
  try {
    const m = await marketCfg(id);
    const [state, tickers, rates] = await Promise.all([
      marketState(m),
      zenexTickers(),
      withCache(`zenex:rates:${m.id}`, 60_000, () => getJson<{ data: unknown }>(`/v1/markets/${m.id}/rates`).then((r) => r.data)).then((r) => r.value),
    ]);
    const t = tickers.find((x) => x.marketId === m.id);
    const dec = m.collateralDecimals;
    const c = state.config;
    // 24h stats: hourly candles for high / low / change, indexed trades for volume.
    const now = Math.floor(Date.now() / 1000);
    const [candleResp, tradesResp] = await Promise.all([
      zenexCandles({ symbol: m.chartSymbol, resolution: "60", from: String(now - 86400), to: String(now) }),
      withCache(`zenex:vol24:${m.id}`, 60_000, () => getJson<{ data: { items: { notionalAtomic: string; occurredAt: string }[] } }>(`/v1/markets/${m.id}/trades?limit=100`)).then((r) => r.value),
    ]);
    const candles = (candleResp.body as { candles?: { o: number; h: number; l: number; c: number }[] }).candles ?? [];
    const dayAgo = Date.now() - 86400_000;
    const volume24h = (tradesResp?.data.items ?? []).filter((x) => Date.parse(x.occurredAt) >= dayAgo).reduce((sum, x) => sum + toNum(big(x.notionalAtomic), dec), 0);
    const open24 = candles[0]?.o ?? null;
    const last = t ? px(big(t.price)) : (candles[candles.length - 1]?.c ?? null);
    const stats24h = {
      high: candles.length ? Math.max(...candles.map((k) => k.h)) : null,
      low: candles.length ? Math.min(...candles.map((k) => k.l)) : null,
      changePct: open24 && last ? ((last - open24) / open24) * 100 : null,
      volume: volume24h,
    };
    return {
      status: 200,
      body: {
        ok: true,
        market: {
          id: m.id,
          symbol: m.id.toUpperCase().replace("-", "/"),
          trading: m.trading,
          vault: m.vault,
          collateral: m.collateral,
          chartSymbol: m.chartSymbol,
          decimals: dec,
          status: state.status,
          statusLabel: MARKET_STATUS[state.status] ?? "Unknown",
        },
        price: t ? { mid: px(big(t.price)), bid: px(big(t.bid)), ask: px(big(t.ask)), at: t.observationsTimestamp, bidAtomic: t.bid, askAtomic: t.ask } : null,
        stats24h,
        openInterest: {
          long: toNum(state.data.notional.long, dec),
          short: toNum(state.data.notional.short, dec),
          max: toNum(c.max_open_interest ?? 0n, dec),
        },
        rates,
        limits: {
          // Leverage cap from the initial margin ratio (e.g. 0.05 -> 20x).
          maxLeverage: c.init_margin ? Math.floor(Number(SCALAR) / Number(c.init_margin)) : null,
          initMargin: Number(c.init_margin ?? 0n) / 1e18,
          maintenanceMargin: Number(c.maintenance_margin ?? 0n) / 1e18,
          minOrderNotional: toNum(c.min_order_notional ?? 0n, dec),
          minOrderMargin: toNum(c.min_order_margin ?? 0n, dec),
          minPositionNotional: toNum(c.min_position_notional ?? 0n, dec),
          maxPositionNotional: toNum(c.max_position_notional ?? 0n, dec),
          execFee: toNum(c.exec_fee ?? 0n, dec),
          // Base trading fee: dominant side pays fee_dom, the other side fee_non_dom (fractions).
          feeDominant: Number(c.fee_dom ?? 0n) / 1e18,
          feeNonDominant: Number(c.fee_non_dom ?? 0n) / 1e18,
          liqFee: Number(c.liq_fee ?? 0n) / 1e18,
          // Impact fee = notional^2 / impactScalar (USDC units), capped at 10% of the notional.
          impactScalar: toNum(c.impact_scalar ?? 0n, dec),
          maxImpactRate: 0.1,
          // Size each side can still add before the open-interest cap.
          capacityLong: Math.max(0, toNum((c.max_open_interest ?? 0n) - state.data.notional.long, dec)),
          capacityShort: Math.max(0, toNum((c.max_open_interest ?? 0n) - state.data.notional.short, dec)),
        },
      },
    };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}

/** TradingView UDF candles proxied (symbol = the market's chartSymbol; resolution in minutes or D). */
export async function zenexCandles(q: { symbol?: string; resolution?: string; from?: string; to?: string }) {
  const symbol = String(q.symbol ?? "XLMUSD").replace(/[^A-Za-z0-9./]/g, "");
  const resolution = /^(\d+|D|W)$/.test(String(q.resolution)) ? String(q.resolution) : "60";
  const to = Number(q.to) || Math.floor(Date.now() / 1000);
  const from = Number(q.from) || to - 86400;
  try {
    const out = await withCache(`zenex:udf:${symbol}:${resolution}:${Math.floor(from / 60)}:${Math.floor(to / 60)}`, 30_000, () =>
      getJson<{ s: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[] }>(
        `/v1/prices/udf/history?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${from}&to=${to}`,
      ),
    );
    const v = out.value;
    if (!v || v.s !== "ok" || !v.t) return { status: 200, body: { ok: true, candles: [] } };
    const candles = v.t.map((t, i) => ({ t: t * 1000, o: v.o![i], h: v.h![i], l: v.l![i], c: v.c![i] }));
    return { status: 200, body: { ok: true, candles } };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}

/** Recent market trades (indexed). */
export async function zenexTrades(id?: string, limit = 30) {
  try {
    const m = await marketCfg(id);
    const r = await getJson<{ data: { items: { id: string; side: string; kind: string; priceAtomic: string; notionalAtomic: string; occurredAt: string; transactionHash: string }[] } }>(
      `/v1/markets/${m.id}/trades?limit=${Math.min(100, Math.max(1, limit))}`,
    );
    return {
      status: 200,
      body: {
        ok: true,
        trades: r.data.items.map((t) => ({
          id: t.id,
          side: t.side,
          kind: t.kind,
          price: px(big(t.priceAtomic)),
          notional: toNum(big(t.notionalAtomic), m.collateralDecimals),
          at: t.occurredAt,
          tx: t.transactionHash,
        })),
      },
    };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}

type RawPosition = { margin: unknown; notional: unknown; tokens: unknown; funding_idx: unknown; borrowing_idx: unknown; locked_notional: unknown; unlocks_at: unknown; decrease_orders: unknown };

async function readPosition(m: MarketCfg, user: string, isLong: boolean): Promise<RawPosition | null> {
  const sdk = await import("@stellar/stellar-sdk");
  try {
    return (await sorobanView(m.trading, "get_position", [sdk.Address.fromString(user).toScVal(), sdk.xdr.ScVal.scvBool(isLong)])) as RawPosition;
  } catch {
    return null; // no stored position on that side
  }
}

/** Display estimate of one side, mirroring zenex-sdk-js estimatePosition (sans close fee). */
function estimate(p: RawPosition, isLong: boolean, s: MarketState, bid: bigint, ask: bigint, dec: number) {
  const notional = big(p.notional);
  const tokens = big(p.tokens);
  const margin = big(p.margin);
  if (notional <= 0n || tokens <= 0n) return null;
  const mark = isLong ? bid : ask; // exit price
  const pnl = isLong ? mulDivFloor(tokens, mark, SCALAR) - notional : notional - mulDivCeil(tokens, mark, SCALAR);
  const fIdx = isLong ? s.data.funding_idx.long : s.data.funding_idx.short;
  const bIdx = isLong ? s.data.borrowing_idx.long : s.data.borrowing_idx.short;
  const funding = mulDivCeil(notional, fIdx - big(p.funding_idx), SCALAR);
  const borrowing = mulDivCeil(notional, bIdx - big(p.borrowing_idx), SCALAR);
  const paidFunding = funding > 0n ? funding : 0n;
  const equity = margin + pnl - paidFunding - borrowing;
  const mm = mulDivCeil(notional, s.config.maintenance_margin ?? 0n, SCALAR);
  const target = isLong ? mm + notional - margin + paidFunding + borrowing : notional + margin - paidFunding - borrowing - mm;
  let liq = mulDivFloor(target, SCALAR, tokens);
  if (liq < 0n) liq = 0n;
  const entry = mulDivFloor(notional, SCALAR, tokens);
  const netPnl = pnl - funding - borrowing;
  return {
    side: isLong ? "long" : "short",
    notional: toNum(notional, dec),
    // Base size (XLM for xlm-usd); stored in settlement-token decimals.
    size: toNum(tokens, dec),
    margin: toNum(margin, dec),
    entryPrice: px(entry),
    markPrice: px(mark),
    liquidationPrice: px(liq),
    pnl: toNum(pnl, dec),
    pendingFunding: toNum(funding, dec),
    pendingBorrowing: toNum(borrowing, dec),
    equity: toNum(equity, dec),
    netPnl: toNum(netPnl, dec),
    netPnlPct: margin > 0n ? (Number(netPnl) / Number(margin)) * 100 : 0,
    leverage: equity > 0n ? Number(notional) / Number(equity) : 0,
    healthFactor: mm > 0n ? Number(equity) / Number(mm) : null,
    decreaseOrders: Array.isArray(p.decrease_orders) ? (p.decrease_orders as unknown[]).map(Number) : [],
  };
}

type ApiOrder = {
  orderId: string;
  side: string;
  kind: number;
  notionalAtomic: string;
  marginAtomic: string;
  triggerPriceAtomic: string;
  priceBoundAtomic: string;
  executionFeeAtomic: string;
  expirationLedger: string;
  status: string;
  placedAt: string;
  transactionHash: string;
};

const KIND_LABEL = ["Market open", "Limit open", "Stop open", "Market close", "Take profit", "Stop loss"];

function orderRow(o: ApiOrder, dec: number) {
  const notional = big(o.notionalAtomic);
  const kind = Number(o.kind);
  const marginOnly = notional === 0n && big(o.marginAtomic) > 0n;
  return {
    id: Number(o.orderId),
    side: o.side,
    kind,
    label: marginOnly ? (kind === 0 ? "Add margin" : "Withdraw margin") : KIND_LABEL[kind] ?? `Kind ${kind}`,
    notional: notional >= FULL_CLOSE / 2n ? null : toNum(notional, dec),
    fullClose: notional >= FULL_CLOSE / 2n,
    margin: toNum(big(o.marginAtomic), dec),
    triggerPrice: big(o.triggerPriceAtomic) > 0n ? px(big(o.triggerPriceAtomic)) : null,
    priceBound: big(o.priceBoundAtomic) > 0n ? px(big(o.priceBoundAtomic)) : null,
    execFee: toNum(big(o.executionFeeAtomic), dec),
    expirationLedger: Number(o.expirationLedger),
    status: o.status,
    placedAt: o.placedAt,
    tx: o.transactionHash,
  };
}

/** Everything the account panel needs: positions (live, on-chain), credit, open orders, history. */
export async function zenexAccount(address: string, id?: string) {
  if (!isAddr(address)) return { status: 400, body: { ok: false, error: "address required" } };
  try {
    const m = await marketCfg(id);
    const dec = m.collateralDecimals;
    const sdk = await import("@stellar/stellar-sdk");
    const [state, tickers, long, short, credit, indexed, fills, lifecycles] = await Promise.all([
      marketState(m),
      zenexTickers(),
      readPosition(m, address, true),
      readPosition(m, address, false),
      (sorobanView(m.trading, "get_claimable_credit", [sdk.Address.fromString(address).toScVal()]) as Promise<unknown>).catch(() => 0),
      getJson<{ data: { orders?: ApiOrder[]; orderHistory?: ApiOrder[] } }>(`/v1/accounts/${address}/state`).catch(() => null),
      getJson<{ data: { items: Record<string, unknown>[] } }>(`/v1/accounts/${address}/trade/fills?limit=50`).catch(() => null),
      getJson<{ data: { items: Record<string, unknown>[] } }>(`/v1/accounts/${address}/trade/lifecycles?limit=30`).catch(() => null),
    ]);
    const t = tickers.find((x) => x.marketId === m.id);
    const bid = big(t?.bid);
    const ask = big(t?.ask);
    const positions = [long && estimate(long, true, state, bid, ask, dec), short && estimate(short, false, state, bid, ask, dec)].filter(Boolean);
    const openOrders = (indexed?.data.orders ?? []).map((o) => orderRow(o, dec));
    const orderHistory = (indexed?.data.orderHistory ?? []).map((o) => orderRow(o, dec));
    return {
      status: 200,
      body: {
        ok: true,
        market: m.id,
        positions,
        claimableCredit: toNum(big(credit), dec),
        openOrders,
        orderHistory,
        fills: (fills?.data.items ?? []).map((f) => ({
          id: String(f.id),
          side: f.side,
          kind: f.kind,
          orderId: Number(f.orderId),
          price: px(big(f.priceAtomic)),
          notional: toNum(big(f.notionalAtomic), dec),
          margin: toNum(big(f.marginAtomic), dec),
          pnl: toNum(big(f.pnlAtomic), dec),
          fees: Object.values((f.fees as Record<string, string>) ?? {}).reduce((s, v) => s + toNum(big(v), dec), 0),
          at: f.occurredAt,
          tx: f.transactionHash,
        })),
        closed: (lifecycles?.data.items ?? []).map((l) => ({
          id: String(l.lifecycleId),
          side: l.side,
          openedAt: l.openedAt,
          closedAt: l.finalizedAt,
          reason: l.finalizationReason,
          entryPrice: Number(l.entryPrice),
          exitPrice: Number(l.exitPrice),
          size: Number(l.size),
          leverage: Number(l.leverage),
          netPnl: toNum(big(l.netPnlAtomic), dec),
          margin: toNum(big(l.marginPostedAtomic), dec),
        })),
        indexed: !!indexed,
      },
    };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}

/** Contract error codes users can meet (zenex-sdk-js errors / market interface). */
const MARKET_ERRORS: Record<string, string> = {
  "702": "The market's status doesn't allow this right now.",
  "704": "The market is frozen.",
  "705": "Opening new size is halted on this market.",
  "711": "Order size is below the market minimum.",
  "712": "Order size is above the market maximum.",
  "713": "Not enough margin for this size (check the leverage limit).",
  "714": "Vault utilization limit reached: try a smaller size.",
  "715": "The market's open-interest cap is reached.",
  "716": "The size is too small to register at this price.",
  "720": "You have no position on this side.",
  "721": "Part of this position is still under the decrease lock; try again shortly.",
  "723": "This position is liquidatable; add margin first.",
  "730": "That order no longer exists (it was filled, cancelled or never created).",
  "731": "That order has expired.",
  "732": "The order's terms aren't valid for this market.",
  "733": "Too many pending orders on this side (max 8).",
  "750": "That vault order no longer exists.",
  "751": "The vault order is still in its lock period.",
  "753": "The Zenex vault is full.",
  "760": "There's no credit to claim.",
  "100": "Insufficient USDC balance for the margin plus the execution fee.",
};

function friendly(e: unknown): string {
  const m = err(e);
  const code = m.match(/error #(\d+)/)?.[1] ?? m.match(/Error\(Contract, #(\d+)\)/)?.[1];
  return code && MARKET_ERRORS[code] ? MARKET_ERRORS[code] : m;
}

const parseAtomic = (v: unknown, dec: number): bigint | null => {
  const s = String(v ?? "").trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [w, f = ""] = s.split(".");
  if (f.length > dec) return null;
  return BigInt(w || "0") * 10n ** BigInt(dec) + BigInt((f + "0".repeat(dec)).slice(0, dec) || "0");
};
const parsePrice = (v: unknown): bigint | null => {
  const n = Number(v);
  if (!(n > 0) || !Number.isFinite(n)) return null;
  return parseAtomic(n.toFixed(18).replace(/0+$/, "").replace(/\.$/, ""), 18);
};

export type ZenexBuildBody = {
  from?: string;
  market?: string;
  action?: string;
  side?: "long" | "short";
  /** Decimal strings in settlement-token units. */
  margin?: string;
  notional?: string;
  /** Decimal price (USD per base). */
  triggerPrice?: string | number;
  slippageBps?: number;
  orderId?: number;
  amount?: string;
  /** Limit / stop / TP / SL lifetime in seconds (default 7 days). */
  expirySec?: number;
  /** Optional take-profit / stop-loss triggers placed with an open, in the same transaction. */
  tp?: string | number;
  sl?: string | number;
};

/**
 * Build one direct market call for `from` (simulated; the wallet signs).
 * actions: open-market | open-limit | close | decrease | add-margin | withdraw-margin |
 *          take-profit | stop-loss | cancel | claim | vault-deposit | vault-redeem | vault-cancel
 */
export async function zenexBuild(b: ZenexBuildBody | null) {
  try {
    const from = String(b?.from ?? "");
    if (!/^G[A-Z2-7]{55}$/.test(from)) return { status: 200, body: { ok: false, error: "Connect a Stellar wallet (G…) to trade." } };
    const m = await marketCfg(b?.market);
    const dec = m.collateralDecimals;
    const sdk = await import("@stellar/stellar-sdk");
    const user = sdk.Address.fromString(from).toScVal();
    const i128 = (x: bigint) => sdk.nativeToScVal(x, { type: "i128" });
    const u32 = (x: number) => sdk.nativeToScVal(x, { type: "u32" });
    const c = new sdk.Contract(m.trading);
    const action = String(b?.action ?? "");
    const isLong = b?.side !== "short";
    const latest = await (async () => {
      const { withRpc } = await import("./rpc.js");
      return withRpc((s) => s.getLatestLedger()).then((l) => l.sequence);
    })();

    // Price bound from the display ticker: a buy accepts up to ask * (1 + slippage),
    // a sell down to bid * (1 - slippage). 0 = unbounded (only used for margin-only moves).
    const bps = BigInt(Math.min(1000, Math.max(5, Math.round(Number(b?.slippageBps ?? 50)))));
    const bound = async (buy: boolean) => {
      const t = (await zenexTickers()).find((x) => x.marketId === m.id);
      if (!t) throw new Error("No live Zenex price right now; try again shortly.");
      return buy ? (big(t.ask) * (10_000n + bps)) / 10_000n : (big(t.bid) * (10_000n - bps)) / 10_000n;
    };
    const create = (kind: number, notional: bigint, margin: bigint, trigger: bigint, priceBound: bigint, ttlLedgers: number) =>
      c.call("create_order", user, sdk.xdr.ScVal.scvBool(isLong), u32(kind), i128(notional), i128(margin), i128(trigger), i128(priceBound), u32(latest + ttlLedgers));

    const MARKET_TTL = 120; // ~10 min for keepers to fill
    // Resting orders (limit / stop / TP / SL): the chosen lifetime, 5s ledgers, at most ~31 days.
    const RESTING_TTL = Math.min(535_680, Math.max(60, Math.round((Number(b?.expirySec) || 7 * 86400) / 5)));
    let op: unknown;
    let label = "";
    let authMode: "record_allow_nonroot" | undefined;
    switch (action) {
      case "open-market":
      case "open-limit":
      case "open-stop": {
        const margin = parseAtomic(b?.margin, dec);
        const notional = parseAtomic(b?.notional, dec);
        if (!margin || !notional) return { status: 200, body: { ok: false, error: "Enter margin and size." } };
        const side = isLong ? "long" : "short";
        let main: ReturnType<typeof create>;
        if (action === "open-market") {
          main = create(ORDER_KIND.MarketIncrease, notional, margin, 0n, await bound(isLong), MARKET_TTL);
          label = `Open ${side} ${b?.notional} USDC`;
        } else {
          const trigger = parsePrice(b?.triggerPrice);
          if (!trigger) return { status: 200, body: { ok: false, error: `Enter a ${action === "open-limit" ? "limit" : "stop"} price.` } };
          main = create(action === "open-limit" ? ORDER_KIND.LimitIncrease : ORDER_KIND.StopIncrease, notional, margin, trigger, 0n, RESTING_TTL);
          label = `${action === "open-limit" ? "Limit" : "Stop"} ${side} ${b?.notional} USDC @ ${b?.triggerPrice}`;
        }
        // TP / SL ride in the same transaction through the router (strict batch: all or nothing).
        const tp = b?.tp != null && b.tp !== "" ? parsePrice(b.tp) : null;
        const sl = b?.sl != null && b.sl !== "" ? parsePrice(b.sl) : null;
        if ((b?.tp && !tp) || (b?.sl && !sl)) return { status: 200, body: { ok: false, error: "Check the take-profit / stop-loss prices." } };
        if (!tp && !sl) {
          op = main;
          break;
        }
        const cfg = await zenexConfig();
        const callOf = (kind: number, notional: bigint, margin: bigint, trigger: bigint, priceBound: bigint, ttl: number) =>
          sdk.xdr.ScVal.scvMap(
            [
              ["args", sdk.xdr.ScVal.scvVec([user, sdk.xdr.ScVal.scvBool(isLong), u32(kind), i128(notional), i128(margin), i128(trigger), i128(priceBound), u32(latest + ttl)])],
              ["contract", sdk.Address.fromString(m.trading).toScVal()],
              ["func", sdk.xdr.ScVal.scvSymbol("create_order")],
            ].map(([k, v]) => new sdk.xdr.ScMapEntry({ key: sdk.xdr.ScVal.scvSymbol(k as string), val: v as InstanceType<typeof sdk.xdr.ScVal> })),
          );
        const mainArgs: [number, bigint, bigint, bigint, bigint, number] =
          action === "open-market"
            ? [ORDER_KIND.MarketIncrease, notional, margin, 0n, await bound(isLong), MARKET_TTL]
            : [action === "open-limit" ? ORDER_KIND.LimitIncrease : ORDER_KIND.StopIncrease, notional, margin, parsePrice(b?.triggerPrice)!, 0n, RESTING_TTL];
        const calls = [callOf(...mainArgs)];
        if (tp) calls.push(callOf(ORDER_KIND.LimitDecrease, FULL_CLOSE, 0n, tp, 0n, RESTING_TTL));
        if (sl) calls.push(callOf(ORDER_KIND.StopDecrease, FULL_CLOSE, 0n, sl, 0n, RESTING_TTL));
        op = new sdk.Contract(cfg.contracts.router).call("multicall", sdk.xdr.ScVal.scvVec(calls));
        authMode = "record_allow_nonroot";
        label += `${tp ? ` · TP ${b?.tp}` : ""}${sl ? ` · SL ${b?.sl}` : ""}`;
        break;
      }
      case "close":
        op = create(ORDER_KIND.MarketDecrease, FULL_CLOSE, 0n, 0n, await bound(!isLong), MARKET_TTL);
        label = `Close ${isLong ? "long" : "short"}`;
        break;
      case "decrease": {
        const notional = parseAtomic(b?.notional, dec) ?? 0n;
        const margin = parseAtomic(b?.margin || "0", dec) ?? 0n;
        if (notional <= 0n) return { status: 200, body: { ok: false, error: "Enter the size to close." } };
        op = create(ORDER_KIND.MarketDecrease, notional, margin, 0n, await bound(!isLong), MARKET_TTL);
        label = `Reduce ${isLong ? "long" : "short"} by ${b?.notional} USDC`;
        break;
      }
      case "add-margin":
      case "withdraw-margin": {
        const amount = parseAtomic(b?.amount, dec);
        if (!amount) return { status: 200, body: { ok: false, error: "Enter an amount." } };
        op = create(action === "add-margin" ? ORDER_KIND.MarketIncrease : ORDER_KIND.MarketDecrease, 0n, amount, 0n, 0n, MARKET_TTL);
        label = `${action === "add-margin" ? "Add" : "Withdraw"} ${b?.amount} USDC margin (${isLong ? "long" : "short"})`;
        break;
      }
      case "take-profit":
      case "stop-loss": {
        const trigger = parsePrice(b?.triggerPrice);
        if (!trigger) return { status: 200, body: { ok: false, error: "Enter a trigger price." } };
        const notional = b?.notional ? (parseAtomic(b.notional, dec) ?? FULL_CLOSE) : FULL_CLOSE;
        op = create(action === "take-profit" ? ORDER_KIND.LimitDecrease : ORDER_KIND.StopDecrease, notional, 0n, trigger, 0n, RESTING_TTL);
        label = `${action === "take-profit" ? "Take profit" : "Stop loss"} @ ${b?.triggerPrice} (${isLong ? "long" : "short"})`;
        break;
      }
      case "cancel":
        if (!Number.isInteger(Number(b?.orderId))) return { status: 200, body: { ok: false, error: "Pick an order." } };
        op = c.call("cancel_order", user, u32(Number(b?.orderId)));
        label = `Cancel order #${b?.orderId}`;
        break;
      case "claim":
        op = c.call("claim_credit", user);
        label = "Claim Zenex credit";
        break;
      case "vault-deposit":
      case "vault-redeem": {
        const shareDec = dec + m.vaultDecimalsOffset;
        const amount = parseAtomic(b?.amount, action === "vault-deposit" ? dec : shareDec);
        if (!amount) return { status: 200, body: { ok: false, error: "Enter an amount." } };
        op = c.call("create_vault_order", user, u32(action === "vault-deposit" ? 0 : 1), i128(amount), i128(0n));
        label = `${action === "vault-deposit" ? "Deposit" : "Redeem"} ${b?.amount} ${action === "vault-deposit" ? "USDC" : "shares"} (Zenex vault)`;
        break;
      }
      case "vault-cancel":
        op = c.call("cancel_vault_order", user, u32(Number(b?.orderId)));
        label = `Cancel vault order #${b?.orderId}`;
        break;
      default:
        return { status: 200, body: { ok: false, error: "Unknown action." } };
    }
    const { xdr } = await buildInvoke({ from, op, authMode });
    return { status: 200, body: { ok: true, xdr, label } };
  } catch (e) {
    return { status: 200, body: { ok: false, error: friendly(e) } };
  }
}
