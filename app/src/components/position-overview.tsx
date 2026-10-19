"use client";

/* Pool / vault "Overview" card: what the active account has in this pool
   or vault right now, in the shape of the lending Manage overview — total
   value, what it's supplying (per token, with USD), share of the venue and
   the yield it's earning. Always shown: an account with nothing in it sees
   zeros and a one-line hint, not an empty gap. Plus the Deposit / Withdraw
   switcher both side panels use. */

import type { ReactNode } from "react";
import { AccountTag } from "./account-tag";
import { LoadingMark } from "./loading";
import { TokenIcon } from "./token-icon";

export type OverviewLeg = { code: string; amount: number; usd: number | null };
export type OverviewStat = { label: string; value: ReactNode; sub?: ReactNode; tone?: "green" | "muted" };

const usd = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v)
    ? "—"
    : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amt = (n: number) =>
  n === 0 ? "0" : n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 2 : n >= 1 ? 4 : 7 });

export function PositionOverview({
  account,
  loading,
  legs,
  valueUsd,
  stats,
  emptyHint,
  action,
}: {
  /** Active account (G or C); null = no wallet connected. */
  account: string | null;
  loading?: boolean;
  /** What the account supplies, per token. Empty / all-zero = no position. */
  legs: OverviewLeg[];
  valueUsd: number | null;
  stats: OverviewStat[];
  emptyHint: string;
  action?: ReactNode;
}) {
  const has = legs.some((l) => l.amount > 0);
  const total = legs.reduce((s, l) => s + (l.usd ?? 0), 0);
  return (
    <section className="po-card" aria-label="Your position">
      <div className="po-head">
        <small className="proto-kicker">OVERVIEW</small>
        {account && <AccountTag address={account} className="po-acct" />}
      </div>
      {!account ? (
        <p className="po-hint">Connect a wallet to see your position here.</p>
      ) : loading ? (
        <p className="po-hint load-row">
          <LoadingMark size={14} /> Reading your position…
        </p>
      ) : (
        <>
          <div className="po-top">
            <div className="po-value">
              <span>Your position</span>
              <b>{has ? usd(valueUsd) : "$0.00"}</b>
            </div>
            {action}
          </div>
          <div className="po-supply">
            <span className="po-label">Supplying</span>
            {has ? (
              <ul>
                {legs.map((l) => (
                  <li key={l.code}>
                    <span className="po-tok">
                      <TokenIcon symbol={l.code} size={18} /> {amt(l.amount)} {l.code}
                    </span>
                    <span className="po-bar" aria-hidden="true">
                      <i style={{ width: `${total > 0 && l.usd != null ? Math.max(2, (l.usd / total) * 100) : legs.length ? 100 / legs.length : 0}%` }} />
                    </span>
                    <em>{usd(l.usd)}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="po-hint">{emptyHint}</p>
            )}
          </div>
        </>
      )}
      {stats.length > 0 && (
        <div className="po-stats">
          {stats.map((s) => (
            <div key={s.label}>
              <span>{s.label}</span>
              <b className={s.tone ? `po-${s.tone}` : undefined}>{s.value}</b>
              {s.sub != null && <small>{s.sub}</small>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Deposit / Withdraw segmented switcher (app tab style). */
export function ModeSwitch<M extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: M;
  options: [M, string][];
  onChange: (m: M) => void;
  label: string;
}) {
  return (
    <div className="po-switch" role="tablist" aria-label={label}>
      {options.map(([m, text]) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={value === m}
          className={value === m ? "on" : undefined}
          onClick={() => onChange(m)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
