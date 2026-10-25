"use client";

import { useMemo } from "react";
import { apiJson, apiJsonWarm } from "@/lib/api";
import { useShared, useSharedMany } from "@/lib/useShared";
import { useBalances, type TokenBalance } from "@/wallet/useBalances";
import { useWallet } from "@/wallet/WalletContext";

// Everything the dashboard shows for the selected portfolio (all wallets or one):
//   assets    = tokens sitting in the wallets
//   positions = capital deployed in protocols: lending supply, LP liquidity and vault shares,
//               minus what is borrowed against it.

export type AssetKey = string; // "native" | "CODE:ISSUER" | "CODE" (Soroban-only token)

export type SupplyRow = {
  kind: "lend" | "lp";
  protocol: string;
  label: string;
  code: string;
  issuer: string | null;
  pool: string;
  amount: number | null;
  usd: number;
  apy: number | null;
  wallet: string;
  /** LP only: both legs of the pool, and the LP share balance (base units). */
  legs?: { code: string; issuer: string | null; amount: number }[];
  shares?: string;
};

export type BorrowRow = {
  protocol: string;
  code: string;
  issuer: string | null;
  pool: string;
  amount: number | null;
  usd: number;
  wallet: string;
};

export type VaultRow = {
  protocol: string;
  vault: string;
  name: string;
  /** Share balance (base units); principal for Sentora. */
  shares: string;
  usd: number;
  underlying: { code: string; issuer: string | null; amount: number }[];
  wallet: string;
};

/** Net exposure per asset, split by where it sits (used for charts and performance). */
export type Exposure = { key: AssetKey; code: string; issuer: string | null; assets: number; positions: number; price: number };

type LendingResp = {
  ok?: boolean;
  totalSupplied?: number;
  totalBorrowed?: number;
  claimable?: { blnd?: number; usd?: number | null };
  perProtocol?: Record<string, { netApy?: number; healthFactor?: number | null }>;
  legs?: {
    protocol: string;
    asset: string;
    code: string;
    pool?: string;
    suppliedUsd: number;
    borrowedUsd: number;
    supplyAmount?: number;
    borrowAmount?: number;
  }[];
};

type VaultResp = {
  positions?: {
    protocol: string;
    vault: string;
    name: string;
    shares?: string;
    valueUsd: number | null;
    underlying: { asset?: string; code: string; amount: string }[];
  }[];
};

type LpResp = {
  ok?: boolean;
  positions?: {
    protocol: string;
    pool: string;
    pair: string;
    valueUsd: number | null;
    underlying: { contract: string; code: string; amount: number }[];
    shares?: string;
    rewards?: { code: string; amount: number; usd: number | null } | null;
  }[];
};

type TokenList = { tokens?: { code: string; contract: string; issuer: string | null; decimals?: number; name?: string | null }[] };

const POSITIONS_TTL = 120_000;

export const assetKey = (code: string, issuer: string | null): AssetKey =>
  !issuer && code.toUpperCase() === "XLM" ? "native" : issuer ? `${code}:${issuer}` : code.toUpperCase();

/** Soroban contract -> classic code/issuer, from the swap token catalogue (loaded once). */
export function useTokenCatalogue() {
  const { value } = useShared<TokenList | null>("tokens", () => apiJson<TokenList>("/api/swap/tokens"), 3_600_000);
  return useMemo(() => {
    const byContract = new Map<string, { code: string; issuer: string | null; decimals: number }>();
    for (const t of value?.tokens ?? []) byContract.set(t.contract, { code: t.code, issuer: t.issuer, decimals: t.decimals ?? 7 });
    return { byContract, tokens: value?.tokens ?? [] };
  }, [value]);
}

/** Assets and positions for `addresses` (default: the wallets the current portfolio view covers). */
export function usePortfolio(addresses?: string[]) {
  const ctx = useWallet();
  const portfolioAddresses = addresses ?? ctx.portfolioAddresses;
  const balances = useBalances(portfolioAddresses);
  const { byContract } = useTokenCatalogue();

  const lending = useSharedMany<LendingResp | null>(
    portfolioAddresses.map((a) => `lend:${a}`),
    (k) => () => apiJsonWarm<LendingResp>(`/api/positions?address=${k.slice(5)}`),
    POSITIONS_TTL,
  );
  const vaults = useSharedMany<VaultResp | null>(
    portfolioAddresses.map((a) => `vaults:${a}`),
    (k) => () => apiJsonWarm<VaultResp>(`/api/vaults/positions?address=${k.slice(7)}`),
    POSITIONS_TTL,
  );
  const lps = useSharedMany<LpResp | null>(
    portfolioAddresses.map((a) => `lp:${a}`),
    (k) => () => apiJsonWarm<LpResp>(`/api/dex/positions?address=${k.slice(3)}`),
    POSITIONS_TTL,
  );

  const resolve = (contract: string | undefined, code: string) => {
    const hit = contract ? byContract.get(contract) : undefined;
    return { code: hit?.code ?? code, issuer: hit?.issuer ?? null, decimals: hit?.decimals ?? 7 };
  };

  const derived = useMemo(() => {
    const supplied: SupplyRow[] = [];
    const borrowed: BorrowRow[] = [];
    const vaultRows: VaultRow[] = [];
    let rewardsUsd = 0;
    let claimableBlnd = 0;
    const apyByWallet: Record<string, number | null> = {};
    let healthFactor: number | null = null;

    for (const wallet of portfolioAddresses) {
      const l = lending.values[`lend:${wallet}`];
      if (l?.ok) {
        claimableBlnd += Number(l.claimable?.blnd ?? 0);
        if (l.claimable?.usd) rewardsUsd += Number(l.claimable.usd);
        apyByWallet[wallet] = l.perProtocol?.blend?.netApy ?? null;
        const hf = l.perProtocol?.blend?.healthFactor;
        if (hf != null) healthFactor = healthFactor == null ? hf : Math.min(healthFactor, hf);
        for (const g of l.legs ?? []) {
          const t = resolve(g.asset, g.code);
          if (g.suppliedUsd > 0)
            supplied.push({
              kind: "lend",
              protocol: g.protocol,
              label: g.protocol === "blend" ? "Blend" : "XOXNO",
              code: t.code,
              issuer: t.issuer,
              pool: g.pool ?? "",
              amount: g.supplyAmount ?? null,
              usd: g.suppliedUsd,
              apy: null,
              wallet,
            });
          if (g.borrowedUsd > 0)
            borrowed.push({
              protocol: g.protocol,
              code: t.code,
              issuer: t.issuer,
              pool: g.pool ?? "",
              amount: g.borrowAmount ?? null,
              usd: g.borrowedUsd,
              wallet,
            });
        }
      }
      for (const p of lps.values[`lp:${wallet}`]?.positions ?? []) {
        if (p.rewards?.usd) rewardsUsd += p.rewards.usd;
        const legs = p.underlying.map((u) => ({ ...resolve(u.contract, u.code), amount: u.amount }));
        supplied.push({
          kind: "lp",
          protocol: p.protocol,
          label: p.protocol.charAt(0).toUpperCase() + p.protocol.slice(1),
          code: p.pair,
          issuer: null,
          pool: p.pool,
          amount: null,
          usd: p.valueUsd ?? 0,
          apy: null,
          wallet,
          legs: legs.map(({ code, issuer, amount }) => ({ code, issuer, amount })),
          shares: p.shares,
        });
      }
      for (const v of vaults.values[`vaults:${wallet}`]?.positions ?? []) {
        vaultRows.push({
          protocol: v.protocol,
          vault: v.vault,
          name: v.name,
          shares: v.shares ?? "0",
          usd: v.valueUsd ?? 0,
          underlying: v.underlying.map((u) => {
            const t = resolve(u.asset, u.code);
            return { code: t.code, issuer: t.issuer, amount: Number(u.amount) / 10 ** t.decimals };
          }),
          wallet,
        });
      }
    }
    supplied.sort((a, b) => b.usd - a.usd);
    borrowed.sort((a, b) => b.usd - a.usd);
    vaultRows.sort((a, b) => b.usd - a.usd);
    return { supplied, borrowed, vaultRows, rewardsUsd, claimableBlnd, apyByWallet, healthFactor };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioAddresses.join(","), lending.values, vaults.values, lps.values, byContract]);

  // BLND emissions are reported in tokens; price them with the wallet price feed when we can.
  const blndPrice = balances.tokens.find((t) => t.code === "BLND")?.price ?? null;
  const rewardsUsd = derived.rewardsUsd + (blndPrice ? derived.claimableBlnd * blndPrice : 0);

  const assetsUsd = balances.totalUsd;
  const suppliedUsd = derived.supplied.reduce((s, r) => s + r.usd, 0);
  const vaultsUsd = derived.vaultRows.reduce((s, r) => s + r.usd, 0);
  const borrowedUsd = derived.borrowed.reduce((s, r) => s + r.usd, 0);
  const positionsUsd = suppliedUsd + vaultsUsd - borrowedUsd;

  // Net exposure per asset: what moves the portfolio when that asset's price moves.
  const rawExposures = useMemo(() => {
    const m = new Map<AssetKey, Exposure>();
    const add = (code: string, issuer: string | null, field: "assets" | "positions", amount: number, price: number) => {
      const key = assetKey(code, issuer);
      const e = m.get(key) ?? { key, code, issuer, assets: 0, positions: 0, price };
      e[field] += amount;
      if (!e.price && price) e.price = price;
      m.set(key, e);
    };
    const px = (t: TokenBalance) => t.price ?? 0;
    for (const t of balances.tokens) if (t.listed) add(t.code, t.issuer, "assets", t.amount, px(t));
    for (const r of derived.supplied) {
      if (r.kind === "lend" && r.amount) add(r.code, r.issuer, "positions", r.amount, r.usd / r.amount);
      for (const leg of r.legs ?? []) add(leg.code, leg.issuer, "positions", leg.amount, 0);
    }
    for (const r of derived.borrowed) if (r.amount) add(r.code, r.issuer, "positions", -r.amount, r.usd / r.amount);
    for (const v of derived.vaultRows) for (const u of v.underlying) add(u.code, u.issuer, "positions", u.amount, 0);
    return [...m.values()];
  }, [balances.tokens, derived]);

  // LP and vault legs arrive without a price: fill them from the API price feed (by code).
  const missing = rawExposures.filter((e) => !e.price).map((e) => e.code.toUpperCase());
  const priceKey = missing.length ? `prices:${[...new Set(missing)].sort().join(",")}` : null;
  const { value: fill } = useShared<{ prices?: Record<string, number | null> } | null>(
    priceKey,
    () => apiJson(`/api/prices?codes=${encodeURIComponent([...new Set(missing)].join(","))}`),
    POSITIONS_TTL,
  );
  const exposures = useMemo(
    () => rawExposures.map((e) => (e.price ? e : { ...e, price: fill?.prices?.[e.code.toUpperCase()] ?? 0 })),
    [rawExposures, fill],
  );

  const lendingLoading = lending.loading;
  const positionsLoading = lending.loading || vaults.loading || lps.loading;

  return {
    addresses: portfolioAddresses,
    assets: balances.tokens,
    assetsLoading: balances.loading,
    supplied: derived.supplied,
    borrowed: derived.borrowed,
    vaults: derived.vaultRows,
    exposures,
    totals: {
      assetsUsd,
      suppliedUsd,
      vaultsUsd,
      borrowedUsd,
      positionsUsd,
      totalUsd: assetsUsd + positionsUsd,
      utilisedUsd: suppliedUsd + vaultsUsd,
      rewardsUsd,
      claimableBlnd: derived.claimableBlnd,
    },
    healthFactor: derived.healthFactor,
    lendingLoading,
    positionsLoading,
    vaultsLoading: vaults.loading,
    lpLoading: lps.loading,
  };
}

export type Portfolio = ReturnType<typeof usePortfolio>;
