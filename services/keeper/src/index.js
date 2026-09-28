// @seidar/keeper — off-chain watcher. Polls Reflector prices + pool health
// (snapshots injected; RPC wiring in integration phase), evaluates rules with
// @seidar/automation-sdk, and emits guardian.execute intents for keepers to
// submit. The guardian re-checks on-chain; this service never moves funds.

import { evaluateRule } from "@seidar/automation-sdk";
import { healthBps } from "@seidar/positions-sdk";

/** One poll tick over subscribed rules + market snapshot. */
export function tick({ rules, snapshot, currentLedger }) {
  const intents = [];
  const decisions = [];
  for (const rule of rules) {
    const position = snapshot.positions[rule.subId] ?? { collateralValue: 0, debtValue: 0 };
    const obs = {
      healthBps: healthBps(position.collateralValue, position.debtValue) ?? 0,
      price: snapshot.prices[rule.priceAsset] ?? 0,
    };
    const d = evaluateRule(rule, obs, currentLedger);
    decisions.push({ subId: rule.subId, ...d, obs });
    if (d.fire) {
      intents.push({
        type: "guardian.execute",
        owner: rule.owner,
        subId: rule.subId,
        observedHealthBps: obs.healthBps,
        observedPrice: obs.price,
        ledger: currentLedger,
      });
    }
  }
  return { intents, decisions };
}

/** Demo loop entrypoint (single tick over fixture data when run directly). */
if (process.argv[1]?.endsWith("index.js")) {
  const out = tick({
    rules: [
      { subId: 1, owner: "GABC", active: true, lastFired: 0, cooldownLedgers: 100, priceAsset: "XLM", trigger: { type: "HealthBelow", value: 15000 } },
    ],
    snapshot: {
      positions: { 1: { collateralValue: 1240, debtValue: 900 } },
      prices: { XLM: 95 },
    },
    currentLedger: 10000,
  });
  console.log(JSON.stringify(out, null, 2));
}
