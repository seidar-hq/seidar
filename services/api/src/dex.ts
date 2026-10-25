// DEX pool boards (Soroban AMMs). Aqua lists via the public Aquarius
// REST API (no key); Phoenix via its on-chain factory
// (CB4SVAWJA6TSRNOJZ7W2AWFW46D5VR4ZMFZKDIKXEINZCZEGZCJZCKMI); Soroswap and
// Sushi V3 via their factories / pool lens (./dex-onchain.ts). Per-leg
// shared cache (10min, SWR).

import { withCache, KEYS, TTL_MS } from "@seidar/cache";
import { livePrices } from "./prices.js";
import { sorobanView as sharedView } from "./rpc.js";
import { tokenMetas } from "./token-meta.js";
import { pricesByContract } from "./contract-price.js";
import { fetchSoroswap, fetchSushi } from "./dex-onchain.js";
import { refreshActivity, registerPools, venueActivity } from "./dex-activity.js";


export const DEX_PROTOCOLS = ["aqua", "phoenix", "soroswap", "sushi"] as const;
export type DexProtocol = (typeof DEX_PROTOCOLS)[number];
export const isDexProtocol = (v: string): v is DexProtocol =>
  (DEX_PROTOCOLS as readonly string[]).includes(v);

const PHOENIX_FACTORY = "CB4SVAWJA6TSRNOJZ7W2AWFW46D5VR4ZMFZKDIKXEINZCZEGZCJZCKMI";

const AQUA_BASE = "https://amm-api.aqua.network/api/external/v2";

export interface DexPoolRow {
  protocol: DexProtocol;
  address: string;
  pair: string;
  assets: { contract: string; code: string }[];
  poolType: string | null;
  feeBps: number | null;
  trades: number | null;
  volumeRaw: number | null;
  tvlUsd: number | null;
  /** On-chain reserves in pool token order (raw base units), null when unread. */
  reserves: { code: string; amount: number; decimals?: number }[] | null;
  /** Venue-published yield (Aqua: fees + AQUA rewards), percent; absent = no source. */
  apyPct?: number | null;
  feeApyPct?: number | null;
  rewardsApyPct?: number | null;
  /** Last-24h volume in USD (Aqua), absent = no source. */
  volume24hUsd?: number | null;
  /** Soroswap / Phoenix / Sushi: swaps and USD volume over the last 7 days
   *  (their own swap events; dex-activity.ts). */
  trades7d?: number;
  volume7dUsd?: number | null;
  /** The swap scan hasn't finished since the API started (numbers soon). */
  activityPending?: boolean;
  updatedAt: number;
}

/**
 * Pool TVL from reserves x prices. Any funded unpriced leg makes TVL unknown,
 * except in a 2-token constant-product pool where both sides hold equal
 * value by construction: TVL = 2 x the priced side.
 */
export function poolTvl(
  legs: { amount: number; decimals: number; priceUsd: number | null }[],
  poolType: string | null,
): number | null {
  const funded = legs.filter((l) => l.amount > 0);
  if (funded.length === 0) return 0;
  const priced = funded.filter((l) => l.priceUsd != null);
  const value = (l: (typeof legs)[0]) => (l.amount / 10 ** l.decimals) * (l.priceUsd ?? 0);
  if (priced.length === funded.length) return priced.reduce((t, l) => t + value(l), 0);
  const xyk = poolType === "xyk" || poolType === "constant_product";
  if (xyk && legs.length === 2 && priced.length === 1) return 2 * value(priced[0]);
  return null;
}

export interface DexTotals {
  tvlRaw: number | null;
  volumeRaw: number | null;
}

const PINNED_CODES: Record<string, string> = {
  CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA: "XLM",
  CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75: "USDC",
  CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV: "EURC",
  CAUIKL3IYGMERDRUN6YSCLWVAKIFG5Q4YJHUKM4S4NJZQIA3BAS6OJPK: "AQUA",
};

const isContract = (v: string) => /^C[A-Z2-7]{55}$/.test(v);

function toNum(v: unknown): number | null {
  if (typeof v === "bigint") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function fetchJson(url: string, ms = 25000): Promise<unknown> {
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

let codeMap: Record<string, string> | null = null;
async function resolveCode(contract: string): Promise<string | null> {
  if (PINNED_CODES[contract]) return PINNED_CODES[contract];
  try {
    if (!codeMap) {
      const list = (await fetchJson(
        "https://raw.githubusercontent.com/soroswap/token-list/main/tokenList.json",
        20000,
      )) as { assets?: { code?: string; contract?: string }[] };
      const map: Record<string, string> = {};
      for (const a of list.assets ?? []) {
        if (a.contract && a.code && !map[a.contract]) map[a.contract] = a.code.toUpperCase();
      }
      codeMap = map;
    }
    return codeMap?.[contract] ?? null;
  } catch {
    return null;
  }
}

const shortCode = (contract: string) => `UNKNOWN-${contract.slice(0, 4)}`;

async function sorobanView(contractId: string, method: string, args: unknown[] = []): Promise<unknown> {
  return sharedView(contractId, method, args);
}

/** Retry Soroban RPC calls once (public RPC 429s under burst load). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (!/429|rate|timeout|abort|ECONNRESET/i.test(msg)) throw e;
    await new Promise((r) => setTimeout(r, 1200));
    return fn();
  }
}

// ---------- Aqua (REST) ----------

interface AquaPoolJson {
  address?: unknown;
  tokens_addresses?: unknown;
  tokens_str?: unknown;
  pool_type?: unknown;
  fee?: unknown;
  tx_count?: unknown;
  total_volume?: unknown;
}

async function fetchAqua(): Promise<{ rows: DexPoolRow[]; totals: DexTotals | null }> {
  const now = Date.now();
  const all: AquaPoolJson[] = [];
  let page = 1;
  for (;;) {
    const data = (await fetchJson(`${AQUA_BASE}/pools/?limit=100&page=${page}`)) as {
      results?: AquaPoolJson[];
      next?: unknown;
    };
    const batch = Array.isArray(data?.results) ? data.results : [];
    all.push(...batch);
    if (typeof data?.next !== "string" || !data.next || batch.length === 0) break;
    page++;
    // Page size caps at 10 server-side (limit is a ceiling, not a size),
    // so the full catalogue needs ~37 pages. The 10min shared cache means
    // one loader pays this while every client reads the cached rows.
    if (page > 50) break;
  }
  let totals: DexTotals | null = null;
  try {
    const t = (await fetchJson(`${AQUA_BASE}/statistics/all-time/`)) as {
      tvl?: unknown;
      volume?: unknown;
    };
    totals = { tvlRaw: toNum(t?.tvl), volumeRaw: toNum(t?.volume) };
  } catch {
    /* header stats are advisory */
  }
  const rows: DexPoolRow[] = [];
  for (const p of all) {
    const address = typeof p?.address === "string" ? p.address : "";
    if (!isContract(address)) continue;
    const contracts = (Array.isArray(p?.tokens_addresses) ? p.tokens_addresses : [])
      .filter((t): t is string => typeof t === "string" && isContract(t));
    if (contracts.length === 0) continue;
    const assets = contracts.map((c) => ({ contract: c, code: "" }));
    const fee = typeof p?.fee === "string" ? Number(p.fee) : toNum(p?.fee);
    rows.push({
      protocol: "aqua",
      address,
      pair: assets.map((a) => a.code).join("/"),
      assets,
      poolType: typeof p?.pool_type === "string" ? p.pool_type : null,
      feeBps: fee != null && Number.isFinite(fee) ? Math.round(fee * 10000) : null,
      trades: toNum(p?.tx_count),
      volumeRaw: toNum(p?.total_volume),
      // Reserves fill in below from get_reserves (pool token order);
      // TVL stays null until priced, never estimated.
      tvlUsd: null,
      reserves: null,
      updatedAt: now,
    });
  }
  // Aqua's app API publishes per-pool APY (fees + rewards) and 24h USD
  // volume (amounts x1e7) in one unpaged list; the external v2 list has neither.
  try {
    const stats = (await fetchJson("https://amm-api.aqua.network/pools/?size=1000")) as { items?: Record<string, unknown>[] };
    const by = new Map((stats?.items ?? []).map((x) => [String(x.address), x]));
    const pctOf = (v: unknown) => {
      const n = typeof v === "string" ? Number(v) : toNum(v);
      return n != null && Number.isFinite(n) ? n * 100 : null;
    };
    for (const r of rows) {
      const x = by.get(r.address);
      if (!x) continue;
      r.apyPct = pctOf(x.total_apy);
      r.feeApyPct = pctOf(x.apy);
      r.rewardsApyPct = pctOf(x.rewards_apy);
      const vol = typeof x.volume_usd === "string" ? Number(x.volume_usd) : toNum(x.volume_usd);
      r.volume24hUsd = vol != null && Number.isFinite(vol) ? vol / 1e7 : null;
    }
  } catch {
    /* yield / volume are enrichment */
  }
  // On-chain reserves -> real per-pool TVL. The REST list carries no
  // reserves, but every pool contract answers get_reserves with
  // [reserve_a, reserve_b] in pool token order (verified live). Chunked
  // and cached: one loader pays this per 10min window, every client reads
  // cached rows. Pools that fail keep tvlUsd null (honest unknown).
  const allContracts = [...new Set(rows.flatMap((r) => r.assets.map((a) => a.contract)))];
  const metas = await tokenMetas(allContracts);
  for (const r of rows) {
    for (const a of r.assets) a.code = metas[a.contract]?.code ?? shortCode(a.contract);
    r.pair = r.assets.map((a) => a.code).join("/");
  }
  try {
    const { prices: byContract } = await pricesByContract(allContracts.filter((c) => metas[c]));
    const enrich = async (r: DexPoolRow): Promise<void> => {
      try {
        const raw = (await withRetry(() =>
          sorobanView(r.address, "get_reserves"),
        )) as unknown;
        const legs = Array.isArray(raw) ? raw : [];
        if (legs.length < r.assets.length) return;
        const reserves = r.assets.map((a, k) => ({
          code: a.code,
          amount: toNum(legs[k]) ?? 0,
          decimals: metas[a.contract]?.decimals ?? 7,
        }));
        r.reserves = reserves;
        r.tvlUsd = poolTvl(
          r.assets.map((a, k) => ({ amount: reserves[k].amount, decimals: reserves[k].decimals, priceUsd: byContract[a.contract] ?? null })),
          r.poolType,
        );
      } catch {
        /* row keeps list-level data; tvl stays unknown */
      }
    };
    for (let i = 0; i < rows.length; i += 10) {
      await Promise.all(rows.slice(i, i + 10).map(enrich));
      if (i + 10 < rows.length) await new Promise((r) => setTimeout(r, 500));
    }
    // Second-chance sweep: burst 429s fail transiently, so failed pools
    // get one more pass in smaller chunks before this loader resolves.
    const failed = () => rows.filter((r) => r.reserves == null);
    if (failed().length > 0) {
      await new Promise((r) => setTimeout(r, 3000));
      const retry = failed();
      for (let i = 0; i < retry.length; i += 8) {
        await Promise.all(retry.slice(i, i + 8).map(enrich));
        if (i + 8 < retry.length) await new Promise((r) => setTimeout(r, 1000));
      }
    }
  } catch {
    /* reserves are enrichment; list rows still served */
  }
  return { rows, totals };
}

// ---------- Phoenix (factory RPC) ----------

interface PhoenixPoolInfo {
  pool_address?: unknown;
  pool_response?: {
    asset_a?: { address?: unknown; amount?: unknown };
    asset_b?: { address?: unknown; amount?: unknown };
  };
  total_fee_bps?: unknown;
}

async function fetchPhoenix(): Promise<{ rows: DexPoolRow[]; totals: null }> {
  const now = Date.now();
  let infos: PhoenixPoolInfo[] = [];
  try {
    const all = (await withRetry(() =>
      sorobanView(PHOENIX_FACTORY, "query_all_pools_details"),
    )) as PhoenixPoolInfo[];
    if (Array.isArray(all)) infos = all;
  } catch {
    infos = [];
  }
  if (infos.length === 0) {
    // Simulation budget fallback: address list, then per-pool detail.
    const addrs = (await withRetry(() => sorobanView(PHOENIX_FACTORY, "query_pools"))) as unknown;
    const list = (Array.isArray(addrs) ? addrs : []).filter(
      (a): a is string => typeof a === "string" && isContract(a),
    );
    const sdk = await import("@stellar/stellar-sdk");
    const out: PhoenixPoolInfo[] = [];
    for (let i = 0; i < list.length; i += 5) {
      const chunk = await Promise.all(
        list.slice(i, i + 5).map(async (addr) => {
          try {
            return (await withRetry(() =>
              sorobanView(PHOENIX_FACTORY, "query_pool_details", [
                sdk.Address.fromString(addr).toScVal(),
              ]),
            )) as PhoenixPoolInfo;
          } catch {
            return null;
          }
        }),
      );
      for (const c of chunk) if (c) out.push(c);
    }
    infos = out;
  }
  const contracts = [
    ...new Set(
      infos.flatMap((p) =>
        [p?.pool_response?.asset_a?.address, p?.pool_response?.asset_b?.address].filter(
          (a): a is string => typeof a === "string" && isContract(a),
        ),
      ),
    ),
  ];
  const metas = await tokenMetas(contracts);
  const { prices: byContract } = await pricesByContract(contracts.filter((c) => metas[c]));
  const codes: Record<string, string> = {};
  for (const c of contracts) codes[c] = metas[c]?.code ?? (await resolveCode(c)) ?? shortCode(c);
  const rows: DexPoolRow[] = [];
  for (const p of infos) {
    const address = typeof p?.pool_address === "string" ? p.pool_address : "";
    if (!isContract(address)) continue;
    const legs = [p?.pool_response?.asset_a, p?.pool_response?.asset_b].filter(
      (l): l is { address?: unknown; amount?: unknown } => !!l,
    );
    if (legs.length === 0) continue;
    const assets = legs.map((l) => {
      const c = typeof l?.address === "string" ? l.address : "";
      return { contract: c, code: codes[c] ?? shortCode(c) };
    });
    // Reserves are on-chain amounts at the token's own decimals x
    // contract-level USD price; any funded unpriced leg makes TVL unknown.
    const reserves = assets.map((a, k) => ({
      code: a.code,
      amount: toNum(legs[k]?.amount) ?? 0,
      decimals: metas[a.contract]?.decimals ?? 7,
    }));
    const tvlUsd = poolTvl(
      assets.map((a, k) => ({ amount: reserves[k].amount, decimals: reserves[k].decimals, priceUsd: byContract[a.contract] ?? null })),
      "xyk",
    );
    rows.push({
      protocol: "phoenix",
      address,
      pair: assets.map((a) => a.code).join("/"),
      assets,
      poolType: "xyk",
      feeBps: toNum(p?.total_fee_bps),
      trades: null,
      volumeRaw: null,
      tvlUsd,
      reserves,
      updatedAt: now,
    });
  }
  return { rows, totals: null };
}

// ---------- entry ----------

export async function getDexPools(protocol: DexProtocol): Promise<{
  rows: DexPoolRow[];
  totals: DexTotals | null;
  sources: Record<string, string>;
  updatedAt: number;
  cached?: boolean;
  stale?: boolean;
}> {
  const out = await withCache(
    // v2 key: row shape grew reserves + on-chain TVL (v1 rows must not
    // shadow the enriched shape for a TTL window).
    KEYS.pool(`dex-${protocol}-v5`),
    TTL_MS.poolsProtocol,
    async () => {
      const data =
        protocol === "aqua"
          ? await fetchAqua()
          : protocol === "phoenix"
            ? await fetchPhoenix()
            : protocol === "soroswap"
              ? await fetchSoroswap()
              : await fetchSushi();
      return {
        rows: data.rows,
        totals: data.totals,
        sources: { [protocol]: protocol === "aqua" ? "live-rest" : "live-chain" },
        updatedAt: Date.now(),
      };
    },
    { swr: true },
  );
  const v = out.value as {
    rows: DexPoolRow[];
    totals: DexTotals | null;
    sources: Record<string, string>;
    updatedAt: number;
  } | null;
  if (!v) return { rows: [], totals: null, sources: {}, updatedAt: Date.now(), cached: out.cached, stale: true };
  if (protocol === "aqua") return { ...v, cached: out.cached, stale: out.stale || undefined };
  // Soroswap / Phoenix / Sushi publish no stats: 7-day trades, volume and a
  // fee APY from their own swap events (dex-activity.ts).
  registerPools(v.rows);
  refreshActivity(protocol);
  const act = await venueActivity(protocol);
  const rows = act.ready
    ? v.rows.map((r) => {
        const a = act.byPool.get(r.address) ?? { trades7d: 0, volume7dUsd: 0 };
        const feeApy =
          a.volume7dUsd != null && r.feeBps != null && r.tvlUsd != null && r.tvlUsd > 0
            ? (((a.volume7dUsd / 7) * (r.feeBps / 10_000) * 365) / r.tvlUsd) * 100
            : null;
        return { ...r, trades7d: a.trades7d, volume7dUsd: a.volume7dUsd, apyPct: feeApy, feeApyPct: feeApy, rewardsApyPct: null };
      })
    : v.rows.map((r) => ({ ...r, activityPending: true }));
  return { ...v, rows, cached: out.cached, stale: out.stale || undefined };
}
