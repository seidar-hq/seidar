// Token icons for every token in the DEX catalogues (Aqua, Phoenix,
// Soroswap, Sushi), resolved per CONTRACT so a copycat sharing a ticker
// never borrows the real token's logo:
//   1. Soroswap's token list entry for that contract;
//   2. the exact asset's stellar.toml image, as indexed by Stellar Expert
//      (asset lookup by contract address).
// Results persist in token_icons (icon, checked_at): each contract is
// looked up once; misses are re-checked weekly. Unknown contracts are filled
// in the background, a few at a time, so a request never waits on hundreds
// of lookups.

import { ensureSchema, getPool, inList } from "./db.js";
import { getDexPools, DEX_PROTOCOLS } from "./dex.js";

const LIST_URL = "https://raw.githubusercontent.com/soroswap/token-list/main/tokenList.json";
const RECHECK_MS = 7 * 24 * 3600_000;

let listIcons: Record<string, string> | null = null;
let listAt = 0;
async function soroswapIcons(): Promise<Record<string, string>> {
  if (listIcons && Date.now() - listAt < 6 * 3600_000) return listIcons;
  try {
    const body = (await fetch(LIST_URL, { signal: AbortSignal.timeout(15000) }).then((r) => r.json())) as {
      assets?: { contract?: string; icon?: string }[];
    };
    const map: Record<string, string> = {};
    for (const a of body.assets ?? []) if (a.contract && a.icon && !map[a.contract]) map[a.contract] = a.icon;
    listIcons = map;
    listAt = Date.now();
  } catch {
    listIcons = listIcons ?? {};
  }
  return listIcons;
}

/** The asset's own published image (stellar.toml via Stellar Expert), or null. */
async function expertIcon(contract: string): Promise<string | null> {
  const r = await fetch(`https://api.stellar.expert/explorer/public/asset/${contract}`, {
    signal: AbortSignal.timeout(12000),
  });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error(`stellar.expert ${r.status}`);
  const d = (await r.json()) as { toml_info?: { image?: string; orgLogo?: string } };
  const img = d.toml_info?.image || null;
  return img && /^https:\/\//.test(img) ? img : null;
}

let schemaReady = false;
async function schema() {
  if (schemaReady) return;
  await ensureSchema();
  // D1 creates token_icons with the rest of the schema; Postgres adds it here.
  if (!process.env.DATABASE_URL) {
    schemaReady = true;
    return;
  }
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS token_icons (
      contract TEXT PRIMARY KEY,
      icon TEXT,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  schemaReady = true;
}

let filling = false;
/** Look up icons for contracts not checked recently (background, 2 at a time). */
async function fill(contracts: string[]) {
  if (filling || !contracts.length) return;
  filling = true;
  try {
    const list = await soroswapIcons();
    let i = 0;
    const worker = async () => {
      while (i < contracts.length) {
        const c = contracts[i++];
        let icon: string | null = list[c] ?? null;
        try {
          if (!icon) icon = await expertIcon(c);
        } catch {
          continue; // rate-limited / offline: retried on a later request
        }
        await getPool()
          .query(
            `INSERT INTO token_icons (contract, icon, checked_at) VALUES ($1, $2, $3)
             ON CONFLICT (contract) DO UPDATE SET icon = $2, checked_at = $3`,
            [c, icon, new Date().toISOString()],
          )
          .catch(() => {});
        await new Promise((r) => setTimeout(r, 400));
      }
    };
    await Promise.all([worker(), worker()]);
  } finally {
    filling = false;
  }
}

/**
 * Icons for every DEX token: byContract, plus byCode for tickers that map to
 * exactly one contract across the catalogues (safe to look up by code).
 */
export async function dexTokenIcons() {
  try {
    await schema();
    const tokens = new Map<string, string>(); // contract -> code
    for (const p of DEX_PROTOCOLS) {
      const d = await getDexPools(p).catch(() => null);
      for (const r of d?.rows ?? []) for (const a of r.assets) if (a.contract) tokens.set(a.contract, a.code.toUpperCase());
    }
    const contracts = [...tokens.keys()];
    const rows: { contract: string; icon: string | null; checked_at: Date | string | null }[] = [];
    for (let i = 0; i < contracts.length; i += 90) {
      const part = contracts.slice(i, i + 90);
      const r = await getPool().query<{ contract: string; icon: string | null; checked_at: Date | string | null }>(
        `SELECT contract, icon, checked_at FROM token_icons WHERE contract IN (${inList(part.length, 1)})`,
        part,
      );
      rows.push(...r.rows);
    }
    const known = new Map(rows.map((r) => [r.contract, r]));
    const list = await soroswapIcons();
    const byContract: Record<string, string> = {};
    for (const c of contracts) {
      const icon = list[c] ?? known.get(c)?.icon ?? null;
      if (icon) byContract[c] = icon;
    }
    const stale = contracts.filter((c) => {
      if (list[c]) return false;
      const k = known.get(c);
      return !k?.checked_at || (!k.icon && Date.now() - new Date(k.checked_at).getTime() > RECHECK_MS);
    });
    void fill(stale);
    const codeCount = new Map<string, number>();
    for (const code of tokens.values()) codeCount.set(code, (codeCount.get(code) ?? 0) + 1);
    const byCode: Record<string, string> = {};
    for (const [c, code] of tokens) if (codeCount.get(code) === 1 && byContract[c]) byCode[code] = byContract[c];
    return { status: 200, body: { ok: true, byContract, byCode, pending: stale.length } };
  } catch (e) {
    return { status: 200, body: { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 160) } };
  }
}
