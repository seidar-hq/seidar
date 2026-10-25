// Per-wallet notifications (header bell). Ported from real_seidar's userdb.ts.
// Each op returns {status, body} so any HTTP runtime can serve it. DB failures stay
// HTTP 200 db-unavailable / db-error; the UI then shows an empty list.

import { dbError, dbUnavailable, ensureSchema, getPool, isDbMissing, type DbNote } from "./db.js";

export const isWallet = (v: string) => /^G[A-Z2-7]{55}$/.test(v);

function toNote(r: DbNote) {
  return { id: r.id, text: r.text, at: r.created_at, read: r.read };
}

export async function listNotes(wallet: string) {
  if (!isWallet(wallet)) return { status: 400, body: { error: "invalid wallet" } };
  try {
    await ensureSchema();
    const { rows } = await getPool().query<DbNote>(
      "SELECT id, wallet, text, created_at, read FROM notifications WHERE wallet = $1 ORDER BY id DESC LIMIT 30",
      [wallet],
    );
    return { status: 200, body: { ok: true, notes: rows.map(toNote) } };
  } catch (e) {
    return isDbMissing(e) ? dbUnavailable() : dbError();
  }
}

export async function createNote(body: Record<string, unknown>) {
  const wallet = String(body.wallet ?? "");
  if (!isWallet(wallet)) return { status: 400, body: { error: "invalid wallet" } };
  try {
    await ensureSchema();
    const pool = getPool();
    if (body.welcome) {
      const existing = await pool.query(
        "SELECT id FROM notifications WHERE wallet = $1 AND text LIKE 'Welcome to Seidar%' LIMIT 1",
        [wallet],
      );
      if (existing.rowCount && existing.rowCount > 0) return { status: 200, body: { ok: true, created: false } };
      const { rows } = await pool.query<DbNote>(
        "INSERT INTO notifications (wallet, text) VALUES ($1, $2) RETURNING id, wallet, text, created_at, read",
        [
          wallet,
          `Welcome to Seidar, ${wallet.slice(0, 4)}…${wallet.slice(-4)}. Your balances, lending, pools, vaults and perps on Stellar now live in one place.`,
        ],
      );
      return { status: 200, body: { ok: true, created: true, note: toNote(rows[0]) } };
    }
    const text = String(body.text ?? "").slice(0, 500);
    if (!text) return { status: 400, body: { error: "empty text" } };
    const { rows } = await pool.query<DbNote>(
      "INSERT INTO notifications (wallet, text) VALUES ($1, $2) RETURNING id, wallet, text, created_at, read",
      [wallet, text],
    );
    return { status: 200, body: { ok: true, created: true, note: toNote(rows[0]) } };
  } catch (e) {
    return isDbMissing(e) ? dbUnavailable() : dbError();
  }
}

export async function markNotes(body: Record<string, unknown>) {
  const wallet = String(body.wallet ?? "");
  if (!isWallet(wallet)) return { status: 400, body: { error: "invalid wallet" } };
  try {
    await ensureSchema();
    const pool = getPool();
    if (body.all) {
      await pool.query("UPDATE notifications SET read = TRUE WHERE wallet = $1 AND read = FALSE", [wallet]);
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      await pool.query("UPDATE notifications SET read = TRUE WHERE wallet = $1 AND id = ANY($2)", [
        wallet,
        (body.ids as unknown[]).map(Number),
      ]);
    }
    return { status: 200, body: { ok: true } };
  } catch (e) {
    return isDbMissing(e) ? dbUnavailable() : dbError();
  }
}
