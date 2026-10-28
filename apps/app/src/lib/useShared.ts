"use client";

import { useEffect, useState } from "react";

// Shared, de-duplicated async cache: every component asking for the same key shares one request
// and one result. Stale entries keep showing while they refresh.

type Entry = { at: number; value: unknown; error: boolean };

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
      if (value == null && hit?.value != null) {
        store.set(key, { ...hit, at: Date.now() });
        return hit.value as T;
      }
      store.set(key, { at: Date.now(), value, error: false });
      mirror(key, value);
      return value;
    })
    .catch((e) => {
      if (!hit) store.set(key, { at: Date.now(), value: null, error: true });
      throw e;
    })
    .finally(() => {
      inflight.delete(key);
      notify();
    });
  inflight.set(key, job);
  return job;
}

/** Drop entries whose key starts with any of `prefixes` and refetch them for current listeners. */
export function invalidateSharedMany(prefixes: string[]) {
  let changed = false;
  for (const k of [...store.keys()]) {
    if (prefixes.some((p) => k.startsWith(p))) {
      store.delete(k);
      changed = true;
    }
  }
  if (changed) notify();
}

/** Drop entries whose key starts with `prefix` and refetch them for current listeners. */
export function invalidateShared(prefix: string) {
  invalidateSharedMany([prefix]);
}

/** Values for every key (null while loading), refreshed every `ttl`. */
export function useSharedMany<T>(
  keys: string[],
  loaderFor: (key: string) => () => Promise<T>,
  ttl: number,
): { values: Record<string, T | null>; loading: boolean; errors: string[] } {
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

  // Re-run loaders when an entry was invalidated (store miss without an inflight request).
  useEffect(() => {
    for (const k of keys) if (!store.has(k) && !inflight.has(k)) void loadShared(k, loaderFor(k), ttl).catch(() => {});
  });

  const values: Record<string, T | null> = {};
  const errors: string[] = [];
  let loading = false;
  for (const k of keys) {
    const e = store.get(k);
    values[k] = (e?.value as T) ?? null;
    if (!e) loading = true;
    else if (e.error) errors.push(k);
  }
  return { values, loading, errors };
}

export function useShared<T>(key: string | null, loader: () => Promise<T>, ttl: number) {
  const r = useSharedMany<T>(key ? [key] : [], () => loader, ttl);
  return { value: key ? r.values[key] : null, loading: r.loading, error: r.errors.length > 0 };
}
