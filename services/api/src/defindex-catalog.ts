// Complete DeFindex vault catalogue, straight from chain.
//
// The DeFindex /vault/discover API lists only a curated handful (14 of 124
// on 2026-10-15). The factory is authoritative: total_vaults() +
// get_vault_by_index(i) enumerate every deployment; each vault contract then
// reports its own funds (fetch_total_managed_funds), share supply, fees and
// assets. The DeFindex API is used only for APY (it serves any address).
//
// Index -> address and name/symbol are immutable, persisted in
// defindex_vaults so a refresh only re-reads balances.

import { cacheSet, withCache } from "@seidar/cache";

const CATALOG_KEY = "vaults:defindex:catalog:v1";
import { ensureSchema, getPool } from "./db.js";
import { mapLimit, sorobanView } from "./rpc.js";
import { tokenMetas } from "./token-meta.js";
import { pricesByContract } from "./contract-price.js";
import { DEFINDEX_FACTORY, defindexGet, defindexKey } from "./vaults.js";

export interface DfStrategy {
  address: string;
  name: string;
  paused: boolean;
  amountBase: string;
}

export interface DfLeg {
  asset: string;
  code: string;
  decimals: number;
  totalBase: string;
  idleBase: string;
  investedBase: string;
  priceUsd: number | null;
  tvlUsd: number | null;
  strategies: DfStrategy[];
}

export interface DfVault {
  index: number;
  address: string;
  name: string;
  symbol: string;
  legs: DfLeg[];
  totalSupply: string;
  /** Sum of priced legs; null when a funded leg has no price. */
  tvlUsd: number | null;
  idleUsd: number | null;
  feesBps: { vaultFee: number; protocolFee: number } | null;
  apyPct: number | null;
  /** Underlying (primary leg, whole tokens) per one whole share. */
  sharePrice: number | null;
  updatedAt: number;
}

const memIndex = new Map<number, { address: string; name: string; symbol: string }>();

function shortName(name: string): string {
  const p = "DeFindex-Vault-";
  return name.startsWith(p) && name.length > p.length ? name.slice(p.length) : name;
}

async function loadIndex(): Promise<{ index: number; address: string; name: string; symbol: string }[]> {
  const total = Number(await sorobanView(DEFINDEX_FACTORY, "total_vaults"));
  if (!Number.isInteger(total) || total < 0) throw new Error("factory total_vaults unreadable");
  let db = false;
  try {
    await ensureSchema();
    const { rows } = await getPool().query<{ idx: number; address: string; name: string; symbol: string }>(
      "SELECT idx, address, name, symbol FROM defindex_vaults",
    );
    for (const r of rows) memIndex.set(r.idx, { address: r.address, name: r.name, symbol: r.symbol });
    db = true;
  } catch {
    /* memory-only */
  }
  const missing: number[] = [];
  for (let i = 0; i < total; i++) if (!memIndex.has(i)) missing.push(i);
  await mapLimit(missing, 4, async (i) => {
    try {
      const sdk = await import("@stellar/stellar-sdk");
      const address = String(
        await sorobanView(DEFINDEX_FACTORY, "get_vault_by_index", [sdk.nativeToScVal(i, { type: "u32" })]),
      );
      const [name, symbol] = await Promise.all([
        sorobanView(address, "name").catch(() => ""),
        sorobanView(address, "symbol").catch(() => ""),
      ]);
      const rec = { address, name: shortName(String(name ?? "")), symbol: String(symbol ?? "") };
      memIndex.set(i, rec);
      if (db) {
        await getPool()
          .query(
            `INSERT INTO defindex_vaults (idx, address, name, symbol) VALUES ($1, $2, $3, $4)
             ON CONFLICT (idx) DO UPDATE SET address = $2, name = $3, symbol = $4`,
            [i, rec.address, rec.name, rec.symbol],
          )
          .catch(() => {});
      }
    } catch (e) {
      console.error(`[defindex] index ${i}: ${String(e instanceof Error ? e.message : e).slice(0, 120)}`);
    }
  });
  return [...memIndex.entries()]
    .filter(([i]) => i < total)
    .sort((a, b) => a[0] - b[0])
    .map(([index, r]) => ({ index, ...r }));
}

const big = (v: unknown): bigint => {
  try {
    return BigInt(String(v ?? "0"));
  } catch {
    return BigInt(0);
  }
};

const toTokens = (base: bigint, dec: number): number => Number(base) / 10 ** dec;

async function apyFor(address: string): Promise<number | null> {
  if (!defindexKey()) return null;
  return withCache(`vaults:defindex:apy:${address}`, 60 * 60_000, async () => {
    // DeFindex sheds sustained bursts: retry with backoff before giving up.
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const d = (await defindexGet(`/vault/${address}/apy?network=mainnet`, 15000)) as { apy?: unknown };
        const n = Number(d?.apy);
        // Clamp nonsense (tiny-TVL vaults annualize to 6-digit APYs).
        return Number.isFinite(n) && n > -100 && n < 1000 ? Math.max(0, n) : null;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
    }
    throw lastErr;
  })
    .then((r) => (r.value as number | null) ?? null)
    .catch(() => null);
}

interface RawFund {
  asset?: unknown;
  idle_amount?: unknown;
  invested_amount?: unknown;
  total_amount?: unknown;
  strategy_allocations?: { amount?: unknown; paused?: unknown; strategy_address?: unknown }[];
}

async function readVault(v: { index: number; address: string; name: string; symbol: string }) {
  const [funds, supply, fees, assets] = await Promise.all([
    sorobanView(v.address, "fetch_total_managed_funds") as Promise<RawFund[]>,
    sorobanView(v.address, "total_supply"),
    sorobanView(v.address, "get_fees").catch(() => null),
    sorobanView(v.address, "get_assets").catch(() => null) as Promise<
      { address?: unknown; strategies?: { address?: unknown; name?: unknown }[] }[] | null
    >,
  ]);
  const names = new Map<string, string>();
  for (const a of Array.isArray(assets) ? assets : [])
    for (const s of Array.isArray(a?.strategies) ? a.strategies : [])
      if (typeof s?.address === "string") names.set(s.address, String(s.name ?? ""));
  const feeArr = Array.isArray(fees) ? fees.map(Number) : null;
  return {
    funds: Array.isArray(funds) ? funds : [],
    supply: big(supply),
    fees:
      feeArr && feeArr.length >= 2 && feeArr.every(Number.isFinite)
        ? { vaultFee: feeArr[0], protocolFee: feeArr[1] }
        : null,
    names,
  };
}

async function buildCatalog(): Promise<{ vaults: DfVault[]; total: number; failed: number }> {
  const index = await loadIndex();
  const now = Date.now();
  let failed = 0;
  const raw = await mapLimit(index, 6, async (v) => {
    try {
      return { v, r: await readVault(v) };
    } catch {
      failed++;
      return null;
    }
  });
  const ok = raw.filter((x): x is NonNullable<typeof x> => x != null);
  const assetIds = ok.flatMap((x) =>
    x.r.funds.map((f) => (typeof f?.asset === "string" ? f.asset : "")).filter(Boolean),
  );
  const metas = await tokenMetas(assetIds);
  // Price only assets some vault actually holds (skips quoting dead tokens).
  const held = [
    ...new Set(
      ok.flatMap((x) =>
        x.r.funds.filter((f) => big(f?.total_amount) > BigInt(0)).map((f) => String(f.asset)),
      ),
    ),
  ];
  const { prices } = await pricesByContract(held);

  const vaults: DfVault[] = [];
  for (const { v, r } of ok) {
    const legs: DfLeg[] = [];
    for (const f of r.funds) {
      const asset = typeof f?.asset === "string" ? f.asset : "";
      if (!asset) continue;
      const m = metas[asset];
      const dec = m?.decimals ?? 7;
      const total = big(f.total_amount);
      const px = prices[asset] ?? null;
      legs.push({
        asset,
        code: m?.code ?? asset.slice(0, 4),
        decimals: dec,
        totalBase: total.toString(),
        idleBase: big(f.idle_amount).toString(),
        investedBase: big(f.invested_amount).toString(),
        priceUsd: px,
        tvlUsd: total === BigInt(0) ? 0 : px != null ? toTokens(total, dec) * px : null,
        strategies: (Array.isArray(f.strategy_allocations) ? f.strategy_allocations : []).map((s) => ({
          address: String(s?.strategy_address ?? ""),
          name: r.names.get(String(s?.strategy_address ?? "")) ?? "",
          paused: s?.paused === true,
          amountBase: big(s?.amount).toString(),
        })),
      });
    }
    const funded = legs.filter((l) => big(l.totalBase) > BigInt(0));
    const tvl = funded.some((l) => l.tvlUsd == null)
      ? null
      : funded.reduce((s, l) => s + (l.tvlUsd ?? 0), 0);
    const idle = funded.some((l) => l.priceUsd == null)
      ? null
      : funded.reduce((s, l) => s + toTokens(big(l.idleBase), l.decimals) * (l.priceUsd ?? 0), 0);
    const primary = [...funded].sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))[0];
    const sharePrice =
      primary && r.supply > BigInt(0) && funded.length === 1
        ? toTokens(big(primary.totalBase), primary.decimals) / (Number(r.supply) / 1e7)
        : null;
    vaults.push({
      index: v.index,
      address: v.address,
      name: v.name || v.address.slice(0, 4) + "…" + v.address.slice(-4),
      symbol: v.symbol,
      legs,
      totalSupply: r.supply.toString(),
      tvlUsd: tvl,
      idleUsd: idle,
      feesBps: r.fees,
      apyPct: null,
      sharePrice,
      updatedAt: now,
    });
  }
  // APY only for funded vaults (one cached API read each, 1h TTL).
  await mapLimit(
    vaults.filter((x) => x.legs.some((l) => big(l.totalBase) > BigInt(0))),
    3,
    async (x) => {
      x.apyPct = await apyFor(x.address);
    },
  );
  return { vaults, total: index.length, failed };
}

export async function defindexCatalog(fresh = false): Promise<{
  vaults: DfVault[];
  total: number;
  failed: number;
  stale?: boolean;
}> {
  if (fresh) {
    // Explicit refresh: rebuild now (withCache would serve a fresh entry).
    const v = await buildCatalog();
    await cacheSet(CATALOG_KEY, v, 10 * 60_000).catch(() => {});
    return v;
  }
  const out = await withCache(CATALOG_KEY, 10 * 60_000, buildCatalog, { swr: true });
  const v = out.value as { vaults: DfVault[]; total: number; failed: number } | null;
  if (!v) return { vaults: [], total: 0, failed: 0, stale: true };
  return { ...v, stale: out.stale || undefined };
}
