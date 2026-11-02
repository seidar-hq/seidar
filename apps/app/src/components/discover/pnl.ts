"use client";

import { useMemo } from "react";
import { apiJson } from "@/lib/api";
import { useShared } from "@/lib/useShared";
import { assetKey, type Exposure } from "@/portfolio/usePortfolio";
import { useExposureCharts, type Range } from "@/portfolio/useSeries";
import type { ActivityItem } from "@/components/transactions/useActivity";

// Profit and loss of a wallet over a period, estimated from its own history.
//
// Today's net holdings (wallet + positions - debt, per asset) are walked back through the wallet's
// activity: each swap, transfer and reward claim is undone, which gives the holdings at every past
// moment. Valued at that moment's prices they give the wallet's value over time. Transfers in and
// out are deposits and withdrawals, not performance, so
//
//     P&L(t) = value(t) - value(start) - net deposits between start and t
//
// Moving tokens into a protocol (supply, deposit, add liquidity) doesn't change net holdings and is
// skipped; interest earned shows up through today's holdings. Payments from a token's own issuer
// (yield-token distributions) count as income, not deposits.

type ActResp = { ok?: boolean; items?: Omit<ActivityItem, "wallet">[]; next?: string | null; error?: string };
export type Act = Omit<ActivityItem, "wallet">;

const MAX_PAGES = 8;
const HISTORY_MS = 92 * 86_400_000;

/** The wallet's activity back to ~90 days (at most 800 operations). */
export function useWalletActivity(address: string | null) {
  const { value, loading } = useShared<{ items: Act[]; complete: boolean; error: string | null } | null>(
    address ? `discover:activity:${address}` : null,
    async () => {
      const items: Act[] = [];
      let cursor = "";
      const since = Date.now() - HISTORY_MS;
      for (let page = 0; page < MAX_PAGES; page++) {
        const r = await apiJson<ActResp>(`/api/activity?address=${address}&kind=all${cursor ? `&cursor=${cursor}` : ""}`);
        if (!r?.ok) return page === 0 ? null : { items, complete: false, error: r?.error ?? "History stopped loading part-way." };
        items.push(...(r.items ?? []));
        const oldest = items.length ? Date.parse(items[items.length - 1].at) : Date.now();
        if (!r.next) return { items, complete: true, error: null };
        if (oldest < since) return { items, complete: true, error: null };
        cursor = r.next;
      }
      return { items, complete: false, error: null };
    },
    300_000,
  );
  return { items: value?.items ?? [], complete: value?.complete ?? false, error: value?.error ?? null, loading: loading && !value };
}

const RANGE_MS: Partial<Record<Range, number>> = { "1d": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, "90d": 90 * 86_400_000 };

type Effect = { at: number; deltas: Map<string, number>; flowIn: { key: string; amount: number }[]; flowOut: { key: string; amount: number }[]; act: Act };

const isClaim = (a: Act) => /claim/i.test(a.action);
const isDustIn = (a: Act) => a.kind === "transfer" && a.legs.every((l) => l.dir === "in" && l.amount < 0.001);

/** What each activity did to net holdings (positive = holdings went up). */
function effects(acts: Act[]): Effect[] {
  const out: Effect[] = [];
  for (const a of acts) {
    if (!a.ok || !a.legs.length || isDustIn(a)) continue;
    const swap = a.kind === "swap";
    const transfer = a.kind === "transfer";
    if (!swap && !transfer && !(a.kind === "position" && isClaim(a))) continue;
    const e: Effect = { at: Date.parse(a.at), deltas: new Map(), flowIn: [], flowOut: [], act: a };
    for (const l of a.legs) {
      const key = assetKey(l.code, l.issuer);
      const d = l.dir === "in" ? l.amount : -l.amount;
      e.deltas.set(key, (e.deltas.get(key) ?? 0) + d);
      // Deposits / withdrawals: transfers from anyone but the token's own issuer.
      if (transfer && !(l.dir === "in" && l.issuer && a.counterparty === l.issuer)) (l.dir === "in" ? e.flowIn : e.flowOut).push({ key, amount: l.amount });
    }
    out.push(e);
  }
  return out.sort((x, y) => y.at - x.at);
}

export type PnlPoint = { t: number; value: number; pnl: number };
export type Trade = {
  id: string;
  at: number;
  hash: string;
  sold: { code: string; issuer: string | null; amount: number }[];
  bought: { code: string; issuer: string | null; amount: number }[];
  usdThen: number | null;
  /** Value now of what was bought minus value now of what was sold (null: no price). */
  edgeNow: number | null;
};

export type PnlResult = {
  series: PnlPoint[];
  pnl: number;
  pnlPct: number | null;
  startValue: number;
  endValue: number;
  deposits: number;
  withdrawals: number;
  trades: Trade[];
  /** History reaches back to the start of the period. */
  complete: boolean;
  loading: boolean;
};

/** P&L over `range` for a wallet whose current net exposures are `exposures`. */
export function useWalletPnl(address: string | null, exposures: Exposure[], range: Range): PnlResult {
  const act = useWalletActivity(address);
  const effs = useMemo(() => effects(act.items), [act.items]);

  // Price charts for everything held now and everything the history touched.
  const allExposures = useMemo(() => {
    const m = new Map(exposures.map((e) => [e.key, e]));
    for (const a of act.items)
      for (const l of a.legs) {
        const key = assetKey(l.code, l.issuer);
        if (!m.has(key)) m.set(key, { key, code: l.code, issuer: l.issuer, assets: 0, positions: 0, price: 0 });
      }
    return [...m.values()];
  }, [exposures, act.items]);
  const { charts, loading: chartsLoading } = useExposureCharts(allExposures, range);

  return useMemo<PnlResult>(() => {
    const span = RANGE_MS[range] ?? 30 * 86_400_000;
    const now = Date.now();
    const start = now - span;
    const empty: PnlResult = { series: [], pnl: 0, pnlPct: null, startValue: 0, endValue: 0, deposits: 0, withdrawals: 0, trades: [], complete: act.complete, loading: act.loading || chartsLoading };
    if (!exposures.length) return empty;

    const pxFns = new Map<string, (t: number) => number>();
    const nowPx = new Map<string, number>();
    for (const e of allExposures) {
      const pts = charts[e.key];
      if (pts?.length) {
        pxFns.set(e.key, (t: number) => {
          // Binary search for the last point at or before t (the first point before the chart starts).
          let lo = 0;
          let hi = pts.length - 1;
          if (t <= pts[0].t) return pts[0].px;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (pts[mid].t <= t) lo = mid;
            else hi = mid - 1;
          }
          return pts[lo].px;
        });
        nowPx.set(e.key, pts[pts.length - 1].px);
      } else if (e.price) {
        pxFns.set(e.key, () => e.price);
        nowPx.set(e.key, e.price);
      }
    }
    const px = (key: string, t: number) => pxFns.get(key)?.(t) ?? 0;

    // Even steps over the whole period. (Not the densest chart's own times: some assets only have
    // recent hourly points, which would shrink "30 days" to the last two.)
    const steps = range === "1d" ? 96 : range === "7d" ? 84 : 120;
    const grid = Array.from({ length: steps + 1 }, (_, i) => start + (span * i) / steps);

    const current = new Map(exposures.map((e) => [e.key, e.assets + e.positions]));
    const holdings = new Map(current);
    const floor = (k: string) => Math.min(0, current.get(k) ?? 0);
    const value = (t: number) => {
      let v = 0;
      for (const [k, amt] of holdings) v += Math.max(amt, floor(k)) * px(k, t);
      return v;
    };

    // Walk back from now: before valuing time t, undo everything that happened after t.
    let i = 0;
    let flowsAfter = 0; // net deposits (USD) in (t, now]
    let deposits = 0;
    let withdrawals = 0;
    const raw: { t: number; value: number; flowsAfter: number }[] = [];
    for (let g = grid.length - 1; g >= 0; g--) {
      const t = grid[g];
      while (i < effs.length && effs[i].at > t) {
        const e = effs[i];
        for (const [k, d] of e.deltas) holdings.set(k, (holdings.get(k) ?? 0) - d);
        if (e.at >= start) {
          for (const f of e.flowIn) {
            const usd = f.amount * px(f.key, e.at);
            flowsAfter += usd;
            deposits += usd;
          }
          for (const f of e.flowOut) {
            const usd = f.amount * px(f.key, e.at);
            flowsAfter -= usd;
            withdrawals += usd;
          }
        }
        i++;
      }
      raw.push({ t, value: value(t), flowsAfter });
    }
    raw.reverse();
    const v0 = raw[0].value;
    const f0 = raw[0].flowsAfter;
    // flows in (start, t] = flowsAfter(start) - flowsAfter(t)
    const series: PnlPoint[] = raw.map((r) => ({ t: r.t, value: r.value, pnl: r.value - v0 - (f0 - r.flowsAfter) }));
    const end = series[series.length - 1];
    const base = v0 + deposits;

    const trades: Trade[] = effs
      .filter((e) => e.act.kind === "swap" && e.at >= start)
      .slice(0, 60)
      .map((e) => {
        const sold = e.act.legs.filter((l) => l.dir === "out").map(({ code, issuer, amount }) => ({ code, issuer, amount }));
        const bought = e.act.legs.filter((l) => l.dir === "in").map(({ code, issuer, amount }) => ({ code, issuer, amount }));
        const val = (ls: typeof sold, t: number | null) => {
          let s = 0;
          for (const l of ls) {
            const k = assetKey(l.code, l.issuer);
            const p = t == null ? nowPx.get(k) : pxFns.get(k)?.(t);
            if (!p) return null;
            s += l.amount * p;
          }
          return s;
        };
        const soldNow = val(sold, null);
        const boughtNow = val(bought, null);
        return {
          id: e.act.id,
          at: e.at,
          hash: e.act.hash,
          sold,
          bought,
          usdThen: val(sold, e.at) ?? val(bought, e.at),
          edgeNow: soldNow != null && boughtNow != null ? boughtNow - soldNow : null,
        };
      });

    const oldest = act.items.length ? Date.parse(act.items[act.items.length - 1].at) : now;
    return {
      series,
      pnl: end.pnl,
      pnlPct: base > 1 ? (end.pnl / base) * 100 : null,
      startValue: v0,
      endValue: end.value,
      deposits,
      withdrawals,
      trades,
      complete: act.complete || oldest <= start,
      loading: act.loading || chartsLoading,
    };
  }, [effs, charts, exposures, allExposures, range, act.complete, act.loading, act.items, chartsLoading]);
}
