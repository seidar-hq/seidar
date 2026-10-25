// Seidar's service fees — one place for the rates the app shows and the
// contracts charge (contracts/SECURITY.md → Fees).
//
//   automation  0.30% of each keeper swap's output (repay, boost, close,
//               switch, hands-off limit orders). Fixed in the deployed
//               strategy; owners accept it in their rules (GuardParams.fee_bps).
//   swap        0.25% of a user swap's output (Exchange, Earn zaps), taken by
//               the Seidar router.
//   dca         0.20% of each DCA run's output, also via the router.
//   lending     none (supply, borrow, withdraw, repay, vault deposits).
//
// Fees accrue in the router contract (it can hold any token); the admin
// moves them to SEIDAR_FEE_ADDRESS (scripts/claim-fees.ts). Without a router
// on a network, user swaps go straight to the aggregator and carry no fee.

import { isTestnet, netEnv, TESTNET } from "./net.js";

export const FEES = { automationBps: 30, swapBps: 25, dcaBps: 20 } as const;
/** The contracts' cap (MAX_FEE_BPS in contracts/blend_iface). */
export const MAX_FEE_BPS = 100;

/** Seidar router (user swaps with a fee + fee vault) on this network. */
export const routerAddress = (): string | null => netEnv("SEIDAR_ROUTER") ?? (isTestnet() ? TESTNET.router : null);

/** Where claimed fees go: SEIDAR_FEE_ADDRESS. */
export async function feeAddress(): Promise<string | null> {
  return netEnv("SEIDAR_FEE_ADDRESS") ?? null;
}

/** Fee (bps) a user swap will actually pay here: 0 without a router. */
export function swapFeeBps(requested?: number): number {
  if (!routerAddress()) return 0;
  if (requested != null && Number.isInteger(requested) && requested >= 0 && requested <= MAX_FEE_BPS) return requested;
  return FEES.swapBps;
}

/** Net of a fee taken from `gross` (as the contracts round: fee floors). */
export const netOf = (gross: bigint, bps: number) => gross - (gross * BigInt(bps)) / 10_000n;

export async function feeInfo() {
  return {
    status: 200,
    body: {
      ok: true,
      automationBps: FEES.automationBps,
      swapBps: swapFeeBps(),
      dcaBps: routerAddress() ? FEES.dcaBps : 0,
      router: routerAddress(),
      recipient: await feeAddress(),
    },
  };
}
