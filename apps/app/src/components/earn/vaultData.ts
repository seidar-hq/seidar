"use client";

import { apiJson } from "@/lib/api";
import { useShared } from "@/lib/useShared";

// Yield vaults: DeFindex (strategy vaults), Upshift (curated) and Sentora (incentivised deposits).

export type VaultListRow = {
  protocol: string;
  address: string;
  name: string;
  asset: string;
  assetCode: string;
  assetDecimals: number;
  tvlUsd: number;
  apyPct: number | null;
  apySource?: string | null;
  curator?: string;
  withdrawalDays?: number | null;
  paused?: boolean;
  sharePrice?: number | null;
};

export type VaultDetailInfo = {
  protocol: string;
  address: string;
  name: string;
  symbol?: string;
  assets?: { address: string; code: string; strategies?: { address: string; name: string; paused: boolean }[] }[];
  feesBps?: Record<string, number>;
  sharePrice?: number | null;
  tvlUsd?: number;
  apyPct?: number | null;
  ownApy7d?: number | null;
  ownApy30d?: number | null;
  depositors?: number | null;
  manager?: string | null;
  history?: { t: number; pps: number }[];
};

export const VAULT_PROTOCOLS: Record<string, { name: string; logo: string; about: string }> = {
  defindex: {
    name: "DeFindex",
    logo: "/protocols/defindex.svg",
    about:
      "DeFindex vaults pool deposits and allocate them across Stellar yield strategies (lending markets, liquidity). You hold vault shares; their value grows as the strategies earn.",
  },
  upshift: {
    name: "Upshift",
    logo: "/protocols/upshift.png",
    about:
      "Upshift vaults are institutionally curated: the curator allocates deposits across Stellar lending protocols such as Blend. Withdrawals may go through a request queue.",
  },
  sentora: {
    name: "Sentora",
    logo: "/protocols/sentora.png",
    about:
      "Sentora (formerly IntoTheBlock) runs incentivized deposit vaults through Stellar DeFi Hub. Your principal stays in the vault contract and can be withdrawn at any time; the quoted APY is paid as rewards by the curator.",
  },
};

export const vaultProtocol = (id: string) => VAULT_PROTOCOLS[id] ?? { name: id, logo: "", about: "" };

export function useVaultList() {
  const { value, loading } = useShared<{ rows?: VaultListRow[] } | null>("vaults:list", () => apiJson("/api/vaults", undefined, 180_000), 300_000);
  return { rows: value?.rows ?? [], loading: loading && !value };
}

export const apyText = (r: Pick<VaultListRow, "apyPct">) => (r.apyPct == null ? "—" : `${r.apyPct.toFixed(2)}%`);

export const vaultHref = (address: string, mode: "deposit" | "withdraw" = "deposit") => `/earn/vaults/view?address=${address}&mode=${mode}`;

export const withdrawalText = (r: Pick<VaultListRow, "withdrawalDays">) => (r.withdrawalDays ? `${r.withdrawalDays}-day queue` : "Instant");
