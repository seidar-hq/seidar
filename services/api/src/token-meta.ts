// Token metadata from the token contract itself (symbol/decimals/name),
// cached in memory + Postgres (token_meta) since it never changes.
// Code preference: Soroswap token list (canonical tickers) > contract symbol.
// SAC for native XLM reports symbol "native" — normalized to XLM.

import { ensureSchema, getPool } from "./db.js";
import { mapLimit, sorobanView } from "./rpc.js";

export interface TokenMeta {
  contract: string;
  code: string;
  decimals: number;
  name: string;
}

const KNOWN: Record<string, TokenMeta> = {
  CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA: {
    contract: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
    code: "XLM",
    decimals: 7,
    name: "Stellar Lumens",
  },
  CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75: {
    contract: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    code: "USDC",
    decimals: 7,
    name: "USD Coin",
  },
  CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV: {
    contract: "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV",
    code: "EURC",
    decimals: 7,
    name: "EURC",
  },
};

const mem = new Map<string, TokenMeta>(Object.entries(KNOWN));
let listCodes: Record<string, string> | null = null;
let listAt = 0;

async function tokenListCodes(): Promise<Record<string, string>> {
  if (listCodes && Date.now() - listAt < 6 * 3600_000) return listCodes;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const list = (await fetch(
        "https://raw.githubusercontent.com/soroswap/token-list/main/tokenList.json",
        { signal: ctrl.signal },
      ).then((r) => r.json())) as { assets?: { code?: string; contract?: string }[] };
      const map: Record<string, string> = {};
      for (const a of list.assets ?? []) {
        if (a.contract && a.code && !map[a.contract]) map[a.contract] = a.code.toUpperCase();
      }
      listCodes = map;
      listAt = Date.now();
    } finally {
      clearTimeout(t);
    }
  } catch {
    listCodes = listCodes ?? {};
  }
  return listCodes;
}

function cleanSymbol(sym: string): string {
  const s = sym.trim();
  if (s.toLowerCase() === "native") return "XLM";
  // Classic SAC names look like "CODE:ISSUER"; symbol is already CODE.
  return s.split(":")[0].toUpperCase().slice(0, 12) || "?";
}

/** Metadata for one token contract; null only when the contract is unreadable. */
export async function tokenMeta(contract: string): Promise<TokenMeta | null> {
  const hit = mem.get(contract);
  if (hit) return hit;
  try {
    await ensureSchema();
    const { rows } = await getPool().query<{ code: string; decimals: number; name: string }>(
      "SELECT code, decimals, name FROM token_meta WHERE contract = $1",
      [contract],
    );
    if (rows[0]) {
      const m = { contract, code: rows[0].code, decimals: rows[0].decimals, name: rows[0].name };
      mem.set(contract, m);
      return m;
    }
  } catch {
    /* DB optional */
  }
  try {
    const [sym, dec, name] = await Promise.all([
      sorobanView(contract, "symbol").catch(() => null),
      sorobanView(contract, "decimals"),
      sorobanView(contract, "name").catch(() => ""),
    ]);
    const decimals = Number(dec);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) return null;
    const codes = await tokenListCodes();
    const code = codes[contract] ?? cleanSymbol(String(sym ?? ""));
    const m: TokenMeta = { contract, code, decimals, name: String(name ?? "") };
    mem.set(contract, m);
    try {
      await getPool().query(
        `INSERT INTO token_meta (contract, code, decimals, name) VALUES ($1, $2, $3, $4)
         ON CONFLICT (contract) DO UPDATE SET code = $2, decimals = $3, name = $4, updated_at = $5`,
        [contract, m.code, m.decimals, m.name, new Date().toISOString()],
      );
    } catch {
      /* DB optional */
    }
    return m;
  } catch {
    return null;
  }
}

/** True when the contract is canonical (pinned or on the Soroswap list). */
export async function isListedToken(contract: string): Promise<boolean> {
  if (KNOWN[contract]) return true;
  const codes = await tokenListCodes();
  return !!codes[contract];
}

export async function tokenMetas(contracts: string[]): Promise<Record<string, TokenMeta>> {
  const uniq = [...new Set(contracts)];
  const out: Record<string, TokenMeta> = {};
  const metas = await mapLimit(uniq, 4, (c) => tokenMeta(c));
  uniq.forEach((c, i) => {
    const m = metas[i];
    if (m) out[c] = m;
  });
  return out;
}
