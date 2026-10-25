// Which Stellar network a request is for.
//
// The app runs on mainnet; the sidebar's Testnet mode sends `?network=testnet`
// on every API call (lib/api.ts) and the middleware in index.ts runs the
// request inside that network's context. Everything network-specific reads
// from here: RPC endpoints + passphrase (rpc.ts), Horizon, contract
// addresses (automation, Soroswap), the Blend pools served, cache keys and
// DB rows. Scripts and the keeper pick their network with STELLAR_NETWORK.
//
// Testnet scope: Blend (the testnet pool), Soroswap swaps, smart accounts and
// automation. Vaults, DEX pools and XOXNO are mainnet-only.

import { AsyncLocalStorage } from "node:async_hooks";

export type Net = "mainnet" | "testnet";

const store = new AsyncLocalStorage<Net>();
const DEFAULT: Net = process.env.STELLAR_NETWORK === "testnet" ? "testnet" : "mainnet";

export function network(): Net {
  return store.getStore() ?? DEFAULT;
}
export const isTestnet = () => network() === "testnet";

/** Run `fn` (and everything it awaits) on network `n`. */
export function withNetwork<T>(n: Net, fn: () => T): T {
  return store.run(n, fn);
}

export const parseNet = (v: string | null | undefined): Net => (v === "testnet" ? "testnet" : "mainnet");

export const networkPassphrase = () =>
  isTestnet() ? "Test SDF Network ; September 2015" : "Public Global Stellar Network ; September 2015";

export const horizonUrl = () => (isTestnet() ? "https://horizon-testnet.stellar.org" : "https://horizon.stellar.org");

/** Network-scoped cache key: mainnet keys are unchanged, testnet ones prefixed. */
export const netKey = (key: string) => (isTestnet() ? `testnet:${key}` : key);

/** Per-network env: mainnet reads NAME, testnet reads TESTNET_NAME. */
export function netEnv(name: string): string | null {
  const v = isTestnet() ? process.env[`TESTNET_${name}`] : process.env[name];
  return v?.trim() || null;
}

/** Known testnet deployments (contracts/configs/networks.json → testnet). */
export const TESTNET = {
  blendPool: "CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF",
  soroswapRouter: "CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD",
  /** The mainnet Soroswap aggregator's WASM (hash 437653…3190), deployed by
   *  Seidar: Soroswap's own testnet aggregator is the older interface. */
  aggregator: "CCH3TC4BBAXVJMDNKQG44PWLI4OUN4JQ3CNCHN5JA2LM6LCJF5YJPHB3",
  /** Seidar router: user swaps with Seidar's fee + the fee vault. */
  router: "CD6WL7ZJT4ETXCSN64EWMTJ4O3OMALMD43XTC3ZR4EB53GSGANBTF2LV",
  guard: "CCIY2YEDJ2FZ7VCOSB2M4JRMEJMP45IEHYD6ILNLAF3PS2BSAJL2WSB2",
  strategy: "CD6JM3XRJWWWZTWQUOBOM2APA7MB6FLH3SWMTW4AF2FDVGBZEUHSTD4A",
  receiver: "CANXUKYM4H23DW74BVP6JY34SQ5FD5MONAGCOI4EHTUCEUPRRA57CHFU",
  keeper: "GA2V3DHJALCSRYN4OZUFXG7DMPQWOQJE6JLAALNQS27ZBJ4VBYPVGBG6",
};
