// One execution path for every on-chain action:
//   build (API: unsigned, simulated XDR) -> sign (wallet) -> send (API: submit + wait for the ledger).
// `ok` only means ledger SUCCESS; failures surface as TxError with the hash when there is one.
// Watch-only test wallets stop after the build and surface the XDR (WatchOnlyError).

import { apiFetch } from "./api";
import { WatchOnlyError, kitSignTransaction, type WalletKind } from "./wallets";
import { refreshBalances } from "@/wallet/useBalances";
import { pushNote } from "@/components/layout/NotificationButton";

export const explorerTx = (hash: string) => `https://stellar.expert/explorer/public/tx/${hash}`;

export type StepStatus = "queued" | "building" | "signing" | "sending" | "done" | "failed" | "unsigned";

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

export type Signer = { address: string; walletId: WalletKind };

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
  const msg = e instanceof Error ? e.message : String(e);
  if (/declin|reject|denied|cancel|closed/i.test(msg)) return new TxError("Signature declined in your wallet.");
  return new TxError(msg.slice(0, 200));
}

/** Sign an unsigned XDR with the wallet, then submit and confirm. */
export async function signAndSend(
  xdr: string,
  signer: Signer,
  onStatus?: (s: StepStatus) => void,
): Promise<{ hash: string; returnValue: unknown }> {
  onStatus?.("signing");
  let signed: string;
  try {
    signed = await kitSignTransaction(signer.walletId, xdr, signer.address);
  } catch (e) {
    throw walletError(e);
  }
  onStatus?.("sending");
  const s = await postJson<{ ok?: boolean; hash?: string; error?: string; returnValue?: unknown }>("/api/tx/send", {
    xdr: signed,
  });
  if (!s.ok || !s.hash) throw new TxError(s.error ?? "Submission failed.", s.hash ?? null);
  onStatus?.("done");
  return { hash: s.hash, returnValue: s.returnValue ?? null };
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
): Promise<{ hashes: string[]; unsigned: boolean }> {
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
      step.error = b.error ?? "Could not build the transaction.";
      emit();
      throw new TxError(step.error);
    }
    step.label = b.label ?? "Transaction";
    step.xdr = b.xdr;
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
      if (e instanceof WatchOnlyError) {
        // Test wallet: the build succeeded, which is what we can verify without a key.
        step.status = "unsigned";
        emit();
        return { hashes, unsigned: true };
      }
      step.status = "failed";
      step.error = e instanceof Error ? e.message : String(e);
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
