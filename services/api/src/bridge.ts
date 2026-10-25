// Bridge into Stellar with Allbridge Core over NEAR Intents (Messenger.NEAR_INTENTS): the only
// live Allbridge route to Stellar. Flow: quote -> create a one-shot deposit address -> the user
// sends the source tokens there (any wallet or exchange on the source chain, no approval) ->
// solvers deliver USDC or XLM to the Stellar address. Destination is always Stellar.
//   GET  /bridge/routes            source chains + tokens, Stellar destination tokens
//   POST /bridge/quote             { fromChain, fromToken, toToken, amount }
//   POST /bridge/deposit           { ...quote, fromAccount, toAccount } -> deposit (+ raw EVM tx)
//   POST /bridge/submit            { depositAddress, depositMemo?, txId } (speeds up detection)

import type { AllbridgeCoreSdk, TokenWithChainDetails } from "@allbridge/bridge-core-sdk";

const NEAR_INTENTS = 7; // Messenger.NEAR_INTENTS

// Source-chain RPCs: the SDK needs one per EVM chain to build the one-click transfer.
// Public endpoints by default; BRIDGE_RPC_<CHAIN> (e.g. BRIDGE_RPC_BAS) overrides any of them.
const EVM_RPC: Record<string, string> = {
  ETH: "https://ethereum-rpc.publicnode.com",
  POL: "https://polygon-bor-rpc.publicnode.com",
  ARB: "https://arbitrum-one-rpc.publicnode.com",
  AVA: "https://avalanche-c-chain-rpc.publicnode.com",
  OPT: "https://optimism-rpc.publicnode.com",
  BAS: "https://base-rpc.publicnode.com",
  BSC: "https://bsc-rpc.publicnode.com",
};

let sdkP: Promise<{ sdk: AllbridgeCoreSdk; Messenger: { NEAR_INTENTS: number } }> | null = null;
function core() {
  const rpcs = Object.fromEntries(Object.entries(EVM_RPC).map(([k, v]) => [k, process.env[`BRIDGE_RPC_${k}`]?.trim() || v]));
  sdkP ??= import("@allbridge/bridge-core-sdk").then((m) => ({
    sdk: new m.AllbridgeCoreSdk({ ...m.nodeRpcUrlsDefault, ...rpcs }),
    Messenger: m.Messenger as unknown as { NEAR_INTENTS: number },
  }));
  return sdkP;
}

type ChainMap = Record<string, { chainSymbol: string; name: string; chainType: string; chainId?: string; tokens: TokenWithChainDetails[] }>;
let chainsCache: { at: number; map: ChainMap } | null = null;

async function chains(): Promise<ChainMap> {
  if (chainsCache && Date.now() - chainsCache.at < 10 * 60_000) return chainsCache.map;
  const { sdk } = await core();
  const map = (await sdk.chainDetailsMap()) as unknown as ChainMap;
  chainsCache = { at: Date.now(), map };
  return map;
}

const hasIntents = (t: TokenWithChainDetails) => !!(t as { nearIntents?: unknown }).nearIntents;

async function resolve(fromChain: string, fromToken: string, toToken: string) {
  const map = await chains();
  const src = map[fromChain]?.tokens.find((t) => t.tokenAddress === fromToken && hasIntents(t));
  const dst = map.SRB?.tokens.find((t) => t.symbol === toToken && hasIntents(t));
  if (!src || !dst) throw new Error("This route is not supported.");
  return { src, dst, chain: map[fromChain] };
}

const friendly = (e: unknown) => {
  const name = (e as { errorCode?: string; name?: string })?.errorCode ?? (e as { name?: string })?.name ?? "";
  const msg = e instanceof Error ? e.message : String(e);
  if (/AmountTooLow/i.test(name + msg)) return "Amount is below the bridge minimum.";
  if (/NoLiquidity/i.test(name + msg)) return "No solver liquidity for this amount right now. Try a different amount.";
  if (/DoesNotSupported|not supported/i.test(name + msg)) return "This route is not supported.";
  return msg.slice(0, 200);
};

export async function bridgeRoutes() {
  const map = await chains();
  const sources = Object.values(map)
    .filter((c) => c.chainSymbol !== "SRB")
    .map((c) => ({
      chain: c.chainSymbol,
      name: c.name,
      chainType: c.chainType,
      chainId: c.chainId ?? null,
      tokens: c.tokens.filter(hasIntents).map((t) => ({
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        tokenAddress: t.tokenAddress,
        isNative: !!(t as { isNative?: boolean }).isNative,
        usdPrice: Number((t as { usdPrice?: string }).usdPrice ?? 0) || null,
      })),
    }))
    .filter((c) => c.tokens.length > 0);
  const destinations = (map.SRB?.tokens ?? []).filter(hasIntents).map((t) => ({ symbol: t.symbol, tokenAddress: t.tokenAddress, decimals: t.decimals }));
  return { ok: true, sources, destinations };
}

export async function bridgeQuote(b: { fromChain?: string; fromToken?: string; toToken?: string; amount?: string }) {
  try {
    if (!/^\d*\.?\d+$/.test(String(b?.amount ?? ""))) return { ok: false, error: "Enter an amount." };
    const { src, dst } = await resolve(String(b.fromChain), String(b.fromToken), String(b.toToken));
    const { sdk } = await core();
    const q = await sdk.nearIntents.getQuote({ amount: String(b.amount), sourceToken: src, destinationToken: dst });
    return { ok: true, quote: q };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function bridgeDeposit(b: { fromChain?: string; fromToken?: string; toToken?: string; amount?: string; fromAccount?: string; toAccount?: string }) {
  try {
    if (!/^G[A-Z2-7]{55}$/.test(String(b?.toAccount ?? ""))) return { ok: false, error: "A Stellar destination address is required." };
    if (!String(b?.fromAccount ?? "").trim()) return { ok: false, error: "Enter your address on the source chain (used for refunds)." };
    const { src, dst, chain } = await resolve(String(b.fromChain), String(b.fromToken), String(b.toToken));
    const { sdk } = await core();
    const params = {
      amount: String(b.amount),
      sourceToken: src,
      destinationToken: dst,
      fromAccountAddress: String(b.fromAccount).trim(),
      toAccountAddress: String(b.toAccount),
    };
    const deposit = await sdk.nearIntents.createDeposit(params);
    // EVM sources: also return the transfer transaction so a browser wallet can send it in one click.
    let evmTx: unknown = null;
    let evmTxError: string | null = null;
    if (chain.chainType === "EVM") {
      try {
        const built = await sdk.nearIntents.buildSendTransaction({ ...params, nearIntentsDeposit: deposit });
        evmTx = built.rawTransaction;
      } catch (e) {
        evmTxError = friendly(e);
      }
    }
    return { ok: true, deposit, evmTx, evmTxError, chainId: chain.chainId ?? null, messenger: NEAR_INTENTS };
  } catch (e) {
    return { ok: false, error: friendly(e) };
  }
}

export async function bridgeSubmit(b: { depositAddress?: string; depositMemo?: string; txId?: string }) {
  if (!b?.depositAddress || !b?.txId) return { ok: false, error: "depositAddress and txId required" };
  const { sdk } = await core();
  await sdk.nearIntents.submitDeposit({ depositAddress: b.depositAddress, depositMemo: b.depositMemo, txId: b.txId });
  return { ok: true };
}
