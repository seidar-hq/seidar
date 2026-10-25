// Logo URL for a classic asset (CODE:ISSUER): Soroswap's token list first, then the issuer's
// stellar.toml image as indexed by Stellar Expert. Matched on code AND issuer so a copycat ticker
// never borrows a real token's logo. Memory-cached; misses are retried after a day.

const LIST_URL = "https://raw.githubusercontent.com/soroswap/token-list/main/tokenList.json";
const HIT_TTL = 7 * 24 * 3600_000;
const MISS_TTL = 24 * 3600_000;

const cache = new Map<string, { at: number; url: string | null }>();
let list: { at: number; map: Map<string, string> } | null = null;

async function soroswapList(): Promise<Map<string, string>> {
  if (list && Date.now() - list.at < 6 * 3600_000) return list.map;
  const map = new Map<string, string>();
  try {
    const body = (await fetch(LIST_URL, { signal: AbortSignal.timeout(15_000) }).then((r) => r.json())) as {
      assets?: { code?: string; issuer?: string; icon?: string }[];
    };
    for (const a of body.assets ?? [])
      if (a.code && a.issuer && a.icon) map.set(`${a.code.toUpperCase()}:${a.issuer}`, a.icon);
  } catch {
    if (list) return list.map;
  }
  list = { at: Date.now(), map };
  return map;
}

async function expertImage(code: string, issuer: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.stellar.expert/explorer/public/asset/${code}-${issuer}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { toml_info?: { image?: string; orgLogo?: string } };
    return j.toml_info?.image ?? j.toml_info?.orgLogo ?? null;
  } catch {
    return null;
  }
}

export async function tokenLogo(code: string, issuer: string): Promise<string | null> {
  const key = `${code.toUpperCase()}:${issuer}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.url ? HIT_TTL : MISS_TTL)) return hit.url;
  // Stellar Expert serves images from its CDN; Soroswap list entries are often slow IPFS links.
  const url = (await expertImage(code, issuer)) ?? (await soroswapList()).get(key) ?? null;
  cache.set(key, { at: Date.now(), url: url && /^https:\/\//.test(url) ? url : null });
  return cache.get(key)!.url;
}
