"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { explorerTx, type TxStep } from "@/lib/tx";
import { TokenIcon } from "./token-icon";

/* One transaction popup for every on-chain action (DeFi Saver style):
     confirm  — title band ("Supply: 27.00 XLM"), details, Cancel / Accept
     running  — spinner in the band, live per-signature progress
     result   — the amount, then "Transaction abcd…wxyz completed." per tx
                (stellar.expert links); failures say why, with Try again.
   `execute` reports TxStep[] (lib/tx); ok only ever means ledger SUCCESS. */

export type TxRow = { label: string; value: ReactNode; sub?: string; hint?: string };

export type TxSpec = {
  /** Band title, e.g. "Supply: 27.00 XLM". */
  title: string;
  /** Token whose icon leads the band and the result amount. */
  code?: string;
  /** Result headline amount, e.g. "27.00". */
  amount?: string;
  /** Second line under the title (pool / venue). */
  context?: string;
  rows: TxRow[];
  /** Seidar's service fee for this action (lib/fees feeText); every
   *  confirmation shows it, "None" when the action is free. */
  serviceFee?: string;
  notes?: string[];
  confirmLabel?: string;
  execute: (onSteps: (s: TxStep[]) => void) => Promise<void>;
};

const STATUS: Record<TxStep["status"], string> = {
  queued: "Waiting",
  building: "Preparing…",
  signing: "Approve in your wallet",
  sending: "Confirming on Stellar…",
  done: "Confirmed",
  failed: "Failed",
};

const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;

export function TxModal({ spec, onClose }: { spec: TxSpec | null; onClose: () => void }) {
  const [phase, setPhase] = useState<"confirm" | "running" | "done" | "failed">("confirm");
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Parents often rebuild `spec` every render: reset only when it opens.
  const open = spec != null;
  useEffect(() => {
    setPhase("confirm");
    setSteps([]);
    setError(null);
  }, [open]);
  const busy = phase === "running";
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) closeRef.current();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy]);
  if (!spec) return null;

  async function accept() {
    if (!spec || busy) return;
    setPhase("running");
    setError(null);
    setSteps([]);
    try {
      await spec.execute(setSteps);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("failed");
    }
  }

  const finished = phase === "done" || phase === "failed";
  // A chain that already landed a step must not re-run from the top (it
  // would e.g. borrow twice); the user re-plans from the updated position.
  const canRetry = !steps.some((s) => s.status === "done");
  const txs = steps.filter((s) => s.hash || s.status === "failed");
  return (
    <div
      className="mv-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className={`txm txm-${phase}`} role="dialog" aria-modal="true" aria-label={spec.title}>
        <div className="txm-band">
          {spec.code && <TokenIcon symbol={spec.code} size={26} />}
          <div className="txm-titles">
            <h3>{spec.title}</h3>
            {spec.context && <p>{spec.context}</p>}
          </div>
          {busy ? (
            <span className="txm-spin" aria-label="Working" />
          ) : (
            <button type="button" className="txm-x" aria-label="Close" onClick={onClose}>
              ×
            </button>
          )}
        </div>

        {finished ? (
          <div className="txm-result">
            {spec.amount && phase === "done" && (
              <div className="txm-amount">
                <b>{spec.amount}</b>
                {spec.code && <TokenIcon symbol={spec.code} size={22} />}
                {spec.code && <span>{spec.code}</span>}
              </div>
            )}
            <ul className="txm-txs">
              {txs.map((s) => (
                <li key={s.key} className={s.status === "failed" ? "bad" : "ok"}>
                  {s.hash ? (
                    <a href={explorerTx(s.hash)} target="_blank" rel="noreferrer">
                      {s.label}: transaction {short(s.hash)} {s.status === "failed" ? "failed" : "completed"}.
                    </a>
                  ) : (
                    <span>{s.label}: not submitted.</span>
                  )}
                  <i aria-hidden="true">{s.status === "failed" ? "✕" : "✓"}</i>
                </li>
              ))}
            </ul>
            {phase === "failed" && error && (
              <p className="txm-error" role="alert">
                {error}
              </p>
            )}
            {phase === "failed" && !canRetry && (
              <p className="txm-muted">Earlier steps are confirmed — check your position before trying again.</p>
            )}
            {phase === "done" && txs.length === 0 && <p className="txm-muted">Nothing needed signing.</p>}
          </div>
        ) : (
          <div className="txm-body">
            {spec.rows.map((r, i) => (
              <div className="txm-row" key={`${r.label}-${i}`}>
                <span title={r.hint}>
                  {r.hint && <em aria-hidden="true">i</em>}
                  {r.label}
                </span>
                <div>
                  <b>{r.value}</b>
                  {r.sub && <small>{r.sub}</small>}
                </div>
              </div>
            ))}
            <div className="txm-row">
              <span title="What Seidar charges for this action, on top of Stellar network fees.">Seidar service fee</span>
              <div>
                <b>{spec.serviceFee ?? "None"}</b>
              </div>
            </div>
            {spec.notes && spec.notes.length > 0 && (
              <ul className="txm-notes">
                {spec.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            {steps.length > 0 && (
              <ol className="txm-steps">
                {steps.map((s, i) => (
                  <li key={s.key} className={`st-${s.status}`}>
                    <span className="txm-dot">{s.status === "done" ? "✓" : s.status === "failed" ? "✕" : i + 1}</span>
                    <b>{s.label}</b>
                    <small>{s.status === "failed" ? (s.error ?? "Failed") : STATUS[s.status]}</small>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        <div className="txm-foot">
          {phase === "confirm" && (
            <>
              <button type="button" className="txm-cancel" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="txm-accept" onClick={accept}>
                {spec.confirmLabel ?? "Accept"}
              </button>
            </>
          )}
          {phase === "running" && (
            <button type="button" className="txm-accept" disabled>
              Working…
            </button>
          )}
          {phase === "failed" && (
            <>
              <button type="button" className="txm-cancel" onClick={onClose}>
                Close
              </button>
              {canRetry && (
                <button type="button" className="txm-accept" onClick={accept}>
                  Try again
                </button>
              )}
            </>
          )}
          {phase === "done" && (
            <button type="button" className="txm-accept" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
