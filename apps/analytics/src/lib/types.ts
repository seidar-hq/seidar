// Shape of GET /analytics/summary (services/api/src/analytics.ts).

export type Totals = {
  volumeUsd: number;
  txs: number;
  transactingWallets: number;
  wallets: number;
  active1d: number;
  active7d: number;
  active30d: number;
};

export type DailyPoint = {
  day: string;
  txs: number;
  volumeUsd: number;
  transactingWallets: number;
  newWallets: number;
  activeWallets: number;
  totalWallets: number;
};

export type Coverage = {
  lendPools: number | null;
  lendMarkets: number | null;
  lendTvlUsd: number | null;
  dexPools: number | null;
  dexTvlUsd: number | null;
  vaults: number | null;
  vaultTvlUsd: number | null;
  perpsMarkets: number | null;
};

export type RecentTx = { hash: string; kind: string; protocol: string; volumeUsd: number; at: string };

export type Summary = {
  generatedAt: string;
  since: string | null;
  totals: Totals;
  byKind: { kind: string; txs: number; volumeUsd: number }[];
  byProtocol: { protocol: string; txs: number; volumeUsd: number }[];
  daily: DailyPoint[];
  recent: RecentTx[];
  coverage: Coverage;
  windows: Record<WindowId, WindowStats>;
  hourly: { hour: string; txs: number; volumeUsd: number; transactingWallets: number }[];
};

export type WindowId = "all" | "30d" | "7d" | "24h";

export type WindowStats = {
  volumeUsd: number;
  txs: number;
  transactingWallets: number;
  newWallets: number;
  activeWallets: number;
  byKind: { kind: string; txs: number; volumeUsd: number }[];
  byProtocol: { protocol: string; txs: number; volumeUsd: number }[];
};
