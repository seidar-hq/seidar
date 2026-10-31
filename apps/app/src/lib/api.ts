// Backend base URL. The app always reads through the standalone API (services/api).
// Local default is the API dev server; production builds set NEXT_PUBLIC_API_URL.
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002").replace(/\/$/, "");

// Second address of the same Worker (workers.dev). Some mobile carriers can't reach part of
// Cloudflare's address space (188.114.96.0/20 seen unreachable), and Cloudflare sometimes answers
// DNS for seidar.xyz with exactly those addresses: requests then hang for 20 s+ instead of failing.
// workers.dev is a different zone with different addresses, so the app probes both and uses
// whichever answers.
const FALLBACK = (process.env.NEXT_PUBLIC_API_FALLBACK_URL ?? "").replace(/\/$/, "");
const PROBE_TIMEOUT_MS = 8_000;
/** A GET with no response after this long makes the app check the other address. */
const STALL_MS = 6_000;

let active = API_BASE;
let chosen: Promise<string> | null = null;
let probedAt = 0;

/** The API address currently in use (for <img src> and other URLs built outside apiFetch). */
export const apiBase = () => active;

/** Ask each address for /health at once; keep the first that answers (or the current one). */
function probe(): Promise<string> {
  probedAt = Date.now();
  return new Promise<string>((resolve) => {
    let left = 2;
    let done = false;
    // api.seidar.xyz gets a short head start, so it stays the normal choice when both work.
    for (const [base, delay] of [
      [API_BASE, 0],
      [FALLBACK, 500],
    ] as const) {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), PROBE_TIMEOUT_MS + delay);
      new Promise((r) => setTimeout(r, delay))
        .then(() => (done ? false : fetch(`${base}/health`, { cache: "no-store", signal: ctl.signal }).then((r) => r.ok)))
        .catch(() => false)
        .then((ok) => {
          clearTimeout(t);
          if (done) return;
          if (ok) {
            done = true;
            active = base;
            resolve(base);
          } else if (--left === 0) {
            done = true;
            resolve(active);
          }
        });
    }
  });
}

function currentBase(): Promise<string> {
  if (!FALLBACK || typeof window === "undefined") return Promise.resolve(active);
  return (chosen ??= probe());
}

/** Re-check both addresses (at most every 10 s) after a request stalled or failed. */
function reprobe(): Promise<string> {
  if (!FALLBACK) return Promise.resolve(active);
  if (Date.now() - probedAt > 10_000) chosen = probe();
  return chosen ?? (chosen = probe());
}

/** Fetch against the API: "/api/pools" -> "{base}/pools". Absolute URLs pass through. */
export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!input.startsWith("/api/")) return fetch(input, init);
  const path = input.slice(4);
  const base = await currentBase();
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") return fetch(`${base}${path}`, init);
  const first = fetchRetry(`${base}${path}`, init, 3);
  if (!FALLBACK) return first;

  // Hedge: if this address stalls or drops, and a fresh probe prefers the other one, ask there too
  // and take whichever answers first.
  type Out = { r: Response } | { e: unknown } | "stall";
  const settled: Promise<Out> = first.then(
    (r) => ({ r }),
    (e) => ({ e }),
  );
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  const out = await Promise.race([settled, new Promise<Out>((res) => (stallTimer = setTimeout(() => res("stall"), STALL_MS)))]);
  clearTimeout(stallTimer);
  if (out !== "stall" && "r" in out) return out.r;
  if (init?.signal?.aborted) return first;
  const other = await reprobe();
  if (other === base) return first;
  const second = fetchRetry(`${other}${path}`, init, 2);
  if (out !== "stall") return second; // the first address already failed
  return new Promise<Response>((resolve, reject) => {
    let failed = 0;
    const fail = (e: unknown) => {
      if (++failed === 2) reject(e);
    };
    first.then(resolve, fail);
    second.then(resolve, fail);
  });
}

/**
 * GET + JSON, resolving to null on any failure so callers can render an empty state. Aborts after
 * `timeoutMs`: a stuck request must not hold one of the browser's few connections to the API.
 */
export async function apiJson<T>(input: string, init?: RequestInit, timeoutMs = 45_000): Promise<T | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await apiFetch(input, { cache: "no-store", signal: ctl.signal, ...init });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Like apiJson, but re-polls while the API answers `{ warming: true }` (a scan still running).
 * A scan that is still warming after every try resolves to null (not loaded yet), never to its
 * empty placeholder, which would read as "no positions".
 */
export async function apiJsonWarm<T>(input: string, tries = 12, waitMs = 6_000): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    const r = await apiJson<T>(input);
    if (!(r as { warming?: boolean } | null)?.warming) return r;
    await new Promise((res) => setTimeout(res, waitMs));
  }
  return null;
}

// Reads retry a dropped connection (API restart, flaky network); HTTP errors are returned as is.
async function fetchRetry(url: string, init: RequestInit | undefined, tries: number): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, init);
    } catch (e) {
      if (i >= tries - 1 || init?.signal?.aborted) throw e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
}
