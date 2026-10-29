"use client";

import { useMemo } from "react";
import { apiJson, apiJsonWarm } from "@/lib/api";
import { useShared, useSharedMany } from "@/lib/useShared";
import { useTokenCatalogue } from "@/portfolio/usePortfolio";

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

export type LendProtocol = "blend" | "xoxno";

export type Market = {
  key: string;
  protocol: LendProtocol;
  /** Blend pool contract, or "xoxno-hub-N". */
  pool: string;
  poolName: string;
  /** Blend pool status (0-1 active, 2-3 on ice, 4-5 frozen, 6 setup); null for XOXNO. */
  status: number | null;
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
  xoxno?: XoxnoMarket;
};

export const LEND_PROTOCOLS: Record<LendProtocol, { name: string; logo: string; site: string }> = {
  blend: { name: "Blend", logo: "/protocols/blend.png", site: "https://mainnet.blend.capital" },
  xoxno: { name: "XOXNO", logo: "/protocols/xoxno.png", site: "https://xoxno.com/lending" },
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

/** leverage: XOXNO only (one-transaction loop, see leverage.tsx). */
export type LendAction = "supply" | "borrow" | "withdraw" | "repay" | "leverage";

/** Why an action is unavailable on this market (null when allowed). */
export function actionBlock(m: Market, a: LendAction): string | null {
  if (!m.contract) return "Market unavailable";
  if (a === "leverage") return m.protocol === "xoxno" ? (m.canCollateral ? null : "This asset can't be collateral") : "Leverage is available on XOXNO markets";
  const s = m.status;
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
        priceUsd: null,
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
    return out;
  }, [blend.value, xoxno.value, groups.value, byContract, tokens]);

  return { markets, loading: (blend.loading || xoxno.loading) && markets.length === 0 };
}

export type BlendPoolInfo = {
  claimableBlnd: number;
  healthFactor: number | null;
  borrowCapacityUsd: number;
  suppliedUsd: number;
  borrowedUsd: number;
  netApy: number | null;
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
    return { legs, pools, xoxnoHealth, claimableBlnd, loading: r.loading };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses.join(","), r.values, r.loading]);
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

/** Link to a market's page (Supply / Borrow / Withdraw / Repay / Leverage live there). */
export const marketHref = (m: Pick<Market, "protocol" | "pool" | "contract" | "code">, mode: LendAction = "supply", accountId?: string) =>
  `/earn/lending&borrow/view?protocol=${m.protocol}&pool=${encodeURIComponent(m.pool)}&asset=${encodeURIComponent(m.contract ?? m.code)}&mode=${mode}${
    accountId ? `&account=${encodeURIComponent(accountId)}` : ""
  }`;
