// In-app feedback inbox: text + attachments, stored server-side.
// Files arrive as data URLs (no multipart needed), are size/type gated,
// and land in services/api/uploads/ with random names. DB row keeps the
// wallet, text, and file metadata.

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { ensureSchema, getPool } from "./db.js";

const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/pdf",
  "application/json",
]);

export interface FeedbackFile {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

function cleanName(name: string): string {
  const base = String(name ?? "file").split(/[\\/]/).pop() || "file";
  return base.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 128) || "file";
}

export async function submitFeedback(body: {
  wallet?: unknown;
  text?: unknown;
  files?: unknown;
}): Promise<{ status: number; body: unknown }> {
  const wallet = String(body.wallet ?? "");
  if (wallet && !/^G[A-Z2-7]{55}$/.test(wallet)) {
    return { status: 400, body: { ok: false, error: "invalid wallet" } };
  }
  const text = String(body.text ?? "").trim().slice(0, 2000);
  if (!text) {
    return { status: 400, body: { ok: false, error: "feedback text required" } };
  }
  const incoming = Array.isArray(body.files) ? (body.files as FeedbackFile[]) : [];
  if (incoming.length > MAX_FILES) {
    return { status: 400, body: { ok: false, error: `at most ${MAX_FILES} files` } };
  }
    const saved: { name: string; stored: string; type: string; size: number }[] = [];
    const written: string[] = [];
    let total = 0;
  try {
    await ensureSchema();
    const dir = path.join(process.cwd(), "uploads");
    if (incoming.length > 0) {
      await mkdir(dir, { recursive: true });
    }
    for (const f of incoming) {
      const type = String(f?.type ?? "");
      const dataUrl = String(f?.dataUrl ?? "");
      const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
      if (!m || !ALLOWED_TYPES.has(type) || m[1] !== type) {
        return { status: 400, body: { ok: false, error: `unsupported file: ${cleanName(String(f?.name ?? ""))}` } };
      }
      const bytes = Buffer.from(m[2], "base64");
      if (bytes.length === 0) {
        return { status: 400, body: { ok: false, error: `empty file: ${cleanName(String(f?.name ?? ""))}` } };
      }
      total += bytes.length;
      if (total > MAX_TOTAL_BYTES) {
        for (const p of written) {
          try {
            await unlink(p);
          } catch {
            /* best-effort */
          }
        }
        return { status: 400, body: { ok: false, error: "attachments total over 4MB" } };
      }
      const stored = `${Date.now()}-${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}-${cleanName(String(f?.name ?? "file"))}`;
      const full = path.join(dir, stored);
      await writeFile(full, bytes);
      written.push(full);
      saved.push({ name: cleanName(String(f?.name ?? "file")), stored, type, size: bytes.length });
    }
    const token = randomBytes(8).toString("hex");
    const { rows } = await getPool().query<{ id: number }>(
      "INSERT INTO feedback (wallet, text, files) VALUES ($1, $2, $3) RETURNING id",
      [wallet || "", text, JSON.stringify(saved)],
    );
    return { status: 200, body: { ok: true, id: rows[0]?.id ?? null, ref: token } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/DATABASE_URL not set|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
      return { status: 200, body: { ok: false, error: "db-unavailable" } };
    }
    return { status: 200, body: { ok: false, error: String(msg).slice(0, 160) } };
  }
}
