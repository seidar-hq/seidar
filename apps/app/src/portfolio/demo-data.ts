"use client";

// Figures for the dev-only demo portfolio (see demo.ts). Never imported by production builds:
// demo.ts loads this file only when NODE_ENV isn't "production", and the bundler drops that branch.

import type { TokenBalance } from "@/wallet/useBalances";
import type { BorrowRow, SupplyRow, VaultRow } from "./usePortfolio";
import type { Range } from "./useSeries";

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
// Etherfuse issues both stablebonds: USTRY (US Treasuries) and CETES (Mexican government bonds).
const ETHERFUSE = "GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC";
const AQUA_ISSUER = "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA";

/** Mainnet prices on 2026-11-02 (CETES/USTRY from the API's price feed). */
export const DEMO_PRICES: Record<string, number> = { XLM: 0.16734, USDC: 1, USTRY: 1.079, CETES: 0.063487, AQUA: 0.00028051 };

/** % change per asset code over each range: a good week for XLM, steady stablebonds. */
const DEMO_CHANGES: Record<Range, Record<string, number>> = {
  "1h": { XLM: 0.62, USDC: 0, USTRY: 0.01, CETES: 0.01, AQUA: 0.4 },
  "1d": { XLM: 5.14, USDC: 0, USTRY: 0.03, CETES: 0.05, AQUA: 3.8 },
  "7d": { XLM: 11.6, USDC: 0, USTRY: 0.09, CETES: 0.18, AQUA: 7.2 },
  "14d": { XLM: 16.9, USDC: 0, USTRY: 0.17, CETES: 0.36, AQUA: 9.5 },
  "30d": { XLM: 24.3, USDC: 0.01, USTRY: 0.36, CETES: 0.79, AQUA: 14.1 },
  "90d": { XLM: 38.7, USDC: 0.01, USTRY: 1.08, CETES: 2.31, AQUA: 21.6 },
  "1y": { XLM: 61.2, USDC: 0.02, USTRY: 4.4, CETES: 9.6, AQUA: 34.0 },
};

const codeOfKey = (key: string) => (key === "native" ? "XLM" : key.split(":")[0].toUpperCase());

/** Demo changes keyed like usePriceChanges (exposure keys). */
export function demoChanges(keys: string[], range: Range): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const k of keys) out[k] = DEMO_CHANGES[range][codeOfKey(k)] ?? null;
  return out;
}

const SPAN_MS: Record<Range, number> = {
  "1h": 3_600_000,
  "1d": 86_400_000,
  "7d": 7 * 86_400_000,
  "14d": 14 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
  "1y": 365 * 86_400_000,
};

/**
 * A price path for `key` over `range` that ends at today's demo price and starts where the demo
 * change says, with gentle deterministic wobble (same picture on every load).
 */
export function demoChart(key: string, range: Range): { t: number; px: number }[] {
  const code = codeOfKey(key);
  const end = DEMO_PRICES[code];
  if (!end) return [];
  const change = DEMO_CHANGES[range][code] ?? 0;
  const start = end / (1 + change / 100);
  const n = 96;
  const now = Math.floor(Date.now() / 300_000) * 300_000;
  const span = SPAN_MS[range];
  let seed = [...code].reduce((s, c) => s * 31 + c.charCodeAt(0), 7) + range.length * 101;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const swing = code === "USDC" ? 0.0004 : code === "USTRY" || code === "CETES" ? 0.0015 : 0.018;
  const pts: { t: number; px: number }[] = [];
  let noise = 0;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    noise = noise * 0.85 + rand() * swing;
    // Eases from start to end; the wobble fades out so the last point is today's price exactly.
    const trend = start + (end - start) * (f * f * (3 - 2 * f));
    pts.push({ t: now - span + f * span, px: i === n - 1 ? end : trend * (1 + noise * (1 - f * 0.6)) });
  }
  return pts;
}

const token = (code: string, issuer: string | null, amount: number): TokenBalance => {
  const price = DEMO_PRICES[code];
  return { code, issuer, amount, price, usd: amount * price, listed: true, ...(code === "XLM" ? { spendable: amount - 3 } : {}) };
};

/** Wallet holdings: XLM, USDC, two Etherfuse stablebonds and AQUA (about $74k). */
export const DEMO_TOKENS: TokenBalance[] = [
  token("XLM", null, 200_000),
  token("USTRY", ETHERFUSE, 14_000),
  token("USDC", USDC_ISSUER, 12_500),
  token("CETES", ETHERFUSE, 190_000),
  token("AQUA", AQUA_ISSUER, 5_000_000),
].sort((a, b) => b.usd - a.usd);

const FIXED_V21 = "CBAKAZUEJBAFA2DCGBRS2WKJT3FNIMJBHTFL76AY7XMAVEINQNNIQWAO";

/** Positions for `wallet`: Blend USDC supply + XLM borrow, an Aquarius XLM/USDC LP, a DeFindex USDC vault. */
export function demoPositions(wallet: string) {
  const lpXlm = 25_100;
  const lpUsdc = 4_200;
  const supplied: SupplyRow[] = [
    {
      kind: "lend",
      protocol: "blend",
      label: "Blend",
      code: "USDC",
      issuer: USDC_ISSUER,
      pool: FIXED_V21,
      amount: 10_000,
      usd: 10_000,
      apy: null,
      wallet,
      contract: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    },
    {
      kind: "lp",
      protocol: "aqua",
      label: "Aqua",
      code: "XLM/USDC",
      issuer: null,
      pool: "CA6PUJLBYKZKUEKLZJMKBZLEKP2OTHANDEOWSFF44FTSYLKQPIICCJBE",
      amount: null,
      usd: lpXlm * DEMO_PRICES.XLM + lpUsdc,
      apy: null,
      wallet,
      legs: [
        { code: "XLM", issuer: null, amount: lpXlm },
        { code: "USDC", issuer: USDC_ISSUER, amount: lpUsdc },
      ],
    },
  ];
  const borrowed: BorrowRow[] = [
    {
      protocol: "blend",
      code: "XLM",
      issuer: null,
      pool: FIXED_V21,
      amount: 9_000,
      usd: 9_000 * DEMO_PRICES.XLM,
      wallet,
      contract: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",
    },
  ];
  const vaultRows: VaultRow[] = [
    {
      protocol: "defindex",
      vault: "CBNKCU3HGFKHFOF7JTGXQCNKE3G3DXS5RDBQUKQMIIECYKXPIOUGB2S3",
      name: "BeansUsdcVault",
      shares: "0",
      usd: 6_800,
      underlying: [{ code: "USDC", issuer: USDC_ISSUER, amount: 6_800 }],
      wallet,
    },
  ];
  return { supplied, borrowed, vaultRows, rewardsUsd: 214.36, claimableBlnd: 1_842.5, apyByWallet: { [wallet]: 6.84 }, healthFactor: 4.21 };
}
