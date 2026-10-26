// Price stack: Reflector primary, SDEX for AQUA, Coinbase spot + candles,
// CoinGecko fallback-only. Never throws — every leg degrades to keep-last-good
// (Redis via @seidar/cache) then null. Spot-only callers ignore `changes`.
//
// Reflector contracts (verified 2026-10-08 via reflector.network/docs):
//   External CEX&DEX (base USD): CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN
//   Stellar Pubnet Pulse (base USDC): CALI2BYU2JE6WVRUFYTS6MSBNEHGJ35P4AVCZYF3B6QOE3QKOB2PLE6M
//   Forex (base USD): CBKGPWGKSKZF52CFHMTRR23TBWTPMRDIYZ4O2P5VS65BMHYH4DXMCJZC
// Testnet mirrors live in contracts/configs/networks.json (reflector_testnet).

import { cacheGet, cacheGetEntry, cacheSet, KEYS, TTL_MS } from "@seidar/cache";
import { sorobanView as sharedView } from "./rpc.js";


export const REFLECTOR = {
  external: "CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN",
  stellar: "CALI2BYU2JE6WVRUFYTS6MSBNEHGJ35P4AVCZYF3B6QOE3QKOB2PLE6M",
  forex: "CBKGPWGKSKZF52CFHMTRR23TBWTPMRDIYZ4O2P5VS65BMHYH4DXMCJZC",
  decimals: 14,
} as const;

export const AQUA = {
  code: "AQUA",
  issuer: "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA",
  contract: "CAUIKL3IYGMERDRUN6YSCLWVAKIFG5Q4YJHUKM4S4NJZQIA3BAS6OJPK",
} as const;

// SACs for Stellar-asset lookups on the Pulse feed.
const SAC: Record<string, string> = {
  XLM: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
  USDC: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
  EURC: "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV",
};

// External symbols on the CEX&DEX feed.
const EXT_SYMBOL: Record<string, string> = {
  BTC: "BTC",
  WBTC: "BTC",
  CBBTC: "BTC",
  ETH: "ETH",
  WETH: "ETH",
  WSTETH: "ETH",
  WEETH: "ETH",
};

const STABLES: Record<string, number> = {
  USDC: 1,
  USDT0: 1,
  USDGLO: 1,
  PYUSD: 1,
};

async function fetchJson(url: string, ms = 15000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`http ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function sorobanView(contractId: string, method: string, args: unknown[] = []): Promise<unknown> {
  return sharedView(contractId, method, args);
}

/** Build a Reflector `Asset` ScVal: Stellar(SAC) or Other(Symbol). */
async function reflectorAsset(
  kind: "stellar" | "other",
  value: string,
): Promise<unknown> {
  const sdk = await import("@stellar/stellar-sdk");
  const { ScVal } = sdk.xdr;
  if (kind === "stellar") {
    const addr = sdk.Address.fromString(value).toScVal();
    return ScVal.scvVec([ScVal.scvSymbol("Stellar"), addr]);
  }
  return ScVal.scvVec([ScVal.scvSymbol("Other"), ScVal.scvSymbol(value)]);
}

function toUsd(raw: unknown, decimals = REFLECTOR.decimals): number | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { price?: unknown; timestamp?: unknown };
  const p = typeof r.price === "bigint" ? Number(r.price) : Number(r.price);
  if (!Number.isFinite(p) || p <= 0) return null;
  const ts = Number(r.timestamp ?? 0);
  // Fail closed on stale/future-dated feeds (10min max age for 5min sampling).
  const now = Math.floor(Date.now() / 1000);
  if (!(ts > 0 && ts <= now && now - ts <= 600)) return null;
  return p / 10 ** decimals;
}

async function reflectorSpot(code: string): Promise<number | null> {
  const c = code.toUpperCase();
  try {
    if (SAC[c]) {
      const asset = await reflectorAsset("stellar", SAC[c]);
      const raw = await sorobanView(REFLECTOR.stellar, "lastprice", [asset]);
      const px = toUsd(raw);
      // Pulse base is USDC (~$1). Accept as USD.
      if (px != null) return px;
      // Forex cross for EURC if Pulse misses.
      if (c === "EURC") {
        const fx = await reflectorAsset("other", "EUR");
        const fraw = await sorobanView(REFLECTOR.forex, "lastprice", [fx]);
        return toUsd(fraw);
      }
      return null;
    }
    if (EXT_SYMBOL[c]) {
      const asset = await reflectorAsset("other", EXT_SYMBOL[c]);
      const raw = await sorobanView(REFLECTOR.external, "lastprice", [asset]);
      return toUsd(raw);
    }
  } catch {
    return null;
  }
  return null;
}

/** AQUA/XLM mid on SDEX × XLM_USD. Null when book is thin/missing. */
export async function sdexAquaUsd(xlmUsd: number | null): Promise<number | null> {
  if (!(xlmUsd != null && xlmUsd > 0)) return null;
  try {
    const url =
      `https://horizon.stellar.org/order_book?` +
      `selling_asset_type=credit_alphanum4&selling_asset_code=AQUA` +
      `&selling_asset_issuer=${AQUA.issuer}&buying_asset_type=native&limit=5`;
    const book = (await fetchJson(url, 12000)) as {
      bids?: { price: string }[];
      asks?: { price: string }[];
    };
    const bid = Number(book?.bids?.[0]?.price ?? 0);
    const ask = Number(book?.asks?.[0]?.price ?? 0);
    if (!(bid > 0 && ask > 0)) return null;
    // Reject crossed/gappy books (>5% spread).
    const mid = (bid + ask) / 2;
    if (!(mid > 0) || (ask - bid) / mid > 0.05) return null;
    return mid * xlmUsd;
  } catch {
    return null;
  }
}

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

/** CODE/USDC mid on SDEX (USDC pinned at $1). Null when the book is thin/gappy. */
async function sdexUsdcMid(code: string, issuer: string): Promise<number | null> {
  try {
    const type = code.length <= 4 ? "credit_alphanum4" : "credit_alphanum12";
    const url =
      `https://horizon.stellar.org/order_book?` +
      `selling_asset_type=${type}&selling_asset_code=${encodeURIComponent(code)}` +
      `&selling_asset_issuer=${issuer}&buying_asset_type=credit_alphanum4` +
      `&buying_asset_code=USDC&buying_asset_issuer=${USDC_ISSUER}&limit=5`;
    const book = (await fetchJson(url, 12000)) as {
      bids?: { price: string }[];
      asks?: { price: string }[];
    };
    const bid = Number(book?.bids?.[0]?.price ?? 0);
    const ask = Number(book?.asks?.[0]?.price ?? 0);
    if (!(bid > 0 && ask > 0)) return null;
    const mid = (bid + ask) / 2;
    if (!(mid > 0) || (ask - bid) / mid > 0.05) return null;
    return mid;
  } catch {
    return null;
  }
}

const CB_SPOT: Record<string, string> = {
  XLM: "XLM-USD",
  BTC: "BTC-USD",
  WBTC: "BTC-USD",
  CBBTC: "BTC-USD",
  ETH: "ETH-USD",
  WETH: "ETH-USD",
  WSTETH: "ETH-USD",
  WEETH: "ETH-USD",
  USDC: "USDC-USD",
};

async function coinbaseSpot(code: string): Promise<number | null> {
  const pair = CB_SPOT[code.toUpperCase()];
  if (!pair) return null;
  try {
    const body = (await fetchJson(
      `https://api.coinbase.com/v2/prices/${pair}/spot`,
      12000,
    )) as { data?: { amount?: string } };
    const n = Number(body?.data?.amount);
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** 24h % change from our own price history (snapshot table, 15-min
 *  cadence): latest spot vs closest row ≥24h old. True 24h windows only —
 *  needs ~a day of warmer runtime before the first real value; until then
 *  callers degrade to spot-only display. */
async function snapshotChange(code: string, spot: number | null): Promise<number | null> {
  if (!(spot != null && spot > 0)) return null;
  try {
    const { ensureSchema, getPool, isoAgo } = await import("./db.js");
    await ensureSchema();
    const { rows } = await getPool().query<{ px: unknown }>(
      `SELECT px FROM price_snapshots WHERE asset = $1 AND at <= $2
       ORDER BY at DESC LIMIT 1`,
      [code.toUpperCase(), isoAgo(24 * 3600_000)],
    );
    const old = Number(rows[0]?.px);
    if (!(old > 0)) return null;
    return ((spot - old) / old) * 100;
  } catch {
    return null;
  }
}

/** Record one snapshot row per asset (15-min cadence enforced by caller). */
export async function snapshotPrices(all: Record<string, number | null>): Promise<void> {
  const rows = Object.entries(all).filter(
    (e): e is [string, number] => typeof e[1] === "number" && (e[1] as number) > 0,
  );
  if (rows.length === 0) return;
  try {
    const { ensureSchema, getPool, isoAgo } = await import("./db.js");
    await ensureSchema();
    const pool = getPool();
    for (const [code, px] of rows) {
      await pool.query("INSERT INTO price_snapshots (asset, px) VALUES ($1, $2)", [
        code.toUpperCase(),
        px,
      ]);
    }
    await pool.query("DELETE FROM price_snapshots WHERE at < $1", [isoAgo(30 * 86400_000)]);
  } catch {
    /* snapshots are advisory */
  }
}

/** Recent spot history from our own snapshots (15-min sampling, 30-day
 *  retention), bucketed to one point per hour (last print wins), oldest
 *  first, at most `points` rows. Empty when the DB is unreachable or the
 *  warmer hasn't banked rows yet — callers treat that as "no curve", never
 *  as zero prices. */
export async function priceHistory(
  code: string,
  points: number,
): Promise<{ ok: true; code: string; points: { t: number; px: number }[] } | { ok: false; error: string }> {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,12}$/.test(clean)) return { ok: false, error: "code required" };
  const n = Math.max(2, Math.min(800, Math.floor(points) || 48));
  try {
    const { ensureSchema, getPool, isoAgo } = await import("./db.js");
    await ensureSchema();
    const { rows } = await getPool().query<{ at: unknown; px: unknown }>(
      `SELECT at, px FROM price_snapshots WHERE asset = $1 AND at > $2 ORDER BY at ASC LIMIT 4000`,
      [clean, isoAgo(30 * 86400_000)],
    );
    // One point per hour, the hour's last print (rows arrive oldest first).
    const byHour = new Map<number, number>();
    for (const r of rows ?? []) {
      const at = new Date(r?.at as string).getTime();
      const px = Number(r?.px);
      if (Number.isFinite(at) && px > 0) byHour.set(Math.floor(at / 3600_000) * 3600_000, px);
    }
    const all = [...byHour].map(([t, px]) => ({ t, px })).sort((a, b) => a.t - b.t);
    if (all.length === 0) return { ok: false, error: "no-history" };
    if (all.length <= n) return { ok: true, code: clean, points: all };
    const stride = all.length / n;
    const out: { t: number; px: number }[] = [];
    for (let i = 0; i < n; i++) out.push(all[Math.floor(i * stride)]);
    out.push(all[all.length - 1]);
    return { ok: true, code: clean, points: out };
  } catch {
    return { ok: false, error: "db-unavailable" };
  }
}

/** 24h % change from free Coinbase candles (no key). Null when unavailable. */
export async function coinbaseChange(code: string): Promise<number | null> {
  const pair = CB_SPOT[code.toUpperCase()];
  if (!pair) return code.toUpperCase() in STABLES ? 0 : null;
  try {
    const candles = (await fetchJson(
      `https://api.exchange.coinbase.com/products/${pair}/candles?granularity=86400`,
      12000,
    )) as number[][];
    if (!Array.isArray(candles) || candles.length < 2) return null;
    // Buckets are [time, low, high, open, close, volume]; order is not
    // guaranteed, so sort ascending and compare the last two closes.
    const rows = [...candles]
      .filter((b) => Array.isArray(b) && b.length >= 5)
      .sort((a, b) => a[0] - b[0]);
    if (rows.length < 2) return null;
    const prev = rows[rows.length - 2][4];
    const last = rows[rows.length - 1][4];
    if (!(prev > 0 && last > 0)) return null;
    return ((last - prev) / prev) * 100;
  } catch {
    return null;
  }
}

const CG_ID: Record<string, string> = {
  XLM: "stellar",
  EURC: "euro-coin",
  AQUA: "aquarius",
  BTC: "bitcoin",
  WBTC: "bitcoin",
  CBBTC: "bitcoin",
  ETH: "ethereum",
  WETH: "ethereum",
  WSTETH: "ethereum",
  WEETH: "ethereum",
};

/** Last-resort CoinGecko bulk (fallback only — call sparingly). */
async function cgFallback(
  codes: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const ids = [...new Set(codes.map((c) => CG_ID[c]).filter(Boolean))];
  if (ids.length === 0) return out;
  try {
    const body = (await fetchJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=usd`,
      12000,
    )) as Record<string, { usd?: unknown }>;
    for (const code of codes) {
      const id = CG_ID[code];
      const n = Number(body?.[id!]?.usd);
      if (n > 0) out[code] = n;
    }
  } catch {
    // fallback failing must never sink prices
  }
  return out;
}

export interface PriceResult {
  prices: Record<string, number | null>;
  changes: Record<string, number | null>;
  sources: Record<string, string>;
  updatedAt: number;
}

/** Full cascade per code: pinned → Reflector → SDEX(AQUA) → Coinbase → CG. */
/** Spot prices stay servable this long; past their TTL they refresh in the background. */
const SPOT_RETAIN_MS = 6 * 3600_000;
const refreshing = new Set<string>();

export async function livePrices(
  codes: string[],
  opts: { refresh?: boolean } = {},
): Promise<PriceResult> {
  const uniq = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))].slice(0, 40);
  const prices: Record<string, number | null> = {};
  const changes: Record<string, number | null> = {};
  const sources: Record<string, string> = {};

  // 1. Pinned stables (no upstream at all).
  for (const c of uniq) {
    if (STABLES[c] != null) {
      prices[c] = STABLES[c];
      changes[c] = 0;
      sources[c] = "pinned";
    }
  }
  const need = uniq.filter((c) => prices[c] == null);

  // 2. Shared-cache short-circuit (survives restarts via Redis). Stale-while-revalidate:
  //    a price past its TTL is still served, and refreshed in the background.
  const uncached: string[] = [];
  const stale: string[] = [];
  for (const c of need) {
    const e = opts.refresh ? null : await cacheGetEntry<number>(KEYS.priceSpot(c)).catch(() => null);
    if (e && e.value != null && e.value > 0 && Date.now() - e.at < SPOT_RETAIN_MS) {
      prices[c] = e.value;
      sources[c] = "cache";
      if (Date.now() - e.at > TTL_MS.pricesSpot && !refreshing.has(c)) stale.push(c);
    } else uncached.push(c);
  }
  if (stale.length) {
    stale.forEach((c) => refreshing.add(c));
    void livePrices(stale, { refresh: true })
      .catch(() => null)
      .finally(() => stale.forEach((c) => refreshing.delete(c)));
  }

  // 3. Reflector (majors). Batched, one cheap simulate per asset.
  //    XLM first — AQUA/SDEX needs it as the USD leg.
  const order = [...uncached].sort((a, b) =>
    a === "XLM" ? -1 : b === "XLM" ? 1 : 0,
  );
  for (const c of order) {
    if (c === "AQUA") continue; // SDEX path below
    if (prices[c] != null) continue;
    const px = await reflectorSpot(c);
    if (px != null && px > 0) {
      prices[c] = px;
      sources[c] = "reflector";
      await cacheSet(KEYS.priceSpot(c), px, TTL_MS.pricesSpot, SPOT_RETAIN_MS).catch(() => {});
    }
  }

  // 4. SDEX AQUA × Reflector XLM.
  if (uncached.includes("AQUA") && prices["AQUA"] == null) {
    const xlm = prices["XLM"] ?? (await coinbaseSpot("XLM"));
    const aqua = await sdexAquaUsd(xlm);
    if (aqua != null && aqua > 0) {
      prices["AQUA"] = aqua;
      sources["AQUA"] = "sdex-xlm";
      await cacheSet(KEYS.priceSpot("AQUA"), aqua, TTL_MS.pricesSpot, SPOT_RETAIN_MS).catch(() => {});
    }
  }

  // 5. Coinbase spot for whatever is still missing.
  for (const c of uncached) {
    if (prices[c] != null) continue;
    if (c === "EURC") {
      prices[c] = 1.08;
      sources[c] = "pinned-eurc";
      continue;
    }
    const px = await coinbaseSpot(c);
    if (px != null && px > 0) {
      prices[c] = px;
      sources[c] = "coinbase";
      await cacheSet(KEYS.priceSpot(c), px, TTL_MS.pricesSpot, SPOT_RETAIN_MS).catch(() => {});
    }
  }

  // 5b. SDEX mid against USDC for classic assets nobody else quotes
  // (e.g. Etherfuse USTRY/CETES); issuer from the swap registry.
  const sdexNeed = uncached.filter((c) => prices[c] == null);
  if (sdexNeed.length > 0) {
    const { getSwapTokens } = await import("./swap.js");
    const reg = await getSwapTokens().catch(() => null);
    const toks = (reg?.body.ok ? reg.body.tokens : []) as { code: string; issuer?: string | null }[];
    for (const c of sdexNeed) {
      const issuer = toks.find((t) => t.code === c)?.issuer;
      if (!issuer) continue;
      const px = await sdexUsdcMid(c, issuer);
      if (px != null && px > 0) {
        prices[c] = px;
        sources[c] = "sdex-usdc";
        await cacheSet(KEYS.priceSpot(c), px, TTL_MS.pricesSpot, SPOT_RETAIN_MS).catch(() => {});
      }
    }
  }

  // 6. CoinGecko fallback-only for leftovers.
  const missing = uncached.filter((c) => prices[c] == null);
  if (missing.length > 0) {
    const fb = await cgFallback(missing);
    for (const c of missing) {
      if (fb[c] > 0) {
        prices[c] = fb[c];
        sources[c] = "coingecko-fallback";
        await cacheSet(KEYS.priceSpot(c), fb[c], TTL_MS.pricesSpot, SPOT_RETAIN_MS).catch(() => {});
      } else {
        prices[c] = null;
        sources[c] = "unavailable";
      }
    }
  }

  // 7. 24h change: own snapshots first (true 24h windows), Coinbase
  // candles while history accumulates, stables 0. Cached 10min.
  for (const c of uniq) {
    if (changes[c] != null) continue;
    const hit = await cacheGet<number>(KEYS.priceChange(c)).catch(() => null);
    if (typeof hit === "number") {
      changes[c] = hit;
      continue;
    }
    const chg = (await snapshotChange(c, prices[c] ?? null)) ?? (await coinbaseChange(c));
    changes[c] = chg;
    if (typeof chg === "number")
      await cacheSet(KEYS.priceChange(c), chg, TTL_MS.pricesChange).catch(() => {});
  }

  return { prices, changes, sources, updatedAt: Date.now() };
}
