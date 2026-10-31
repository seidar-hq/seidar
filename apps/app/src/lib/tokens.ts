// Token icons, one resolver for every logo in the app (ported from real_seidar's lib/tokens.ts):
//   1. bundled PNGs for the main tokens (same-origin, paint on the first render);
//   2. the API's per-contract DEX registry (/tokens/icons) when the contract is known;
//   3. the Soroswap token list by code;
//   4. the exact classic asset's published image (CODE:ISSUER via the API /token/logo);
//   5. the registry by code (only codes that map to a single contract);
//   6. a letter badge.
// IPFS links go through the API /icon?cid= proxy (gateway failover lives server-side).
// The list and the registry are cached in memory + localStorage for 12h.

import { apiBase, apiFetch } from "./api";

export type TokenMeta = { code: string; icon: string | null; name: string | null };

const LIST_URL = "https://raw.githubusercontent.com/soroswap/token-list/main/tokenList.json";
const LIST_KEY = "seidar.tokenlist";
const DEX_KEY = "seidar.dexicons";
const TTL_MS = 12 * 60 * 60 * 1000;

/** Pinned local icons (always available, same-origin). */
const PINNED: Record<string, TokenMeta> = {
  XLM: { code: "XLM", icon: "/tokens/xlm.png", name: "Stellar Lumens" },
  AQUA: { code: "AQUA", icon: "/tokens/aqua.png", name: "AQUA" },
  // The list's EURC icon is an IPFS CID that no gateway reliably serves.
  EURC: { code: "EURC", icon: "/tokens/eurc.png", name: "Euro Coin" },
  // FxDAO (EURX/GBPX) and Orbit (oUSD) icons live on gateways that 404 from most clients.
  EURX: { code: "EURX", icon: "/tokens/eurx.png", name: "Decentralized EUR Coin" },
  GBPX: { code: "GBPX", icon: "/tokens/gbpx.png", name: "Decentralized GBP Coin" },
  OUSD: { code: "OUSD", icon: "/tokens/ousd.png", name: "Orbit USD" },
  // Common tokens, shipped as 96px copies (USDC's IPFS icon took ~7s through the gateway proxy).
  USDC: { code: "USDC", icon: "/tokens/usdc.png", name: "USD Coin" },
  USTRY: { code: "USTRY", icon: "/tokens/ustry.png", name: "Etherfuse USTRY" },
  CETES: { code: "CETES", icon: "/tokens/cetes.png", name: "Etherfuse CETES" },
  USDT0: { code: "USDT0", icon: "/tokens/usdt0.png", name: "USDT0" },
  PYUSD: { code: "PYUSD", icon: "/tokens/pyusd.png", name: "PayPal USD" },
  USDGLO: { code: "USDGLO", icon: "/tokens/usdglo.png", name: "Glo Dollar" },
  // BLND's list icon is a dead IPFS pin.
  BLND: { code: "BLND", icon: "/tokens/blnd.png", name: "Blend" },
  // Franklin Templeton publishes no token image: its portrait mark (cropped from the official
  // Franklin Templeton logo), as Stellar wallets show for BENJI.
  BENJI: { code: "BENJI", icon: "/tokens/benji.png", name: "Franklin OnChain U.S. Government Money Fund" },
  SOLVBTC: { code: "SOLVBTC", icon: "/tokens/solvbtc.png", name: "SolvBTC" },
  XSOLVBTC: { code: "XSOLVBTC", icon: "/tokens/xsolvbtc.png", name: "xSolvBTC" },
};

export function pinnedTokenMeta(code: string): TokenMeta | null {
  return PINNED[code.toUpperCase()] ?? null;
}

function readLocal<T>(key: string): { at: number; value: T } | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: T };
    return typeof parsed?.at === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {}
}

// ---- Soroswap curated list, by code ----

let list: { at: number; value: Record<string, TokenMeta> } | null = null;
let listInflight: Promise<Record<string, TokenMeta>> | null = null;

async function fetchList(): Promise<Record<string, TokenMeta>> {
  const res = await fetch(LIST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`token list http ${res.status}`);
  const body = (await res.json()) as { assets?: { code?: string; icon?: string; name?: string }[] } | unknown[];
  const assets = (Array.isArray(body) ? body : (body as { assets?: unknown[] }).assets ?? []) as {
    code?: string;
    icon?: string;
    name?: string;
  }[];
  const byCode: Record<string, TokenMeta> = {};
  for (const a of assets) {
    if (!a || typeof a.code !== "string") continue;
    const code = a.code.toUpperCase();
    // First entry wins (curated order).
    if (!byCode[code]) byCode[code] = { code, icon: a.icon || null, name: a.name ?? null };
  }
  return byCode;
}

async function listMeta(code: string): Promise<TokenMeta | null> {
  list ??= typeof window === "undefined" ? null : readLocal<Record<string, TokenMeta>>(LIST_KEY);
  if (list && Date.now() - list.at < TTL_MS) return list.value[code] ?? null;
  try {
    listInflight ??= fetchList().finally(() => {
      listInflight = null;
    });
    const fresh = await listInflight;
    list = { at: Date.now(), value: fresh };
    writeLocal(LIST_KEY, fresh);
  } catch {
    /* offline list: fall through to whatever is cached */
  }
  return list?.value[code] ?? null;
}

// ---- DEX registry (API /tokens/icons), by contract ----

type DexIcons = { byContract: Record<string, string>; byCode: Record<string, string> };
let dex: DexIcons | null = null;
let dexAt = 0;
let dexInflight: Promise<DexIcons> | null = null;
export const ICONS_EVENT = "seidar:dex-icons";

export function loadDexIcons(): Promise<DexIcons> {
  if (!dex && typeof window !== "undefined") {
    const cached = readLocal<DexIcons>(DEX_KEY);
    if (cached) {
      dex = cached.value;
      // A stale copy still serves immediately; it refreshes below.
      dexAt = Date.now() - TTL_MS + 30_000;
    }
  }
  if (dex && Date.now() - dexAt < 90_000) return Promise.resolve(dex);
  dexInflight ??= apiFetch("/api/tokens/icons", { cache: "no-store" })
    .then((r) => r.json())
    .then((d: { byContract?: Record<string, string>; byCode?: Record<string, string>; pending?: number }) => {
      const next = { byContract: d?.byContract ?? {}, byCode: d?.byCode ?? {} };
      const grew = !dex || Object.keys(next.byContract).length > Object.keys(dex.byContract).length;
      dex = next;
      // Still filling server-side: look again in a minute.
      dexAt = (d?.pending ?? 0) > 0 ? Date.now() - 60_000 : Date.now();
      writeLocal(DEX_KEY, next);
      if (grew) window.dispatchEvent(new Event(ICONS_EVENT));
      return next;
    })
    .catch(() => dex ?? { byContract: {}, byCode: {} })
    .finally(() => {
      dexInflight = null;
    });
  return dexInflight;
}

function dexIcon(code: string, contract?: string | null): string | null {
  if (!dex) return null;
  if (contract) return dex.byContract[contract] ?? null;
  return dex.byCode[code.toUpperCase()] ?? null;
}

// ---- resolution ----

/** IPFS links resolve through the API's gateway proxy; plain HTTPS links pass through. */
export function iconUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/ipfs\/([^/?#]+)/) ?? url.match(/^ipfs:\/\/([^/?#]+)/);
  return m ? `${apiBase()}/icon?cid=${m[1]}` : url;
}

export type TokenRef = { code: string; issuer?: string | null; contract?: string | null };

const isNative = (t: TokenRef) => t.code.toUpperCase() === "XLM" && !t.issuer;

/** Icon known without any network round trip (bundled PNGs), or null. */
export function instantIcon(t: TokenRef): string | null {
  if (isNative(t)) return PINNED.XLM.icon;
  return pinnedTokenMeta(t.code)?.icon ?? null;
}

/** Ordered candidate URLs for a token; the UI walks them on error, then shows a letter badge. */
export async function resolveIcon(t: TokenRef): Promise<string[]> {
  const code = t.code.toUpperCase();
  const out: string[] = [];
  const push = (u: string | null | undefined) => {
    const v = iconUrl(u);
    if (v && !out.includes(v)) out.push(v);
  };
  push(instantIcon(t));
  if (out.length) return out;
  if (t.contract) {
    if (!dexIcon(code, t.contract)) await loadDexIcons();
    push(dexIcon(code, t.contract));
  }
  push((await listMeta(code))?.icon);
  if (t.issuer) push(`${apiBase()}/token/logo?asset=${encodeURIComponent(`${t.code}:${t.issuer}`)}`);
  if (!out.length) {
    await loadDexIcons();
    push(dexIcon(code, null));
  }
  return out;
}

/** Deterministic hue for letter badges. */
export function fallbackHue(code: string): number {
  let h = 0;
  for (const c of code.toUpperCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
