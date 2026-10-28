"use client";

import { useCallback, useState } from "react";
import { WatchOnlyError } from "@/lib/wallets";
import { TxError, TxPending, readableError, refreshAfterTx, signAndSend, type Signer, type TxMeta, type TxStep } from "@/lib/tx";
import { pushNote } from "@/components/layout/NotificationButton";

/** State for TxDialog plus a runner for "build one XDR, then sign and send it" flows. */
export function useTxRunner() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState<TxStep[]>([]);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback((t: string) => {
    setTitle(t);
    setSteps([]);
    setError(null);
    setOpen(true);
  }, []);

  /** Build with `build`, then sign + submit. Resolves true only on ledger success. */
  const runSingle = useCallback(
    async (t: string, label: string, signer: Signer, build: () => Promise<string>, meta?: TxMeta): Promise<boolean> => {
      start(t);
      const step: TxStep = { key: "s0", label, status: "building" };
      const emit = () => setSteps([{ ...step }]);
      emit();
      try {
        step.xdr = await build();
        const r = await signAndSend(
          step.xdr,
          signer,
          (s) => {
            step.status = s;
            emit();
          },
          meta,
        );
        step.hash = r.hash;
        step.status = "done";
        emit();
        refreshAfterTx(signer.address);
        void pushNote(signer.address, `${label} confirmed.`);
        return true;
      } catch (e) {
        if (e instanceof WatchOnlyError) {
          step.status = "unsigned";
          emit();
          return false;
        }
        if (e instanceof TxPending) {
          step.status = "submitted";
          step.hash = e.hash;
          emit();
          refreshAfterTx(signer.address);
          return false;
        }
        step.status = "failed";
        step.error = e instanceof TxError ? e.message : readableError(e);
        step.hash = e instanceof TxError ? e.hash : null;
        emit();
        return false;
      }
    },
    [start],
  );

  return {
    dialog: { open, title, steps, error, onClose: () => setOpen(false) },
    start,
    setSteps,
    setError,
    runSingle,
  };
}
