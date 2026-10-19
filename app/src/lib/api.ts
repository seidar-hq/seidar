import { isTestnetMode } from "./network";
// Backend base URL. The dashboard ALWAYS reads through the standalone API
// (services/api) — never Next.js /api/* routes (deleted). Local default is
// the API dev server; production Cloudflare Pages builds set
// NEXT_PUBLIC_API_URL to the deployed API origin at build time.
export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"
).replace(/\/$/, "");

/**
 * Same-origin-shaped fetch that always hits the backend: any "/api/..." path
 * is rewritten to the standalone API ("/api/pools" -> "{base}/pools").
 * Absolute/external URLs pass through untouched.
 */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!input.startsWith("/api/")) return fetch(input, init);
  let url = `${API_BASE}${input.slice(4)}`;
  // Testnet mode: every API call runs on testnet (services/api net.ts).
  if (isTestnetMode()) url += `${url.includes("?") ? "&" : "?"}network=testnet`;
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") return fetch(url, init);
  return fetchRetry(url, init, 3);
}

/* Reads retry a dropped connection (API restart / deploy, flaky network)
   so a page never sits on "Loading…" because one request died. Only
   network failures retry — an HTTP error answer is returned as is. */
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
