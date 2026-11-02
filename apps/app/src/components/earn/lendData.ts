"use client";

import { useEffect, useMemo } from "react";
import { registerIcons } from "@/lib/tokens";
import { apiJson, apiJsonWarm } from "@/lib/api";
import { useShared, useSharedMany } from "@/lib/useShared";
import { useTokenCatalogue } from "@/portfolio/usePortfolio";
import { TEMPLAR_ENABLED } from "@/lib/features";

// Lending markets across Blend (isolated pools, each with an admin status) and XOXNO (hubs with
// spokes), normalised to one row per (venue, pool/hub, asset).

type BlendAsset = {
  pool: string;
  poolName: string;
  code: string;
  asset?: string;
  decimals?: number;
  suppliedUsd?: number;
  borrowedUsd?: number;
  supplyApy: number | null;
  borrowApy: number | null;
  ltvPct?: number | null;
  canBorrow?: boolean;
  canCollateral?: boolean;
  poolStatus?: number | null;
  poolMinCollateralUsd?: number | null;
  lFactor?: number;
  priceUsd?: number | null;
  supplyBlnd?: number | null;
  borrowBlnd?: number | null;
};

export type XoxnoSpoke = {
  spokeId: number;
  spokeName: string;
  ltvBps: number;
  canSupply: boolean;
  canBorrow: boolean;
  canBeCollateral?: boolean;
  supplyCapacity?: { amount: string; usd: number };
  borrowCapacity?: { amount: string; usd: number };
};

export type XoxnoMarket = {
  sac: string;
  symbol: string;
  name?: string;
  decimals: number;
  hubId: number;
  hubName?: string;
  supplyApy?: number;
  borrowApy?: number;
  priceUsd?: number;
  logoUrl?: string;
  spokes: XoxnoSpoke[];
};

type GroupAsset = { asset: string; code: string; suppliedUsd: number; borrowedUsd: number; availableUsd?: number; utilPct?: number };
type LendGroups = { groups?: { protocol: string; id: string; name: string; assets: GroupAsset[] }[] };

export type LendProtocol = "blend" | "xoxno" | "templar";

/** A Templar market as /templar/markets describes it (services/api/src/templar.ts). Percent fields are 0..100. */
export type TemplarAsset = { assetId: string; contract: string; symbol: string; name: string | null; decimals: number; priceUsd: number | null };
export type TemplarMarketInfo = {
  id: string;
  name: string;
  status: string;
  version: string | null;
  collateral: TemplarAsset;
  borrow: TemplarAsset;
  supplyApy: number | null;
  borrowApy: number | null;
  utilizationPct: number | null;
  totalSupplyUsd: number;
  totalBorrowUsd: number;
  collateralUsd: number;
  availableUsd: number;
  maxLtvPct: number;
  liquidationLtvPct: number;
  mcrMaintenance: number;
  mcrLiquidation: number;
  maxUsagePct: number;
  liquidationPenaltyPct: number;
  originationFee: { kind: "flat" | "proportional"; value: number };
  withdrawalFee: { kind: "flat" | "proportional"; value: number; durationMs: number } | null;
  supplierSharePct: number | null;
  minSupply: number | null;
  maxBorrowDurationMs: number | null;
  priceMaxAgeS: number | null;
  oracle: string | null;
  withdrawalQueue: { length: number; depthUsd: number };
  rateCurve: { kind: "piecewise" | "linear" | "other"; points: { u: number; rate: number }[]; kinkPct: number | null };
  appUrl: string;
};

/** One Templar position of a Stellar wallet's universal account (/templar/positions). */
export type TemplarPosition = {
  marketId: string;
  listed: boolean;
  name: string;
  appUrl: string;
  supply: { contract: string | null; symbol: string; amount: number; usd: number; apy: number | null; earnedUsd: number; queuedWithdrawal: number | null } | null;
  borrow: {
    contract: string | null;
    symbol: string;
    amount: number;
    usd: number;
    apy: number | null;
    collateral: { contract: string | null; symbol: string; amount: number; usd: number };
    healthFactor: number | null;
    liquidationPrice: number | null;
  } | null;
};
export type TemplarPositionsResp = {
  ok?: boolean;
  error?: string;
  account?: string;
  positions?: TemplarPosition[];
  totals?: { suppliedUsd: number; collateralUsd: number; borrowedUsd: number };
  appUrl?: string;
};

export const TEMPLAR_APP = "https://app.templarfi.org";
export const templarAppHref = (marketId: string, action: "market" | "supply" | "borrow" = "market") =>
  action === "market" ? `${TEMPLAR_APP}/markets/${marketId}` : `${TEMPLAR_APP}/${action}?market=${marketId}`;

/** Templar positions of these wallets (one shared fetch per wallet; Portfolio reads the same keys). */
export function useTemplarPositions(addresses: string[]) {
  const keys = TEMPLAR_ENABLED ? addresses.map((a) => `templar:pos:${a}`) : [];
  const r = useSharedMany<TemplarPositionsResp | null>(keys, (k) => () => apiJson<TemplarPositionsResp>(`/api/templar/positions?address=${k.slice(12)}`), 120_000);
  return { values: r.values, loading: TEMPLAR_ENABLED && r.loading, refreshing: TEMPLAR_ENABLED && r.refreshing };
}

/** Templar's markets (only those whose two assets are Stellar tokens; the API filters). */
export function useTemplarMarkets() {
  const r = useShared<{ ok?: boolean; markets?: TemplarMarketInfo[] } | null>(
    TEMPLAR_ENABLED ? "templar:markets" : null,
    () => apiJson("/api/templar/markets", undefined, 60_000),
    300_000,
  );
  return { markets: r.value?.markets ?? [], loading: TEMPLAR_ENABLED && r.loading && !r.value, error: r.error, ready: !!r.value };
}

export type Market = {
  key: string;
  protocol: LendProtocol;
  /** Blend pool contract, or "xoxno-hub-N". */
  pool: string;
  poolName: string;
  /** Blend pool status (0-1 active, 2-3 on ice, 4-5 frozen, 6 setup); null for XOXNO. */
  status: number | null;
  /** Collateral (USD) a position needs before it may borrow; Blend per pool (after collateral factors). XOXNO: see /lending/xoxno/limits. */
  minCollateralUsd: number | null;
  code: string;
  contract: string | null;
  issuer: string | null;
  decimals: number;
  supplyApy: number | null;
  borrowApy: number | null;
  suppliedUsd: number;
  borrowedUsd: number;
  availableUsd: number;
  utilPct: number | null;
  ltvPct: number | null;
  canBorrow: boolean;
  canCollateral: boolean;
  priceUsd: number | null;
  /** Blend liability factor (0..1): debt counts as amount / lFactor in health. */
  lFactor?: number | null;
  /** Blend BLND emissions per year per token supplied / borrowed. */
  supplyBlnd?: number | null;
  borrowBlnd?: number | null;
  xoxno?: XoxnoMarket;
  /** Templar: the market, and which of its two assets this row is (collateral only, or the lent/borrowed asset). */
  templar?: TemplarMarketInfo;
  templarSide?: "collateral" | "borrow";
};

export const LEND_PROTOCOLS: Record<LendProtocol, { name: string; logo: string; site: string }> = {
  blend: { name: "Blend", logo: "/protocols/blend.png", site: "https://mainnet.blend.capital" },
  xoxno: { name: "XOXNO", logo: "/protocols/xoxno.png", site: "https://xoxno.com/lending" },
  templar: { name: "Templar", logo: "/protocols/templar.png", site: "https://app.templarfi.org" },
};

export type StatusInfo = { label: string; tone: "ice" | "frozen" | "setup"; tip: string };

/** Blend pool admin status as a pill (null when the market is fully active). */
export function marketStatus(status: number | null | undefined): StatusInfo | null {
  if (status == null || status <= 1) return null;
  if (status <= 3)
    return {
      label: "On ice",
      tone: "ice",
      tip: "Blend has paused new borrowing in this pool. You can still supply, withdraw and repay.",
    };
  if (status <= 5)
    return {
      label: "Frozen",
      tone: "frozen",
      tip: "Blend has frozen this pool: no new supply or borrowing. You can still withdraw and repay what you hold.",
    };
  return { label: "In setup", tone: "setup", tip: "This pool's admin hasn't opened it yet: no supply or borrowing until it goes active." };
}

/** leverage: XOXNO in one transaction, Blend as a loop of transactions (see leverage.tsx). */
export type LendAction = "supply" | "borrow" | "withdraw" | "repay" | "leverage";

/** Why an action is unavailable on this market (null when allowed). */
export function actionBlock(m: Market, a: LendAction): string | null {
  if (!m.contract) return "Market unavailable";
  const s = m.status;
  if (a === "leverage") {
    if (!m.canCollateral) return "This asset can't be collateral";
    if (s != null && s >= 6) return "Pool is in setup";
    if (s != null && s >= 4) return "Pool is frozen: leverage is paused";
    if (s != null && s >= 2) return "Pool is on ice: leverage is paused";
    return null;
  }
  if (s != null && s >= 6) return "Pool is in setup";
  if (a === "supply" && s != null && s >= 4) return "Pool is frozen: supplying is paused";
  if (a === "borrow") {
    if (s != null && s >= 4) return "Pool is frozen: borrowing is paused";
    if (s != null && s >= 2) return "Pool is on ice: borrowing is paused";
    if (!m.canBorrow) return "This asset can't be borrowed";
  }
  return null;
}

/** Every lending market (Blend pools + XOXNO hubs). Setup-only pools with no deposits are hidden. */
export function useLendMarkets() {
  const { byContract, tokens } = useTokenCatalogue();
  const blend = useShared<{ assets?: BlendAsset[] } | null>("pools:blend", () => apiJson("/api/pools?protocol=blend", undefined, 120_000), 300_000);
  const xoxno = useShared<{ assets?: XoxnoMarket[] } | null>("xoxno:markets", () => apiJson("/api/lending/xoxno/markets", undefined, 120_000), 300_000);
  const groups = useShared<LendGroups | null>("lend:markets", () => apiJson("/api/lend/markets", undefined, 120_000), 300_000);
  const templar = useTemplarMarkets();

  const markets = useMemo<Market[]>(() => {
    const tvl = new Map<string, GroupAsset>();
    for (const g of groups.value?.groups ?? []) for (const a of g.assets) tvl.set(`${g.id}:${a.asset}`, a);
    const out: Market[] = [];
    const seen = new Set<string>();
    for (const a of blend.value?.assets ?? []) {
      const key = `blend:${a.pool}:${a.asset ?? a.code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const t = a.asset ? tvl.get(`${a.pool}:${a.asset}`) : undefined;
      const supplied = t?.suppliedUsd ?? a.suppliedUsd ?? 0;
      if ((a.poolStatus ?? 0) >= 6 && supplied < 1) continue;
      const meta = a.asset ? byContract.get(a.asset) : undefined;
      const borrowed = t?.borrowedUsd ?? a.borrowedUsd ?? 0;
      out.push({
        key,
        protocol: "blend",
        pool: a.pool,
        poolName: a.poolName,
        status: a.poolStatus ?? null,
        minCollateralUsd: a.poolMinCollateralUsd ?? null,
        code: a.code,
        contract: a.asset ?? null,
        issuer: meta?.issuer ?? null,
        decimals: a.decimals ?? meta?.decimals ?? 7,
        supplyApy: a.supplyApy,
        borrowApy: a.borrowApy,
        suppliedUsd: supplied,
        borrowedUsd: borrowed,
        availableUsd: t?.availableUsd ?? Math.max(0, supplied - borrowed),
        utilPct: t?.utilPct ?? (supplied > 0 ? (borrowed / supplied) * 100 : null),
        ltvPct: a.ltvPct ?? null,
        canBorrow: a.canBorrow !== false,
        canCollateral: a.canCollateral !== false,
        priceUsd: a.priceUsd ?? null,
        lFactor: a.lFactor ?? null,
        supplyBlnd: a.supplyBlnd ?? null,
        borrowBlnd: a.borrowBlnd ?? null,
      });
    }
    for (const x of xoxno.value?.assets ?? []) {
      const pool = `xoxno-hub-${x.hubId}`;
      const key = `xoxno:${pool}:${x.sac}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const t = tvl.get(`${pool}:${x.sac}`);
      const meta = byContract.get(x.sac) ?? tokens.find((k) => k.contract === x.sac);
      const supplied = t?.suppliedUsd ?? 0;
      const borrowed = t?.borrowedUsd ?? 0;
      const ltv = Math.max(0, ...x.spokes.filter((s) => s.canBeCollateral !== false).map((s) => s.ltvBps / 100));
      out.push({
        key,
        protocol: "xoxno",
        pool,
        poolName: `${x.hubName ?? "Hub"} hub`,
        status: null,
        minCollateralUsd: null,
        code: x.symbol,
        contract: x.sac,
        issuer: meta?.issuer ?? null,
        decimals: x.decimals ?? 7,
        supplyApy: x.supplyApy != null ? x.supplyApy * 100 : null,
        borrowApy: x.borrowApy != null ? x.borrowApy * 100 : null,
        suppliedUsd: supplied,
        borrowedUsd: borrowed,
        availableUsd: t?.availableUsd ?? Math.max(0, supplied - borrowed),
        utilPct: t?.utilPct ?? (supplied > 0 ? (borrowed / supplied) * 100 : null),
        ltvPct: ltv > 0 ? ltv : null,
        canBorrow: x.spokes.some((s) => s.canBorrow),
        canCollateral: x.spokes.some((s) => s.canBeCollateral !== false && s.ltvBps > 0),
        priceUsd: x.priceUsd ?? null,
        xoxno: x,
      });
    }
    // Templar: one pool per market with two rows: the collateral (backs loans, earns nothing) and the
    // asset suppliers lend and borrowers take.
    const dupes = new Map<string, number>();
    for (const t of templar.markets) dupes.set(t.name, (dupes.get(t.name) ?? 0) + 1);
    const seenName = new Map<string, number>();
    for (const t of templar.markets) {
      const n = (seenName.get(t.name) ?? 0) + 1;
      seenName.set(t.name, n);
      const cMeta = byContract.get(t.collateral.contract);
      const bMeta = byContract.get(t.borrow.contract);
      const cCode = cMeta?.code ?? t.collateral.symbol;
      const bCode = bMeta?.code ?? t.borrow.symbol;
      const poolName = `${cCode} / ${bCode}${(dupes.get(t.name) ?? 0) > 1 ? ` #${n}` : ""}`;
      const base = { protocol: "templar" as const, pool: t.id, poolName, status: null, minCollateralUsd: null, templar: t };
      out.push({
        ...base,
        key: `templar:${t.id}:${t.collateral.contract}`,
        templarSide: "collateral",
        code: cCode,
        contract: t.collateral.contract,
        issuer: cMeta?.issuer ?? null,
        decimals: cMeta?.decimals ?? t.collateral.decimals,
        supplyApy: null,
        borrowApy: null,
        suppliedUsd: t.collateralUsd,
        borrowedUsd: 0,
        availableUsd: 0,
        utilPct: null,
        ltvPct: t.maxLtvPct,
        canBorrow: false,
        canCollateral: true,
        priceUsd: t.collateral.priceUsd,
      });
      out.push({
        ...base,
        key: `templar:${t.id}:${t.borrow.contract}`,
        templarSide: "borrow",
        code: bCode,
        contract: t.borrow.contract,
        issuer: bMeta?.issuer ?? null,
        decimals: bMeta?.decimals ?? t.borrow.decimals,
        supplyApy: t.supplyApy,
        borrowApy: t.borrowApy,
        suppliedUsd: t.totalSupplyUsd,
        borrowedUsd: t.totalBorrowUsd,
        availableUsd: t.availableUsd,
        utilPct: t.utilizationPct,
        ltvPct: null,
        canBorrow: true,
        canCollateral: false,
        priceUsd: t.borrow.priceUsd,
      });
    }
    return out;
  }, [blend.value, xoxno.value, groups.value, byContract, tokens, templar.markets]);

  // XOXNO publishes a logo for every token it lists (its LP tokens have none elsewhere).
  useEffect(() => {
    const xs = xoxno.value?.assets;
    if (xs?.length) registerIcons(Object.fromEntries(xs.map((x) => [x.sac, x.logoUrl])));
  }, [xoxno.value]);

  // Per protocol too: a Blend list arriving first must not make an XOXNO page decide it doesn't exist.
  const state = (r: { value: unknown; loading: boolean; error: boolean }) => (r.value ? "ready" : r.loading || !r.error ? "loading" : "failed");
  return {
    markets,
    loading: (blend.loading || xoxno.loading) && markets.length === 0,
    status: {
      blend: state(blend),
      xoxno: state(xoxno),
      templar: templar.ready ? "ready" : templar.loading || !templar.error ? "loading" : "failed",
    } as Record<LendProtocol, "ready" | "loading" | "failed">,
  };
}

export type BlendPoolInfo = {
  claimableBlnd: number;
  healthFactor: number | null;
  borrowCapacityUsd: number;
  suppliedUsd: number;
  borrowedUsd: number;
  netApy: number | null;
  /** Health inputs: collateral x c_factor and debt / l_factor, in USD (absent from older API builds). */
  effCollateralUsd?: number;
  effDebtUsd?: number;
};

type PositionsResp = {
  ok?: boolean;
  claimable?: { blnd?: number; usd?: number | null };
  blendPools?: Record<string, BlendPoolInfo>;
  perProtocol?: { xoxno?: { healthFactor?: number | null } };
  legs?: {
    protocol: string;
    asset: string;
    code: string;
    pool?: string;
    suppliedUsd: number;
    borrowedUsd: number;
    supplyAmount?: number;
    borrowAmount?: number;
    lentAmount?: number;
    xoxno?: { accountId: string; spokeId: number; hubId: number };
  }[];
};

export type UserLeg = {
  wallet: string;
  protocol: LendProtocol;
  pool: string;
  contract: string;
  code: string;
  suppliedUsd: number;
  borrowedUsd: number;
  supplied: number;
  borrowed: number;
  /** Blend: part of the supply that is not collateral. */
  lent: number;
  xoxno?: { accountId: string; spokeId: number; hubId: number };
  /** Templar: the market's name and health, and whether Seidar lists it (else it opens in Templar's app). */
  templar?: { name: string; listed: boolean; appUrl: string; healthFactor: number | null; liquidationPrice: number | null; side: "supply" | "collateral" | "borrow" };
};

/**
 * Lending legs, per-pool Blend info and XOXNO health for `addresses` (shares the dashboard's
 * `lend:` cache entries, so nothing is fetched twice).
 */
export function useLendPositions(addresses: string[]) {
  const r = useSharedMany<PositionsResp | null>(
    addresses.map((a) => `lend:${a}`),
    (k) => () => apiJsonWarm<PositionsResp>(`/api/positions?address=${k.slice(5)}`),
    120_000,
  );
  const tp = useTemplarPositions(addresses);
  return useMemo(() => {
    const legs: UserLeg[] = [];
    const pools: Record<string, Record<string, BlendPoolInfo>> = {};
    const xoxnoHealth: Record<string, number | null> = {};
    let claimableBlnd = 0;
    for (const a of addresses) {
      const p = r.values[`lend:${a}`];
      if (!p?.ok) continue;
      claimableBlnd += Number(p.claimable?.blnd ?? 0);
      pools[a] = p.blendPools ?? {};
      xoxnoHealth[a] = p.perProtocol?.xoxno?.healthFactor ?? null;
      for (const g of p.legs ?? []) {
        legs.push({
          wallet: a,
          protocol: g.protocol as LendProtocol,
          pool: g.protocol === "xoxno" ? `xoxno-hub-${g.xoxno?.hubId ?? 1}` : (g.pool ?? ""),
          contract: g.asset,
          code: g.code,
          suppliedUsd: g.suppliedUsd,
          borrowedUsd: g.borrowedUsd,
          supplied: g.supplyAmount ?? 0,
          borrowed: g.borrowAmount ?? 0,
          lent: g.lentAmount ?? 0,
          xoxno: g.xoxno,
        });
      }
    }
    // Templar: the supplied asset, collateral and debt are each a leg (as Blend reports them).
    for (const a of addresses)
      for (const t of tp.values[`templar:pos:${a}`]?.positions ?? []) {
        const info = { name: t.name, listed: t.listed, appUrl: t.appUrl, healthFactor: t.borrow?.healthFactor ?? null, liquidationPrice: t.borrow?.liquidationPrice ?? null };
        const leg = (side: "supply" | "collateral" | "borrow", contract: string | null, code: string, usd: number, amount: number): UserLeg => ({
          wallet: a,
          protocol: "templar",
          pool: t.marketId,
          contract: contract ?? code,
          code,
          suppliedUsd: side === "borrow" ? 0 : usd,
          borrowedUsd: side === "borrow" ? usd : 0,
          supplied: side === "borrow" ? 0 : amount,
          borrowed: side === "borrow" ? amount : 0,
          lent: side === "supply" ? amount : 0,
          templar: { ...info, side },
        });
        if (t.supply) legs.push(leg("supply", t.supply.contract, t.supply.symbol, t.supply.usd, t.supply.amount));
        if (t.borrow && t.borrow.collateral.amount > 0)
          legs.push(leg("collateral", t.borrow.collateral.contract, t.borrow.collateral.symbol, t.borrow.collateral.usd, t.borrow.collateral.amount));
        if (t.borrow && t.borrow.amount > 0) legs.push(leg("borrow", t.borrow.contract, t.borrow.symbol, t.borrow.usd, t.borrow.amount));
      }
    return { legs, pools, xoxnoHealth, claimableBlnd, loading: r.loading || tp.loading, refreshing: r.refreshing || tp.refreshing };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses.join(","), r.values, r.loading, r.refreshing, tp.values, tp.loading, tp.refreshing]);
}

export const pct = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : `${v >= 1000 ? v.toFixed(0) : v.toFixed(digits)}%`;

export const compactUsd = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
};

/** A Blend pool or an XOXNO hub with every asset it lists. */
export type LendPool = {
  key: string;
  protocol: LendProtocol;
  pool: string;
  name: string;
  status: number | null;
  markets: Market[];
  suppliedUsd: number;
  borrowedUsd: number;
  availableUsd: number;
  collaterals: Market[];
  borrowables: Market[];
  bestSupplyApy: number | null;
};

/** Markets grouped by pool (Blend) / hub (XOXNO), largest first. */
export function groupPools(markets: Market[]): LendPool[] {
  const by = new Map<string, LendPool>();
  for (const m of markets) {
    const key = `${m.protocol}:${m.pool}`;
    let p = by.get(key);
    if (!p) {
      p = { key, protocol: m.protocol, pool: m.pool, name: m.poolName, status: m.status, markets: [], suppliedUsd: 0, borrowedUsd: 0, availableUsd: 0, collaterals: [], borrowables: [], bestSupplyApy: null };
      by.set(key, p);
    }
    p.markets.push(m);
    p.suppliedUsd += m.suppliedUsd;
    p.borrowedUsd += m.borrowedUsd;
    p.availableUsd += m.availableUsd;
    if (m.canCollateral) p.collaterals.push(m);
    if (m.canBorrow && m.borrowApy != null) p.borrowables.push(m);
    if (m.supplyApy != null && m.suppliedUsd >= 1_000) p.bestSupplyApy = Math.max(p.bestSupplyApy ?? 0, m.supplyApy);
    if (m.status != null) p.status = p.status == null ? m.status : Math.min(p.status, m.status);
  }
  for (const p of by.values()) {
    p.markets.sort((a, b) => b.suppliedUsd - a.suppliedUsd);
    p.collaterals.sort((a, b) => b.suppliedUsd - a.suppliedUsd);
    p.borrowables.sort((a, b) => b.suppliedUsd - a.suppliedUsd);
  }
  return [...by.values()].sort((a, b) => b.suppliedUsd - a.suppliedUsd);
}

/** BLND price (for emission APRs and reward values). */
export function useBlndPrice(): number | null {
  return (
    useShared<{ prices?: Record<string, number | null> } | null>("prices:BLND", () => apiJson("/api/prices?codes=BLND"), 300_000).value?.prices?.BLND ?? null
  );
}

/** BLND emissions as an APR (%) on top of the market's own rate, at the BLND and asset prices. */
export function blndApr(m: Pick<Market, "supplyBlnd" | "borrowBlnd" | "priceUsd">, side: "supply" | "borrow", blndPx: number | null): number | null {
  const per = side === "supply" ? m.supplyBlnd : m.borrowBlnd;
  if (!per || !blndPx || !m.priceUsd) return null;
  const v = ((per * blndPx) / m.priceUsd) * 100;
  return Number.isFinite(v) && v >= 0.005 ? v : null;
}

/** Link to a pool's page; `asset` and `mode` preselect the action card. */
export const poolHref = (p: { protocol: LendProtocol; pool: string }, opts: { asset?: string | null; mode?: LendAction; account?: string } = {}) =>
  `/earn/lending&borrow/view?protocol=${p.protocol}&pool=${encodeURIComponent(p.pool)}${opts.asset ? `&asset=${encodeURIComponent(opts.asset)}` : ""}${
    opts.mode ? `&mode=${opts.mode}` : ""
  }${opts.account ? `&account=${encodeURIComponent(opts.account)}` : ""}`;

/** Link to a market: its pool's page with that asset picked. */
export const marketHref = (m: Pick<Market, "protocol" | "pool" | "contract" | "code">, mode: LendAction = "supply", accountId?: string) =>
  poolHref(m, { asset: m.contract ?? m.code, mode, account: accountId });
