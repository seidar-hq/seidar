// Per-pool history + trade feed for the pool page.
//   history: Aqua publishes hourly TVL / volume (amm-api statistics, USD x1e7,
//            30 days) -> daily points. Other venues have no history source.
//   trades:  Aqua's indexed event feed (swaps, deposits, withdrawals, claims);
//            Soroswap / Phoenix / Sushi from the pool contract's own events
//            via Soroban RPC getEvents (the RPC keeps a recent window only).

import { withCache } from "@seidar/cache";
import { withRpc } from "./rpc.js";
import { tokenMetas } from "./token-meta.js";

const isContract = (v: string) => /^C[A-Z2-7]{55}$/.test(v);
const err = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

export type HistoryPoint = { t: number; tvlUsd: number | null; volumeUsd: number | null };

export async function poolHistory(protocol: string, pool: string) {
  if (!isContract(pool)) return { status: 400, body: { ok: false, error: "pool required" } };
  if (protocol !== "aqua") return { status: 200, body: { ok: true, points: [], source: null } };
  try {
    const out = await withCache(`dexhist:aqua:${pool}`, 15 * 60_000, async () => {
      const r = await fetch(`https://amm-api.aqua.network/statistics/pool/${pool}/?size=1000`, { cache: "no-store" });
      if (!r.ok) throw new Error(`aqua stats http ${r.status}`);
      const j = (await r.json()) as { items?: { datetime_str: string; liquidity_usd: string; volume_usd: string }[] };
      const days = new Map<string, { t: number; tvl: number | null; vol: number; tvlAt: number }>();
      for (const it of j.items ?? []) {
        const at = Date.parse(it.datetime_str.replace(" ", "T") + "Z");
        if (!Number.isFinite(at)) continue;
        const key = it.datetime_str.slice(0, 10);
        const d = days.get(key) ?? { t: Date.parse(key + "T00:00:00Z"), tvl: null, vol: 0, tvlAt: 0 };
        const tvl = Number(it.liquidity_usd) / 1e7;
        const vol = Number(it.volume_usd) / 1e7;
        if (Number.isFinite(vol)) d.vol += vol;
        // Day TVL = the latest hourly reading of that day.
        if (Number.isFinite(tvl) && at >= d.tvlAt) {
          d.tvl = tvl;
          d.tvlAt = at;
        }
        days.set(key, d);
      }
      const points: HistoryPoint[] = [...days.values()]
        .sort((a, b) => a.t - b.t)
        .map((d) => ({ t: d.t, tvlUsd: d.tvl, volumeUsd: d.vol }));
      return { points };
    });
    return { status: 200, body: { ok: true, points: (out.value as { points: HistoryPoint[] }).points, source: "aqua" } };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}

export type Trade = {
  type: string;
  time: number | null;
  account: string | null;
  tx: string | null;
  /** Signed human amounts per token (pool -> user positive). */
  legs: { code: string; amount: number }[];
  /** Leg signs are the trader's view (sold < 0 < bought); false = sizes only. */
  signed: boolean;
};

async function aquaTrades(pool: string, limit: number): Promise<Trade[]> {
  const r = await fetch(`https://amm-api.aqua.network/events/pool/${pool}/?size=${limit}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`aqua events http ${r.status}`);
  const j = (await r.json()) as {
    items?: { event_type: string; ledger_close_at_str: string; tokens: string[]; amounts: string[]; transaction_hash: string; account_address: string }[];
  };
  const items = j.items ?? [];
  const metas = await tokenMetas([...new Set(items.flatMap((i) => i.tokens ?? []))]);
  return items.map((i) => ({
    type: i.event_type,
    time: Date.parse(i.ledger_close_at_str.replace(" ", "T") + "Z") || null,
    account: i.account_address || null,
    tx: i.transaction_hash || null,
    legs: (i.tokens ?? []).map((t, k) => {
      const m = metas[t];
      // Aqua amounts are base units with a ".0000000" tail.
      return { code: m?.code ?? `${t.slice(0, 4)}…`, amount: Math.abs(Number(i.amounts?.[k] ?? 0)) / 10 ** (m?.decimals ?? 7) };
    }),
    // Aqua's feed doesn't say which side the trader sold: sizes only.
    signed: false,
  }));
}

/** Pool contract events from Soroban RPC (recent window), decoded generically. */
async function rpcTrades(pool: string, tokens: string[], limit: number): Promise<Trade[]> {
  const sdk = await import("@stellar/stellar-sdk");
  const metas = await tokenMetas(tokens);
  type Ev = Awaited<ReturnType<import("@stellar/stellar-sdk").rpc.Server["getEvents"]>>["events"][number];
  // getEvents pages forward from startLedger, so read a recent window to
  // its end and widen it (1h -> 24h -> the RPC's ~7-day retention) until it
  // holds enough events. The RPC scans a bounded ledger range per call and
  // hands back a cursor, so each window pages until the cursor reaches the
  // tip. A window past retention fails; the widening stops there.
  const events = await withRpc(async (server) => {
    const latest = (await server.getLatestLedger()).sequence;
    let got: Ev[] = [];
    for (const back of [720, 17_280, 115_000]) {
      const all: Ev[] = [];
      try {
        let cursor: string | undefined;
        for (let page = 0; page < 80; page++) {
          const r = cursor
            ? await server.getEvents({ cursor, filters: [{ type: "contract", contractIds: [pool] }], limit: 500 })
            : await server.getEvents({ startLedger: Math.max(1, latest - back), filters: [{ type: "contract", contractIds: [pool] }], limit: 500 });
          all.push(...r.events);
          if (!r.cursor || r.cursor === cursor) break;
          cursor = r.cursor;
          if (Number(BigInt(cursor.split("-")[0]) >> 32n) >= r.latestLedger) break;
        }
      } catch {
        break;
      }
      got = all;
      if (all.length >= limit * 3) break;
    }
    return got;
  });
  const native = (v: import("@stellar/stellar-sdk").xdr.ScVal): unknown => {
    try {
      return sdk.scValToNative(v);
    } catch {
      return null;
    }
  };
  const meta = (c: string) => metas[c];
  const human = (contract: string, v: unknown) => Number(v) / 10 ** (meta(contract)?.decimals ?? 7);
  const code = (contract: string) => meta(contract)?.code ?? `${contract.slice(0, 4)}…`;
  const out: Trade[] = [];
  // Phoenix writes one event per field of an action (topic [action, field]);
  // a "sender" field opens a new record.
  let phx: { tx: string; time: number | null; type: string; f: Record<string, unknown> } | null = null;
  const flushPhx = () => {
    if (!phx) return;
    const f = phx.f;
    const legs: { code: string; amount: number }[] = [];
    if (phx.type === "swap" && typeof f.sell_token === "string" && typeof f.buy_token === "string") {
      legs.push({ code: code(f.sell_token), amount: -human(f.sell_token, f.offer_amount) });
      legs.push({ code: code(f.buy_token), amount: human(f.buy_token, f.return_amount) });
    }
    out.push({ type: phx.type, time: phx.time, account: typeof f.sender === "string" ? f.sender : null, tx: phx.tx, legs, signed: true });
    phx = null;
  };
  for (const ev of events) {
    const topics = ev.topic.map(native);
    const data = native(ev.value);
    const time = ev.ledgerClosedAt ? Date.parse(ev.ledgerClosedAt) : null;
    const t0 = typeof topics[0] === "string" ? topics[0] : "";
    const t1 = typeof topics[1] === "string" ? topics[1] : "";
    if (t0 === "SoroswapPair") {
      if (!["swap", "deposit", "withdraw"].includes(t1) || !data || typeof data !== "object") continue;
      const d = data as Record<string, unknown>;
      const n = (k: string) => Number(d[k] ?? 0);
      const legs =
        t1 === "swap"
          ? [0, 1].map((k) => ({ code: code(tokens[k]), amount: human(tokens[k], n(`amount_${k}_out`) - n(`amount_${k}_in`)) }))
          : [0, 1].map((k) => ({ code: code(tokens[k]), amount: (t1 === "deposit" ? -1 : 1) * human(tokens[k], n(`amount_${k}`)) }));
      out.push({ type: t1, time, account: typeof d.to === "string" ? d.to : null, tx: ev.txHash ?? null, legs, signed: true });
      continue;
    }
    if (["swap", "provide_liquidity", "withdraw_liquidity"].includes(t0) && t1) {
      if (!phx || phx.tx !== ev.txHash || phx.type !== t0 || t1 === "sender") {
        flushPhx();
        phx = { tx: ev.txHash ?? "", time, type: t0, f: {} };
      }
      phx.f[t1] = data;
      continue;
    }
    flushPhx();
    // Anything else (Sushi V3 …): a named action with amount0 / amount1.
    const names = topics.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
    const type = names.find((x) => ["swap", "mint", "burn", "collect", "deposit", "withdraw"].includes(x));
    if (!type) continue;
    const legs: { code: string; amount: number }[] = [];
    let account: string | null = null;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const d = data as Record<string, unknown>;
      for (const k of [0, 1]) {
        const v = d[`amount${k}`] ?? d[`amount_${k}`];
        if (v != null && tokens[k]) legs.push({ code: code(tokens[k]), amount: -human(tokens[k], v) });
      }
      // Sushi V3: the trader is the swap's sender (recipient may be a router).
      const who = d.sender ?? d.owner ?? d.recipient;
      account = typeof who === "string" ? who : null;
    }
    out.push({ type, time, account, tx: ev.txHash ?? null, legs, signed: type === "swap" });
  }
  flushPhx();
  return out.reverse().slice(0, limit);
}

export async function poolTrades(protocol: string, pool: string, tokens: string[], limit = 30) {
  if (!isContract(pool)) return { status: 400, body: { ok: false, error: "pool required" } };
  const n = Math.min(100, Math.max(5, limit));
  try {
    // Leg codes need the pool's tokens: take them from the venue board when the caller didn't.
    if (!tokens.filter(isContract).length && protocol !== "aqua") {
      const { getDexPools, isDexProtocol } = await import("./dex.js");
      if (isDexProtocol(protocol)) {
        const row = (await getDexPools(protocol).catch(() => null))?.rows.find((r) => r.address === pool);
        tokens = row?.assets.map((a) => a.contract) ?? [];
      }
    }
    const out = await withCache(`dextrades:${protocol}:${pool}:${n}`, 30_000, async () => ({
      trades: protocol === "aqua" ? await aquaTrades(pool, n) : await rpcTrades(pool, tokens.filter(isContract), n),
    }));
    return {
      status: 200,
      body: { ok: !!out.value, trades: (out.value as { trades: Trade[] } | null)?.trades ?? [], source: protocol === "aqua" ? "aqua" : "rpc-events" },
    };
  } catch (e) {
    return { status: 200, body: { ok: false, error: err(e) } };
  }
}
