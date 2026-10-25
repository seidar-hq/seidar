"use client";

import { useEffect, useMemo, useState } from "react";
import { apiJson } from "@/lib/api";

export type TokenBalance = {
  code: string;
  issuer: string | null;
  amount: number;
  price: number | null;
  usd: number;
  listed: boolean;
};

export type WalletBalances = { tokens: TokenBalance[]; usd: number; loading: boolean; error: boolean };

type RawBalance = { code: string; issuer: string | null; balance: number | string; listed?: boolean };

// One shared cache so the header, dashboard and settings never fetch the same wallet twice.
const TTL = 60_000;
const cache = new Map<string, { at: number; data: WalletBalances }>();
const inflight = new Map<string, Promise<WalletBalances>>();
const listeners = new Set<() => void>();

const EMPTY: WalletBalances = { tokens: [], usd: 0, loading: true, error: false };

async function fetchWallet(address: string): Promise<WalletBalances> {
  const b = await apiJson<{ ok?: boolean; balances?: RawBalance[] }>(`/api/balances?address=${address}`);
  if (!b?.ok || !Array.isArray(b.balances)) return { tokens: [], usd: 0, loading: false, error: true };
  const rows = b.balances.map((r) => ({ ...r, amount: Number(r.balance) || 0 }));
  const codes = [...new Set(rows.filter((r) => r.listed !== false).map((r) => r.code))];
  const p = codes.length
    ? await apiJson<{ prices?: Record<string, number | null> }>(`/api/prices?codes=${encodeURIComponent(codes.join(","))}`)
    : null;
  // The price feed misses some listed assets (e.g. BLND): use the last Horizon market price instead.
  const fallback: Record<string, number> = {};
  await Promise.all(
    rows
      .filter((r) => r.listed !== false && r.issuer && p?.prices?.[r.code] == null)
      .slice(0, 10)
      .map(async (r) => {
        const c = await apiJson<{ ok?: boolean; points?: { px: number }[] }>(
          `/api/prices/chart?asset=${encodeURIComponent(`${r.code}:${r.issuer}`)}&range=1d`,
        );
        const last = c?.ok ? c.points?.[c.points.length - 1]?.px : undefined;
        if (last) fallback[`${r.code}:${r.issuer}`] = last;
      }),
  );
  const tokens: TokenBalance[] = rows
    .map((r) => {
      const listed = r.listed !== false;
      const price = listed ? (p?.prices?.[r.code] ?? fallback[`${r.code}:${r.issuer}`] ?? null) : null;
      return { code: r.code, issuer: r.issuer, amount: r.amount, price, usd: price ? price * r.amount : 0, listed };
    })
    .sort((a, b) => b.usd - a.usd || b.amount - a.amount);
  return { tokens, usd: tokens.reduce((s, t) => s + t.usd, 0), loading: false, error: false };
}

function load(address: string, force = false): Promise<WalletBalances> {
  const hit = cache.get(address);
  if (!force && hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
  const pending = inflight.get(address);
  if (pending) return pending;
  const job = fetchWallet(address)
    .then((data) => {
      cache.set(address, { at: Date.now(), data });
      return data;
    })
    .finally(() => {
      inflight.delete(address);
      listeners.forEach((l) => l());
    });
  inflight.set(address, job);
  return job;
}

/** Drop cached balances (after a transaction) and refetch for anyone listening. */
export function refreshBalances(addresses?: string[]) {
  for (const a of addresses ?? [...cache.keys()]) void load(a, true);
}

/** Balances for each address, keyed by address, plus the combined USD total. */
export function useBalances(addresses: string[]) {
  const [, bump] = useState(0);
  const key = addresses.join(",");

  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    for (const a of addresses) void load(a);
    const t = setInterval(() => addresses.forEach((a) => void load(a)), TTL);
    return () => {
      listeners.delete(l);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const byAddress: Record<string, WalletBalances> = {};
  for (const a of addresses) byAddress[a] = cache.get(a)?.data ?? EMPTY;
  const list = Object.values(byAddress);
  const totalUsd = list.reduce((s, w) => s + w.usd, 0);
  const loading = list.some((w) => w.loading);

  // Same token held in several wallets is merged into one row.
  const merged = useMemo(() => {
    const m = new Map<string, TokenBalance>();
    for (const w of list)
      for (const t of w.tokens) {
        const k = `${t.code}:${t.issuer ?? "native"}`;
        const prev = m.get(k);
        m.set(k, prev ? { ...prev, amount: prev.amount + t.amount, usd: prev.usd + t.usd } : t);
      }
    return [...m.values()].sort((a, b) => b.usd - a.usd || b.amount - a.amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, totalUsd, loading]);

  return { byAddress, totalUsd, loading, tokens: merged };
}
