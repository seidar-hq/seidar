// Per-wallet notifications (header bell). Ported from real_seidar's userdb.ts.
// Each op returns {status, body} so any HTTP runtime can serve it. DB failures stay
// HTTP 200 db-unavailable / db-error; the UI then shows an empty list.

import { dbError, dbUnavailable, ensureSchema, getPool, inList, isDbMissing, type DbNote } from "./db.js";

export const isWallet = (v: string) => /^G[A-Z2-7]{55}$/.test(v);

function toNote(r: DbNote) {
  return { id: r.id, text: r.text, at: r.created_at, read: Boolean(r.read) };
}

/** Unread notes only: "Mark all as read" clears the bell's list (read rows stay, so the welcome isn't re-sent). */
export async function listNotes(wallet: string) {
  if (!isWallet(wallet)) return { status: 400, body: { error: "invalid wallet" } };
  try {
    await ensureSchema();
    const { rows } = await getPool().query<DbNote>(
      "SELECT id, wallet, text, created_at, read FROM notifications WHERE wallet = $1 AND read = $2 ORDER BY id DESC LIMIT 30",
      [wallet, false],
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
      const existing = await pool.query<{ id: number }>(
        "SELECT id FROM notifications WHERE wallet = $1 AND text LIKE 'Welcome to Seidar%' ORDER BY id ASC LIMIT 50",
        [wallet],
      );
      // rows, not rowCount: on D1 a SELECT's rowCount is the number of rows *changed* (always 0).
      if (existing.rows.length > 0) {
        // Before that fix every connect added another welcome: keep the first, mark the copies read.
        const extra = existing.rows.slice(1).map((r) => Number(r.id));
        if (extra.length)
          await pool.query(`UPDATE notifications SET read = $2 WHERE wallet = $1 AND id IN (${inList(extra.length, 3)})`, [wallet, true, ...extra]);
        return { status: 200, body: { ok: true, created: false } };
      }
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
      await pool.query("UPDATE notifications SET read = $2 WHERE wallet = $1 AND read = $3", [wallet, true, false]);
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      const ids = (body.ids as unknown[]).map(Number).filter(Number.isFinite).slice(0, 200);
      if (ids.length)
        await pool.query(`UPDATE notifications SET read = $2 WHERE wallet = $1 AND id IN (${inList(ids.length, 3)})`, [wallet, true, ...ids]);
    }
    return { status: 200, body: { ok: true } };
  } catch (e) {
    return isDbMissing(e) ? dbUnavailable() : dbError();
  }
}
