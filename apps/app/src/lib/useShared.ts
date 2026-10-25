"use client";

import { useEffect, useState } from "react";

// Shared, de-duplicated async cache: every component asking for the same key shares one request
// and one result. Stale entries keep showing while they refresh.

type Entry = { at: number; value: unknown; error: boolean };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => l());

export function loadShared<T>(key: string, loader: () => Promise<T>, ttl: number, force = false): Promise<T> {
  const hit = store.get(key);
  if (!force && hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value as T);
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const job = loader()
    .then((value) => {
      store.set(key, { at: Date.now(), value, error: false });
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

/** Drop entries whose key starts with `prefix` and refetch them for current listeners. */
export function invalidateShared(prefix: string) {
  for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
  notify();
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
