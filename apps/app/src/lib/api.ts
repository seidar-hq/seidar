// Backend base URL. The app always reads through the standalone API (services/api).
// Local default is the API dev server; production builds set NEXT_PUBLIC_API_URL.
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002").replace(/\/$/, "");

/** Fetch against the API: "/api/pools" -> "{base}/pools". Absolute URLs pass through. */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!input.startsWith("/api/")) return fetch(input, init);
  const url = `${API_BASE}${input.slice(4)}`;
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") return fetch(url, init);
  return fetchRetry(url, init, 3);
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
