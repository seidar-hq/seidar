// One execution path for every on-chain action:
//   build (API: unsigned, simulated XDR) -> sign (wallet) -> send (API: submit + wait for the ledger).
// `ok` only means ledger SUCCESS; failures surface as TxError with the hash when there is one.
// Watch-only test wallets stop after the build and surface the XDR (WatchOnlyError).
// When the send step gives no clear answer (dropped connection while the user was in their wallet
// app, an API error, a timeout), the outcome is read from the ledger by hash instead of guessed.

import { apiFetch } from "./api";
import { MAINNET_PASSPHRASE, WatchOnlyError, kitSignTransaction, type WalletKind } from "./wallets";
import { refreshBalances } from "@/wallet/useBalances";
import { pushNote } from "@/components/layout/NotificationButton";

export const explorerTx = (hash: string) => `https://stellar.expert/explorer/public/tx/${hash}`;

export type StepStatus =
  | "queued"
  | "building"
  | "signing"
  | "sending"
  /** No clear answer from the API: checking the ledger for this transaction. */
  | "confirming"
  /** Submitted but not seen on the ledger yet (the explorer link has the outcome). */
  | "submitted"
  | "done"
  | "failed"
  | "unsigned";

export type TxStep = {
  key: string;
  label: string;
  status: StepStatus;
  hash?: string | null;
  error?: string | null;
  /** Built XDR, kept for watch-only wallets so the flow can be inspected. */
  xdr?: string | null;
};

export class TxError extends Error {
  constructor(
    message: string,
    public hash: string | null = null,
  ) {
    super(message);
  }
}

/** Signed and submitted, but its outcome was not visible on the ledger in time. */
export class TxPending extends Error {
  constructor(public hash: string) {
    super("Submitted. Waiting for Stellar to confirm it.");
  }
}

export type Signer = { address: string; walletId: WalletKind };

/** Product + protocol label sent with each submission (public analytics counts by these). */
export type TxMeta = { kind: string; protocol: string };

/** The label for a build endpoint and its request body. */
export function txMeta(path: string, body: unknown): TxMeta | undefined {
  const p = (body as { protocol?: unknown } | null)?.protocol;
  const protocol = typeof p === "string" ? p : "";
  if (path.includes("/zenex/")) return { kind: "perps", protocol: "zenex" };
  if (path.includes("/lending/claim")) return { kind: "claim", protocol: "blend" };
  if (path.includes("/lending/")) return { kind: "lending", protocol };
  if (path.includes("/vaults/")) return { kind: "vault", protocol };
  if (path.includes("/dex/")) return { kind: "liquidity", protocol };
  return undefined;
}

/** Stellar transaction result codes, in words. */
const TX_CODES: Record<string, string> = {
  txBAD_SEQ: "Your account sent another transaction first. Please try again.",
  txTOO_LATE: "This transaction expired before it reached the network. Please try again.",
  txTOO_EARLY: "This transaction isn't valid yet. Please try again in a moment.",
  txINSUFFICIENT_BALANCE: "Not enough XLM to cover the network fee and your account's minimum balance.",
  txINSUFFICIENT_FEE: "The network fee was too low at this moment. Please try again.",
  txBAD_AUTH: "The signature doesn't match this account. Sign with the wallet that is connected.",
  txBAD_AUTH_EXTRA: "The transaction carried an unexpected signature. Please try again.",
  txNO_ACCOUNT: "This account doesn't exist on Stellar yet. Fund it with XLM first.",
  txFAILED: "One of the steps in this transaction failed on Stellar.",
  txMALFORMED: "The transaction was malformed. Please try again.",
  txMISSING_OPERATION: "The transaction was malformed. Please try again.",
  txINTERNAL_ERROR: "Stellar returned an internal error. Please try again.",
  txSOROBAN_INVALID: "The smart-contract part of this transaction was rejected. Please try again.",
};

/**
 * Extracts the most useful message from wallet-kit errors. Some wallets reject with a string,
 * others with `{ message }`, `{ error: { message } }`, or an Error-like object; `String(object)`
 * would otherwise leak "[object Object]" into the dialog.
 */
function errorText(raw: unknown, depth = 0): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (raw instanceof Error) return raw.message || raw.name || "";
  if (typeof raw === "object" && depth < 3) {
    const o = raw as Record<string, unknown>;
    for (const key of ["message", "error", "reason", "details", "cause", "data", "name"]) {
      if (!(key in o) || o[key] === raw) continue;
      const text = errorText(o[key], depth + 1);
      if (text) return text;
    }
    try {
      const json = JSON.stringify(raw);
      if (json && json !== "{}" && json !== "[]") return json;
    } catch {}
  }
  return "";
}

/**
 * Turns raw failure text (network result codes, simulator output, HTTP or RPC errors) into a short
 * sentence a user can act on. Messages that are already plain English pass through unchanged.
 */
export function readableError(raw: unknown): string {
  const msg = errorText(raw).replace(/\s+/g, " ").replace(/^(Error|TypeError):\s*/i, "").trim();
  if (!msg || /^\[object \w+\]$/.test(msg)) return "Something went wrong. Please try again.";
  const code = msg.match(/\b(tx[A-Z_]+)\b/)?.[1];
  if (code && TX_CODES[code]) return TX_CODES[code];
  if (/^Simulation failed/i.test(msg)) return "The protocol rejected this transaction when it was checked before signing. Try a different amount, or try again shortly.";
  if (/^Server error \((\d+)\)/i.test(msg)) return "Seidar's server couldn't handle this request. Please try again in a moment.";
  if (/\b429\b|rate.?limit|too many requests/i.test(msg)) return "The network is busy right now. Please try again in a few seconds.";
  if (/too many subrequests|failed to fetch|fetch failed|network ?error|networkerror|load failed|timed? ?out|ETIMEDOUT|ECONNRESET|aborted/i.test(msg))
    return "Couldn't reach the Stellar network. Check your connection and try again.";
  // Already readable: keep it, but never let a huge dump into the dialog.
  return msg.length > 220 ? `${msg.slice(0, 217)}…` : msg;
}

export async function postJson<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const r = await apiFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => null)) as T | null;
  if (!j) throw new TxError(`Server error (${r.status}).`);
  return j;
}

function walletError(e: unknown): Error {
  if (e instanceof WatchOnlyError) return e;
  const code = (e as { code?: unknown } | null)?.code;
  const msg = errorText(e);
  if (code === 4001 || code === "4001" || /declin|reject|denied|cancel|closed|user.?cancel/i.test(msg)) {
    return new TxError("Transaction cancelled.");
  }
  return new TxError(readableError(msg));
}

const HORIZON = "https://horizon.stellar.org";
const SEND_TIMEOUT_MS = 75_000;
const CONFIRM_WINDOW_MS = 90_000;

/** The transaction id, computed locally from the signed envelope (no network needed). */
async function txHash(signed: string): Promise<string | null> {
  try {
    const { TransactionBuilder } = await import("@stellar/stellar-sdk");
    return TransactionBuilder.fromXDR(signed, MAINNET_PASSPHRASE).hash().toString("hex");
  } catch {
    return null;
  }
}

type SendReply = { ok?: boolean; hash?: string; error?: string; returnValue?: unknown };

/** POST /tx/send. Null when there is no usable answer (network drop, non-JSON error page, timeout). */
async function submitViaApi(signed: string, meta?: TxMeta): Promise<SendReply | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), SEND_TIMEOUT_MS);
  try {
    const r = await apiFetch("/api/tx/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ xdr: signed, meta }),
      signal: ctl.signal,
    });
    const j = (await r.json().catch(() => null)) as SendReply | null;
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Ledger verdict for a hash from Horizon: unknown while it is not (yet) on the ledger. */
async function ledgerStatus(hash: string): Promise<"success" | "failed" | "unknown"> {
  try {
    const r = await fetch(`${HORIZON}/transactions/${hash}`, { cache: "no-store" });
    if (!r.ok) return "unknown";
    const j = (await r.json()) as { successful?: boolean };
    return j.successful ? "success" : "failed";
  } catch {
    return "unknown";
  }
}

/** Waits `ms`, or less when the tab comes back to the foreground (re-check right away). */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
      resolve();
    };
    const onVisible = () => document.visibilityState === "visible" && done();
    const t = setTimeout(done, ms);
    document.addEventListener("visibilitychange", onVisible);
  });
}

/**
 * Polls the ledger for `hash`. If it hasn't appeared after a few seconds the same signed envelope is
 * submitted once more straight to Horizon (safe: the network deduplicates by hash), covering a send
 * that never reached the API.
 */
async function confirmOnLedger(hash: string, signed: string): Promise<"success" | "failed" | "unknown"> {
  const start = Date.now();
  let resent = false;
  while (Date.now() - start < CONFIRM_WINDOW_MS) {
    const st = await ledgerStatus(hash);
    if (st !== "unknown") return st;
    if (!resent && Date.now() - start > 6_000) {
      resent = true;
      void fetch(`${HORIZON}/transactions_async`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `tx=${encodeURIComponent(signed)}`,
      }).catch(() => {});
    }
    await pause(2_500);
  }
  return "unknown";
}

/** The API answered with a definite rejection (as opposed to "no answer" or "still waiting"). */
const definite = (r: SendReply) => !r.ok && !/timed out waiting/i.test(r.error ?? "");

/** Sign an unsigned XDR with the wallet, then submit and confirm. */
export async function signAndSend(
  xdr: string,
  signer: Signer,
  onStatus?: (s: StepStatus) => void,
  meta?: TxMeta,
): Promise<{ hash: string; returnValue: unknown }> {
  onStatus?.("signing");
  let signed: string;
  try {
    signed = await kitSignTransaction(signer.walletId, xdr, signer.address);
  } catch (e) {
    throw walletError(e);
  }
  onStatus?.("sending");
  const hash = await txHash(signed);
  const s = await submitViaApi(signed, meta);
  if (s?.ok && s.hash) {
    onStatus?.("done");
    return { hash: s.hash, returnValue: s.returnValue ?? null };
  }
  if ((s && definite(s)) || !hash) throw new TxError(readableError(s?.error ?? "Submission failed."), s?.hash ?? hash);

  // No clear answer: read the outcome from the ledger.
  onStatus?.("confirming");
  const verdict = await confirmOnLedger(hash, signed);
  if (verdict === "success") {
    onStatus?.("done");
    return { hash, returnValue: null };
  }
  if (verdict === "failed") throw new TxError("Transaction failed on-chain.", hash);
  throw new TxPending(hash);
}

type BuildResult = { ok?: boolean; xdr?: string; label?: string; next?: unknown; error?: string };

/**
 * Run a build endpoint that may return several transactions in sequence (`next` holds the body for
 * the following build). Each step is signed and confirmed before the next is built.
 */
export async function runBuilt(
  path: string,
  firstBody: unknown,
  signer: Signer,
  onSteps: (steps: TxStep[]) => void,
): Promise<{ hashes: string[]; unsigned: boolean; pending?: boolean }> {
  const steps: TxStep[] = [];
  const hashes: string[] = [];
  const emit = () => onSteps(steps.map((s) => ({ ...s })));
  let body: unknown = firstBody;
  let i = 0;
  while (body) {
    const step: TxStep = { key: `s${i++}`, label: "Preparing…", status: "building" };
    steps.push(step);
    emit();
    let b: BuildResult;
    try {
      b = await postJson<BuildResult>(path, body);
    } catch (e) {
      b = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!b.ok || !b.xdr) {
      step.status = "failed";
      step.error = readableError(b.error ?? "Could not build the transaction.");
      emit();
      throw new TxError(step.error);
    }
    step.label = b.label ?? "Transaction";
    step.xdr = b.xdr;
    try {
      const r = await signAndSend(
        b.xdr,
        signer,
        (s) => {
          step.status = s;
          emit();
        },
        txMeta(path, body),
      );
      step.hash = r.hash;
      hashes.push(r.hash);
      step.status = "done";
      emit();
    } catch (e) {
      if (e instanceof WatchOnlyError) {
        // Test wallet: the build succeeded, which is what we can verify without a key.
        step.status = "unsigned";
        emit();
        return { hashes, unsigned: true };
      }
      if (e instanceof TxPending) {
        // Submitted but not visible on the ledger yet: later steps depend on it, so stop here.
        step.status = "submitted";
        step.hash = e.hash;
        emit();
        setTimeout(() => refreshBalances([signer.address]), 20_000);
        return { hashes, unsigned: false, pending: true };
      }
      step.status = "failed";
      step.error = e instanceof TxError ? e.message : readableError(e);
      step.hash = e instanceof TxError ? e.hash : null;
      emit();
      throw e;
    }
    body = b.next ?? null;
  }
  refreshBalances([signer.address]);
  try {
    window.dispatchEvent(new Event("seidar:refresh"));
  } catch {}
  void pushNote(signer.address, `${steps.map((s) => s.label).join(" · ")} confirmed.`);
  return { hashes, unsigned: false };
}

/** Token amount (decimal string or number) -> base-unit integer string, or null when not positive. */
export function toBase(amount: string | number, decimals: number): string | null {
  const s = typeof amount === "number" ? amount.toFixed(decimals) : amount.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [w, f = ""] = s.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  const out = BigInt(w || "0") * BigInt(10) ** BigInt(decimals) + BigInt(frac || "0");
  return out > BigInt(0) ? out.toString() : null;
}
