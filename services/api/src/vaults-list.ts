// Earn vault aggregator (Stellar only).
//  - DeFindex: complete on-chain catalogue (./defindex-catalog.ts) — every
//    factory deployment, multi-asset TVL, real decimals, contract-level
//    pricing. Listed only when priced at >= MIN_VAULT_TVL_USD. No name
//    heuristics: they hid real vaults (BeansUsdcVault, CashAbroadUSDC).
//  - Upshift: curated registry read on-chain + Merkl advertised APY.
// Persistence: Redis SWR via @seidar/cache. No resurrection of vaults that
// stopped reading — a stale number is worse than a missing row.

import { baseToTokens, type VaultRow } from "@seidar/vaults";
import { cacheGet, cacheSet, withCache, KEYS } from "@seidar/cache";
import { UPSHIFT_VAULTS } from "./vaults.js";
import { ensureSchema, getPool } from "./db.js";
import { livePrices } from "./prices.js";
import { sorobanView } from "./rpc.js";
import { defindexCatalog, type DfVault } from "./defindex-catalog.js";

const TTL_MS = 10 * 60 * 1000;

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

interface MerklOpp {
  identifier?: unknown;
  name?: unknown;
  apr?: unknown;
  totalApr?: unknown;
  tvl?: unknown;
}

async function merklStellar(): Promise<Record<string, MerklOpp>> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const list = (await fetch("https://api.merkl.xyz/v4/opportunities/?chainId=4&status=LIVE", {
        signal: ctrl.signal,
        cache: "no-store",
      }).then((r) => r.json())) as MerklOpp[];
      const out: Record<string, MerklOpp> = {};
      for (const o of Array.isArray(list) ? list : []) {
        if (typeof o?.identifier === "string") out[o.identifier] = o;
      }
      return out;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return {};
  }
}

/** A vault is listed only when its TVL is known and at least this much. */
export const MIN_VAULT_TVL_USD = 100;
export const listable = (tvlUsd: number | null | undefined): tvlUsd is number =>
  typeof tvlUsd === "number" && Number.isFinite(tvlUsd) && tvlUsd >= MIN_VAULT_TVL_USD;

export function defindexRow(v: DfVault): VaultRow | null {
  const funded = v.legs.filter((l) => {
    try {
      return BigInt(l.totalBase) > BigInt(0);
    } catch {
      return false;
    }
  });
  if (funded.length === 0 || !listable(v.tvlUsd)) return null;
  const primary = [...funded].sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))[0];
  // Tiny vaults annualize a few cents into absurd APYs; do not trust them.
  const apyPct = v.apyPct != null && v.apyPct > 100 && v.tvlUsd < 10_000 ? null : v.apyPct;
  return {
    protocol: "defindex",
    address: v.address,
    name: v.name,
    symbol: v.symbol,
    asset: primary.asset,
    assetCode: funded.length > 1 ? funded.map((l) => l.code).join("/") : primary.code,
    assetDecimals: primary.decimals,
    tvlUsd: v.tvlUsd,
    apyPct,
    apySource: apyPct != null ? "advertised" : null,
    liquidityUsd: v.idleUsd,
    updatedAt: v.updatedAt,
    legs: funded.map((l) => ({
      asset: l.asset,
      code: l.code,
      decimals: l.decimals,
      totalBase: l.totalBase,
      tvlUsd: l.tvlUsd,
      priceUsd: l.priceUsd,
    })),
    feeSplitBps: v.feesBps,
    sharePrice: v.sharePrice,
  };
}

async function snapshotRows(rows: VaultRow[]): Promise<void> {
  try {
    await ensureSchema();
    const p = getPool();
    for (const r of rows) {
      await p.query(
        `INSERT INTO vault_snapshots (protocol, vault_address, share_price, tvl_usd, apy_pct)
         VALUES ($1, $2, $3, $4, $5)`,
        [r.protocol, r.address, r.sharePrice ?? null, r.tvlUsd, r.apyPct],
      );
    }
  } catch {
    /* snapshots are advisory; rows still served */
  }
}

let lastSnapshotAt = 0;

export type VaultProtocolFilter = "defindex" | "upshift" | "untangled" | "sentora";

async function fetchVaults(): Promise<{ rows: VaultRow[]; sources: Record<string, string>; updatedAt: number }> {
  const rows: VaultRow[] = [];
  const sources: Record<string, string> = {};
  const now = Date.now();
  // Merkl incentives cover Upshift and the Sentora share vault; fetched once per build.
  const merkl = merklStellar();

  try {
    const cat = await defindexCatalog();
    for (const v of cat.vaults) {
      const r = defindexRow(v);
      if (r) rows.push(r);
    }
    sources.defindex = `chain: ${cat.vaults.length}/${cat.total} vaults read${cat.failed ? `, ${cat.failed} unreadable` : ""}`;
  } catch (e) {
    console.error(`[vaults] defindex catalogue failed: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`);
    sources.defindex = "error";
  }

  try {
    const opps = await merkl;
    const upshiftCodes = [...new Set(UPSHIFT_VAULTS.map((v) => v.assetCode))];
    const { prices: upx } = await livePrices(upshiftCodes);
    for (const v of UPSHIFT_VAULTS) {
      try {
        const [supplyRaw, assetsRaw] = await Promise.all([
          withRetry(() => sorobanView(v.address, "total_supply")),
          withRetry(() => sorobanView(v.address, "total_assets")),
        ]);
        const supply = toNum(supplyRaw);
        const assets = toNum(assetsRaw);
        const px = upx[v.assetCode] ?? (v.assetCode === "USDC" ? 1 : null);
        const tvl = assets != null && px != null ? baseToTokens(String(Math.floor(assets)), v.assetDecimals) * px : null;
        const opp = opps[v.address];
        const apy = opp && Number(opp.totalApr) > 0 ? Number(opp.totalApr) : null;
        let liq: number | null = null;
        try {
          const sdk = await import("@stellar/stellar-sdk");
          const local = await withRetry(() =>
            sorobanView(v.asset, "balance", [sdk.Address.fromString(v.address).toScVal()]),
          );
          const lb = toNum(local);
          if (lb != null && px != null) liq = baseToTokens(String(Math.floor(lb)), v.assetDecimals) * px;
        } catch {
          /* stays null */
        }
        if (!listable(tvl)) continue;
        rows.push({
          protocol: "upshift",
          address: v.address,
          name: v.name,
          symbol: v.symbol,
          asset: v.asset,
          assetCode: v.assetCode,
          assetDecimals: v.assetDecimals,
          tvlUsd: tvl,
          apyPct: apy,
          apySource: apy != null ? "advertised" : null,
          liquidityUsd: liq,
          curator: v.curator,
          withdrawalDays: v.withdrawalDays,
          updatedAt: now,
        });
      } catch (e) {
        console.error(`[vaults] upshift skip ${v.address}: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`);
      }
    }
    sources.upshift = "live";
  } catch {
    sources.upshift = "error";
  }

  sources.untangled = "pending-registry (address unpublished)";

  // Sentora: incentivized deposit vaults (principal on chain, curator-quoted APY) + the sentUSDC share vault.
  try {
    const { sentoraRows } = await import("./sentora.js");
    const { prices } = await livePrices(["XLM", "USDC", "PYUSD"]);
    const opps = await merkl;
    const apr: Record<string, number | null> = {};
    for (const [k, o] of Object.entries(opps)) apr[k] = Number(o.totalApr) > 0 ? Number(o.totalApr) : null;
    rows.push(...((await sentoraRows(prices, apr)) as VaultRow[]));
    sources.sentora = "live";
  } catch {
    sources.sentora = "error";
  }

  // A source that failed this round keeps its last good rows instead of vanishing from the list.
  const failed = (["defindex", "upshift", "sentora"] as const).filter(
    (p) => sources[p] === "error" || !rows.some((r) => r.protocol === p),
  );
  if (failed.length) {
    const prev = await cacheGet<{ rows: VaultRow[] }>(KEYS.vaultsRows).catch(() => null);
    for (const p of failed) rows.push(...(prev?.rows ?? []).filter((r) => r.protocol === p));
  }

  if (Date.now() - lastSnapshotAt > 3600_000 && rows.length > 0) {
    lastSnapshotAt = Date.now();
    await snapshotRows(rows);
  }
  return { rows, sources, updatedAt: now };
}

export async function getVaults(fresh = false, protocol?: VaultProtocolFilter) {
  if (fresh) {
    // Explicit refresh rebuilds now (withCache would serve a fresh entry).
    const v = await fetchVaults();
    await cacheSet(KEYS.vaultsRows, v, TTL_MS).catch(() => {});
    const rows = protocol ? v.rows.filter((r) => r.protocol === protocol) : v.rows;
    return { rows, sources: v.sources, updatedAt: v.updatedAt, cached: false, stale: undefined };
  }
  const out = await withCache(KEYS.vaultsRows, TTL_MS, () => fetchVaults(), { swr: true });
  const v = out.value as { rows: VaultRow[]; sources: Record<string, string>; updatedAt: number } | null;
  if (!v) return { rows: [], sources: {}, updatedAt: Date.now(), cached: out.cached, stale: true };
  const rows = protocol ? v.rows.filter((r) => r.protocol === protocol) : v.rows;
  return { rows, sources: v.sources, updatedAt: v.updatedAt, cached: out.cached, stale: out.stale || undefined };
}
