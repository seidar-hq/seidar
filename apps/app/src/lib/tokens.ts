// Token metadata: Soroswap curated list first, deterministic fallback.
// Consistent single source for every logo in the app: positions, tokens
// rail, recipes. 12h cache (memory + localStorage); misses get a
// reasonable default (letter badge) and never break the UI.

export type TokenMeta = {
  code: string;
  icon: string | null;
  name: string | null;
};

const LIST_URL =
  "https://raw.githubusercontent.com/soroswap/token-list/main/tokenList.json";
const CACHE_KEY = "seidar.tokenlist";
const TTL_MS = 12 * 60 * 60 * 1000;

type ListEntry = {
  code?: string;
  icon?: string;
  name?: string;
  contract?: string;
  issuer?: string;
};

let mem: { at: number; byCode: Record<string, TokenMeta> } | null = null;

function readCache(): { at: number; byCode: Record<string, TokenMeta> } | null {
  if (mem) return mem;
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== "number" || !parsed.byCode) return null;
    mem = parsed;
    return mem;
  } catch {
    return null;
  }
}

function writeCache(byCode: Record<string, TokenMeta>) {
  mem = { at: Date.now(), byCode };
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(mem));
    }
  } catch {
    /* ignore */
  }
}

async function fetchList(): Promise<Record<string, TokenMeta>> {
  const res = await fetch(LIST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`token list http ${res.status}`);
  const body = await res.json();
  const assets: ListEntry[] = Array.isArray(body) ? body : body.assets ?? [];
  const byCode: Record<string, TokenMeta> = {};
  for (const a of assets) {
    if (!a || typeof a.code !== "string") continue;
    const code = a.code.toUpperCase();
    // First entry wins (curated order); never overwrite a known icon.
    if (!byCode[code]) {
      byCode[code] = {
        code,
        icon: typeof a.icon === "string" && a.icon ? a.icon : null,
        name: typeof a.name === "string" ? a.name : null,
      };
    }
  }
  return byCode;
}

/** Pinned local icons (always available, same-origin). */
const PINNED: Record<string, TokenMeta> = {
  XLM: { code: "XLM", icon: "/xlm-logo.png", name: "Stellar Lumens" },
};

/** Metadata for a symbol; always resolves (fallback when unknown). */
export async function getTokenMeta(symbol: string): Promise<TokenMeta> {
  const code = symbol.toUpperCase();
  if (PINNED[code]) return PINNED[code];
  const cached = readCache();
  if (cached && Date.now() - cached.at < TTL_MS && cached.byCode[code]) {
    return cached.byCode[code];
  }
  try {
    const fresh = await fetchList();
    writeCache(fresh);
    if (fresh[code]) return fresh[code];
  } catch {
    /* offline list — fall through to default */
  }
  if (cached?.byCode[code]) return cached.byCode[code];
  return { code, icon: null, name: null };
}

/** Deterministic hue for fallback badges. */
export function fallbackHue(symbol: string): number {
  let h = 0;
  for (const c of symbol.toUpperCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/**
 * Ordered candidates for an icon URL. IPFS icons resolve through our own
 * `/api/icon` proxy — server-side gateway failover order lives in
 * app/api/icon/route.ts (GATEWAYS). Browsers often cannot reach public IPFS
 * gateways directly, and same-origin avoids CORS/CSP issues. Plain HTTPS icons are returned as-is. The UI walks the list on
 * error and falls back to a letter badge.
 */
export function iconCandidates(url: string | null): string[] {
  if (!url) return [];
  const m = url.match(/\/ipfs\/([^/?#]+)/);
  if (!m) return [url];
  return [`/api/icon?cid=${m[1]}`];
}
