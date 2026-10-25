"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiJson } from "@/lib/api";

export type ActivityLeg = { code: string; issuer: string | null; amount: number; dir: "in" | "out" };
export type ActivityItem = {
  id: string;
  at: string;
  hash: string;
  ok: boolean;
  kind: "swap" | "transfer" | "position" | "other";
  action: string;
  protocol: string | null;
  counterparty: string | null;
  legs: ActivityLeg[];
  feeXlm: number | null;
  wallet: string;
};

type Resp = { ok?: boolean; items?: Omit<ActivityItem, "wallet">[]; next?: string | null; error?: string };

/** History filter value an item belongs to. */
export function category(i: ActivityItem): string {
  if (i.kind === "swap") return "swap";
  if (i.kind === "transfer") return i.legs.some((l) => l.dir === "out") ? "send" : "receive";
  if (i.kind === "position") {
    if (i.protocol === "Zenex") return /vault/i.test(i.action) ? "vaults" : "perps";
    if (/liquidity/i.test(i.action) || ["Soroswap", "Aquarius", "Phoenix"].includes(i.protocol ?? "")) return "liquidity";
    if (["Upshift", "DeFindex"].includes(i.protocol ?? "") || /^(Deposit|Withdraw)$/.test(i.action)) return "vaults";
    return "lend";
  }
  return "other";
}

/** Incoming dust (spam payments of a few stroops) clutters history; hidden unless asked for. */
export const isDust = (i: ActivityItem) =>
  i.kind === "transfer" && i.legs.every((l) => l.dir === "in" && l.amount < 0.001);

/**
 * Activity for several wallets, merged newest first. `loadMore` pulls the next Horizon page for
 * every wallet that still has one.
 */
export function useActivity(addresses: string[], kind: "all" | "positions" | "swaps") {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursors = useRef<Record<string, string | null>>({});
  const sig = `${kind}:${addresses.join(",")}`;
  const current = useRef(sig);

  const fetchPage = useCallback(
    async (reset: boolean) => {
      const run = sig;
      setLoading(true);
      setError(null);
      const targets = reset ? addresses : addresses.filter((a) => cursors.current[a]);
      const results = await Promise.all(
        targets.map(async (a) => {
          const c = reset ? "" : (cursors.current[a] ?? "");
          const r = await apiJson<Resp>(`/api/activity?address=${a}&kind=${kind}${c ? `&cursor=${c}` : ""}`);
          return { a, r };
        }),
      );
      if (current.current !== run) return;
      const fresh: ActivityItem[] = [];
      for (const { a, r } of results) {
        if (!r?.ok) {
          setError(r?.error ?? "Could not load history.");
          continue;
        }
        cursors.current[a] = r.next ?? null;
        for (const it of r.items ?? []) fresh.push({ ...it, wallet: a });
      }
      setItems((prev) => {
        const all = reset ? fresh : [...prev, ...fresh];
        const seen = new Set<string>();
        return all
          .filter((i) => (seen.has(`${i.wallet}:${i.id}`) ? false : (seen.add(`${i.wallet}:${i.id}`), true)))
          .sort((x, y) => (x.at < y.at ? 1 : -1));
      });
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sig],
  );

  useEffect(() => {
    current.current = sig;
    cursors.current = {};
    setItems([]);
    if (addresses.length) void fetchPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const hasMore = addresses.some((a) => cursors.current[a]);
  return { items, loading, error, hasMore, loadMore: () => fetchPage(false), reload: () => fetchPage(true) };
}
