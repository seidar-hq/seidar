// @seidar/cache — shared Redis reader with in-memory fallback + single-flight.
//
// Design: warmers write, routes read. When REDIS_URL is unset or `ioredis`
// is not installed, everything degrades to process memory so local dev and
// existing Next.js routes keep working with zero infra.
// When Redis is reachable, cache survives restarts and is shared across
// instances — fixing the thundering-herd on public RPC + CoinGecko.
//
// Key layout (see KEYS below):
//   prices:spot:{CODE}      60s   Reflector/SDEX/Coinbase spot
//   prices:change:{CODE}    10min Coinbase candles 24h change
//   pools:{blend|xoxno}  5-10min per-protocol rows
//   pools:registry          1h    ticker registry
//   vaults:rows             10min aggregated vault rows
//   tokens:registry         1h
//   icon:{cid}              24h

export const TTL_MS = {
  pricesSpot: 60_000,
  pricesChange: 10 * 60_000,
  poolsProtocol: 10 * 60_000,
  poolsRegistry: 60 * 60_000,
  vaultsRows: 10 * 60_000,
  tokensRegistry: 60 * 60_000,
  icon: 24 * 60 * 60_000,
} as const;

export const KEYS = {
  priceSpot: (code: string) => `prices:spot:${code.toUpperCase()}`,
  priceChange: (code: string) => `prices:change:${code.toUpperCase()}`,
  pool: (protocol: string) => `pools:${protocol.toLowerCase()}`,
  poolsRegistry: "pools:registry",
  vaultsRows: "vaults:rows",
  tokensRegistry: "tokens:registry",
  icon: (cid: string) => `icon:${cid}`,
} as const;

type Entry = { at: number; value: unknown };

const mem = new Map<string, Entry>();

/* Single-flight: concurrent misses for the same key share one loader promise.
   On Cloudflare Workers a loader belongs to the request that started it: when that request ends
   (client gone, or its waitUntil cut off 30 s after the response) the runtime cancels its I/O and
   the promise never settles. Anyone still awaiting it would hang until their own client gave up
   (observed 2026-10-30: /prices, /zenex/account and /balances stuck for 30-60 s, the app showing
   0.00). So a flight expires: joiners wait at most until it is `flightMaxMs` old, then the key is
   free for a new loader. */
type Flight = { p: Promise<unknown>; at: number };
const inflight = new Map<string, Flight>();
let flightMaxMs = 5 * 60_000;

/** How long a shared loader may run before it is presumed dead (the Worker sets ~25 s). */
export function setFlightMaxMs(ms: number): void {
  flightMaxMs = ms;
}

class FlightExpired extends Error {}

/** The live flight for `key`, dropping one that has outlived `flightMaxMs`. */
function liveFlight(key: string): Flight | undefined {
  const f = inflight.get(key);
  if (f && Date.now() - f.at >= flightMaxMs) {
    inflight.delete(key);
    return undefined;
  }
  return f;
}

function startFlight<T>(key: string, p: Promise<T>): Promise<T> {
  const f: Flight = { p, at: Date.now() };
  inflight.set(key, f);
  void p
    .finally(() => {
      if (inflight.get(key) === f) inflight.delete(key);
    })
    .catch(() => {});
  return p;
}

/** Await another caller's flight, but never past its expiry (rejects with FlightExpired). */
function joinFlight<T>(f: Flight): Promise<T> {
  const left = f.at + flightMaxMs - Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new FlightExpired("flight expired")), Math.max(0, left));
  });
  return Promise.race([f.p as Promise<T>, expiry]).finally(() => clearTimeout(timer));
}

/**
 * Single-flight `load` under `key` (shared with withCache's flights namespace only if the caller
 * uses the same key). Joins a live flight; one past its expiry is replaced by a fresh load.
 */
export async function singleFlight<T>(key: string, load: () => Promise<T>): Promise<T> {
  const f = liveFlight(key);
  if (f) {
    try {
      return await joinFlight<T>(f);
    } catch (e) {
      if (!(e instanceof FlightExpired)) throw e;
      if (inflight.get(key) === f) inflight.delete(key);
    }
  }
  return startFlight(key, load());
}

let redis: {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, ttlMs: number): Promise<unknown>;
} | null = null;
let redisTried = false;

/* Dev persistence: with CACHE_FILE set and no Redis, the memory cache is saved to that file
   (debounced) and reloaded on start, so a restarting dev server keeps its warm cache. */
const env = (k: string): string =>
  ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[k] ?? "").trim();
type Fs = { readFileSync(p: string, enc: string): string; writeFileSync(p: string, d: string): void };
const loadFs = () => (Function("m", "return import(m)") as (m: string) => Promise<Fs>)("node:fs");
let fileLoaded: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function fileLoad(): Promise<void> {
  const file = env("CACHE_FILE");
  if (!file) return Promise.resolve();
  fileLoaded ??= loadFs()
    .then((fs) => {
      const data = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, Entry>;
      for (const [k, e] of Object.entries(data)) if (!mem.has(k)) mem.set(k, e);
    })
    .catch(() => {});
  return fileLoaded;
}

function fileSave(): void {
  const file = env("CACHE_FILE");
  if (!file || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void loadFs()
      .then((fs) => fs.writeFileSync(file, JSON.stringify(Object.fromEntries(mem))))
      .catch(() => {});
  }, 2000);
}

async function getRedis() {
  if (redisTried) return redis;
  redisTried = true;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  try {
    // Dynamic specifier on purpose: `ioredis` is optional (services/api
    // provides it at runtime). Keeps @seidar/cache dependency-free so
    // existing apps build with zero installs.
    const loader = Function("m", "return import(m)") as (
      m: string,
    ) => Promise<{
      default?: new (url: string, opts?: Record<string, unknown>) => {
        get(k: string): Promise<string | null>;
        set(k: string, v: string, mode: string, ttl: number): Promise<unknown>;
        on(e: string, fn: () => void): void;
      };
    }>;
    const mod = await loader("ioredis");
    const Ctor = mod.default;
    if (!Ctor) return null;
    const client = new Ctor(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    client.on("error", () => {});
    redis = {
      get: (k) => client.get(k),
      // ioredis SET key value PX ttl
      set: (k, v, _mode, ttlMs) => client.set(k, v, "PX", ttlMs),
    };
    return redis;
  } catch {
    return null;
  }
}

/** Plug in a remote store instead of Redis (the Cloudflare Worker passes its KV namespace). */
export function setCacheDriver(
  d: { get(key: string): Promise<string | null>; put(key: string, value: string, ttlMs: number): Promise<unknown> } | null,
): void {
  redisTried = true;
  redis = d ? { get: (k) => d.get(k), set: (k, v, _mode, ttlMs) => d.put(k, v, ttlMs) } : null;
}

/* Background refreshes (stale-while-revalidate) outlive the request that started them. Node keeps
   them running on its own; a Worker must hand them to ctx.waitUntil, so they're tracked here,
   numbered so each request drains only the work started since it began (not another request's
   refresh, nor one the runtime already cancelled, which would never settle). */
const pending = new Map<Promise<unknown>, number>();
let bgSeq = 0;
function track<T>(p: Promise<T>): Promise<T> {
  pending.set(p, ++bgSeq);
  void p.finally(() => pending.delete(p)).catch(() => {});
  return p;
}
/** Run work after the response (a Worker drains it with ctx.waitUntil via drainBackground). */
export function runInBackground(p: Promise<unknown>): void {
  void track(p.catch(() => {}));
}

/** A marker for drainBackground: background work started after this call. */
export function backgroundMark(): number {
  return bgSeq;
}

/** Settles once every background refresh started after `since` (default: all) has finished. */
export function drainBackground(since = 0): Promise<unknown> {
  return Promise.allSettled([...pending].filter(([, n]) => n > since).map(([p]) => p));
}

/* Key scope: the API registers a resolver (its network context), so one
   process can serve mainnet and testnet without their entries mixing. The
   default scope is "" (keys unchanged). */
let scope: () => string = () => "";
export function setKeyScope(fn: () => string): void {
  scope = fn;
}

export async function cacheGet<T>(rawKey: string): Promise<T | null> {
  await fileLoad();
  const key = scope() + rawKey;
  const r = await getRedis().catch(() => null);
  if (r) {
    try {
      const raw = await r.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { at: number; value: T };
      return parsed.value ?? null;
    } catch {
      // fall through to memory
    }
  }
  const hit = mem.get(key);
  return (hit?.value as T) ?? null;
}

/** Raw entry with timestamp (for keep-last-good / stale-while-revalidate). */
export async function cacheGetEntry<T>(
  rawKey: string,
): Promise<{ at: number; value: T } | null> {
  await fileLoad();
  const key = scope() + rawKey;
  const r = await getRedis().catch(() => null);
  if (r) {
    try {
      const raw = await r.get(key);
      if (raw) return JSON.parse(raw) as { at: number; value: T };
    } catch {
      // fall through
    }
  }
  const hit = mem.get(key);
  return (hit as { at: number; value: T }) ?? null;
}

export async function cacheSet(
  rawKey: string,
  value: unknown,
  ttlMs: number,
  /** How long Redis keeps it (default ttlMs). Stale-while-revalidate
   *  readers judge freshness by `at`, so they keep entries longer to
   *  always have something to serve while refreshing. */
  retainMs: number = ttlMs,
): Promise<void> {
  const key = scope() + rawKey;
  const payload = JSON.stringify({ at: Date.now(), value });
  mem.set(key, { at: Date.now(), value });
  fileSave();
  const r = await getRedis().catch(() => null);
  if (r) {
    try {
      await r.set(key, payload, "PX", Math.max(ttlMs, retainMs));
    } catch {
      // memory already written; redis failure must never sink a route
    }
  }
}

/**
 * Read-through helper: serve cache when fresh, else single-flight the loader,
 * keep last-good on loader failure, optionally serve stale immediately while
 * revalidating in background.
 */
/** SWR entries stay in Redis a day past freshness: a cold restart or an
 *  idle spell serves the last read instantly while it refreshes. */
const SWR_RETAIN_MS = 24 * 3600_000;

export async function withCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  opts: { swr?: boolean } = {},
): Promise<{ value: T | null; cached: boolean; stale: boolean }> {
  const entry = await cacheGetEntry<T>(key);
  // Single-flight per scoped key (cacheGet/Set scope `key` themselves).
  const flight = scope() + key;
  const fresh =
    entry && Date.now() - entry.at < ttlMs ? (entry as { value: T }) : null;
  if (fresh) return { value: fresh.value, cached: true, stale: false };

  if (opts.swr && entry) {
    // Serve stale now, refresh in background (single-flight; a dead flight is replaced).
    if (!liveFlight(flight)) {
      const p = loader()
        .then((v) => cacheSet(key, v, ttlMs, SWR_RETAIN_MS).then(() => v))
        .catch(() => null);
      startFlight(flight, track(p));
    }
    return {
      value: (entry as { value: T }).value,
      cached: true,
      stale: true,
    };
  }

  try {
    const v = await singleFlight(flight, async () => {
      const v = await loader();
      await cacheSet(key, v, ttlMs, opts.swr ? SWR_RETAIN_MS : ttlMs);
      return v;
    });
    return { value: v, cached: !!entry, stale: false };
  } catch {
    return {
      value: (entry as { value: T } | null)?.value ?? null,
      cached: !!entry,
      stale: true,
    };
  }
}

/** In-process rate limiter (per-instance; use Redis for shared limits later). */
const hits = new Map<string, number[]>();
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; remaining: number } {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return { ok: false, remaining: 0 };
  }
  arr.push(now);
  hits.set(key, arr);
  return { ok: true, remaining: limit - arr.length };
}
