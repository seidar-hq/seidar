// Swap activity for the venues that publish no stats (Soroswap, Phoenix,
// Sushi): one venue-wide getEvents scan per venue over everything the RPC
// still keeps (~7 days), then incremental scans every few minutes. Per pool:
// swap count and USD volume (input side x live price) over the last 7 days,
// from which the pool board derives a fee APY:
//   fee APY = (7d volume / 7) x fee x 365 / TVL.
// Aqua publishes its own stats (dex.ts) and isn't scanned here.
//
// Event shapes (verified on mainnet 2026-10-18):
//   Soroswap pair: topics [String "SoroswapPair", Symbol "swap"],
//                  data { amount_0_in, amount_1_in, amount_0_out, amount_1_out, to }
//   Phoenix pool:  one event per field, topics [String "swap", String field]
//                  (sender, sell_token, offer_amount, buy_token, return_amount…)
//   Sushi V3 pool: topics [Symbol "swap"], data { amount0, amount1 } signed
//                  from the pool's view (positive = paid in)

import { withRpc } from "./rpc.js";
import { pricesByContract } from "./contract-price.js";

export type Venue = "soroswap" | "phoenix" | "sushi";
const WINDOW_MS = 7 * 24 * 3600_000;
const RESCAN_MS = 5 * 60_000;

type Swap = { at: number; pool: string; token: string; amount: bigint };
const swaps: Record<Venue, Swap[]> = { soroswap: [], phoenix: [], sushi: [] };
const cursorLedger: Record<Venue, number> = { soroswap: 0, phoenix: 0, sushi: 0 };
const lastScan: Record<Venue, number> = { soroswap: 0, phoenix: 0, sushi: 0 };
const scanning: Partial<Record<Venue, Promise<void>>> = {};
/** Pool -> its tokens in pool order (from the board), for Soroswap / Sushi. */
const poolTokens = new Map<string, string[]>();

export function registerPools(rows: { address: string; assets: { contract: string }[] }[]) {
  for (const r of rows) if (!poolTokens.has(r.address)) poolTokens.set(r.address, r.assets.map((a) => a.contract));
}

async function scan(venue: Venue): Promise<void> {
  const sdk = await import("@stellar/stellar-sdk");
  const str = (s: string) => sdk.xdr.ScVal.scvString(s).toXDR("base64");
  const sym = (s: string) => sdk.xdr.ScVal.scvSymbol(s).toXDR("base64");
  const topics =
    venue === "soroswap" ? [[str("SoroswapPair"), sym("swap")]] : venue === "phoenix" ? [[str("swap"), "*"]] : [[sym("swap")]];
  const native = (v: import("@stellar/stellar-sdk").xdr.ScVal): unknown => {
    try {
      return sdk.scValToNative(v);
    } catch {
      return null;
    }
  };
  const fresh: Swap[] = [];
  // Phoenix: fields of one swap arrive as separate events of one tx.
  const phx = new Map<string, { at: number; pool: string; f: Record<string, unknown> }>();
  await withRpc(async (server) => {
    const latest = (await server.getLatestLedger()).sequence;
    // Oldest the RPC keeps: an out-of-range start fails, so step forward.
    let start = cursorLedger[venue] || latest - 120_000;
    let cursor: string | undefined;
    for (let page = 0; page < 400; page++) {
      let r: Awaited<ReturnType<typeof server.getEvents>>;
      try {
        r = cursor
          ? await server.getEvents({ cursor, filters: [{ type: "contract", topics }], limit: 1000 })
          : await server.getEvents({ startLedger: start, filters: [{ type: "contract", topics }], limit: 1000 });
      } catch (e) {
        if (!cursor && page < 6) {
          start += 20_000; // before retention: move the window up
          continue;
        }
        throw e;
      }
      for (const ev of r.events) {
        const pool = String(ev.contractId ?? "");
        const at = ev.ledgerClosedAt ? Date.parse(ev.ledgerClosedAt) : Date.now();
        const data = native(ev.value);
        if (venue === "soroswap") {
          const toks = poolTokens.get(pool);
          const d = data as Record<string, unknown> | null;
          if (!toks || !d) continue;
          for (const k of [0, 1]) {
            const amt = BigInt(String(d[`amount_${k}_in`] ?? 0));
            if (amt > 0n) fresh.push({ at, pool, token: toks[k], amount: amt });
          }
        } else if (venue === "sushi") {
          const toks = poolTokens.get(pool);
          const d = data as Record<string, unknown> | null;
          if (!toks || !d || d.amount0 == null) continue; // other contracts' "swap" events
          for (const k of [0, 1]) {
            const amt = BigInt(String(d[`amount${k}`] ?? 0));
            if (amt > 0n) fresh.push({ at, pool, token: toks[k], amount: amt });
          }
        } else {
          const field = native(ev.topic[1]);
          if (typeof field !== "string") continue;
          const key = `${ev.txHash}:${pool}`;
          const cur = phx.get(key) ?? { at, pool, f: {} };
          cur.f[field] = data;
          phx.set(key, cur);
        }
      }
      if (!r.cursor || r.cursor === cursor) break;
      cursor = r.cursor;
      // Cursor = TOID: its ledger is the high 32 bits.
      const curLedger = Number(BigInt(cursor.split("-")[0]) >> 32n);
      if (curLedger >= r.latestLedger) break;
    }
    cursorLedger[venue] = latest;
  });
  for (const { at, pool, f } of phx.values()) {
    if (typeof f.sell_token === "string" && f.offer_amount != null)
      fresh.push({ at, pool, token: f.sell_token, amount: BigInt(String(f.offer_amount)) });
  }
  const cutoff = Date.now() - WINDOW_MS;
  swaps[venue] = [...swaps[venue], ...fresh].filter((s) => s.at >= cutoff);
  lastScan[venue] = Date.now();
}

/** Kick a (re)scan when due; never blocks a caller. */
export function refreshActivity(venue: Venue) {
  if (scanning[venue] || Date.now() - lastScan[venue] < RESCAN_MS) return;
  scanning[venue] = scan(venue)
    .catch((e) => console.error(`[dex-activity] ${venue}:`, e instanceof Error ? e.message : e))
    .finally(() => {
      delete scanning[venue];
    });
}

export type PoolActivity = { trades7d: number; volume7dUsd: number | null };

// Pricing the swap list is the slow part: keep the result until the next scan (or 5 min).
const activityMemo: Partial<Record<Venue, { scanAt: number; at: number; value: Map<string, PoolActivity> }>> = {};
const activityInflight: Partial<Record<Venue, Promise<Map<string, PoolActivity>>>> = {};

/** 7-day trades + USD volume per pool (null volume = an unpriced input). */
export async function venueActivity(venue: Venue): Promise<{ ready: boolean; byPool: Map<string, PoolActivity> }> {
  if (!lastScan[venue]) return { ready: false, byPool: new Map() };
  const memo = activityMemo[venue];
  if (memo && memo.scanAt === lastScan[venue] && Date.now() - memo.at < 5 * 60_000) return { ready: true, byPool: memo.value };
  // A stale memo still answers instantly while the new one is computed.
  const job = (activityInflight[venue] ??= computeActivity(venue)
    .then((value) => {
      activityMemo[venue] = { scanAt: lastScan[venue], at: Date.now(), value };
      return value;
    })
    .finally(() => {
      delete activityInflight[venue];
    }));
  if (memo) return { ready: true, byPool: memo.value };
  return { ready: true, byPool: await job };
}

async function computeActivity(venue: Venue): Promise<Map<string, PoolActivity>> {
  const list = swaps[venue];
  const byPool = new Map<string, PoolActivity>();
  const { prices } = await pricesByContract([...new Set(list.map((s) => s.token))]).catch(() => ({ prices: {} as Record<string, number | null> }));
  const { tokenMetas } = await import("./token-meta.js");
  const metas = await tokenMetas([...new Set(list.map((s) => s.token))]);
  for (const s of list) {
    const a = byPool.get(s.pool) ?? { trades7d: 0, volume7dUsd: 0 };
    a.trades7d += 1;
    const px = prices[s.token];
    const dec = metas[s.token]?.decimals ?? 7;
    if (a.volume7dUsd != null) a.volume7dUsd = px != null && px > 0 ? a.volume7dUsd + (Number(s.amount) / 10 ** dec) * px : null;
    byPool.set(s.pool, a);
  }
  return byPool;
}
