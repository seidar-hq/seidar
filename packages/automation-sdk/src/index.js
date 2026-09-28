// @seidar/automation-sdk — trigger evaluation shared by keeper + frontend.
// Mirrors the guardian contract rules; never moves funds.

/** Pure trigger check: does the observation fire the rule? */
export function shouldFire(trigger, observedHealthBps, observedPrice) {
  if (trigger.type === "HealthBelow") return observedHealthBps < trigger.value;
  if (trigger.type === "PriceBelow") return observedPrice < trigger.value;
  throw new Error(`unknown trigger: ${trigger?.type}`);
}

/** Cooldown gate: enough ledgers since lastFired? */
export function offCooldown(lastFiredLedger, cooldownLedgers, currentLedger) {
  return currentLedger >= lastFiredLedger + cooldownLedgers;
}

/** Full keeper decision: active + cooled + trigger true. */
export function evaluateRule(rule, obs, currentLedger) {
  if (!rule.active) return { fire: false, reason: "inactive" };
  if (!offCooldown(rule.lastFired, rule.cooldownLedgers, currentLedger)) {
    return { fire: false, reason: "cooldown" };
  }
  if (!shouldFire(rule.trigger, obs.healthBps, obs.price)) {
    return { fire: false, reason: "trigger-false" };
  }
  return { fire: true, reason: "fire" };
}

/** Decode helper for guardian list_known maps. */
export function knownSubs(knownMap) {
  return Object.entries(knownMap)
    .filter(([, v]) => v === true)
    .map(([k]) => Number(k));
}
