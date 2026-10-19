"use client";

/* Blend market status (pool config status: 0-1 active, 2-3 on ice, 4-5
   frozen, 6 setup) as a pill with an (i) explainer on hover. A market that
   groups same-name pools takes its most usable status. */

export type MarketBadge = { label: string; tone: "ice" | "frozen" | "setup"; tip: string };

export function marketStatusBadge(status: number | null | undefined): MarketBadge | null {
  if (status == null || status <= 1) return null;
  if (status <= 3)
    return {
      label: "On ice",
      tone: "ice",
      tip: "Blend has paused new borrowing in this market. You can still supply, withdraw and repay. Automations that need a flash loan can't run here.",
    };
  if (status <= 5)
    return {
      label: "Frozen",
      tone: "frozen",
      tip: "Blend has frozen this market: no new supply or borrowing. You can still withdraw and repay what you hold.",
    };
  return {
    label: "In setup",
    tone: "setup",
    tip: "This market's admin hasn't opened it yet: no supply or borrowing until it goes active.",
  };
}

/** Status pill; `small` for list rows. Renders nothing for active markets. */
export function MarketStatusPill({ status, small }: { status: number | null | undefined; small?: boolean }) {
  const b = marketStatusBadge(status);
  if (!b) return null;
  return (
    <span
      className={`ph-badge ph-${b.tone}${small ? " ph-badge-sm" : ""}`}
      tabIndex={0}
      aria-label={`${b.label}: ${b.tip}`}
      onClick={(e) => {
        // Inside clickable cards: reading the pill must not open the market.
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {b.label}
      <svg width={small ? 11 : 13} height={small ? 11 : 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="11" x2="12" y2="16" />
        <circle cx="12" cy="7.6" r="0.6" fill="currentColor" />
      </svg>
      <span className="ph-tip" role="tooltip">
        {b.tip}
      </span>
    </span>
  );
}
