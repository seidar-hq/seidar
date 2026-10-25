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

/** GET + JSON, resolving to null on any failure so callers can render an empty state. */
export async function apiJson<T>(input: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await apiFetch(input, { cache: "no-store", ...init });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
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
