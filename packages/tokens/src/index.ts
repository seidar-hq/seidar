// @seidar/tokens — asset registry + helpers (mirrors defisaver-tokens).
// Contract addresses for well-known Stellar assets. SAC addresses for native
// XLM / Circle USDC are pinned; pool addresses come from contracts/configs.

export const DECIMALS_DEFAULT = 7;

export interface AssetInfo {
  symbol: string;
  decimals: number;
  /** SAC contract address, or null until pinned per network. */
  sac: string | null;
  stable: boolean;
  testnetOnly?: boolean;
}

export const ASSETS: Record<string, AssetInfo> = {
  XLM: {
    symbol: "XLM",
    decimals: 7,
    // XLM SAC (testnet + mainnet share this contract id)
    sac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    stable: false,
  },
  USDC: {
    symbol: "USDC",
    decimals: 7,
    // Circle USDC (mainnet)
    sac: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    stable: true,
  },
  EURC: {
    symbol: "EURC",
    decimals: 7,
    sac: null, // pin per network before mainnet
    stable: true,
  },
  BLEND_USDC_TESTNET: {
    symbol: "USDC",
    decimals: 7,
    sac: "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU",
    stable: true,
    testnetOnly: true,
  },
};

export interface ProtocolInfo {
  name: string;
  maxLtvBps: number;
  liqThresholdBps: number;
}

export const PROTOCOLS: Record<string, ProtocolInfo> = {
  blend: { name: "Blend V2", maxLtvBps: 7500, liqThresholdBps: 15000 },
  xoxno: { name: "XOXNO", maxLtvBps: 8000, liqThresholdBps: 15000 },
};

/** Convert human amount to stroops (smallest unit). */
export function toStroops(
  amount: number,
  decimals: number = DECIMALS_DEFAULT,
): bigint {
  return BigInt(Math.round(amount * 10 ** decimals));
}

/** Convert stroops back to human amount. */
export function fromStroops(
  stroops: bigint,
  decimals: number = DECIMALS_DEFAULT,
): number {
  return Number(stroops) / 10 ** decimals;
}

/** Look up an asset by symbol, throws on unknown. */
export function getAsset(symbol: string): AssetInfo {
  const a = ASSETS[symbol];
  if (!a) throw new Error(`unknown asset: ${symbol}`);
  return a;
}

/** True for stable↔stable pairs (1bps fee tier). */
export function isStablePair(a: string, b: string): boolean {
  return Boolean(getAsset(a).stable && getAsset(b).stable);
}

/** Correlated volatile pairs (ETH↔wstETH style). Stellar has no native
 * staking and no canonical liquid-staking token, so no pair qualifies yet.
 * The 10 bps tier is reserved until a real correlated asset exists. */
const CORRELATED: Set<string> = new Set([]);
export function isCorrelatedPair(a: string, b: string): boolean {
  return CORRELATED.has(`${a}:${b}`);
}
