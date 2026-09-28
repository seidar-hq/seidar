// @seidar/tokens — asset registry + helpers (mirrors defisaver-tokens).
// Contract addresses for well-known Stellar assets. SAC addresses for native
// XLM / Circle USDC are pinned; pool addresses come from contracts/configs.

export const DECIMALS_DEFAULT = 7;

export const ASSETS = {
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

export const PROTOCOLS = {
  blend: { name: "Blend V2", maxLtvBps: 7500, liqThresholdBps: 15000 },
  xoxno: { name: "XOXNO", maxLtvBps: 8000, liqThresholdBps: 15000 },
  peridot: { name: "Peridot", maxLtvBps: 7000, liqThresholdBps: 14000 },
};

/** Convert human amount to stroops (smallest unit). */
export function toStroops(amount, decimals = DECIMALS_DEFAULT) {
  return BigInt(Math.round(amount * 10 ** decimals));
}

/** Convert stroops back to human amount. */
export function fromStroops(stroops, decimals = DECIMALS_DEFAULT) {
  return Number(stroops) / 10 ** decimals;
}

/** Look up an asset by symbol, throws on unknown. */
export function getAsset(symbol) {
  const a = ASSETS[symbol];
  if (!a) throw new Error(`unknown asset: ${symbol}`);
  return a;
}

/** True for stable↔stable pairs (1bps fee tier). */
export function isStablePair(a, b) {
  return Boolean(getAsset(a).stable && getAsset(b).stable);
}

/** Correlated volatile pairs (ETH↔wstETH style). On Stellar: XLM↔sXLM. */
const CORRELATED = new Set(["XLM:sXLM", "sXLM:XLM"]);
export function isCorrelatedPair(a, b) {
  return CORRELATED.has(`${a}:${b}`);
}
