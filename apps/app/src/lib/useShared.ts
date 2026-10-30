"use client";

import { useEffect, useState } from "react";

// Shared, de-duplicated async cache: every component asking for the same key shares one request
// and one result. Stale entries keep showing while they refresh.
//
// After a transaction the wallet's entries are also marked `pending` (refreshAfterTx): their values
// are expected to change, so the UI shows its loading shimmer on those numbers until a refresh
// returns something different (or settleShared gives up once the last post-tx refresh is done).

type Entry = { at: number; value: unknown; error: boolean; pending?: string; fails?: number };

/* A key that has never loaded and fails (loaders resolve to null on any API failure) is retried
   soon, 2 s, 4 s, 8 s… up to 30 s, instead of at its next interval, and reads as still loading for
   the first few tries: a failed read must not render as "nothing there" (0.00, empty tables). */
const RETRY_MS = [2_000, 4_000, 8_000, 15_000, 30_000];
const SILENT_FAILS = 4;
const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleRetry(key: string, n: number) {
  if (retryTimers.has(key)) return;
  const wait = RETRY_MS[Math.min(n, RETRY_MS.length) - 1];
  retryTimers.set(
    key,
    setTimeout(() => {
      retryTimers.delete(key);
      const e = store.get(key);
      // Marked stale: any mounted reader refetches it on its next pass (see useSharedMany).
      if (e?.error && e.value == null) {
        store.set(key, { ...e, at: STALE });
        notify();
      }
    }, wait),
  );
}

/** Record a failed load of `key` that has no good value to keep. */
function failed(key: string, prev: Entry | undefined) {
  const fails = (prev?.fails ?? 0) + 1;
  store.set(key, { at: Date.now(), value: null, error: true, pending: prev?.pending, fails });
  scheduleRetry(key, fails);
}

/** Cheap identity of a value, to tell when a post-transaction refresh brought new data. */
const sig = (v: unknown) => {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return String(Math.random());
  }
};

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

// Public lists (markets, pools, vaults, token catalogue, perps market, bridge routes) are mirrored
// in localStorage, like real_seidar's mirrors: a revisit paints from the last copy at once and
// refreshes behind it. Never wallet-specific data. Keys ending in ":" are prefixes.
const PERSIST = [
  "pools:",
  "dexpools:",
  "xoxno:markets",
  "lend:markets",
  "vaults:list",
  "tokens",
  "zenex:market",
  "bridge:routes",
  // Price charts and % changes (market data, not wallet data).
  "chart:",
  "pair:",
  "changes:",
  // Home's market overview.
  "market:assets",
  "market:overview",
];
const LS_PREFIX = "seidar.cache.";
const MAX_CHARS = 1_500_000;
const persists = (k: string) => PERSIST.some((p) => (p.endsWith(":") ? k.startsWith(p) : k === p));

/** Seed `key` from its localStorage mirror as a stale entry (shown now, refetched right away). */
function hydrate(key: string) {
  if (store.has(key) || typeof window === "undefined" || !persists(key)) return;
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + key);
    if (raw) store.set(key, { at: 0, value: JSON.parse(raw), error: false });
  } catch {}
}

function mirror(key: string, value: unknown) {
  if (typeof window === "undefined" || !persists(key) || value == null) return;
  try {
    const raw = JSON.stringify(value);
    if (raw.length <= MAX_CHARS) window.localStorage.setItem(LS_PREFIX + key, raw);
  } catch {}
}

export function loadShared<T>(key: string, loader: () => Promise<T>, ttl: number, force = false): Promise<T> {
  hydrate(key);
  const hit = store.get(key);
  if (!force && hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value as T);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const job = loader()
    .then((value) => {
      // A failed refresh (null) never replaces a good copy.
      const prev = store.get(key);
      if (value == null && hit?.value != null) {
        store.set(key, { ...hit, at: Date.now(), pending: prev?.pending });
        return hit.value as T;
      }
      if (value == null) {
        failed(key, prev);
        return value;
      }
      // Still pending while the indexers haven't caught up with the transaction (same data back).
      const pending = prev?.pending != null && sig(value) === prev.pending ? prev.pending : undefined;
      store.set(key, { at: Date.now(), value, error: false, pending });
      mirror(key, value);
      return value;
    })
    .catch((e) => {
      // Keep a good copy on screen; it is retried at the next interval, not on every render.
      const prev = store.get(key);
      if (hit?.value != null) store.set(key, { ...hit, at: Date.now(), pending: prev?.pending });
      else failed(key, prev);
      throw e;
    })
    .finally(() => {
      inflight.delete(key);
      notify();
    });
  inflight.set(key, job);
  return job;
}

/** Mark entries stale (at = 0) so the next read refetches them; listeners see "needs a refetch". */
const STALE = 0;

/**
 * Refetch entries whose key starts with any of `prefixes` for current listeners. The current
 * values stay on screen until the new ones arrive (dropping them made every card fall back to its
 * loading state for a moment after each transaction, a visible flash).
 */
export function invalidateSharedMany(prefixes: string[], opts: { pending?: boolean } = {}) {
  let changed = false;
  for (const [k, e] of [...store.entries()]) {
    if (prefixes.some((p) => k.startsWith(p))) {
      const pending = opts.pending ? (e.pending ?? sig(e.value)) : e.pending;
      store.set(k, { ...e, at: STALE, pending });
      changed = true;
    }
  }
  if (changed) notify();
}

/** Stop showing "updating" for these prefixes (the last post-transaction refresh has run). */
export function settleShared(prefixes: string[]) {
  let changed = false;
  for (const [k, e] of [...store.entries()]) {
    if (e.pending != null && prefixes.some((p) => k.startsWith(p))) {
      store.set(k, { ...e, pending: undefined });
      changed = true;
    }
  }
  if (changed) notify();
}

/** Refetch entries whose key starts with `prefix` (current values stay until then). */
export function invalidateShared(prefix: string) {
  invalidateSharedMany([prefix]);
}

/** Values for every key (null while loading), refreshed every `ttl`. */
export function useSharedMany<T>(
  keys: string[],
  loaderFor: (key: string) => () => Promise<T>,
  ttl: number,
): { values: Record<string, T | null>; loading: boolean; refreshing: boolean; errors: string[] } {
  const [, bump] = useState(0);
  const sig = keys.join("|");

  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    // After mount (never during render: the static HTML must hydrate unchanged), seed mirrored
    // lists from localStorage so they show before the network answers.
    const before = keys.filter((k) => store.has(k)).length;
    keys.forEach(hydrate);
    if (keys.filter((k) => store.has(k)).length > before) l();
    const run = () => keys.forEach((k) => void loadShared(k, loaderFor(k), ttl).catch(() => {}));
    run();
    const t = setInterval(run, ttl);
    return () => {
      listeners.delete(l);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, ttl]);

  // Re-run loaders when an entry is missing or was invalidated, unless a request is already out.
  useEffect(() => {
    for (const k of keys) {
      const e = store.get(k);
      if ((!e || e.at === STALE) && !inflight.has(k)) void loadShared(k, loaderFor(k), ttl).catch(() => {});
    }
  });

  const values: Record<string, T | null> = {};
  const errors: string[] = [];
  let loading = false;
  let refreshing = false;
  for (const k of keys) {
    const e = store.get(k);
    values[k] = (e?.value as T) ?? null;
    if (!e) loading = true;
    else if (e.error) {
      errors.push(k);
      if (e.value == null && (e.fails ?? 0) < SILENT_FAILS) loading = true;
    }
    if (e?.pending != null) refreshing = true;
  }
  return { values, loading, refreshing, errors };
}

export function useShared<T>(key: string | null, loader: () => Promise<T>, ttl: number) {
  const r = useSharedMany<T>(key ? [key] : [], () => loader, ttl);
  return { value: key ? r.values[key] : null, loading: r.loading, refreshing: r.refreshing, error: r.errors.length > 0 };
}
