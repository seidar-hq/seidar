// Per-wallet equity snapshots (piggyback-sampled, no dedicated poller).
// The /positions route calls sampleWallet() fire-and-forget after serving:
// one row per wallet per hour max, 90-day retention, never $0 seeds.
// Sampling never throws and never delays the host request — everything is
// advisory, exactly like price_snapshots.

import { getBalances } from "./balances.js";
import { livePrices } from "./prices.js";
import { network } from "./net.js";

const SAMPLE_MS = 60 * 60_000;
const isWallet = (v: string) => /^G[A-Z2-7]{55}$/.test(v);

/** Record one equity snapshot for a wallet (no-op unless due). */
export async function sampleWallet(
  address: string,
  supplied: number,
  borrowed: number,
): Promise<void> {
  try {
    if (!isWallet(address)) return;
    const sup = Number(supplied);
    const bor = Number(borrowed);
    if (!Number.isFinite(sup) || !Number.isFinite(bor)) return;
    const { ensureSchema, getPool } = await import("./db.js");
    await ensureSchema();
    const pool = getPool();
    const last = await pool.query<{ at: unknown }>(
      "SELECT at FROM wallet_snapshots WHERE wallet = $1 AND network = $2 ORDER BY at DESC LIMIT 1",
      [address, network()],
    );
    const lastAt = last.rows[0]?.at ? new Date(last.rows[0].at as string).getTime() : 0;
    if (Date.now() - lastAt < SAMPLE_MS) return;
    const bals = await getBalances(address).catch(() => null);
    const held = bals && "balances" in bals ? bals.balances : [];
    const codes = [...new Set(held.map((b) => b.code))];
    let tokens = 0;
    if (codes.length > 0) {
      const { prices } = await livePrices(codes).catch(() => ({ prices: {} as Record<string, number | null> }));
      for (const b of held) {
        const px = (prices as Record<string, number | null>)[b.code];
        if (typeof px === "number" && px > 0) tokens += b.balance * px;
      }
    }
    const net = sup - bor + tokens;
    if (!(net > 0)) return; // never seed $0 — mirrors the client guard
    await pool.query(
      "INSERT INTO wallet_snapshots (wallet, net_worth, supplied, borrowed, tokens_value, network) VALUES ($1, $2, $3, $4, $5, $6)",
      [address, Math.round(net * 100) / 100, sup, bor, Math.round(tokens * 100) / 100, network()],
    );
    await pool.query("DELETE FROM wallet_snapshots WHERE at < NOW() - INTERVAL '90 days'");
  } catch {
    /* advisory only */
  }
}

export type EquityPoint = {
  t: number;
  net: number;
  supplied: number;
  borrowed: number;
  tokens: number;
};

/** Ordered equity curve for a wallet (oldest first, downsampled). */
export async function getPortfolioHistory(
  wallet: string,
  points: number,
): Promise<
  | { ok: true; wallet: string; points: EquityPoint[] }
  | { ok: false; error: string }
> {
  if (!isWallet(wallet)) return { ok: false, error: "invalid wallet" };
  const n = Math.max(2, Math.min(500, Math.floor(points) || 120));
  try {
    const { ensureSchema, getPool } = await import("./db.js");
    await ensureSchema();
    const { rows } = await getPool().query<{
      t: unknown;
      net: unknown;
      supplied: unknown;
      borrowed: unknown;
      tokens: unknown;
    }>(
      `SELECT EXTRACT(EPOCH FROM at) * 1000 AS t, net_worth AS net,
              supplied, borrowed, tokens_value AS tokens
       FROM wallet_snapshots WHERE wallet = $1 AND network = $2 AND at > NOW() - INTERVAL '90 days'
       ORDER BY at ASC LIMIT 2000`,
      [wallet, network()],
    );
    const all: EquityPoint[] = (rows ?? [])
      .map((r) => ({
        t: Number(r?.t),
        net: Number(r?.net),
        supplied: Number(r?.supplied ?? 0),
        borrowed: Number(r?.borrowed ?? 0),
        tokens: Number(r?.tokens ?? 0),
      }))
      .filter((p) => Number.isFinite(p.t) && p.net > 0);
    if (all.length <= n) return { ok: true, wallet, points: all };
    const stride = all.length / n;
    const out: EquityPoint[] = [];
    for (let i = 0; i < n; i++) out.push(all[Math.floor(i * stride)]);
    out.push(all[all.length - 1]);
    return { ok: true, wallet, points: out };
  } catch {
    return { ok: false, error: "db-unavailable" };
  }
}
