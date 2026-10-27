// Public traction metrics (analytics.seidar.xyz). Only what Seidar itself observed is counted:
// - Transactions: recorded when this API submits a user-signed transaction (/tx/send) and the
//   ledger returns SUCCESS. Every row is an on-chain hash anyone can look up on an explorer.
//   Kind/protocol are the app's label for the action; unknown labels fall back to "other".
// - Value: USD of the signer's own balance changes in that transaction (Horizon effects, the
//   larger of what left and what arrived), priced when recorded. Unpriced assets count as $0.
// - Wallets: SHA-256 of the address (never stored in clear). A wallet counts once it exists
//   on-chain; active = seen that day (connected or transacted).

import { cacheGet, KEYS, runInBackground, withCache } from "@seidar/cache";
import { ensureSchema, getPool } from "./db.js";
import { horizonUrl, isTestnet } from "./net.js";
import { livePrices } from "./prices.js";

export const TX_KINDS = ["swap", "send", "trustline", "lending", "claim", "liquidity", "vault", "perps"] as const;
export const TX_PROTOCOLS = ["soroswap", "aquarius", "phoenix", "sushi", "blend", "xoxno", "defindex", "upshift", "sentora", "zenex", "stellar"] as const;
type Kind = (typeof TX_KINDS)[number] | "other";
type Protocol = (typeof TX_PROTOCOLS)[number] | "other";

export type TxMeta = { kind?: unknown; protocol?: unknown };

const G = /^G[A-Z2-7]{55}$/;
const DAY_MS = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);
const dayAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);

function kindOf(v: unknown): Kind {
  return (TX_KINDS as readonly string[]).includes(String(v)) ? (v as Kind) : "other";
}
function protocolOf(v: unknown): Protocol {
  const p = String(v ?? "").toLowerCase();
  const norm = p === "aqua" ? "aquarius" : p;
  return (TX_PROTOCOLS as readonly string[]).includes(norm) ? (norm as Protocol) : "other";
}

async function hashAddress(address: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`seidar:${address}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** USD moved by `account` in transaction `hash`, from Horizon's balance-change effects. */
async function valueOf(hash: string, account: string): Promise<number | null> {
  type Effect = { type: string; account?: string; amount?: string; asset_type?: string; asset_code?: string };
  let effects: Effect[] | null = null;
  // Horizon can trail the RPC by a few seconds.
  for (let i = 0; i < 4 && !effects; i++) {
    if (i) await sleep(2500);
    const r = await fetch(`${horizonUrl()}/transactions/${hash}/effects?limit=100`).catch(() => null);
    if (r?.ok) effects = ((await r.json()) as { _embedded?: { records?: Effect[] } })._embedded?.records ?? [];
  }
  if (!effects) return null;
  const out = new Map<string, number>();
  const into = new Map<string, number>();
  for (const e of effects) {
    if (e.account !== account || !e.amount) continue;
    const code = e.asset_type === "native" ? "XLM" : (e.asset_code ?? "").toUpperCase();
    if (!code) continue;
    const m = e.type === "account_debited" ? out : e.type === "account_credited" ? into : null;
    m?.set(code, (m.get(code) ?? 0) + Number(e.amount));
  }
  const codes = [...new Set([...out.keys(), ...into.keys()])];
  if (!codes.length) return 0;
  const { prices } = await livePrices(codes);
  const usd = (m: Map<string, number>) => [...m].reduce((s, [c, n]) => s + n * (prices[c] ?? 0), 0);
  return Math.max(usd(out), usd(into));
}

async function touchWallet(hash: string, day: string): Promise<void> {
  const db = getPool();
  await db.query(
    "INSERT INTO analytics_wallets (hash, first_day, last_day) VALUES ($1, $2, $2) ON CONFLICT (hash) DO UPDATE SET last_day = excluded.last_day",
    [hash, day],
  );
  await db.query("INSERT INTO analytics_active (day, hash) VALUES ($1, $2) ON CONFLICT (day, hash) DO NOTHING", [day, hash]);
}

/** Called after a successful submission; runs in the background (never delays the response). */
export function recordSubmitted(hash: string, source: string, meta: TxMeta | undefined): void {
  if (isTestnet() || !/^[0-9a-f]{64}$/.test(hash) || !G.test(source)) return;
  runInBackground(
    (async () => {
      const usd = await valueOf(hash, source).catch(() => null);
      await ensureSchema();
      const account = await hashAddress(source);
      const day = today();
      await getPool().query(
        "INSERT INTO analytics_txs (hash, account, kind, protocol, volume_usd, day, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (hash) DO NOTHING",
        [hash, account, kindOf(meta?.kind), protocolOf(meta?.protocol), usd ?? 0, day, new Date().toISOString()],
      );
      await touchWallet(account, day);
    })(),
  );
}

/** App ping when a wallet is connected (once a day per wallet). Only on-chain accounts count. */
export async function pingWallet(body: { address?: unknown }) {
  const address = String(body?.address ?? "");
  if (!G.test(address)) return { status: 400, body: { ok: false, error: "address required" } };
  if (isTestnet()) return { status: 200, body: { ok: true } };
  runInBackground(
    (async () => {
      await ensureSchema();
      const hash = await hashAddress(address);
      const known = await getPool().query("SELECT 1 FROM analytics_wallets WHERE hash = $1", [hash]);
      if (!known.rows.length) {
        const r = await fetch(`${horizonUrl()}/accounts/${address}`).catch(() => null);
        if (!r?.ok) return;
      }
      await touchWallet(hash, today());
    })(),
  );
  return { status: 200, body: { ok: true } };
}

// ---------- summary ----------

type Num = number | string | null;
const n = (v: Num) => Number(v ?? 0) || 0;

type Coverage = {
  lendPools: number | null;
  lendMarkets: number | null;
  lendTvlUsd: number | null;
  dexPools: number | null;
  dexTvlUsd: number | null;
  vaults: number | null;
  vaultTvlUsd: number | null;
  perpsMarkets: number | null;
};

/** Live coverage from the caches the app already fills (never triggers a cold protocol scan). */
async function coverage(): Promise<Coverage> {
  type Lend = { assets: unknown[]; tvlUsd: number; retired?: boolean }[];
  type Rows = { rows?: { tvlUsd?: number | null }[] };
  const [lend, vaults, zenex, ...dex] = await Promise.all([
    cacheGet<Lend>("lend-markets-v5").catch(() => null),
    cacheGet<Rows>(KEYS.vaultsRows).catch(() => null),
    cacheGet<{ markets?: unknown[] }>("zenex:config").catch(() => null),
    ...["soroswap", "aqua", "phoenix", "sushi"].map((p) => cacheGet<Rows>(KEYS.pool(`dex-${p}-v5`)).catch(() => null)),
  ]);
  const live = lend?.filter((g) => !g.retired) ?? null;
  const dexRows = dex.flatMap((d) => d?.rows ?? []);
  const sum = (rows: { tvlUsd?: number | null }[]) => rows.reduce((s, r) => s + (Number.isFinite(r.tvlUsd) ? Number(r.tvlUsd) : 0), 0);
  return {
    lendPools: live ? live.length : null,
    lendMarkets: live ? live.reduce((s, g) => s + g.assets.length, 0) : null,
    lendTvlUsd: live ? live.reduce((s, g) => s + (g.tvlUsd || 0), 0) : null,
    dexPools: dex.some(Boolean) ? dexRows.length : null,
    dexTvlUsd: dex.some(Boolean) ? sum(dexRows) : null,
    vaults: vaults?.rows ? vaults.rows.length : null,
    vaultTvlUsd: vaults?.rows ? sum(vaults.rows) : null,
    perpsMarkets: zenex?.markets ? zenex.markets.length : null,
  };
}

export type AnalyticsSummary = {
  generatedAt: string;
  since: string | null;
  totals: {
    volumeUsd: number;
    txs: number;
    transactingWallets: number;
    wallets: number;
    active1d: number;
    active7d: number;
    active30d: number;
  };
  byKind: { kind: string; txs: number; volumeUsd: number }[];
  byProtocol: { protocol: string; txs: number; volumeUsd: number }[];
  daily: { day: string; txs: number; volumeUsd: number; transactingWallets: number; newWallets: number; activeWallets: number; totalWallets: number }[];
  recent: { hash: string; kind: string; protocol: string; volumeUsd: number; at: string }[];
  coverage: Coverage;
  /** Exact figures per time filter (unique wallets can't be summed from daily rows). */
  windows: Record<WindowId, WindowStats>;
  /** Last 24 hours by UTC hour (for the 24h filter). */
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

// ---------- owner-only adjustments ----------
// The summary is always built from measured data first. These parameters are layered on top
// (server-side, so every visitor sees the same result) and can be changed only with the admin
// token. Real transactions keep moving the base, so the adjusted view grows with them too.

export type AnalyticsAdjustments = {
  enabled: boolean;
  volumeX: number;
  volumeAdd: number;
  txX: number;
  txAdd: number;
  walletX: number;
  walletAdd: number;
  /** Share of wallets that transacted. */
  transactingShare: number;
  /** Share of all wallets active in the last 30 / 7 days / today. */
  active30Share: number;
  active7Share: number;
  active1Share: number;
  /** Days the added amounts are spread over (ending today). */
  historyDays: number;
  /** Curve of the added history: 1 = linear growth, higher = steeper recent growth. */
  growth: number;
  /** Day-to-day variation, 0..1. */
  jitter: number;
  kindMix: Record<string, number>;
  protocolMix: Record<string, number>;
  /** How many real recent transactions to show (0..25). */
  recentRows: number;
};

export const DEFAULT_ADJUSTMENTS: AnalyticsAdjustments = {
  enabled: true,
  volumeX: 1,
  volumeAdd: 0,
  txX: 1,
  txAdd: 0,
  walletX: 1,
  walletAdd: 0,
  transactingShare: 0.45,
  active30Share: 0.35,
  active7Share: 0.18,
  active1Share: 0.06,
  historyDays: 60,
  growth: 1.6,
  jitter: 0.35,
  kindMix: { swap: 40, lending: 22, vault: 14, liquidity: 10, perps: 8, claim: 3, send: 2, trustline: 1 },
  protocolMix: { soroswap: 30, blend: 18, aquarius: 8, phoenix: 4, xoxno: 6, defindex: 9, upshift: 4, sentora: 3, zenex: 8, sushi: 2, stellar: 3 },
  recentRows: 25,
};

const ADJ_KIND_PROTOCOLS: Record<string, string[]> = {
  swap: ["soroswap"],
  lending: ["blend", "xoxno"],
  claim: ["blend"],
  vault: ["defindex", "upshift", "sentora"],
  liquidity: ["soroswap", "aquarius", "phoenix", "sushi"],
  perps: ["zenex"],
  send: ["stellar"],
  trustline: ["stellar"],
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const clampNum = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function pickNum(raw: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const v = Number(raw[key]);
  return Number.isFinite(v) ? clampNum(v, min, max) : fallback;
}

function pickMix(raw: Record<string, unknown>, key: string, fallback: Record<string, number>): Record<string, number> {
  const src = asRecord(raw[key]);
  const out: Record<string, number> = {};
  for (const id of Object.keys(fallback)) {
    const v = Number(src[id]);
    out[id] = Number.isFinite(v) ? clampNum(v, 0, 1_000_000) : fallback[id];
  }
  return out;
}

/** Accept any client payload, keep only the known parameters and sane ranges. */
export function sanitizeAdjustments(input: unknown): AnalyticsAdjustments {
  const raw = asRecord(input);
  return {
    enabled: raw.enabled === undefined ? DEFAULT_ADJUSTMENTS.enabled : raw.enabled !== false && raw.enabled !== 0 && raw.enabled !== "false",
    volumeX: pickNum(raw, "volumeX", DEFAULT_ADJUSTMENTS.volumeX, 0, 1000),
    volumeAdd: pickNum(raw, "volumeAdd", DEFAULT_ADJUSTMENTS.volumeAdd, -1e15, 1e15),
    txX: pickNum(raw, "txX", DEFAULT_ADJUSTMENTS.txX, 0, 1000),
    txAdd: Math.round(pickNum(raw, "txAdd", DEFAULT_ADJUSTMENTS.txAdd, -1e12, 1e12)),
    walletX: pickNum(raw, "walletX", DEFAULT_ADJUSTMENTS.walletX, 0, 1000),
    walletAdd: Math.round(pickNum(raw, "walletAdd", DEFAULT_ADJUSTMENTS.walletAdd, -1e12, 1e12)),
    transactingShare: pickNum(raw, "transactingShare", DEFAULT_ADJUSTMENTS.transactingShare, 0, 1),
    active30Share: pickNum(raw, "active30Share", DEFAULT_ADJUSTMENTS.active30Share, 0, 1),
    active7Share: pickNum(raw, "active7Share", DEFAULT_ADJUSTMENTS.active7Share, 0, 1),
    active1Share: pickNum(raw, "active1Share", DEFAULT_ADJUSTMENTS.active1Share, 0, 1),
    historyDays: Math.round(pickNum(raw, "historyDays", DEFAULT_ADJUSTMENTS.historyDays, 1, 90)),
    growth: pickNum(raw, "growth", DEFAULT_ADJUSTMENTS.growth, 1, 4),
    jitter: pickNum(raw, "jitter", DEFAULT_ADJUSTMENTS.jitter, 0, 1),
    kindMix: pickMix(raw, "kindMix", DEFAULT_ADJUSTMENTS.kindMix),
    protocolMix: pickMix(raw, "protocolMix", DEFAULT_ADJUSTMENTS.protocolMix),
    recentRows: Math.round(pickNum(raw, "recentRows", DEFAULT_ADJUSTMENTS.recentRows, 0, 25)),
  };
}

/** Stored parameters, or null when the database cannot be read. */
export async function readAdjustments(): Promise<{ adjustments: AnalyticsAdjustments; updatedAt: string | null } | null> {
  try {
    await ensureSchema();
    const r = await getPool().query<{ params: unknown; updated_at?: string }>(
      "SELECT params, updated_at FROM analytics_adjustments WHERE id = 1",
    );
    const row = r.rows[0];
    if (!row) return { adjustments: DEFAULT_ADJUSTMENTS, updatedAt: null };
    let parsed: unknown = {};
    try {
      parsed = typeof row.params === "string" ? JSON.parse(row.params) : row.params;
    } catch {
      parsed = {};
    }
    return { adjustments: sanitizeAdjustments(parsed), updatedAt: row.updated_at == null ? null : String(row.updated_at) };
  } catch {
    return null;
  }
}

/** Persist the owner's parameters (one row). */
export async function writeAdjustments(input: unknown) {
  const adjustments = sanitizeAdjustments(input);
  const updatedAt = new Date().toISOString();
  try {
    await ensureSchema();
    await getPool().query(
      "INSERT INTO analytics_adjustments (id, params, updated_at) VALUES (1, $1, $2) ON CONFLICT (id) DO UPDATE SET params = excluded.params, updated_at = excluded.updated_at",
      [JSON.stringify(adjustments), updatedAt],
    );
    return { status: 200, body: { ok: true, adjustments, updatedAt } };
  } catch {
    return { status: 200, body: { ok: false, error: "db-unavailable" } };
  }
}

/** Owner-only: current parameters. */
export async function analyticsAdjustments() {
  const r = await readAdjustments();
  if (!r) return { status: 200, body: { ok: false, error: "db-unavailable" } };
  return { status: 200, body: { ok: true, ...r } };
}

const ADJ_MIN_TOKEN = 16;

/** The owner token from the API environment. Shorter/empty values disable the admin routes. */
export function analyticsAdminToken(): string {
  return (process.env.ANALYTICS_ADMIN_TOKEN ?? "").trim();
}

/** Constant-time bearer check; admin routes stay closed until a long enough token is configured. */
export function isAnalyticsAdmin(header: string | undefined): boolean {
  const expected = analyticsAdminToken();
  const got = (header ?? "").replace(/^Bearer\s+/i, "").trim();
  if (expected.length < ADJ_MIN_TOKEN || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

const adjRand = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** Weights over `days`, ending today, summing to 1. */
function adjCurve(days: number, growth: number, jitter: number, seed: number, len: number): number[] {
  if (!len) return [];
  const w = Array.from({ length: len }, (_, i) => {
    const pos = i - (len - days);
    if (pos < 0) return 0;
    const base = Math.pow((pos + 1) / days, Math.max(0, growth - 1));
    return base * (1 + jitter * (adjRand(seed + i) * 2 - 1));
  });
  const s = w.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  return w.map((v) => Math.max(0, v) / s);
}

const adjRound = (n: number) => Math.round(Number.isFinite(n) ? n : 0);
const adjNear = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0);

/** Split integer `total` across weights without losing units. */
function adjSplitInt(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const raw = weights.map((w) => w * total);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0 && order.length; k = (k + 1) % order.length, rest--) out[order[k][1]]++;
  return out;
}

const adjSplitSigned = (total: number, weights: number[]): number[] =>
  total < 0 ? adjSplitInt(-total, weights).map((v) => -v) : adjSplitInt(total, weights);

function adjAlignInts(values: number[], total: number): number[] {
  const clean = values.map((v) => adjNear(v));
  const sum = clean.reduce((a, b) => a + b, 0);
  const weights = sum > 0 ? clean.map((v) => v / sum) : clean.map(() => (clean.length ? 1 / clean.length : 0));
  return adjSplitInt(Math.max(0, adjRound(total)), weights);
}

const adjSumLast = (values: number[], days: number) =>
  values.slice(Math.max(0, values.length - days)).reduce((a, b) => a + b, 0);

type BreakRow = { txs: number; volumeUsd: number };

/** Split an added amount across ids: manual mix first, then measured mix, then evenly. */
function adjShares(ids: string[], mix: Record<string, number>, base: Map<string, BreakRow>, value: (r: BreakRow) => number): number[] {
  if (!ids.length) return [];
  const manual = ids.map((id) => Math.max(0, mix[id] ?? 0));
  const manualSum = manual.reduce((a, b) => a + b, 0);
  if (manualSum > 0) return manual.map((w) => w / manualSum);
  const measured = ids.map((id) => Math.max(0, value(base.get(id) ?? { txs: 0, volumeUsd: 0 })));
  const measuredSum = measured.reduce((a, b) => a + b, 0);
  if (measuredSum > 0) return measured.map((w) => w / measuredSum);
  return ids.map(() => 1 / ids.length);
}

function adjBreakdown(
  base: WindowStats,
  p: AnalyticsAdjustments,
  addVolume: number,
  addTxs: number,
): { byKind: { kind: string; txs: number; volumeUsd: number }[]; byProtocol: { protocol: string; txs: number; volumeUsd: number }[] } {
  const byKind = new Map<string, BreakRow>();
  for (const r of base.byKind) byKind.set(r.kind, { txs: adjNear(adjRound(r.txs * p.txX)), volumeUsd: adjNear(r.volumeUsd * p.volumeX) });
  const byProtocol = new Map<string, BreakRow>();
  for (const r of base.byProtocol) byProtocol.set(r.protocol, { txs: adjNear(adjRound(r.txs * p.txX)), volumeUsd: adjNear(r.volumeUsd * p.volumeX) });

  const addKind = (kind: string, vol: number, txs: number) => {
    const cur = byKind.get(kind) ?? { txs: 0, volumeUsd: 0 };
    byKind.set(kind, { txs: adjNear(cur.txs + txs), volumeUsd: adjNear(cur.volumeUsd + vol) });
  };
  const addProtocol = (protocol: string, vol: number, txs: number) => {
    const cur = byProtocol.get(protocol) ?? { txs: 0, volumeUsd: 0 };
    byProtocol.set(protocol, { txs: adjNear(cur.txs + txs), volumeUsd: adjNear(cur.volumeUsd + vol) });
  };

  // Decreases are spread over every measured row, not only the owner's mix, so the subtraction
  // cannot be lost on an unmapped category and the breakdown still sums to the window total.
  if (addVolume < 0 || addTxs < 0) {
    const kindIds = [...byKind.keys()];
    if (addVolume < 0) {
      const shares = adjShares(kindIds, {}, byKind, (r) => r.volumeUsd);
      kindIds.forEach((kind, i) => addKind(kind, addVolume * shares[i], 0));
    }
    if (addTxs < 0) {
      const shares = adjShares(kindIds, {}, byKind, (r) => r.txs);
      const split = adjSplitSigned(adjRound(addTxs), shares);
      kindIds.forEach((kind, i) => addKind(kind, 0, split[i] ?? 0));
    }
    const protocolIds = [...byProtocol.keys()];
    if (addVolume < 0) {
      const shares = adjShares(protocolIds, {}, byProtocol, (r) => r.volumeUsd);
      protocolIds.forEach((protocol, i) => addProtocol(protocol, addVolume * shares[i], 0));
    }
    if (addTxs < 0) {
      const shares = adjShares(protocolIds, {}, byProtocol, (r) => r.txs);
      const split = adjSplitSigned(adjRound(addTxs), shares);
      protocolIds.forEach((protocol, i) => addProtocol(protocol, 0, split[i] ?? 0));
    }
  }

  // Increases follow the owner's mix; protocol increases follow the product's protocol map.
  if (addVolume > 0 || addTxs > 0) {
    const kindIds = Object.keys(p.kindMix).length ? Object.keys(p.kindMix) : [...byKind.keys()];
    if (!kindIds.length) kindIds.push("other");
    const volShares = addVolume > 0 ? adjShares(kindIds, p.kindMix, byKind, (r) => r.volumeUsd) : [];
    const txSplit = addTxs > 0 ? adjSplitInt(adjRound(addTxs), adjShares(kindIds, p.kindMix, byKind, (r) => r.txs)) : [];
    kindIds.forEach((kind, i) => {
      const vol = addVolume > 0 ? addVolume * volShares[i] : 0;
      const txs = txSplit[i] ?? 0;
      if (vol === 0 && txs === 0) return;
      addKind(kind, vol, txs);
      const ids = ADJ_KIND_PROTOCOLS[kind] ?? ["other"];
      if (vol !== 0) {
        const shares = adjShares(ids, p.protocolMix, byProtocol, (r) => r.volumeUsd);
        ids.forEach((protocol, j) => addProtocol(protocol, vol * shares[j], 0));
      }
      if (txs !== 0) {
        const shares = adjShares(ids, p.protocolMix, byProtocol, (r) => r.txs);
        const split = adjSplitInt(txs, shares);
        ids.forEach((protocol, j) => addProtocol(protocol, 0, split[j] ?? 0));
      }
    });
  }

  const kindRows = [...byKind].map(([kind, v]) => ({ kind, ...v }));
  const protocolRows = [...byProtocol].map(([protocol, v]) => ({ protocol, ...v }));
  const targetTxs = adjNear(adjRound(base.txs * p.txX + addTxs));
  const kindTxs = adjAlignInts(kindRows.map((r) => r.txs), targetTxs);
  const protocolTxs = adjAlignInts(protocolRows.map((r) => r.txs), targetTxs);
  return {
    byKind: kindRows.map((r, i) => ({ ...r, txs: kindTxs[i] ?? 0 })).filter((r) => r.txs > 0 || r.volumeUsd > 0).sort(desc),
    byProtocol: protocolRows.map((r, i) => ({ ...r, txs: protocolTxs[i] ?? 0 })).filter((r) => r.txs > 0 || r.volumeUsd > 0).sort(desc),
  };
}

function adjWindow(
  base: WindowStats,
  p: AnalyticsAdjustments,
  addVolume: number,
  addTxs: number,
  newWallets: number,
  activeWallets: number,
  transactingWallets: number,
  walletCap: number,
): WindowStats {
  const volumeUsd = adjNear(base.volumeUsd * p.volumeX + addVolume);
  const txs = adjNear(adjRound(base.txs * p.txX + addTxs));
  const active = Math.min(walletCap, adjNear(adjRound(activeWallets)));
  const transacting = Math.min(txs, active, Math.max(txs > 0 && active > 0 ? 1 : 0, adjNear(adjRound(transactingWallets))));
  return {
    volumeUsd,
    txs,
    transactingWallets: transacting,
    newWallets: Math.min(walletCap, adjNear(adjRound(newWallets))),
    activeWallets: active,
    ...adjBreakdown(base, p, addVolume, addTxs),
  };
}

/** Pure: returns a new summary. Never mutates the cached measured one. */
export function applyAdjustments(real: AnalyticsSummary, p: AnalyticsAdjustments): AnalyticsSummary {
  if (!p.enabled) return real;

  const len = real.daily.length;
  const days = Math.max(1, Math.min(Math.max(1, len), adjRound(p.historyDays)));
  const volWeights = adjCurve(days, p.growth, p.jitter, 11, len);
  const txWeights = adjCurve(days, p.growth, p.jitter, 23, len);
  const walWeights = adjCurve(days, p.growth, p.jitter * 0.8, 37, len);
  const volAdds = volWeights.map((w) => p.volumeAdd * w);
  const txAdds = adjSplitSigned(adjRound(p.txAdd), txWeights);
  const walAdds = adjSplitSigned(adjRound(p.walletAdd), walWeights);

  const firstTotal = len ? real.daily[0].totalWallets - real.daily[0].newWallets : 0;
  // New wallets cannot go below zero. A negative walletAdd that is larger than the measured
  // new wallets on its day reduces the starting total instead, so the final total still moves.
  const dailyNew = real.daily.map((d, i) => {
    const baseNew = adjNear(adjRound(d.newWallets * p.walletX));
    const add = walAdds[i] ?? 0;
    const applied = add < 0 ? -Math.min(-add, baseNew) : add;
    return { newWallets: adjNear(baseNew + applied), leftover: add - applied };
  });
  const dailyTxs = adjAlignInts(
    real.daily.map((d, i) => d.txs * p.txX + (txAdds[i] ?? 0)),
    adjRound(real.daily.reduce((s, d) => s + d.txs, 0) * p.txX + p.txAdd),
  );
  let running = adjNear(adjRound(firstTotal * p.walletX) + dailyNew.reduce((s, d) => s + d.leftover, 0));
  const daily: AnalyticsSummary["daily"] = real.daily.map((d, i) => {
    const newWallets = dailyNew[i].newWallets;
    running = adjNear(running + newWallets);
    const txs = dailyTxs[i] ?? 0;
    const activeWallets = Math.min(
      running,
      Math.max(
        newWallets,
        adjNear(adjRound(d.activeWallets * p.walletX + p.walletAdd * p.active1Share * (0.7 + 0.6 * adjRand(i + 101)))),
      ),
    );
    const transactingWallets = Math.min(
      txs,
      activeWallets,
      Math.max(
        txs > 0 && activeWallets > 0 ? 1 : 0,
        adjNear(
          adjRound(
            d.transactingWallets * p.walletX +
              (txAdds[i] > 0 && p.walletAdd > 0 ? p.walletAdd * p.active1Share * p.transactingShare : 0),
          ),
        ),
      ),
    );
    return {
      day: d.day,
      txs,
      volumeUsd: adjNear(d.volumeUsd * p.volumeX + (volAdds[i] ?? 0)),
      transactingWallets,
      newWallets,
      activeWallets,
      totalWallets: running,
    };
  });

  const wallets = len ? running : adjNear(adjRound(real.totals.wallets * p.walletX + p.walletAdd));
  const volumeAll = adjNear(real.totals.volumeUsd * p.volumeX + p.volumeAdd);
  const txsAll = adjNear(adjRound(real.totals.txs * p.txX + p.txAdd));
  const new30 = daily.slice(-30).reduce((s, d) => s + d.newWallets, 0);
  const new7 = daily.slice(-7).reduce((s, d) => s + d.newWallets, 0);
  const new24 = adjNear(adjRound(real.windows["24h"].newWallets * p.walletX + adjSumLast(walAdds, 1)));
  const active30 = Math.min(wallets, Math.max(new30, adjNear(adjRound(real.totals.active30d * p.walletX + p.walletAdd * p.active30Share))));
  const active7 = Math.min(active30, Math.max(new7, adjNear(adjRound(real.totals.active7d * p.walletX + p.walletAdd * p.active7Share))));
  // totals.active1d is the UTC day; the 24h filter also includes yesterday (same as the API base).
  const new1 = len ? daily[len - 1].newWallets : 0;
  const active1 = Math.min(active7, Math.max(new1, adjNear(adjRound(real.totals.active1d * p.walletX + p.walletAdd * p.active1Share))));
  const active24 = Math.min(active7, Math.max(new24, adjNear(adjRound(real.windows["24h"].activeWallets * p.walletX + p.walletAdd * p.active1Share))));
  const transactingAll = Math.min(
    wallets,
    txsAll,
    Math.max(txsAll > 0 && wallets > 0 ? 1 : 0, adjNear(adjRound(real.totals.transactingWallets * p.walletX + p.walletAdd * p.transactingShare))),
  );
  if (len) {
    const last = daily[len - 1];
    last.activeWallets = active1;
    last.transactingWallets = Math.min(last.transactingWallets, active1);
  }

  const totals = {
    volumeUsd: volumeAll,
    txs: txsAll,
    transactingWallets: transactingAll,
    wallets,
    active30d: active30,
    active7d: active7,
    active1d: active1,
  };

  const transacting30 = adjNear(adjRound(real.windows["30d"].transactingWallets * p.walletX + p.walletAdd * p.active30Share * p.transactingShare));
  const transacting7 = adjNear(adjRound(real.windows["7d"].transactingWallets * p.walletX + p.walletAdd * p.active7Share * p.transactingShare));
  const transacting24 = adjNear(adjRound(real.windows["24h"].transactingWallets * p.walletX + p.walletAdd * p.active1Share * p.transactingShare));

  const all = adjWindow(real.windows.all, p, p.volumeAdd, p.txAdd, wallets, wallets, transactingAll, wallets);
  const w30 = adjWindow(
    real.windows["30d"],
    p,
    adjSumLast(volAdds, 30),
    adjSumLast(txAdds, 30),
    new30,
    active30,
    transacting30,
    wallets,
  );
  const w7 = adjWindow(
    real.windows["7d"],
    p,
    adjSumLast(volAdds, 7),
    adjSumLast(txAdds, 7),
    new7,
    active7,
    transacting7,
    wallets,
  );
  const w24 = adjWindow(
    real.windows["24h"],
    p,
    adjSumLast(volAdds, 1),
    adjSumLast(txAdds, 1),
    new24,
    active24,
    transacting24,
    wallets,
  );

  const hourWeights = real.hourly.map((h) => h.volumeUsd);
  const hourSum = hourWeights.reduce((a, b) => a + Math.abs(b), 0);
  const hourShares = hourWeights.map((w) => (hourSum > 0 ? Math.abs(w) / hourSum : 1 / Math.max(1, hourWeights.length)));
  const hourVol = hourShares.map((s) => adjSumLast(volAdds, 1) * s);
  const hourTx = adjSplitSigned(adjRound(adjSumLast(txAdds, 1)), hourShares);
  const hourTrans = hourShares.map((s) => Math.max(0, p.walletAdd) * p.active1Share * p.transactingShare * s);
  const hourly = real.hourly.map((h, i) => {
    const txs = adjNear(adjRound(h.txs * p.txX) + (hourTx[i] ?? 0));
    return {
      hour: h.hour,
      txs,
      volumeUsd: adjNear(h.volumeUsd * p.volumeX + (hourVol[i] ?? 0)),
      transactingWallets: Math.min(txs, Math.max(txs > 0 ? 1 : 0, adjNear(adjRound(h.transactingWallets * p.walletX + (hourTrans[i] ?? 0))))),
    };
  });

  const recent = real.recent.slice(0, Math.max(0, Math.min(p.recentRows, real.recent.length)));
  return {
    ...real,
    totals,
    byKind: all.byKind,
    byProtocol: all.byProtocol,
    daily,
    recent,
    windows: { all, "30d": w30, "7d": w7, "24h": w24 },
    hourly,
  };
}

type Group = { kind: string; protocol: string; txs: Num; volume: Num };
const desc = <T extends { volumeUsd: number; txs: number }>(a: T, b: T) => b.volumeUsd - a.volumeUsd || b.txs - a.txs;

function breakdown(groups: Group[]) {
  const byKind = new Map<string, { txs: number; volumeUsd: number }>();
  const byProtocol = new Map<string, { txs: number; volumeUsd: number }>();
  for (const g of groups) {
    for (const [m, k] of [
      [byKind, g.kind],
      [byProtocol, g.protocol],
    ] as const) {
      const cur = m.get(k) ?? { txs: 0, volumeUsd: 0 };
      cur.txs += n(g.txs);
      cur.volumeUsd += n(g.volume);
      m.set(k, cur);
    }
  }
  return {
    byKind: [...byKind].map(([kind, v]) => ({ kind, ...v })).sort(desc),
    byProtocol: [...byProtocol].map(([protocol, v]) => ({ protocol, ...v })).sort(desc),
  };
}

/** One time filter. Transactions use exact timestamps; wallet activity is kept per UTC day. */
async function windowStats(db: ReturnType<typeof getPool>, sinceIso: string, sinceDay: string): Promise<WindowStats> {
  const [groups, acc, fresh, active] = await Promise.all([
    db.query<Group>(
      "SELECT kind, protocol, COUNT(*) AS txs, COALESCE(SUM(volume_usd), 0) AS volume FROM analytics_txs WHERE created_at >= $1 GROUP BY kind, protocol",
      [sinceIso],
    ),
    db.query<{ n: Num }>("SELECT COUNT(DISTINCT account) AS n FROM analytics_txs WHERE created_at >= $1", [sinceIso]),
    db.query<{ n: Num }>("SELECT COUNT(*) AS n FROM analytics_wallets WHERE first_day >= $1", [sinceDay]),
    db.query<{ n: Num }>("SELECT COUNT(DISTINCT hash) AS n FROM analytics_active WHERE day >= $1", [sinceDay]),
  ]);
  const b = breakdown(groups.rows);
  return {
    volumeUsd: b.byKind.reduce((s, r) => s + r.volumeUsd, 0),
    txs: b.byKind.reduce((s, r) => s + r.txs, 0),
    transactingWallets: n(acc.rows[0]?.n),
    newWallets: n(fresh.rows[0]?.n),
    activeWallets: n(active.rows[0]?.n),
    ...b,
  };
}

async function hourlySeries(db: ReturnType<typeof getPool>): Promise<AnalyticsSummary["hourly"]> {
  const start = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 - 23 * 3_600_000);
  const r = await db.query<{ hour: string; txs: Num; volume: Num; accounts: Num }>(
    "SELECT SUBSTR(created_at, 1, 13) AS hour, COUNT(*) AS txs, COALESCE(SUM(volume_usd), 0) AS volume, COUNT(DISTINCT account) AS accounts FROM analytics_txs WHERE created_at >= $1 GROUP BY SUBSTR(created_at, 1, 13)",
    [start.toISOString()],
  );
  const by = new Map(r.rows.map((x) => [x.hour, x]));
  return Array.from({ length: 24 }, (_, i) => {
    const hour = new Date(start.getTime() + i * 3_600_000).toISOString().slice(0, 13);
    const x = by.get(hour);
    return { hour, txs: n(x?.txs ?? 0), volumeUsd: n(x?.volume ?? 0), transactingWallets: n(x?.accounts ?? 0) };
  });
}

const WINDOW_DAYS = 90;

async function buildSummary(): Promise<AnalyticsSummary> {
  await ensureSchema();
  const db = getPool();
  const from = dayAgo(WINDOW_DAYS - 1);
  const [tot, wal, act, groups, dTx, dNew, before, dAct, recent, cov] = await Promise.all([
    db.query<{ txs: Num; volume: Num; accounts: Num; first_day: string | null }>(
      "SELECT COUNT(*) AS txs, COALESCE(SUM(volume_usd), 0) AS volume, COUNT(DISTINCT account) AS accounts, MIN(day) AS first_day FROM analytics_txs",
    ),
    db.query<{ wallets: Num; first_day: string | null }>("SELECT COUNT(*) AS wallets, MIN(first_day) AS first_day FROM analytics_wallets"),
    db.query<{ a1: Num; a7: Num; a30: Num }>(
      "SELECT COUNT(DISTINCT CASE WHEN day >= $1 THEN hash END) AS a1, COUNT(DISTINCT CASE WHEN day >= $2 THEN hash END) AS a7, COUNT(DISTINCT hash) AS a30 FROM analytics_active WHERE day >= $3",
      [today(), dayAgo(6), dayAgo(29)],
    ),
    db.query<{ kind: string; protocol: string; txs: Num; volume: Num }>(
      "SELECT kind, protocol, COUNT(*) AS txs, COALESCE(SUM(volume_usd), 0) AS volume FROM analytics_txs GROUP BY kind, protocol",
    ),
    db.query<{ day: string; txs: Num; volume: Num; accounts: Num }>(
      "SELECT day, COUNT(*) AS txs, COALESCE(SUM(volume_usd), 0) AS volume, COUNT(DISTINCT account) AS accounts FROM analytics_txs WHERE day >= $1 GROUP BY day",
      [from],
    ),
    db.query<{ day: string; n: Num }>("SELECT first_day AS day, COUNT(*) AS n FROM analytics_wallets WHERE first_day >= $1 GROUP BY first_day", [from]),
    db.query<{ n: Num }>("SELECT COUNT(*) AS n FROM analytics_wallets WHERE first_day < $1", [from]),
    db.query<{ day: string; n: Num }>("SELECT day, COUNT(*) AS n FROM analytics_active WHERE day >= $1 GROUP BY day", [from]),
    db.query<{ hash: string; kind: string; protocol: string; volume_usd: Num; created_at: string }>(
      "SELECT hash, kind, protocol, volume_usd, created_at FROM analytics_txs ORDER BY created_at DESC LIMIT 25",
    ),
    coverage(),
  ]);
  const [wAll, w30, w7, w24, hourly] = await Promise.all([
    windowStats(db, "", ""),
    windowStats(db, new Date(Date.now() - 30 * DAY_MS).toISOString(), dayAgo(29)),
    windowStats(db, new Date(Date.now() - 7 * DAY_MS).toISOString(), dayAgo(6)),
    windowStats(db, new Date(Date.now() - DAY_MS).toISOString(), dayAgo(1)),
    hourlySeries(db),
  ]);

  const t = tot.rows[0];
  const byKind = new Map<string, { txs: number; volumeUsd: number }>();
  const byProtocol = new Map<string, { txs: number; volumeUsd: number }>();
  for (const g of groups.rows) {
    for (const [m, k] of [
      [byKind, g.kind],
      [byProtocol, g.protocol],
    ] as const) {
      const cur = m.get(k) ?? { txs: 0, volumeUsd: 0 };
      cur.txs += n(g.txs);
      cur.volumeUsd += n(g.volume);
      m.set(k, cur);
    }
  }

  const txByDay = new Map(dTx.rows.map((r) => [r.day, r]));
  const newByDay = new Map(dNew.rows.map((r) => [r.day, n(r.n)]));
  const actByDay = new Map(dAct.rows.map((r) => [r.day, n(r.n)]));
  let running = n(before.rows[0]?.n);
  const daily: AnalyticsSummary["daily"] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    const day = dayAgo(i);
    const tx = txByDay.get(day);
    const fresh = newByDay.get(day) ?? 0;
    running += fresh;
    daily.push({
      day,
      txs: n(tx?.txs ?? 0),
      volumeUsd: n(tx?.volume ?? 0),
      transactingWallets: n(tx?.accounts ?? 0),
      newWallets: fresh,
      activeWallets: actByDay.get(day) ?? 0,
      totalWallets: running,
    });
  }

  const firsts = [t?.first_day, wal.rows[0]?.first_day].filter((d): d is string => !!d).sort();
  const sortDesc = <T extends { volumeUsd: number; txs: number }>(a: T, b: T) => b.volumeUsd - a.volumeUsd || b.txs - a.txs;
  return {
    generatedAt: new Date().toISOString(),
    since: firsts[0] ?? null,
    totals: {
      volumeUsd: n(t?.volume),
      txs: n(t?.txs),
      transactingWallets: n(t?.accounts),
      wallets: n(wal.rows[0]?.wallets),
      active1d: n(act.rows[0]?.a1),
      active7d: n(act.rows[0]?.a7),
      active30d: n(act.rows[0]?.a30),
    },
    byKind: [...byKind].map(([kind, v]) => ({ kind, ...v })).sort(sortDesc),
    byProtocol: [...byProtocol].map(([protocol, v]) => ({ protocol, ...v })).sort(sortDesc),
    daily,
    recent: recent.rows.map((r) => ({ hash: r.hash, kind: r.kind, protocol: r.protocol, volumeUsd: n(r.volume_usd), at: String(r.created_at) })),
    coverage: cov,
    windows: { all: wAll, "30d": w30, "7d": w7, "24h": w24 },
    hourly,
  };
}

export async function analyticsSummary() {
  try {
    const out = await withCache("analytics:summary:v2", 60_000, buildSummary, { swr: true });
    if (!out.value) return { status: 200, body: { ok: false, error: "unavailable" } };
    const stored = await readAdjustments();
    const adjustments = stored?.adjustments ?? DEFAULT_ADJUSTMENTS;
    const summary = adjustments.enabled ? applyAdjustments(out.value, adjustments) : out.value;
    return { status: 200, body: { ok: true, ...summary } };
  } catch {
    return { status: 200, body: { ok: false, error: "db-unavailable" } };
  }
}
