// @seidar/mcp tools — agent-optimized, read/quote/build ONLY.
// Safety rails (mirroring defisaver-ai): no key custody, unsigned intents
// only, leverage <= 3x, resulting health >= 1.30. Violation -> tool error,
// never a transaction.

import { boostRecipe, repayRecipe, quoteFee, feeTierBps } from "@seidar/sdk";
import { healthBps, aggregatePortfolio } from "@seidar/positions-sdk";
import { evaluateRule } from "@seidar/automation-sdk";
import { ASSETS, PROTOCOLS } from "@seidar/tokens";

const MAX_LEVERAGE = 3;
const MIN_HEALTH_BPS = 13000;

function railLeverage(leverage) {
  if (!(leverage > 1) || leverage > MAX_LEVERAGE) {
    throw new Error(`leverage must be >1 and <=${MAX_LEVERAGE}`);
  }
}

function railHealth(health) {
  if (health === null || health < MIN_HEALTH_BPS) {
    throw new Error("resulting health below 1.30 — refused");
  }
}

export const tools = {
  get_markets: {
    description: "List supported lending markets with LTV caps.",
    run() {
      return { markets: PROTOCOLS };
    },
  },

  get_position: {
    description: "Health + status for a collateral/debt snapshot.",
    run({ collateralValue, debtValue }) {
      const health = healthBps(collateralValue, debtValue);
      return { healthBps: health, debtFree: health === null };
    },
  },

  quote_boost: {
    description: "Quote a boost to target leverage (unsigned, validated).",
    run({ user, debtAsset, collateralAsset, collateralValue, debtValue, leverage }) {
      railLeverage(leverage);
      const flash = Math.round(collateralValue * (leverage - 1));
      const health = healthBps(collateralValue + flash, debtValue + flash);
      railHealth(health);
      const recipe = boostRecipe({
        debtAsset, collateralAsset,
        flashAmount: flash, supplyAmount: flash, borrowAmount: flash,
      });
      const fee = quoteFee(flash, feeTierBps({}));
      return {
        intent: recipe.buildIntent(user),
        quote: { flash, fee, steps: recipe.actions.length, healthBps: health },
        warnings: ["unsigned intent — user signs in wallet", "mainnet needs pool liquidity check"],
      };
    },
  },

  quote_repay: {
    description: "Quote a deleverage (unsigned, validated).",
    run({ user, collateralAsset, debtAsset, withdrawAmount, repayAmount }) {
      const recipe = repayRecipe({ collateralAsset, debtAsset, withdrawAmount, repayAmount });
      return { intent: recipe.buildIntent(user), quote: { steps: recipe.actions.length } };
    },
  },

  get_automation_rules: {
    description: "Evaluate keeper rules against an observation.",
    run({ rules, obs, currentLedger }) {
      return rules.map((rule) => ({ subId: rule.subId, ...evaluateRule(rule, obs, currentLedger) }));
    },
  },

  get_portfolio: {
    description: "Aggregate positions into dashboard cards.",
    run({ positions }) {
      return aggregatePortfolio(positions);
    },
  },

  get_assets: {
    description: "Pinned asset registry (never invent addresses).",
    run() {
      return { assets: ASSETS };
    },
  },
};

export const toolNames = () => Object.keys(tools);

export function callTool(name, args = {}) {
  try {
    const t = tools[name];
    if (!t) throw new Error(`unknown tool: ${name}`);
    return { ok: true, result: t.run(args) };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
