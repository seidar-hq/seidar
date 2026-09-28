import { NextResponse } from "next/server";
import { ensureSchema, getPool, type DbNote } from "@/lib/db";

export const dynamic = "force-dynamic";

function toNote(r: DbNote) {
  return { id: r.id, text: r.text, at: r.created_at, read: r.read };
}

function isDbMissing(e: unknown) {
  return e instanceof Error && /DATABASE_URL not set|ECONNREFUSED|ENOTFOUND/i.test(e.message + (e as { code?: string }).code);
}

/** List latest notifications for a wallet (newest first). */
export async function GET(req: Request) {
  const wallet = new URL(req.url).searchParams.get("wallet") ?? "";
  if (!/^G[A-Z2-7]{55}$/.test(wallet)) {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }
  try {
    await ensureSchema();
    const { rows } = await getPool().query<DbNote>(
      "SELECT id, wallet, text, created_at, read FROM notifications WHERE wallet = $1 ORDER BY id DESC LIMIT 20",
      [wallet]
    );
    return NextResponse.json({ ok: true, notes: rows.map(toNote) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: isDbMissing(e) ? "db-unavailable" : "db-error" }, { status: 200 });
  }
}

/**
 * Create a notification. `{ wallet, welcome: true }` inserts the welcome
 * message exactly once per wallet (no-op when one already exists).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const wallet = String(body.wallet ?? "");
  if (!/^G[A-Z2-7]{55}$/.test(wallet)) {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }
  try {
    await ensureSchema();
    const pool = getPool();
    if (body.welcome) {
      const existing = await pool.query("SELECT id FROM notifications WHERE wallet = $1 AND text LIKE 'Welcome to Seidar%' LIMIT 1", [wallet]);
      if (existing.rowCount && existing.rowCount > 0) {
        return NextResponse.json({ ok: true, created: false });
      }
      const { rows } = await pool.query<DbNote>(
        "INSERT INTO notifications (wallet, text) VALUES ($1, $2) RETURNING id, wallet, text, created_at, read",
        [wallet, `Welcome to Seidar, ${wallet.slice(0, 4)}…${wallet.slice(-4)} — your positions, keepers and gas credits live here. Start with a testnet Boost to see automation in action.`]
      );
      return NextResponse.json({ ok: true, created: true, note: toNote(rows[0]) });
    }
    const text = String(body.text ?? "").slice(0, 500);
    if (!text) return NextResponse.json({ error: "empty text" }, { status: 400 });
    const { rows } = await pool.query<DbNote>(
      "INSERT INTO notifications (wallet, text) VALUES ($1, $2) RETURNING id, wallet, text, created_at, read",
      [wallet, text]
    );
    return NextResponse.json({ ok: true, created: true, note: toNote(rows[0]) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: isDbMissing(e) ? "db-unavailable" : "db-error" }, { status: 200 });
  }
}

/** Mark notifications read: `{ wallet, all: true }` or `{ wallet, ids: [...] }`. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const wallet = String(body.wallet ?? "");
  if (!/^G[A-Z2-7]{55}$/.test(wallet)) {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }
  try {
    await ensureSchema();
    const pool = getPool();
    if (body.all) {
      await pool.query("UPDATE notifications SET read = TRUE WHERE wallet = $1 AND read = FALSE", [wallet]);
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      await pool.query("UPDATE notifications SET read = TRUE WHERE wallet = $1 AND id = ANY($2)", [wallet, body.ids.map(Number)]);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: isDbMissing(e) ? "db-unavailable" : "db-error" }, { status: 200 });
  }
}
