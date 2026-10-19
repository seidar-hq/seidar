"use client";
import { explorerTx, type TxStep } from "@/lib/tx";

/* Shared step list for every on-chain flow: one row per transaction with
   its live status (build -> sign -> send -> confirmed) and explorer link. */

const STATUS_TEXT: Record<TxStep["status"], string> = {
  queued: "Waiting",
  building: "Preparing",
  signing: "Approve in wallet",
  sending: "Confirming",
  done: "Confirmed",
  failed: "Failed",
};

export function TxSteps({ steps }: { steps: TxStep[] }) {
  return (
    <ol className="tx-steps" aria-live="polite">
      {steps.map((s, i) => (
        <li key={s.key} className={`tx-step st-${s.status}`}>
          <span className="tx-dot" aria-hidden="true">
            {s.status === "done" ? "✓" : s.status === "failed" ? "!" : i + 1}
          </span>
          <div className="tx-main">
            <b>{s.label}</b>
            <small>{s.status === "failed" && s.error ? s.error : STATUS_TEXT[s.status]}</small>
          </div>
          {s.hash && (
            <a className="tx-link" href={explorerTx(s.hash)} target="_blank" rel="noreferrer">
              View tx
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
