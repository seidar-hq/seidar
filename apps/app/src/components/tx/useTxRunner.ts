"use client";

import { useCallback, useState } from "react";
import { WatchOnlyError } from "@/lib/wallets";
import { TxError, signAndSend, type Signer, type TxStep } from "@/lib/tx";
import { refreshBalances } from "@/wallet/useBalances";

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
    async (t: string, label: string, signer: Signer, build: () => Promise<string>): Promise<boolean> => {
      start(t);
      const step: TxStep = { key: "s0", label, status: "building" };
      const emit = () => setSteps([{ ...step }]);
      emit();
      try {
        step.xdr = await build();
        const r = await signAndSend(step.xdr, signer, (s) => {
          step.status = s;
          emit();
        });
        step.hash = r.hash;
        step.status = "done";
        emit();
        refreshBalances([signer.address]);
        return true;
      } catch (e) {
        if (e instanceof WatchOnlyError) {
          step.status = "unsigned";
          emit();
          return false;
        }
        step.status = "failed";
        step.error = e instanceof Error ? e.message : String(e);
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
