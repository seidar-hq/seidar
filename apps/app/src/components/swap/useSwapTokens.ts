"use client";

import { useMemo } from "react";
import { useTokenCatalogue } from "@/portfolio/usePortfolio";
import { useBalances } from "@/wallet/useBalances";
import type { SwapToken } from "./TokenSelectDialog";

/** Swap catalogue tokens with the active wallet's balances and prices merged in. */
export function useSwapTokens(address: string | null) {
  const { tokens } = useTokenCatalogue();
  const { byAddress } = useBalances(address ? [address] : []);
  const held = address ? byAddress[address]?.tokens : undefined;

  return useMemo<SwapToken[]>(() => {
    const out: SwapToken[] = tokens.map((t) => {
      const b = held?.find((h) => h.code === t.code && (h.issuer ?? null) === (t.issuer ?? null));
      return {
        code: t.code,
        contract: t.contract,
        decimals: t.decimals ?? 7,
        name: t.name ?? null,
        issuer: t.issuer,
        balance: b?.amount ?? 0,
        usd: b?.usd ?? 0,
        price: b?.price ?? null,
      };
    });
    return out;
  }, [tokens, held]);
}
