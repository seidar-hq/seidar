import { explorerBase, networkPassphrase } from "./network";
// One execution path for every on-chain action in the app:
//   build (server: unsigned + simulated XDR) -> sign (connected wallet kit)
//   -> send (server: submit + wait for the ledger verdict).
// `ok` only ever means ledger SUCCESS; a reverted or timed-out tx surfaces as
// an error with its hash so the UI can link the explorer.

import { apiFetch } from "./api";
import { kitSignTransaction, walletKindFor } from "./wallets";

export const explorerTx = (hash: string) => `${explorerBase()}/tx/${hash}`;

export type StepStatus = "queued" | "building" | "signing" | "sending" | "done" | "failed";

export interface TxStep {
  key: string;
  label: string;
  status: StepStatus;
  hash?: string | null;
  error?: string | null;
}

export class TxError extends Error {
  hash: string | null;
  constructor(message: string, hash: string | null = null) {
    super(message);
    this.hash = hash;
  }
}

async function postJson<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
  const r = await apiFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => null)) as T | null;
  if (!j) throw new TxError(`Server error (${r.status}).`);
  return j;
}

function walletError(e: unknown): TxError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/declin|reject|denied|cancel|closed/i.test(msg)) return new TxError("Signature declined in your wallet.");
  return new TxError(msg.slice(0, 200));
}

/**
 * Sign an unsigned XDR, then submit + confirm. `signer` is the connected
 * wallet key; it may differ from the tx source when the active account is a
 * Seidar sub-account (master weight 0, owner wallet as its signer).
 */
export async function signAndSend(
  xdr: string,
  signer: string,
  onStatus?: (s: StepStatus) => void,
): Promise<{ hash: string; returnValue: unknown }> {
  onStatus?.("signing");
  let signed: string;
  try {
    signed = await kitSignTransaction(walletKindFor(signer) ?? "freighter", xdr, {
      networkPassphrase: networkPassphrase(),
      address: signer,
    });
  } catch (e) {
    throw walletError(e);
  }
  onStatus?.("sending");
  const s = await postJson<{ ok?: boolean; hash?: string; error?: string; returnValue?: unknown }>(
    "/api/tx/send",
    { xdr: signed },
  );
  if (!s.ok || !s.hash) throw new TxError(s.error ?? "Submission failed.", s.hash ?? null);
  onStatus?.("done");
  return { hash: s.hash, returnValue: s.returnValue ?? null };
}

export type LendingProtocolId = "blend" | "xoxno";
export type LendingActionKind = "supply" | "withdraw" | "borrow" | "repay";

export interface LendingPlan {
  protocol: LendingProtocolId;
  from: string;
  /** Owner wallet that authorizes when `from` is a Seidar smart account. */
  signer?: string;
  actions: { action: LendingActionKind; asset: string; amount: string }[];
  pool?: string;
  xoxno?: { accountId?: string; spokeId?: number; hubId?: number };
}

/**
 * Execute a lending plan. The server may split it (
 * XOXNO one-kind-per-call); each returned step is signed and confirmed
 * before the next is built, so sequence numbers are always fresh.
 */
export async function runLending(
  plan: LendingPlan,
  onSteps: (steps: TxStep[]) => void,
  signer: string = plan.from,
): Promise<{ hashes: string[] }> {
  const steps: TxStep[] = [];
  const hashes: string[] = [];
  const emit = () => onSteps(steps.map((s) => ({ ...s })));
  // A smart account (C...) authorizes through the owner wallet that signs.
  let body: LendingPlan | null = /^C/.test(plan.from) && !plan.signer ? { ...plan, signer } : plan;
  let i = 0;
  while (body) {
    const step: TxStep = { key: `s${i++}`, label: "Preparing…", status: "building" };
    steps.push(step);
    emit();
    const b: { ok?: boolean; xdr?: string; label?: string; next?: LendingPlan | null; error?: string } =
      await postJson("/api/lending/build", body);
    if (!b.ok || !b.xdr) {
      step.status = "failed";
      step.error = b.error ?? "Could not build the transaction.";
      emit();
      throw new TxError(step.error);
    }
    step.label = b.label ?? "Transaction";
    try {
      const r = await signAndSend(b.xdr, signer, (s) => {
        step.status = s;
        emit();
      });
      step.hash = r.hash;
      hashes.push(r.hash);
      step.status = "done";
      emit();
    } catch (e) {
      step.status = "failed";
      step.error = e instanceof Error ? e.message : String(e);
      step.hash = e instanceof TxError ? e.hash : null;
      emit();
      throw e;
    }
    body = b.next ?? null;
  }
  try {
    window.dispatchEvent(new Event("seidar:refresh"));
  } catch {
    /* SSR */
  }
  return { hashes };
}

/** Token amount (decimal string or number) -> base-unit integer string. */
export function toBase(amount: string | number, decimals: number): string | null {
  const s = typeof amount === "number" ? amount.toFixed(decimals) : amount.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const [w, f = ""] = s.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  const out = BigInt(w || "0") * BigInt(10) ** BigInt(decimals) + BigInt(frac || "0");
  return out > BigInt(0) ? out.toString() : null;
}
