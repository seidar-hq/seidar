// Wallet sign-in (SEP-53 message auth): challenge -> Freighter sign ->
// verify -> bearer session token. Tokens are stored hashed, nonces are
// single-use with a 10-minute window. Standing session *grants* (POST
// /sessions) require a valid token: unattended execution must provably
// come from the wallet owner.

import { createHash, randomBytes } from "node:crypto";
import { ensureSchema, getPool } from "./db.js";

const NONCE_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 7 * 24 * 3600_000;
// SEP-53: signature = ed25519_sign(SHA256("Stellar Signed Message:\n" + msg)).
const SEP53_PREFIX = "Stellar Signed Message:\n";

const isWallet = (v: string) => /^G[A-Z2-7]{55}$/.test(v);

export async function getChallenge(address: string) {
  if (!isWallet(address)) {
    return { status: 400, body: { ok: false, error: "invalid address" } };
  }
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = new Date().toISOString();
  const message = ["Seidar sign-in", address, `Nonce: ${nonce}`, `Issued: ${issuedAt}`].join("\n");
  const expiresAt = Date.now() + NONCE_TTL_MS;
  try {
    await ensureSchema();
    const pool = getPool();
    await pool.query("DELETE FROM auth_nonces WHERE expires_at < NOW()");
    await pool.query("INSERT INTO auth_nonces (nonce, address, expires_at) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')", [
      nonce,
      address,
    ]);
    return { status: 200, body: { ok: true, message, nonce, expiresAt } };
  } catch {
    return { status: 200, body: { ok: false, error: "db-unavailable" } };
  }
}

async function sep53Verify(address: string, message: string, sig: Buffer): Promise<boolean> {
  try {
    const sdk = await import("@stellar/stellar-sdk");
    const hash = createHash("sha256").update(SEP53_PREFIX + message, "utf8").digest();
    if (sdk.Keypair.fromPublicKey(address).verify(hash, sig)) return true;
    // Legacy wallets that sign raw bytes (pre-SEP-53): accept as fallback.
    return sdk.Keypair.fromPublicKey(address).verify(Buffer.from(message, "utf8"), sig);
  } catch {
    return false;
  }
}

export async function verifySignIn(body: {
  address?: unknown;
  message?: unknown;
  signature?: unknown;
  signerAddress?: unknown;
}) {
  const address = String(body.address ?? "");
  const message = String(body.message ?? "");
  const signature = String(body.signature ?? "");
  if (!isWallet(address)) {
    return { status: 400, body: { ok: false, error: "invalid address" } };
  }
  if (body.signerAddress && String(body.signerAddress) !== address) {
    return { status: 400, body: { ok: false, error: "signer mismatch" } };
  }
  if (!message || message.length > 2000) {
    return { status: 400, body: { ok: false, error: "invalid message" } };
  }
  if (!message.includes(address)) {
    return { status: 400, body: { ok: false, error: "message not bound to address" } };
  }
  const nonce = /Nonce: ([0-9a-f]{32})/.exec(message)?.[1];
  if (!nonce) {
    return { status: 400, body: { ok: false, error: "challenge nonce missing" } };
  }
  let sig: Buffer;
  try {
    sig = Buffer.from(signature, "base64");
  } catch {
    return { status: 400, body: { ok: false, error: "malformed signature" } };
  }
  if (sig.length !== 64) {
    return { status: 400, body: { ok: false, error: "malformed signature" } };
  }
  try {
    await ensureSchema();
    const pool = getPool();
    const used = await pool.query<{ address: string }>(
      "DELETE FROM auth_nonces WHERE nonce = $1 AND address = $2 AND expires_at > NOW() RETURNING address",
      [nonce, address],
    );
    if ((used.rowCount ?? 0) === 0) {
      return { status: 400, body: { ok: false, error: "challenge expired or already used" } };
    }
    if (!(await sep53Verify(address, message, sig))) {
      return { status: 400, body: { ok: false, error: "bad signature" } };
    }
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = Date.now() + SESSION_TTL_MS;
    await pool.query(
      "INSERT INTO auth_sessions (address, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')",
      [address, tokenHash],
    );
    await pool.query("DELETE FROM auth_sessions WHERE expires_at < NOW()");
    return { status: 200, body: { ok: true, token, expiresAt } };
  } catch {
    return { status: 200, body: { ok: false, error: "db-unavailable" } };
  }
}

/** True when `token` is a live session for `address`. */
export async function checkSession(address: string, token: string | null | undefined): Promise<boolean> {
  if (!isWallet(address) || !token || token.length < 32) return false;
  try {
    await ensureSchema();
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { rows } = await getPool().query<{ address: string }>(
      "SELECT address FROM auth_sessions WHERE token_hash = $1 AND address = $2 AND expires_at > NOW() LIMIT 1",
      [tokenHash, address],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}
