// @seidar/positions-sdk — read lens over lending positions
// (mirrors defisaver-positions-sdk getMarketsData/getAccountData).
// Pure functions over pool snapshots; RPC fetching is layered in services/.

export const BPS = 10_000;

export type HealthStatus = "yield" | "healthy" | "watch" | "risk";

/** Health in bps, null when debt-free. */
export function healthBps(
  collateralValue: number,
  debtValue: number,
): number | null {
  if (debtValue <= 0) return null;
  if (collateralValue <= 0) return 0;
  return Math.floor((collateralValue * BPS) / debtValue);
}

/** Status bucket used across dashboard + keepers. */
export function healthStatus(
  health: number | null,
  liqThresholdBps = 15000,
): HealthStatus {
  if (health === null) return "yield";
  if (health >= liqThresholdBps + 1000) return "healthy";
  if (health >= liqThresholdBps - 2500) return "watch";
  return "risk";
}

/** Max debt value allowed for collateral at maxLtvBps. */
export function borrowLimit(
  collateralValue: number,
  maxLtvBps: number,
): number {
  if (collateralValue <= 0) return 0;
  return Math.floor((collateralValue * maxLtvBps) / BPS);
}

/** Net APY estimate: supply APY minus borrow APY weighted by position. */
export function netApy(
  supplyValue: number,
  supplyApyBps: number,
  debtValue: number,
  borrowApyBps: number,
): number {
  const total = supplyValue + debtValue;
  if (total <= 0) return 0;
  return Math.round(
    (supplyValue * supplyApyBps - debtValue * borrowApyBps) / total,
  );
}

export interface Position {
  collateralValue?: number;
  debtValue?: number;
  automation?: string;
}

export interface PortfolioSummary {
  collateral: number;
  debt: number;
  loans: number;
  protected: number;
  count: number;
}

/** Aggregate a portfolio of positions into dashboard cards. */
export function aggregatePortfolio(positions: Position[]): PortfolioSummary {
  let collateral = 0;
  let debt = 0;
  let protectedLoans = 0;
  let loans = 0;
  for (const p of positions) {
    collateral += p.collateralValue ?? 0;
    debt += p.debtValue ?? 0;
    if ((p.debtValue ?? 0) > 0) {
      loans += 1;
      if (p.automation && p.automation !== "Off") protectedLoans += 1;
    }
  }
  return {
    collateral,
    debt,
    loans,
    protected: protectedLoans,
    count: positions.length,
  };
}
