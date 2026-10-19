// App network: mainnet by default; Testnet mode is a sidebar toggle
// (components/shell.tsx). The choice lives in localStorage and switching
// reloads the page, so every read during a page's life sees one network.
// apiFetch tags API calls with ?network=testnet; signing, Horizon and
// explorer links read their values from here.
//
// Testnet covers Blend (the testnet pool), Soroswap swaps, smart accounts and
// automation; the API answers "mainnet only" for vaults, DEX pools and XOXNO.

export type Net = "mainnet" | "testnet";

const KEY = "seidar.network";

export function getNetwork(): Net {
  if (typeof window === "undefined") return "mainnet";
  try {
    return window.localStorage.getItem(KEY) === "testnet" ? "testnet" : "mainnet";
  } catch {
    return "mainnet";
  }
}

export const isTestnetMode = () => getNetwork() === "testnet";

/** Switch networks: stored, then the page reloads into the other network. */
export function setNetwork(n: Net): void {
  try {
    window.localStorage.setItem(KEY, n);
    // Accounts and orders are per network: drop the cached ones (the API
    // serves each network's own on reload).
    for (const k of ["seidar.smartAccount", "seidar.activeAccount", "seidar.strategies"]) window.localStorage.removeItem(k);
  } catch {
    /* private mode: the reload below still re-reads (mainnet) */
  }
  window.location.reload();
}

export const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";
export const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";

export const networkPassphrase = () => (isTestnetMode() ? TESTNET_PASSPHRASE : MAINNET_PASSPHRASE);
export const horizonBase = () => (isTestnetMode() ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org");
/** stellar.expert base for the active network, e.g. `${explorerBase()}/tx/${hash}`. */
export const explorerBase = () => `https://stellar.expert/explorer/${isTestnetMode() ? "testnet" : "public"}`;
