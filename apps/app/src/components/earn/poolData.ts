"use client";

import { useMemo } from "react";
import { apiJson } from "@/lib/api";
import { useSharedMany } from "@/lib/useShared";
import { useTokenCatalogue } from "@/portfolio/usePortfolio";

// DEX pools across Soroswap, Aquarius, Phoenix and Sushi, with token issuers resolved.

export const POOL_VENUES = [
  { id: "soroswap", name: "Soroswap", logo: "/protocols/soroswap.png", site: "https://app.soroswap.finance" },
  { id: "aqua", name: "Aquarius", logo: "/protocols/aqua.png", site: "https://aqua.network/pools" },
  { id: "phoenix", name: "Phoenix", logo: "/protocols/phoenix.png", site: "https://app.phoenix-hub.io" },
  { id: "sushi", name: "SushiSwap", logo: "/protocols/sushi.png", site: "https://www.sushi.com/stellar" },
] as const;
export type PoolVenue = (typeof POOL_VENUES)[number]["id"];
export const venueMeta = (id: string) => POOL_VENUES.find((v) => v.id === id) ?? { id, name: id, logo: "", site: "" };

export type PoolRow = {
  protocol: PoolVenue;
  address: string;
  pair: string;
  assets: { contract: string; code: string }[];
  poolType: string;
  feeBps: number | null;
  tvlUsd: number | null;
  reserves?: { code: string; amount: number; decimals: number }[];
  apyPct?: number | null;
  feeApyPct?: number | null;
  rewardsApyPct?: number | null;
  volume24hUsd?: number | null;
  volume7dUsd?: number | null;
  trades7d?: number | null;
};

export type PoolLeg = { contract: string; code: string; issuer: string | null; decimals: number };
export type Pool = PoolRow & { key: string; legs: PoolLeg[] };

/** Concentrated pools take a price range instead of pool shares. */
export const isConcentrated = (p: Pick<PoolRow, "poolType" | "protocol">) => p.poolType === "concentrated" || p.protocol === "sushi";

export const poolTypeLabel = (t: string) =>
  t === "concentrated" ? "Concentrated" : t === "stable" ? "Stable" : t === "xyk" || t === "constant_product" ? "Constant product" : t;

export function usePools() {
  const { byContract } = useTokenCatalogue();
  const { values, loading } = useSharedMany<{ rows?: PoolRow[] } | null>(
    POOL_VENUES.map((v) => `dexpools:${v.id}`),
    (k) => () => apiJson(`/api/dex/pools?protocol=${k.split(":")[1]}`, undefined, 240_000),
    300_000,
  );
  const pools = useMemo<Pool[]>(() => {
    const out: Pool[] = [];
    for (const v of POOL_VENUES)
      for (const r of values[`dexpools:${v.id}`]?.rows ?? []) {
        out.push({
          ...r,
          protocol: v.id,
          key: `${v.id}:${r.address}`,
          legs: r.assets.map((a) => {
            const m = byContract.get(a.contract);
            return { contract: a.contract, code: m?.code ?? a.code, issuer: m?.issuer ?? null, decimals: m?.decimals ?? 7 };
          }),
        });
      }
    return out;
  }, [values, byContract]);
  /** Venues whose board hasn't arrived yet. */
  const pending = new Set(POOL_VENUES.filter((v) => values[`dexpools:${v.id}`] == null).map((v) => v.id as string));
  return { pools, loading: loading && pools.length === 0, pending };
}

export const poolHref = (p: Pick<PoolRow, "protocol" | "address">, tab = "supply") => `/earn/pools/view?protocol=${p.protocol}&pool=${p.address}&tab=${tab}`;

export const feeText = (bps: number | null | undefined) => (bps == null ? "—" : `${(bps / 100).toFixed(bps % 100 === 0 ? 2 : bps < 10 ? 3 : 2)}%`);
