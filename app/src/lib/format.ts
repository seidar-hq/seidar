// Small display helpers shared across the app.

/** GABC…WXYZ style short form of a Stellar address. */
export function shortAddress(addr: string) {
  return addr.length > 9 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}
