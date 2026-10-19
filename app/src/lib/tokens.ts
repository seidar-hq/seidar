// Token metadata: Soroswap curated list first, deterministic fallback.
// Consistent single source for every logo in the app: positions, tokens
// rail, recipes. 12h cache (memory + localStorage); misses get a
// reasonable default (letter badge) and never break the UI.

import { API_BASE } from "./api";

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
let inflight: Promise<Record<string, TokenMeta>> | null = null;

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
  AQUA: { code: "AQUA", icon: "/aqua-logo.png", name: "AQUA" },
  // The Soroswap list's EURC icon is an IPFS CID that no gateway reliably
  // serves (pinata times out, ipfs.io/w3s.link rate-limit), so EURC always
  // ended up as a letter badge. Pinned locally like XLM/AQUA instead.
  EURC: { code: "EURC", icon: "/eurc-logo.png", name: "Euro Coin" },
  // Same story: FxDAO (EURX/GBPX) and Orbit (oUSD) icons live on gateways
  // that 404 from most clients, so they rendered as letter badges.
  EURX: { code: "EURX", icon: "/eurx-logo.png", name: "Decentralized EUR Coin" },
  GBPX: { code: "GBPX", icon: "/gbpx-logo.png", name: "Decentralized GBP Coin" },
  OUSD: { code: "OUSD", icon: "/ousd-logo.png", name: "Orbit USD" },
  // Common tokens, shipped as 96px copies: USDC's IPFS icon took ~7s
  // through the gateway proxy and USTRY/CETES are 0.7MB PNGs on S3.
  USDC: { code: "USDC", icon: "/tokens/usdc.png", name: "USD Coin" },
  USTRY: { code: "USTRY", icon: "/tokens/ustry.png", name: "Etherfuse USTRY" },
  CETES: { code: "CETES", icon: "/tokens/cetes.png", name: "Etherfuse CETES" },
  USDT0: { code: "USDT0", icon: "/tokens/usdt0.png", name: "USDT0" },
  PYUSD: { code: "PYUSD", icon: "/tokens/pyusd.png", name: "PayPal USD" },
  USDGLO: { code: "USDGLO", icon: "/tokens/usdglo.png", name: "Glo Dollar" },
  // BLND's list icon is a dead IPFS pin; these copies come from the logos
  // Aqua shows (LOBSTR asset directory, Solv's token CDN).
  BLND: { code: "BLND", icon: "/tokens/blnd.png", name: "Blend" },
  SOLVBTC: { code: "SOLVBTC", icon: "/tokens/solvbtc.png", name: "SolvBTC" },
  XSOLVBTC: { code: "XSOLVBTC", icon: "/tokens/xsolvbtc.png", name: "xSolvBTC" },
};

/** Pinned metadata, known synchronously (same on server and client). */
export function pinnedTokenMeta(symbol: string): TokenMeta | null {
  return PINNED[symbol.toUpperCase()] ?? null;
}

/** Metadata for a symbol; always resolves (fallback when unknown). */
export async function getTokenMeta(symbol: string): Promise<TokenMeta> {
  const code = symbol.toUpperCase();
  if (PINNED[code]) return PINNED[code];
  const cached = readCache();
  if (cached && Date.now() - cached.at < TTL_MS && cached.byCode[code]) {
    return cached.byCode[code];
  }
  try {
    // One list fetch shared by every icon on the page.
    inflight ??= fetchList().finally(() => {
      inflight = null;
    });
    const fresh = await inflight;
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
 * Ordered candidates for an icon URL. IPFS icons resolve through the backend
 * icon proxy (gateway failover lives server-side). Browsers often cannot
 * reach public IPFS gateways directly. Plain HTTPS icons are returned as-is.
 * The UI walks the list on error and falls back to a letter badge.
 */
export function iconCandidates(url: string | null): string[] {
  if (!url) return [];
  const m = url.match(/\/ipfs\/([^/?#]+)/);
  if (!m) return [url];
  return [`${API_BASE}/icon?cid=${m[1]}`];
}

/* DEX token icons resolved per contract by the API (/tokens/icons): Aqua,
   Phoenix, Soroswap and Sushi tokens the curated list doesn't carry.
   byCode only holds tickers that map to one contract, so a copycat token
   never shows the real one's logo. Fetched once per page life (again while
   the API is still filling), shared by every TokenIcon. */
type DexIcons = { byContract: Record<string, string>; byCode: Record<string, string> };
let dexIcons: DexIcons | null = null;
let dexInflight: Promise<DexIcons> | null = null;
let dexAt = 0;
export const DEX_ICONS_EVENT = "seidar:dex-icons";

export function loadDexIcons(): Promise<DexIcons> {
  if (dexIcons && Date.now() - dexAt < 90_000) return Promise.resolve(dexIcons);
  dexInflight ??= fetch(`${API_BASE}/tokens/icons`, { cache: "no-store" })
    .then((r) => r.json())
    .then((d: { ok?: boolean; byContract?: Record<string, string>; byCode?: Record<string, string>; pending?: number }) => {
      const next = { byContract: d?.byContract ?? {}, byCode: d?.byCode ?? {} };
      const grew = !dexIcons || Object.keys(next.byContract).length > Object.keys(dexIcons.byContract).length;
      dexIcons = next;
      // Still filling server-side: look again in a while.
      dexAt = (d?.pending ?? 0) > 0 ? Date.now() - 60_000 : Date.now();
      if (grew && typeof window !== "undefined") window.dispatchEvent(new Event(DEX_ICONS_EVENT));
      return next;
    })
    .catch(() => dexIcons ?? { byContract: {}, byCode: {} })
    .finally(() => {
      dexInflight = null;
    });
  return dexInflight;
}

/** Icon from the DEX registry for a contract (exact) or an unambiguous code. */
export function dexIcon(code: string, contract?: string | null): string | null {
  if (!dexIcons) return null;
  if (contract) return dexIcons.byContract[contract] ?? null;
  return dexIcons.byCode[code.toUpperCase()] ?? null;
}
