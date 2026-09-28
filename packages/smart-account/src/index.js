// @seidar/smart-account — OZ stellar-accounts rule builders + AuthPayload
// helpers. Mirrors the locked wallet spec: 1/1 owner by default, scoped
// keeper session for automation, optional multisig policy (never on the
// keeper rule). Pure payload builders; on-chain enforcement lives in the
// OZ contracts (see docs + audit notes).

export const RuleType = Object.freeze({
  Default: "Default",
  CallContract: "CallContract",
});

export const MAX_SIGNERS_PER_RULE = 15;
export const MAX_POLICIES_PER_RULE = 5;

/** Admin rule: owner only, no expiry. */
export function adminRule(owner, { name = "Admin" } = {}) {
  return {
    name,
    type: RuleType.Default,
    validUntil: null,
    signers: [{ kind: "owner", address: owner }],
    policies: [],
  };
}

/** Keeper session rule: scoped to guardian contract, expiring, capped. */
export function keeperSessionRule(keeper, guardian, { validUntilLedger, dailyLimit } = {}) {
  if (!Number.isInteger(validUntilLedger)) throw new Error("validUntilLedger (ledger seq) required");
  return {
    name: "Keeper session",
    type: RuleType.CallContract,
    contract: guardian,
    validUntil: validUntilLedger,
    signers: [{ kind: "keeper", address: keeper }],
    policies: [{ kind: "spending-limit", dailyLimit }],
  };
}

/** Optional multisig policy for treasury/admin rules (NOT keeper rules). */
export function multisigPolicy({ threshold, weights }) {
  if (!Number.isInteger(threshold) || threshold <= 0) throw new Error("threshold must be positive");
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (threshold > total) throw new Error("threshold exceeds total weight (would brick the rule)");
  const signers = Object.keys(weights);
  if (signers.length > MAX_SIGNERS_PER_RULE) throw new Error("too many signers (max 15)");
  return { kind: "threshold", threshold, weights };
}

/**
 * AuthPayload for signing: one context_rule_id per auth context.
 * Signers MUST sign sha256(signature_payload || xdr(context_rule_ids)) —
 * never the raw payload — or sponsors can downgrade the rule.
 */
export function authPayload({ signatures = {}, contextRuleIds = [] } = {}) {
  if (!Array.isArray(contextRuleIds) || contextRuleIds.length === 0) {
    throw new Error("contextRuleIds (one per auth context) required");
  }
  return { signers: signatures, context_rule_ids: contextRuleIds };
}

/** Guardrail: multisig policies must never attach to keeper session rules. */
export function attachPolicy(rule, policy) {
  if (rule.signers.some((s) => s.kind === "keeper") && policy.kind === "threshold") {
    throw new Error("multisig on keeper rule would stall automation — refused");
  }
  if (rule.policies.length >= MAX_POLICIES_PER_RULE) throw new Error("too many policies (max 5)");
  return { ...rule, policies: [...rule.policies, policy] };
}
