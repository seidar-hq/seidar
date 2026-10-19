"use client";
// Smart-account display names. The owner names an account when creating it
// (and can rename it in the account drawer); the name shows everywhere the
// app would otherwise print the C… address, with the address kept as
// copyable subtext. Names live in the API (automation_accounts.name); the
// shell loads them with the account list and publishes them here, mirrored
// to localStorage so a reload shows names before the list resolves.

import { useEffect, useState } from "react";
import { shortAddress } from "./format";

const KEY = "seidar.accountNames";
const EVENT = "seidar:account-names";

let names: Record<string, string> = {};
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === "object") names = v as Record<string, string>;
  } catch {
    /* private mode: names arrive with the account list */
  }
}

/** Merge names for these accounts (an empty name clears one). */
export function setAccountNames(map: Record<string, string | null | undefined>) {
  load();
  const next = { ...names };
  for (const [addr, n] of Object.entries(map)) {
    const v = (n ?? "").trim();
    if (v) next[addr] = v;
    else delete next[addr];
  }
  names = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(names));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* SSR */
  }
}

/** The owner's name for an account, or null. */
export function accountName(addr: string | null | undefined): string | null {
  if (!addr) return null;
  load();
  return names[addr] ?? null;
}

/** Name when set, else the short address. */
export function accountLabel(addr: string | null | undefined): string {
  if (!addr) return "";
  return accountName(addr) ?? shortAddress(addr);
}

/** Re-render when any name changes; returns the label helper. */
export function useAccountNames(): (addr: string | null | undefined) => string {
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener(EVENT, on);
    // Names mirrored before this mount (SSR rendered short addresses).
    on();
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return accountLabel;
}

/** Suggested name for a wallet's next account. */
export function nextAccountName(existing: number): string {
  return existing === 0 ? "Main" : `Account ${existing + 1}`;
}
