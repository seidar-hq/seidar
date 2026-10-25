// Lend markets: every asset that can be lent (plain supply, never
// collateral), grouped the way each protocol pools liquidity — Blend by pool,
// XOXNO by hub (its spokes all draw on the hub's reserve, so APY is per hub).
//
//   GET /lend/markets -> { ok, groups: [{ protocol, id, name, assets: [...] }] }
//
// XOXNO's no-collateral spokes are borrow-side markets (they take no
// deposits), so an XOXNO lend goes through the hub's busiest collateral spoke
// into an account Seidar never borrows from — with no debt, nothing in it can
// be liquidated.

import { cacheGet, cacheGetEntry, withCache } from "@seidar/cache";
import { getPoolData } from "./pools.js";
import { isTestnet } from "./net.js";
import { tokenMetas } from "./token-meta.js";

export interface LendAsset {
  asset: string;
  code: string;
  decimals: number;
  supplyApy: number | null;
  suppliedUsd: number | null;
  borrowedUsd: number | null;
  availableUsd: number | null;
  /** Utilisation, percent. */
  utilPct: number | null;
  /** XOXNO: spoke a lend deposits through. */
  spokeId?: number;
  /** Blend pool status: 4+ frozen (no new supply). */
  frozen?: boolean;
}
export interface LendGroup {
  protocol: "blend" | "xoxno";
  /** Blend pool contract, or `xoxno-hub-<id>`. */
  id: string;
  name: string;
  hubId?: number;
  assets: LendAsset[];
  tvlUsd: number;
  /** Nothing supplied (a superseded pool): hidden from the list, still
   *  there so positions left in it can be withdrawn. */
  retired?: boolean;
}

type XRes = {
  spokeId: number;
  hubId: number;
  asset: string;
  symbol?: string;
  decimals?: number;
  supplyApy?: number;
  totalDepositsUsd?: number | null;
  totalBorrowsUsd?: number | null;
  availableLiquidityUsd?: number | null;
  useAsCollateral?: boolean;
  collateralFactorBps?: number;
};

async function xoxnoGroups(): Promise<LendGroup[]> {
  const r = await fetch("https://api.xoxno.com/stellar-lending/reserves", { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`xoxno reserves ${r.status}`);
  const body = (await r.json()) as unknown;
  const rows = (Array.isArray(body) ? body : ((body as { reserves?: unknown[] }).reserves ?? [])) as XRes[];
  const byHubAsset = new Map<string, XRes[]>();
  for (const x of rows) {
    if (!String(x.asset).startsWith("C")) continue;
    const k = `${x.hubId}|${x.asset}`;
    byHubAsset.set(k, [...(byHubAsset.get(k) ?? []), x]);
  }
  const metas = await tokenMetas([...new Set(rows.map((x) => x.asset).filter((a) => String(a).startsWith("C")))]).catch(
    () => ({}) as Record<string, { code: string; decimals: number }>,
  );
  // Aqua LP share tokens (symbol "POOL") read as their pair: "LP XLM/AQUA".
  const lpPair = new Map<string, string>();
  try {
    const shares = (await cacheGet<Record<string, string>>("lp-share-tokens:aqua")) ?? {};
    const { getDexPools } = await import("./dex.js");
    const { rows: aqua } = await getDexPools("aqua");
    for (const p of aqua) if (shares[p.address]) lpPair.set(shares[p.address], `LP ${p.pair}`);
  } catch {
    /* plain codes */
  }
  const hubs = new Map<number, LendGroup>();
  for (const members of byHubAsset.values()) {
    const m0 = members[0];
    // Deposit spoke: a collateral spoke that takes deposits, the busiest one.
    const depositable = members.filter((m) => m.useAsCollateral !== false && (m.collateralFactorBps ?? 0) > 0);
    if (depositable.length === 0) continue;
    const spoke = [...depositable].sort((a, b) => (b.totalDepositsUsd ?? 0) - (a.totalDepositsUsd ?? 0))[0];
    const sum = (f: (m: XRes) => number | null | undefined) => members.reduce((t, m) => t + (f(m) ?? 0), 0);
    const supplied = sum((m) => m.totalDepositsUsd);
    const borrowed = sum((m) => m.totalBorrowsUsd);
    const g =
      hubs.get(m0.hubId) ??
      ({ protocol: "xoxno", id: `xoxno-hub-${m0.hubId}`, name: `XOXNO Hub ${m0.hubId}`, hubId: m0.hubId, assets: [], tvlUsd: 0 } as LendGroup);
    g.assets.push({
      asset: m0.asset,
      code: lpPair.get(m0.asset) ?? metas[m0.asset]?.code ?? (String(m0.symbol ?? "") || m0.asset.slice(0, 4)),
      decimals: Number(m0.decimals ?? metas[m0.asset]?.decimals ?? 7),
      supplyApy: Math.max(...members.map((m) => Number(m.supplyApy ?? 0))) * 100,
      suppliedUsd: supplied,
      borrowedUsd: borrowed,
      availableUsd: Math.max(0, supplied - borrowed),
      utilPct: supplied > 0 ? (borrowed / supplied) * 100 : null,
      spokeId: spoke.spokeId,
    });
    g.tvlUsd += supplied;
    hubs.set(m0.hubId, g);
  }
  return [...hubs.values()];
}

async function blendGroups(): Promise<LendGroup[]> {
  const d = await getPoolData("blend");
  const groups = new Map<string, LendGroup>();
  for (const a of d.assets) {
    if (a.protocol !== "blend" || !a.asset) continue;
    const g = groups.get(a.pool) ?? ({ protocol: "blend", id: a.pool, name: a.poolName, assets: [], tvlUsd: 0 } as LendGroup);
    if (g.assets.some((x) => x.asset === a.asset)) continue;
    const sup = a.suppliedUsd ?? null;
    const bor = a.borrowedUsd ?? null;
    g.assets.push({
      asset: a.asset,
      code: a.code,
      decimals: a.decimals ?? 7,
      supplyApy: a.supplyApy,
      suppliedUsd: sup,
      borrowedUsd: bor,
      availableUsd: sup != null && bor != null ? Math.max(0, sup - bor) : null,
      utilPct: sup != null && bor != null && sup > 0 ? (bor / sup) * 100 : null,
      frozen: (a.poolStatus ?? 0) >= 4,
    });
    g.tvlUsd += sup ?? 0;
    groups.set(a.pool, g);
  }
  return [...groups.values()];
}

const KEY = "lend-markets-v5";

export async function getLendMarkets() {
  try {
    const out = await withCache(
      KEY,
      5 * 60_000,
      async () => {
        const [b, x] = await Promise.all([
          blendGroups().catch(() => [] as LendGroup[]),
          isTestnet() ? Promise.resolve([] as LendGroup[]) : xoxnoGroups().catch(() => [] as LendGroup[]),
        ]);
        // A protocol that reads empty this cycle is a blip: keep its last
        // good groups; with nothing at all, throw so the cache keeps serving.
        const prev = ((await cacheGetEntry<LendGroup[]>(KEY).catch(() => null))?.value ?? []) as LendGroup[];
        const blend = b.length > 0 ? b : prev.filter((g) => g.protocol === "blend");
        const xoxno = x.length > 0 || isTestnet() ? x : prev.filter((g) => g.protocol === "xoxno");
        if (blend.length + xoxno.length === 0) throw new Error("lend markets: nothing loaded");
        // Retired pools (same names, nothing supplied) are flagged: the list
        // hides them, positions still in them stay withdrawable.
        return [...blend, ...xoxno]
          // Unpriced totals (null) are unknown, not empty: never retire on them.
          .map((g) => (g.tvlUsd < 1 && g.assets.every((a) => a.suppliedUsd != null) ? { ...g, retired: true } : g))
          .map((g) => ({ ...g, assets: g.assets.sort((a, b) => (b.suppliedUsd ?? 0) - (a.suppliedUsd ?? 0)) }))
          .sort((a, b) => b.tvlUsd - a.tvlUsd);
      },
      { swr: true },
    );
    return { status: 200, body: { ok: true, groups: out.value ?? [] } };
  } catch (e) {
    return { status: 200, body: { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) } };
  }
}
