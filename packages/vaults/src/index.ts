// @seidar/vaults — shared Earn vault math: row normalization, APY from
// share-price history, filtering/sorting/pagination, alert diffing.
// Pure (no IO): the app fetches, the keeper evaluates, both reuse this.

export type VaultProtocol = "defindex" | "upshift" | "untangled" | "sentora";

export interface VaultFunds {
  asset: string;
  totalAmount: string;
  idleAmount?: string;
  investedAmount?: string;
}

export interface VaultStrategy {
  address: string;
  name: string;
  paused: boolean;
  amount?: string;
}

export interface VaultRow {
  protocol: VaultProtocol;
  address: string;
  name: string;
  symbol: string;
  asset: string;
  assetCode: string;
  assetDecimals: number;
  tvlUsd: number;
  apyPct: number | null;
  /** Where apyPct came from: our own snapshots vs advertised upstream. */
  apySource: "snapshot" | "advertised" | null;
  liquidityUsd: number | null;
  curator?: string;
  withdrawalDays?: number | null;
  updatedAt: number;
  /** Every funded asset leg (multi-asset vaults list more than one). */
  legs?: {
    asset: string;
    code: string;
    decimals: number;
    totalBase: string;
    tvlUsd: number | null;
    priceUsd: number | null;
  }[];
  /** Performance fee on yield + protocol share, both in bps. */
  feeSplitBps?: { vaultFee: number; protocolFee: number } | null;
  /** Underlying per whole share (single-asset vaults). */
  sharePrice?: number | null;
}

export interface VaultDetail extends VaultRow {
  assets: {
    address: string;
    code: string;
    strategies: VaultStrategy[];
  }[];
  feesBps: {
    vaultFee: number;
    platformFee?: number;
    performanceFee?: number;
  };
  sharePrice: number | null;
  totalSupply: string | null;
  depositors?: number | null;
  appUrl: string;
}

export interface PpsPoint {
  t: number;
  pps: number;
}

/**
 * Annualize a share-price move as APY percent.
 * Null on any non-positive/degenerate input (never invent yield).
 */
export function annualizePps(
  ppsStart: number,
  ppsEnd: number,
  daysElapsed: number,
): number | null {
  if (
    !(ppsStart > 0) ||
    !(ppsEnd > 0) ||
    !(daysElapsed > 0) ||
    !Number.isFinite(ppsStart) ||
    !Number.isFinite(ppsEnd) ||
    !Number.isFinite(daysElapsed)
  )
    return null;
  const growth = ppsEnd / ppsStart;
  if (!(growth > 0) || !Number.isFinite(growth)) return null;
  const apy = (Math.pow(growth, 365 / daysElapsed) - 1) * 100;
  return Number.isFinite(apy) ? apy : null;
}

/**
 * APY over the trailing `days` from a PPS series (ascending time).
 * Uses the earliest point at/after the window start and the latest point.
 */
export function apyFromSeries(
  points: PpsPoint[],
  days: number,
  now = Date.now(),
): number | null {
  if (!Array.isArray(points) || points.length < 2 || !(days > 0)) return null;
  const start = now - days * 86400_000;
  const inWindow = points.filter(
    (p) =>
      Number.isFinite(p?.t) &&
      Number.isFinite(p?.pps) &&
      (p.t as number) >= start &&
      (p.t as number) <= now,
  );
  if (inWindow.length < 2) return null;
  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const elapsedDays = ((last.t as number) - (first.t as number)) / 86400_000;
  // Need a meaningful window (at least a day) to annualize responsibly.
  if (!(elapsedDays >= 1)) return null;
  return annualizePps(first.pps as number, last.pps as number, elapsedDays);
}

export interface Page<T> {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  rows: T[];
}

/** 1-based pagination with clamped bounds (never empty-crash). */
export function paginate<T>(rows: T[], page: number, perPage: number): Page<T> {
  const list = Array.isArray(rows) ? rows : [];
  const pp =
    Number.isInteger(perPage) && perPage > 0
      ? Math.min(perPage, 100)
      : 20;
  const totalPages = Math.max(1, Math.ceil(list.length / pp));
  const pg =
    Number.isInteger(page) && page > 0 ? Math.min(page, totalPages) : 1;
  const start = (pg - 1) * pp;
  return {
    page: pg,
    perPage: pp,
    total: list.length,
    totalPages,
    rows: list.slice(start, start + pp),
  };
}

export interface VaultFilter {
  protocols?: VaultProtocol[];
  tokens?: string[];
  minTvlUsd?: number;
  hideZeroApy?: boolean;
}

export function filterVaults(rows: VaultRow[], f: VaultFilter): VaultRow[] {
  const list = Array.isArray(rows) ? rows : [];
  const protos = new Set((f.protocols ?? []).map((p) => p.toLowerCase()));
  const toks = new Set((f.tokens ?? []).map((t) => t.toUpperCase()));
  return list.filter((r) => {
    if (protos.size > 0 && !protos.has(r.protocol.toLowerCase())) return false;
    if (toks.size > 0 && !toks.has(r.assetCode.toUpperCase())) return false;
    if (typeof f.minTvlUsd === "number" && r.tvlUsd < f.minTvlUsd)
      return false;
    if (f.hideZeroApy && !(r.apyPct != null && r.apyPct > 0)) return false;
    return true;
  });
}

export type VaultSortKey = "apy" | "tvl" | "liquidity" | "name" | "protocol" | "token";
export type SortDir = "asc" | "desc";

function sortVal(r: VaultRow, key: VaultSortKey): number | string | null {
  if (key === "apy") return r.apyPct;
  if (key === "tvl") return r.tvlUsd;
  if (key === "liquidity") return r.liquidityUsd;
  if (key === "protocol") return `${r.protocol}/${r.name}`;
  if (key === "token") return r.assetCode;
  return r.name;
}

/** Sort rows; null metrics always sink to the bottom regardless of dir. */
export function sortVaults(
  rows: VaultRow[],
  key: VaultSortKey,
  dir: SortDir = "desc",
): VaultRow[] {
  const list = [...(Array.isArray(rows) ? rows : [])];
  const mul = dir === "asc" ? 1 : -1;
  list.sort((a, b) => {
    const va = sortVal(a, key);
    const vb = sortVal(b, key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string" || typeof vb === "string")
      return mul * String(va).localeCompare(String(vb));
    return mul * (va - vb);
  });
  return list;
}

/** True when APY fell by at least `thresholdPp` points (both known). */export function apyDropAlert(
  prev: number | null,
  cur: number | null,
  thresholdPp: number,
): boolean {
  if (prev == null || cur == null) return false;
  if (!Number.isFinite(prev) || !Number.isFinite(cur)) return false;
  if (!(thresholdPp > 0)) return false;
  return prev - cur >= thresholdPp;
}

export interface DiscoverVault {
  address?: unknown;
  totalManagedFunds?: { asset?: unknown; total_amount?: unknown }[];
  apy?: unknown;
}

function num(v: unknown): number | null {
  const n =
    typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Base-unit integer string -> whole tokens (float, display only). */
export function baseToTokens(base: string, decimals: number): number {
  const n = num(base);
  if (n == null || !(decimals >= 0)) return 0;
  return n / 10 ** decimals;
}

/**
 * Normalize DeFindex /vault/discover entries into rows.
 * codeOf maps underlying contract -> CODE, priceOf maps CODE -> USD.
 * Unknown assets keep contract suffix as code with price 0 (never fake TVL).
 */
export function normalizeDefindex(
  vaults: DiscoverVault[],
  codeOf: (contract: string) => string | null,
  priceOf: (code: string) => number | null,
  decimalsOf: (code: string) => number,
  now = Date.now(),
): VaultRow[] {
  const out: VaultRow[] = [];
  for (const v of Array.isArray(vaults) ? vaults : []) {
    const address = typeof v?.address === "string" ? v.address : "";
    if (!/^C[A-Z2-7]{55}$/.test(address)) continue;
    const funds = Array.isArray(v?.totalManagedFunds)
      ? v.totalManagedFunds
      : [];
    // Primary leg = largest managed position (multi-asset vaults).
    let asset = "";
    let amountBase = "0";
    for (const f of funds) {
      const a = typeof f?.asset === "string" ? f.asset : "";
      const amt = typeof f?.total_amount === "string" ? f.total_amount : "0";
      if (!/^C[A-Z2-7]{55}$/.test(a)) continue;
      try {
        if (BigInt(amt) > BigInt(amountBase)) {
          asset = a;
          amountBase = amt;
        }
      } catch {
        /* skip malformed */
      }
    }
    if (!asset) continue;
    const code = codeOf(asset) ?? `UNKNOWN-${asset.slice(0, 4)}`;
    const dec = decimalsOf(code);
    const px = priceOf(code) ?? 0;
    const apy = num(v?.apy);
    out.push({
      protocol: "defindex",
      address,
      name: address.slice(0, 4) + "…" + address.slice(-4),
      symbol: "",
      asset,
      assetCode: code,
      assetDecimals: dec,
      tvlUsd: baseToTokens(amountBase, dec) * px,
      apyPct: apy != null && apy >= 0 ? apy : null,
      apySource: apy != null && apy >= 0 ? "advertised" : null,
      liquidityUsd: null,
      updatedAt: now,
    });
  }
  return out;
}

/**
 * Display name: "DeFindex-Vault-Neko EURC" -> "Neko EURC".
 * Only the exact factory prefix is stripped; everything else untouched.
 */
export function shortVaultName(name: string): string {
  if (typeof name !== "string") return "";
  const prefix = "DeFindex-Vault-";
  if (name.startsWith(prefix) && name.length > prefix.length)
    return name.slice(prefix.length);
  return name;
}

/**
 * Pick the vault address out of tx-meta-created contracts: first
 * well-formed contract that is not in the exclusion set (factory,
 * router, known strategies/tokens). Null when nothing qualifies.
 */
export function pickVaultCandidate(
  created: string[],
  exclude: string[],
): string | null {
  const ex = new Set(
    (Array.isArray(exclude) ? exclude : []).map((a) => a.toUpperCase()),
  );
  for (const a of Array.isArray(created) ? created : []) {
    if (typeof a !== "string") continue;
    if (!/^C[A-Z2-7]{55}$/.test(a)) continue;
    if (ex.has(a.toUpperCase())) continue;
    return a;
  }
  return null;
}

/**
 * Vault contract addresses out of a StellarExpert asset-search payload
 * (dfTokens carry the vault name, and for DeFindex the token contract IS
 * the vault). Deduped, well-formed only.
 */
export function extractExplorerVaults(json: unknown): string[] {
  const out = new Set<string>();
  try {
    const recs = (json as { _embedded?: { records?: unknown[] } })?._embedded
      ?.records;
    if (!Array.isArray(recs)) return [];
    for (const r of recs) {
      const c = (r as { contract?: unknown })?.contract;
      if (typeof c === "string" && /^C[A-Z2-7]{55}$/.test(c)) out.add(c);
    }
  } catch {
    /* malformed */
  }
  return [...out];
}
