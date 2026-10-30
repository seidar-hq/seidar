// Database: Postgres (`pg`, local Node via DATABASE_URL) or Cloudflare D1 (SQLite, the Worker
// registers its binding with useD1). Queries are written once in the subset both accept:
// `$n` placeholders (rewritten to `?n` for D1), timestamps as ISO-8601 text computed in JS
// (isoAgo) instead of NOW()/INTERVAL, IN lists instead of ANY(), no casts, no DISTINCT ON.
// DATABASE_URL lives server-side only (services/api env, never the browser).

import type { Pool } from "pg";

export type QueryResult<T> = { rows: T[]; rowCount: number | null };
export type Db = { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<QueryResult<T>> };

/** The slice of the D1 binding this module uses. */
export type D1Like = {
  prepare(sql: string): { bind(...v: unknown[]): { all<T>(): Promise<{ results: T[]; meta: { changes?: number } }> } };
  batch(stmts: unknown[]): Promise<unknown>;
};

let d1: D1Like | null = null;
let d1Db: Db | null = null;

/** Worker entry: route every query to this D1 database. */
export function useD1(binding: D1Like): void {
  d1 = binding;
  d1Db = {
    async query<T>(text: string, params: unknown[] = []) {
      const sql = text.replace(/\$(\d+)/g, "?$1");
      const vals = params.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v instanceof Date ? v.toISOString() : v ?? null));
      const r = await binding.prepare(sql).bind(...vals).all<T>();
      return { rows: r.results ?? [], rowCount: r.meta?.changes ?? (r.results ?? []).length };
    },
  };
}

/** ISO timestamp `ms` milliseconds ago (compares correctly against both TIMESTAMPTZ and ISO text). */
export const isoAgo = (ms: number) => new Date(Date.now() - ms).toISOString();

/** `$start, $start+1, ...` for an IN list of n values. */
export const inList = (n: number, start: number) => Array.from({ length: n }, (_, i) => `$${start + i}`).join(", ");

let pool: Pool | null = null;

export function getPool(): Db {
  if (d1Db) return d1Db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  if (!pool) {
    // Loaded lazily so the Worker bundle never initialises `pg`.
    const { Pool: PgPool } = pgModule();
    // Bounded waits: a dead database must fail fast into the localStorage
    // fallback, never hang API routes (and the UI) indefinitely.
    pool = new PgPool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 5000,
      query_timeout: 10000,
      statement_timeout: 10000,
    });
  }
  return pool as unknown as Db;
}

// `pg` is CommonJS; createRequire keeps it out of the Worker's module graph.
function pgModule(): typeof import("pg") {
  const req = (globalThis as { process?: { getBuiltinModule?: (m: string) => { createRequire(u: string): (m: string) => unknown } } }).process?.getBuiltinModule?.("node:module");
  if (!req) throw new Error("pg needs Node");
  return req.createRequire(import.meta.url)("pg") as typeof import("pg");
}

// Memoized: DDL runs once per process (re-attempted after a failure). On Workers the request that
// started it can be cancelled mid-way, leaving the promise pending for good and every query behind
// it hanging, so an attempt that hasn't finished within SCHEMA_MAX_MS is started afresh.
let schemaReady: { p: Promise<void>; at: number; done: boolean } | null = null;
const SCHEMA_MAX_MS = 15_000;

export function ensureSchema(): Promise<void> {
  if (!schemaReady || (!schemaReady.done && Date.now() - schemaReady.at > SCHEMA_MAX_MS)) {
    const attempt: { p: Promise<void>; at: number; done: boolean } = { p: Promise.resolve(), at: Date.now(), done: false };
    attempt.p = runSchema().then(
      () => {
        attempt.done = true;
      },
      (e) => {
        if (schemaReady === attempt) schemaReady = null;
        throw e;
      },
    );
    schemaReady = attempt;
  }
  return schemaReady.p;
}

async function runSchema(): Promise<void> {
  if (d1) {
    const stmts = SQLITE_SCHEMA.split(";").map((s) => s.trim()).filter(Boolean);
    await d1.batch(stmts.map((s) => d1!.prepare(s).bind()));
    return;
  }
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE INDEX IF NOT EXISTS notifications_wallet_idx ON notifications (wallet, id DESC);
    CREATE TABLE IF NOT EXISTS exchange_strategies (
      id SERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      params JSONB NOT NULL DEFAULT '{}',
      attempts INT NOT NULL DEFAULT 0,
      last_note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS exchange_strategies_wallet_idx ON exchange_strategies (wallet, id DESC);
    CREATE TABLE IF NOT EXISTS smart_accounts (
      id SERIAL PRIMARY KEY,
      owner_wallet TEXT NOT NULL,
      address TEXT NOT NULL,
      policy JSONB NOT NULL DEFAULT '{}',
      tx_hash TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS smart_accounts_owner_idx ON smart_accounts (owner_wallet, id DESC);
    -- One owner may hold several smart wallets (single-wallet UNIQUE retired).
    ALTER TABLE smart_accounts DROP CONSTRAINT IF EXISTS smart_accounts_owner_wallet_key;
    -- Standing session grants: one user signature authorizing bounded,
    -- unattended execution (keeper submits pre-signed envelopes only).
    CREATE TABLE IF NOT EXISTS session_grants (
      id SERIAL PRIMARY KEY,
      owner_wallet TEXT NOT NULL,
      strategy_id TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'swap',
      max_amount_usd NUMERIC NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      message TEXT NOT NULL DEFAULT '',
      signature TEXT NOT NULL DEFAULT '',
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS session_grants_owner_idx ON session_grants (owner_wallet, id DESC);
    -- Earn vault snapshots: share-price + TVL history powering our own APY
    -- computation and APY-drop alerts (never blind-trust advertised APY).
    CREATE TABLE IF NOT EXISTS vault_snapshots (
      id SERIAL PRIMARY KEY,
      protocol TEXT NOT NULL,
      vault_address TEXT NOT NULL,
      share_price DOUBLE PRECISION,
      tvl_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      apy_pct DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS vault_snapshots_vault_idx ON vault_snapshots (protocol, vault_address, id DESC);
    -- Per-wallet APY watchlists for drop alerts.
    CREATE TABLE IF NOT EXISTS vault_watches (
      id SERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      protocol TEXT NOT NULL,
      vault_address TEXT NOT NULL,
      threshold_pp DOUBLE PRECISION NOT NULL DEFAULT 2,
      last_notified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (wallet, protocol, vault_address)
    );
    CREATE INDEX IF NOT EXISTS vault_watches_wallet_idx ON vault_watches (wallet, id DESC);
    -- Permissionlessly discovered vaults (factory tx-meta scanner).
    CREATE TABLE IF NOT EXISTS known_vaults (
      contract_address TEXT PRIMARY KEY,
      protocol TEXT NOT NULL DEFAULT 'defindex',
      tx_hash TEXT NOT NULL DEFAULT '',
      funded BOOLEAN NOT NULL DEFAULT FALSE,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_checked TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    -- Own price history for honest 24h change + price charts (15-min
    -- cadence, 30-day retention).
    CREATE TABLE IF NOT EXISTS price_snapshots (
      id SERIAL PRIMARY KEY,
      asset TEXT NOT NULL,
      px DOUBLE PRECISION NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS price_snapshots_asset_idx ON price_snapshots (asset, at DESC);
    -- Per-wallet equity history (piggyback-sampled off positions reads: one
    -- row per wallet per hour max, 90-day retention). Public-chain data only.
    CREATE TABLE IF NOT EXISTS wallet_snapshots (
      id SERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      net_worth DOUBLE PRECISION NOT NULL,
      supplied DOUBLE PRECISION NOT NULL DEFAULT 0,
      borrowed DOUBLE PRECISION NOT NULL DEFAULT 0,
      tokens_value DOUBLE PRECISION NOT NULL DEFAULT 0,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS wallet_snapshots_wallet_idx ON wallet_snapshots (wallet, at DESC);
    -- Per network (testnet samples once leaked into mainnet curves); rows
    -- from before this column stay NULL and are never served.
    ALTER TABLE wallet_snapshots ADD COLUMN IF NOT EXISTS network TEXT;
    -- Indexer cursors (factory scan position, snapshot marks).
    CREATE TABLE IF NOT EXISTS indexer_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    -- Position alerts: ratio monitors per wallet+protocol (one-shot by
    -- default; automation alerts are evaluated from strategy states).
    -- Supply-cap alerts carry the watched asset code in asset with the
    -- cap at creation as threshold (one-shot on increase).
    CREATE TABLE IF NOT EXISTS position_alerts (
      id SERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      protocol TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'ratio',
      direction TEXT NOT NULL DEFAULT 'below',
      threshold NUMERIC NOT NULL DEFAULT 0,
      asset TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      fired BOOLEAN NOT NULL DEFAULT FALSE,
      last_note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE position_alerts ADD COLUMN IF NOT EXISTS asset TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS position_alerts_wallet_idx ON position_alerts (wallet, id DESC);    -- Last-good vault rows: coverage survives restarts and flaky upstreams
    -- (a vault once listed never blinks out on a transient miss).
    CREATE TABLE IF NOT EXISTS vault_row_cache (
      address TEXT PRIMARY KEY,
      protocol TEXT NOT NULL DEFAULT '',
      row JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    -- In-app feedback inbox (see feedback.ts): wallet, text, file metadata.
    CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      wallet TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      files JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS feedback_wallet_idx ON feedback (wallet, id DESC);
    -- DeFindex factory index -> vault address (immutable once deployed), plus
    -- immutable metadata so catalogue refreshes only re-read balances.
    CREATE TABLE IF NOT EXISTS defindex_vaults (
      idx INTEGER PRIMARY KEY,
      address TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      symbol TEXT NOT NULL DEFAULT '',
      assets JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    -- Token metadata read from the token contract itself (symbol/decimals).
    CREATE TABLE IF NOT EXISTS token_meta (
      contract TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      decimals INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    -- Public analytics (analytics.ts): transactions Seidar submitted, wallets (hashed), daily activity.
    CREATE TABLE IF NOT EXISTS analytics_txs (
      hash TEXT PRIMARY KEY,
      account TEXT NOT NULL,
      kind TEXT NOT NULL,
      protocol TEXT NOT NULL,
      volume_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
      day TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS analytics_txs_day_idx ON analytics_txs (day);
    CREATE INDEX IF NOT EXISTS analytics_txs_created_idx ON analytics_txs (created_at DESC);
    CREATE TABLE IF NOT EXISTS analytics_wallets (hash TEXT PRIMARY KEY, first_day TEXT NOT NULL, last_day TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS analytics_active (day TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (day, hash));
    -- Owner-only adjustments layered over the measured summary (single row).
    CREATE TABLE IF NOT EXISTS analytics_adjustments (
      id INTEGER PRIMARY KEY,
      params TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);
}


const TS = "TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))";
const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT NOT NULL, text TEXT NOT NULL, created_at ${TS}, read INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS notifications_wallet_idx ON notifications (wallet, id DESC);
CREATE TABLE IF NOT EXISTS vault_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, protocol TEXT NOT NULL, vault_address TEXT NOT NULL, share_price REAL, tvl_usd REAL NOT NULL DEFAULT 0, apy_pct REAL, created_at ${TS});
CREATE INDEX IF NOT EXISTS vault_snapshots_vault_idx ON vault_snapshots (protocol, vault_address, id DESC);
CREATE TABLE IF NOT EXISTS vault_watches (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT NOT NULL, protocol TEXT NOT NULL, vault_address TEXT NOT NULL, threshold_pp REAL NOT NULL DEFAULT 2, last_notified_at TEXT, created_at ${TS}, UNIQUE (wallet, protocol, vault_address));
CREATE INDEX IF NOT EXISTS vault_watches_wallet_idx ON vault_watches (wallet, id DESC);
CREATE TABLE IF NOT EXISTS price_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, asset TEXT NOT NULL, px REAL NOT NULL, at ${TS});
CREATE INDEX IF NOT EXISTS price_snapshots_asset_idx ON price_snapshots (asset, at DESC);
CREATE TABLE IF NOT EXISTS wallet_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT NOT NULL, net_worth REAL NOT NULL, supplied REAL NOT NULL DEFAULT 0, borrowed REAL NOT NULL DEFAULT 0, tokens_value REAL NOT NULL DEFAULT 0, network TEXT, at ${TS});
CREATE INDEX IF NOT EXISTS wallet_snapshots_wallet_idx ON wallet_snapshots (wallet, at DESC);
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, files TEXT NOT NULL DEFAULT '[]', created_at ${TS});
CREATE TABLE IF NOT EXISTS defindex_vaults (idx INTEGER PRIMARY KEY, address TEXT NOT NULL UNIQUE, name TEXT NOT NULL DEFAULT '', symbol TEXT NOT NULL DEFAULT '', assets TEXT NOT NULL DEFAULT '[]', created_at ${TS});
CREATE TABLE IF NOT EXISTS token_meta (contract TEXT PRIMARY KEY, code TEXT NOT NULL, decimals INTEGER NOT NULL, name TEXT NOT NULL DEFAULT '', updated_at ${TS});
CREATE TABLE IF NOT EXISTS token_icons (contract TEXT PRIMARY KEY, icon TEXT, checked_at ${TS});
CREATE TABLE IF NOT EXISTS analytics_txs (hash TEXT PRIMARY KEY, account TEXT NOT NULL, kind TEXT NOT NULL, protocol TEXT NOT NULL, volume_usd REAL NOT NULL DEFAULT 0, day TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS analytics_txs_day_idx ON analytics_txs (day);
CREATE INDEX IF NOT EXISTS analytics_txs_created_idx ON analytics_txs (created_at DESC);
CREATE TABLE IF NOT EXISTS analytics_wallets (hash TEXT PRIMARY KEY, first_day TEXT NOT NULL, last_day TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analytics_active (day TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (day, hash));
CREATE TABLE IF NOT EXISTS analytics_adjustments (id INTEGER PRIMARY KEY, params TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT '')
`;

export type DbSessionGrant = {
  id: number;
  owner_wallet: string;
  strategy_id: string;
  scope: string;
  max_amount_usd: string;
  expires_at: string | null;
  message: string;
  signature: string;
  revoked: boolean;
  created_at: string;
};

export type DbStrategy = {
  id: number;
  wallet: string;
  kind: string;
  status: string;
  params: Record<string, unknown>;
  attempts: number;
  last_note: string;
  created_at: string;
  updated_at: string;
};

export type DbSmartAccount = {
  id: number;
  owner_wallet: string;
  address: string;
  policy: Record<string, unknown>;
  tx_hash: string;
  created_at: string;
};

export const STRATEGY_STATUSES = [
  "active",
  "triggered",
  "executing",
  "executed",
  "completed",
  "expired",
  "cancelled",
  "failed",
] as const;

export type DbNote = {
  id: number;
  wallet: string;
  text: string;
  created_at: string;
  read: boolean;
};

export function isDbMissing(e: unknown): boolean {
  return (
    e instanceof Error &&
    /DATABASE_URL not set|ECONNREFUSED|ENOTFOUND/i.test(
      e.message + (e as { code?: string }).code,
    )
  );
}

export function dbUnavailable() {
  return { status: 200, body: { ok: false, error: "db-unavailable" } };
}

export function dbError() {
  return { status: 200, body: { ok: false, error: "db-error" } };
}
