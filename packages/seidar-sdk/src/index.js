// @seidar/sdk — recipe builder (mirrors defisaver-sdk Recipe semantics).
// Builds validated action lists for seidar-recipe-executor + quotes fees.
// Real Soroban XDR encoding (stellar-sdk) is layered on `buildIntent()`
// output in the integration phase; intents are already execution-ordered.

export const ActionKind = Object.freeze({
  Supply: "Supply",
  Borrow: "Borrow",
  Repay: "Repay",
  Withdraw: "Withdraw",
  Swap: "Swap",
  FlashLoan: "FlashLoan",
});

export class Recipe {
  constructor() {
    this.actions = [];
  }

  /** Append an action. `paramSrcIndex` reuses output of an earlier action. */
  add(kind, asset, amount, paramSrcIndex = null) {
    if (!Object.values(ActionKind).includes(kind)) throw new Error(`unknown action: ${kind}`);
    if (!Number.isInteger(amount) || amount < 0) throw new Error("amount must be a non-negative integer");
    if (paramSrcIndex !== null && (!Number.isInteger(paramSrcIndex) || paramSrcIndex >= this.actions.length)) {
      throw new Error("paramSrcIndex must reference an earlier action");
    }
    this.actions.push({ kind, asset, amount, paramSrcIndex });
    return this;
  }

  flashLoan(asset, amount) { return this.add(ActionKind.FlashLoan, asset, amount); }
  supply(asset, amount, paramSrcIndex = null) { return this.add(ActionKind.Supply, asset, amount, paramSrcIndex); }
  borrow(asset, amount, paramSrcIndex = null) { return this.add(ActionKind.Borrow, asset, amount, paramSrcIndex); }
  repay(asset, amount, paramSrcIndex = null) { return this.add(ActionKind.Repay, asset, amount, paramSrcIndex); }
  withdraw(asset, amount, paramSrcIndex = null) { return this.add(ActionKind.Withdraw, asset, amount, paramSrcIndex); }
  swap(asset, amount, paramSrcIndex = null) { return this.add(ActionKind.Swap, asset, amount, paramSrcIndex); }

  /** Enforce executor rules: non-empty, flash-loan first and at most once. */
  validate() {
    if (this.actions.length === 0) throw new Error("recipe is empty");
    const flashes = this.actions.filter((a) => a.kind === ActionKind.FlashLoan);
    if (flashes.length > 1) throw new Error("only one FlashLoan per recipe");
    this.actions.forEach((a, i) => {
      if (a.kind === ActionKind.FlashLoan && i !== 0) throw new Error("FlashLoan must be the first action");
    });
    return true;
  }

  /** Unsigned execution intent for the executor contract. */
  buildIntent(user) {
    this.validate();
    return {
      user,
      actions: this.actions.map((a) => ({ ...a })),
      createdAt: new Date().toISOString(),
    };
  }
}

/** Fee in stroops for `amount` at `feeBps` (rounded down). */
export function quoteFee(amount, feeBps) {
  if (amount <= 0 || feeBps <= 0) return 0;
  return Math.floor((amount * feeBps) / 10_000);
}

/** 1 / 10 / 25 bps tiers mirroring contracts + DeFi Saver. */
export function feeTierBps({ stable = false, correlated = false } = {}) {
  if (stable) return 1;
  if (correlated) return 10;
  return 25;
}

/** Boost recipe: flash debt -> swap to collateral -> supply -> borrow to repay flash. */
export function boostRecipe({ debtAsset, collateralAsset, flashAmount, supplyAmount, borrowAmount }) {
  return new Recipe()
    .flashLoan(debtAsset, flashAmount)
    .swap(collateralAsset, flashAmount, 0)
    .supply(collateralAsset, supplyAmount)
    .borrow(debtAsset, borrowAmount);
}

/** Repay recipe: withdraw -> swap to debt -> repay. */
export function repayRecipe({ collateralAsset, debtAsset, withdrawAmount, repayAmount }) {
  return new Recipe()
    .withdraw(collateralAsset, withdrawAmount)
    .swap(debtAsset, withdrawAmount, 0)
    .repay(debtAsset, repayAmount);
}
