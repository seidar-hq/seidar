// @seidar/automation-sdk — trigger evaluation shared by keeper + frontend.
// Mirrors the guardian contract rules; never moves funds.

export interface Trigger {
  type: string;
  value: number;
}

export interface GuardRule {
  active: boolean;
  lastFired: number;
  cooldownLedgers: number;
  trigger: Trigger;
}

export interface Observation {
  healthBps: number;
  price: number;
}

export type FireReason = "inactive" | "cooldown" | "trigger-false" | "fire";

export interface RuleDecision {
  fire: boolean;
  reason: FireReason;
}

/** Loose trigger shape (callers may probe unknown types). */
export interface TriggerLike {
  type: string;
  value?: number;
}

/** Pure trigger check: does the observation fire the rule? */
export function shouldFire(
  trigger: TriggerLike,
  observedHealthBps: number,
  observedPrice: number,
): boolean {
  if (trigger.type === "HealthBelow")
    return observedHealthBps < (trigger.value ?? NaN);
  if (trigger.type === "PriceBelow")
    return observedPrice < (trigger.value ?? NaN);
  throw new Error(`unknown trigger: ${trigger.type}`);
}

/** Cooldown gate: enough ledgers since lastFired? */
export function offCooldown(
  lastFiredLedger: number,
  cooldownLedgers: number,
  currentLedger: number,
): boolean {
  return currentLedger >= lastFiredLedger + cooldownLedgers;
}

/** Full keeper decision: active + cooled + trigger true. */
export function evaluateRule(
  rule: GuardRule,
  obs: Observation,
  currentLedger: number,
): RuleDecision {
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
export function knownSubs(knownMap: Record<string, boolean>): number[] {
  return Object.entries(knownMap)
    .filter(([, v]) => v === true)
    .map(([k]) => Number(k));
}
