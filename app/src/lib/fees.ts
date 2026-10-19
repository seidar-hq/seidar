"use client";
// Seidar's service fees as the API reports them for the active network
// (services/api/src/fees.ts → GET /fees). A rate is 0 where the contract
// that charges it isn't deployed, so the UI never shows a fee nobody takes.
import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import { isTestnetMode } from "./network";

export type Fees = { automationBps: number; swapBps: number; dcaBps: number };

const cache = new Map<string, Promise<Fees | null>>();

export function loadFees(): Promise<Fees | null> {
  const key = isTestnetMode() ? "testnet" : "mainnet";
  let p = cache.get(key);
  if (!p) {
    p = apiFetch("/api/fees", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) =>
        d?.ok ? { automationBps: Number(d.automationBps), swapBps: Number(d.swapBps), dcaBps: Number(d.dcaBps) } : null,
      )
      .catch(() => null);
    p.then((v) => v ?? cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** Live fee rates (null while loading or when the API is unreachable). */
export function useFees(): Fees | null {
  const [fees, setFees] = useState<Fees | null>(null);
  useEffect(() => {
    let live = true;
    loadFees().then((f) => live && setFees(f));
    return () => {
      live = false;
    };
  }, []);
  return fees;
}

/** "0.25%" from bps. */
export const pct = (bps: number) => `${(bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;

/** Row text for a fee on a swap output, e.g. "0.25% · ~0.12 USDC". */
export function feeText(bps: number | null | undefined, outTokens?: number | null, code?: string): string {
  if (bps == null) return "…";
  if (bps <= 0) return "None";
  const amt = outTokens != null && Number.isFinite(outTokens) ? (outTokens * bps) / 10_000 : null;
  return amt != null && code
    ? `${pct(bps)} · ~${amt.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${code}`
    : pct(bps);
}

/** What an automation costs, for panels and confirmations. */
export function automationFeeNote(bps: number | null | undefined): string {
  const rate = bps == null ? "Seidar's service fee" : bps > 0 ? `Seidar's ${pct(bps)} service fee` : null;
  return rate
    ? `No fee for keeping this automation enabled and your position monitored. Each execution takes ${rate} from the swap's output, plus the swap's pool fees; the Seidar keeper pays the Stellar network fee.`
    : "No fee for keeping this automation enabled and your position monitored. Each execution pays only the swap's pool fees; the Seidar keeper pays the Stellar network fee.";
}

/** TxModal "Seidar service fee" value for enabling an automation. */
export const automationFeeRow = (bps: number | null | undefined) =>
  bps == null ? "…" : bps > 0 ? `${pct(bps)} of each execution's swap output` : "None";
