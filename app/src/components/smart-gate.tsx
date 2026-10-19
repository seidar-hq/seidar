"use client";
import { useEffect, useState } from "react";
import { useShellSmarts, useTxActive } from "./shell";

/* Seidar runs every action from an OpenZeppelin smart account (C...); the
   connected wallet (G...) only creates and funds one, and signs for it.
   useSmartAccount() is the one source of truth for "can this act, and who
   signs"; smartGate() is what an action button does when it can't yet. */

export const isSmartAddress = (a: string | null | undefined): a is string =>
  typeof a === "string" && /^C[A-Z2-7]{55}$/.test(a);

function useOwnerWallet(): string | null {
  const [owner, setOwner] = useState<string | null>(null);
  useEffect(() => {
    function onWallet(e: Event) {
      setOwner((e as CustomEvent<string | null>).detail ?? null);
    }
    window.addEventListener("seidar:wallet", onWallet);
    try {
      const raw = window.localStorage.getItem("seidar.wallet");
      if (raw) setOwner(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    return () => window.removeEventListener("seidar:wallet", onWallet);
  }, []);
  return owner;
}

export function useSmartAccount(): {
  /** Connected wallet: signs for the smart account. */
  owner: string | null;
  /** Active smart account, or null when the main wallet is active. */
  account: string | null;
  smarts: string[];
} {
  const owner = useOwnerWallet();
  const active = useTxActive(owner);
  const { smarts } = useShellSmarts(owner);
  return { owner, account: isSmartAddress(active) ? active : null, smarts };
}

/** Label + action for a button whose flow needs a smart account. */
export function smartGate(owner: string | null, smarts: string[]): { label: string; run: () => void } {
  if (!owner)
    return { label: "Connect wallet", run: () => window.dispatchEvent(new Event("seidar:open-wallets")) };
  if (smarts.length > 0)
    return {
      label: "Switch to smart account",
      run: () => window.dispatchEvent(new CustomEvent("seidar:set-active-account", { detail: smarts[0] })),
    };
  return { label: "Create smart account", run: () => window.dispatchEvent(new Event("seidar:open-smart-account")) };
}
