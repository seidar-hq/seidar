// XOXNO's mainnet swap router (CCVENF...R7F3TR) was last updated on
// 2026-10-12. Curve support (opcode 7) landed in the quote server and the
// contract source on 2026-10-16, but the deployed router was never upgraded.
// A quote with a Curve hop therefore decodes in the current SDK and then
// panics InvalidRouteXdr (#13) on chain before any token moves.
//
// Until XOXNO redeploys the router, Seidar must not build a transaction from
// a route that contains a Curve hop. Detect it from the quote bytes, not from
// the quote's display fields (which can disagree with the packed program).

/** True when the quote's packed program contains a Curve swap hop (opcode 7). */
export async function routeUsesCurve(routeXdr: string): Promise<boolean> {
  const { decodeStellarRouteBytes } = await import("@xoxno/sdk-js/stellar-lending");
  return decodeStellarRouteBytes(routeXdr).ops.some((op) => op.kind === "swap" && op.venue === "Curve");
}
