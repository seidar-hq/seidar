// In-app feedback: text, an optional reply address and up to 4 images (2 MB in all), emailed to
// the team. On Cloudflare the mail goes out through the Email Routing send binding (worker.ts
// registers it); it goes to FEEDBACK_TO (feedback@seidar.xyz, routed to the team inbox).
// A row is also kept in the feedback table (text and file names only) when a database is there.

import { randomBytes } from "node:crypto";
import { ensureSchema, getPool } from "./db.js";

export const FEEDBACK_MAX_FILES = 4;
export const FEEDBACK_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export interface FeedbackFile {
  name: string;
  type: string;
  dataUrl: string;
}

/** Sends one raw MIME message (from, to, raw). */
export type Mailer = (from: string, to: string, raw: string) => Promise<void>;
let mailer: Mailer | null = null;
export function setFeedbackMailer(m: Mailer): void {
  mailer = m;
}

const FROM = process.env.FEEDBACK_FROM || "feedback@seidar.xyz";

function cleanName(name: string): string {
  const base = String(name ?? "image").split(/[\\/]/).pop() || "image";
  return base.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 96) || "image";
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
/** 76-character lines (RFC 2045). Slicing, not a regex: images are megabytes and CPU time is metered. */
function wrap(s: string): string {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += 76) out.push(s.slice(i, i + 76));
  return out.join("\r\n") + "\r\n";
}
const header = (s: string) => `=?UTF-8?B?${b64(s)}?=`;
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

function mime(to: string, subject: string, text: string, replyTo: string | null, files: { name: string; type: string; base64: string }[]): string {
  const boundary = `seidar-${randomBytes(12).toString("hex")}`;
  const lines = [
    `From: Seidar Feedback <${FROM}>`,
    `To: <${to}>`,
    ...(replyTo ? [`Reply-To: <${replyTo}>`] : []),
    `Subject: ${header(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomBytes(16).toString("hex")}@seidar.xyz>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="utf-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(b64(text)),
  ];
  for (const f of files) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${f.type}; name="${f.name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${f.name}"`,
      "",
      wrap(f.base64),
    );
  }
  lines.push(`--${boundary}--`, "");
  return lines.join("\r\n");
}

export async function submitFeedback(body: {
  wallet?: unknown;
  text?: unknown;
  email?: unknown;
  page?: unknown;
  files?: unknown;
}): Promise<{ status: number; body: unknown }> {
  const bad = (error: string) => ({ status: 400, body: { ok: false, error } });
  const wallet = String(body.wallet ?? "");
  if (wallet && !/^[GC][A-Z2-7]{55}$/.test(wallet)) return bad("invalid wallet");
  const text = String(body.text ?? "").trim().slice(0, 4000);
  if (!text) return bad("Write your feedback first.");
  const email = oneLine(String(body.email ?? "")).slice(0, 200);
  if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) return bad("That email address doesn't look right.");
  const page = oneLine(String(body.page ?? "")).slice(0, 300);

  const incoming = Array.isArray(body.files) ? (body.files as FeedbackFile[]) : [];
  if (incoming.length > FEEDBACK_MAX_FILES) return bad(`Attach at most ${FEEDBACK_MAX_FILES} images.`);
  const files: { name: string; type: string; base64: string; size: number }[] = [];
  let total = 0;
  for (const f of incoming) {
    const name = cleanName(String(f?.name ?? ""));
    const url = String(f?.dataUrl ?? "");
    const comma = url.indexOf(",");
    const head = comma > 0 && comma < 64 ? /^data:([a-z/+.-]+);base64$/.exec(url.slice(0, comma)) : null;
    const data = head ? url.slice(comma + 1) : "";
    if (!head || !IMAGE_TYPES.has(head[1]) || !data || /[^A-Za-z0-9+/=]/.test(data.slice(0, 256)))
      return bad(`${name} isn't a PNG, JPEG, GIF or WebP image.`);
    const size = Buffer.byteLength(data, "base64");
    if (!size) return bad(`${name} is empty.`);
    total += size;
    if (total > FEEDBACK_MAX_BYTES) return bad("Images can be 2 MB in total.");
    files.push({ name, type: head[1], base64: data, size });
  }

  const to = process.env.FEEDBACK_TO;
  if (!mailer || !to) return { status: 503, body: { ok: false, error: "feedback-not-configured" } };

  const summary = oneLine(text).slice(0, 60);
  const message = [
    text,
    "",
    "—",
    `Wallet: ${wallet || "not connected"}`,
    `Reply to: ${email || "not given"}`,
    `Page: ${page || "unknown"}`,
    `Images: ${files.length ? files.map((f) => `${f.name} (${Math.ceil(f.size / 1024)} KB)`).join(", ") : "none"}`,
  ].join("\n");
  try {
    await mailer(FROM, to, mime(to, `Seidar feedback: ${summary}${summary.length < oneLine(text).length ? "…" : ""}`, message, email || null, files));
  } catch (e) {
    console.error("feedback mail failed", e instanceof Error ? e.message : e);
    return { status: 502, body: { ok: false, error: "Couldn't send your feedback right now. Try again in a minute." } };
  }

  // Keep a record when a database is attached; the email is what matters, so failures are ignored.
  try {
    await ensureSchema();
    await getPool().query("INSERT INTO feedback (wallet, text, files) VALUES ($1, $2, $3)", [
      wallet,
      email ? `${text}\n\nReply to: ${email}` : text,
      JSON.stringify(files.map((f) => ({ name: f.name, type: f.type, size: f.size }))),
    ]);
  } catch {
    /* no database (local dev without Postgres) */
  }
  return { status: 200, body: { ok: true } };
}
