// The Explore page's look (glass shells, deep charcoal gradients, tinted panels), offered to other pages without changing them by default.
//
// A page opts in by wrapping its content in an element with `data-look="explore"`. The shared card
// shells (SectionCard, InsetCard, KpiCard, PlainCard and a few widget roots) carry the rules below
// under the `LOOK` selector, so they change only inside such a wrapper. Every other page keeps its
// current styling.

export const LOOK = "[data-look='explore'] &";

/** Big section card: charcoal gradient, hairline ring, deep drop shadow. */
export const lookCard = {
  background: "linear-gradient(180deg, #131313 0%, #171717 55%, #222222 100%)",
  border: "0.0625rem solid rgba(255,255,255,0.10)",
  borderRadius: "1.75rem",
  boxShadow: "rgba(0,0,0,0.35) 0 0.625rem 1.4rem, rgba(0,0,0,0.28) 0 2.5rem 2.5rem -1rem, rgba(255,255,255,0.08) 0 0.0625rem 0 inset",
} as const;

/** Panel inside a card: frosted, translucent, like the vault cards on Explore. */
export const lookInset = {
  backgroundColor: "rgba(255,255,255,0.04)",
  border: "0.0625rem solid rgba(255,255,255,0.10)",
  borderRadius: "1.25rem",
  boxShadow: "0 0 0.625rem rgba(255,255,255,0.03), 0 0.375rem 1.125rem rgba(0,0,0,0.24)",
} as const;

/** Small stat tile: the Explore theme tile's surface (black to grey). */
export const lookTile = {
  position: "relative",
  overflow: "hidden",
  background: "linear-gradient(180deg, #101010 0%, #171717 52%, #4a4a4a 100%)",
  border: "0.0625rem solid rgba(255,255,255,0.10)",
  // Same corners as the regular KPI cards, single hairline border (no outer glass ring).
  borderRadius: "0.75rem",
  boxShadow: "none",
  // Content sits above the decoration (chrome icon) that tiles may carry.
  "& > :not(.look-decor)": { position: "relative", zIndex: 1 },
} as const;

/** Large panel with a coloured wash fading down from the top (Explore's Bonds / Currencies). */
export const lookPanel = (tint: string) =>
  ({
    background: `linear-gradient(${tint} 0%, rgba(0,0,0,0) 45%), #1c1c1c`,
    border: "0.0625rem solid rgba(255,255,255,0.10)",
    borderRadius: "1.75rem",
    boxShadow: "rgba(0,0,0,0.35) 0 0.625rem 1.4rem, rgba(255,255,255,0.08) 0 0.0625rem 0 inset",
  }) as const;

export const TINT = {
  violet: "rgba(153,69,255,0.16)",
  teal: "rgba(24,184,158,0.14)",
  blue: "rgba(0,96,255,0.14)",
} as const;
