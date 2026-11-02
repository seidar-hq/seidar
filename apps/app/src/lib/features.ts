// Feature flags, fixed at build time (NEXT_PUBLIC_*). Unreleased features are on in `next dev`
// (.env.development) and off in production builds until they ship.

/** Home (market overview at "/"). Off: "/" is Portfolio and the nav has no Home, as before. */
export const HOME_ENABLED = process.env.NEXT_PUBLIC_ENABLE_HOME === "1";

/** Discover (browse any wallet, see its risk and P&L, copy its positions). Dev only for now. */
export const DISCOVER_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DISCOVER === "1";
