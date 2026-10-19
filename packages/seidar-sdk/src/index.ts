// @seidar/sdk — recipe builder (mirrors defisaver-sdk Recipe semantics).
// Builds validated action lists for seidar-recipe-executor + quotes fees.
// Real Soroban XDR encoding (stellar-sdk) is layered on `buildIntent()`
// output in the integration phase; intents are already execution-ordered.

export const ActionKind = {
  Supply: "Supply",
  Borrow: "Borrow",
  Repay: "Repay",
  Withdraw: "Withdraw",
  Swap: "Swap",
  FlashLoan: "FlashLoan",
} as const;

export type ActionKind = (typeof ActionKind)[keyof typeof ActionKind];

export interface RecipeAction {
  kind: ActionKind;
  asset: string;
  amount: number;
  paramSrcIndex: number | null;
}

export interface RecipeIntent {
  user: string;
  actions: RecipeAction[];
  createdAt: string;
}

export class Recipe {
  actions: RecipeAction[] = [];

  /** Append an action. `paramSrcIndex` reuses output of an earlier action. */
  add(
    kind: string,
    asset: string,
    amount: number,
    paramSrcIndex: number | null = null,
  ): this {
    if (!(Object.values(ActionKind) as string[]).includes(kind))
      throw new Error(`unknown action: ${kind}`);
    if (!Number.isInteger(amount) || amount < 0)
      throw new Error("amount must be a non-negative integer");
    if (
      paramSrcIndex !== null &&
      (!Number.isInteger(paramSrcIndex) ||
        paramSrcIndex >= this.actions.length)
    ) {
      throw new Error("paramSrcIndex must reference an earlier action");
    }
    this.actions.push({
      kind: kind as ActionKind,
      asset,
      amount,
      paramSrcIndex,
    });
    return this;
  }

  flashLoan(asset: string, amount: number): this {
    return this.add(ActionKind.FlashLoan, asset, amount);
  }
  supply(
    asset: string,
    amount: number,
    paramSrcIndex: number | null = null,
  ): this {
    return this.add(ActionKind.Supply, asset, amount, paramSrcIndex);
  }
  borrow(
    asset: string,
    amount: number,
    paramSrcIndex: number | null = null,
  ): this {
    return this.add(ActionKind.Borrow, asset, amount, paramSrcIndex);
  }
  repay(
    asset: string,
    amount: number,
    paramSrcIndex: number | null = null,
  ): this {
    return this.add(ActionKind.Repay, asset, amount, paramSrcIndex);
  }
  withdraw(
    asset: string,
    amount: number,
    paramSrcIndex: number | null = null,
  ): this {
    return this.add(ActionKind.Withdraw, asset, amount, paramSrcIndex);
  }
  swap(
    asset: string,
    amount: number,
    paramSrcIndex: number | null = null,
  ): this {
    return this.add(ActionKind.Swap, asset, amount, paramSrcIndex);
  }

  /** Enforce executor rules: non-empty, flash-loan first and at most once. */
  validate(): true {
    if (this.actions.length === 0) throw new Error("recipe is empty");
    const flashes = this.actions.filter(
      (a) => a.kind === ActionKind.FlashLoan,
    );
    if (flashes.length > 1) throw new Error("only one FlashLoan per recipe");
    this.actions.forEach((a, i) => {
      if (a.kind === ActionKind.FlashLoan && i !== 0)
        throw new Error("FlashLoan must be the first action");
    });
    return true;
  }

  /** Unsigned execution intent for the executor contract. */
  buildIntent(user: string): RecipeIntent {
    this.validate();
    return {
      user,
      actions: this.actions.map((a) => ({ ...a })),
      createdAt: new Date().toISOString(),
    };
  }
}

/** Fee in stroops for `amount` at `feeBps` (rounded down). */
export function quoteFee(amount: number, feeBps: number): number {
  if (amount <= 0 || feeBps <= 0) return 0;
  return Math.floor((amount * feeBps) / 10_000);
}

export interface FeeTier {
  stable?: boolean;
  correlated?: boolean;
}

/** 1 / 10 / 25 bps tiers mirroring contracts + DeFi Saver. */
export function feeTierBps({ stable = false, correlated = false }: FeeTier = {}): number {
  if (stable) return 1;
  if (correlated) return 10;
  return 25;
}

export interface BoostParams {
  debtAsset: string;
  collateralAsset: string;
  flashAmount: number;
  supplyAmount: number;
  borrowAmount: number;
}

/** Boost recipe: flash debt -> swap to collateral -> supply -> borrow to repay flash. */
export function boostRecipe({
  debtAsset,
  collateralAsset,
  flashAmount,
  supplyAmount,
  borrowAmount,
}: BoostParams): Recipe {
  return new Recipe()
    .flashLoan(debtAsset, flashAmount)
    .swap(collateralAsset, flashAmount, 0)
    .supply(collateralAsset, supplyAmount)
    .borrow(debtAsset, borrowAmount);
}

export interface RepayParams {
  collateralAsset: string;
  debtAsset: string;
  withdrawAmount: number;
  repayAmount: number;
}

/** Repay recipe: withdraw -> swap to debt -> repay. */
export function repayRecipe({
  collateralAsset,
  debtAsset,
  withdrawAmount,
  repayAmount,
}: RepayParams): Recipe {
  return new Recipe()
    .withdraw(collateralAsset, withdrawAmount)
    .swap(debtAsset, withdrawAmount, 0)
    .repay(debtAsset, repayAmount);
}
