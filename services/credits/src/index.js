// @seidar/credits — gas-credit ledger for sponsored transactions.
// New users get a free bucket (txs + stroop budget). Each relayer-paid tx
// deducts its feeCharged; at zero the dashboard flips to user-pays USDC
// (FeeForwarder) or self-pay XLM. Backed by Postgres in production; this
// module is the pure accounting core (battle-tested here).

/** Fresh credit bucket: 5 sponsored txs up to `budgetStroops`. */
export function newBucket({ txs = 5, budgetStroops = 50_000_000 } = {}) {
  return { txsLeft: txs, budgetLeft: budgetStroops };
}

/**
 * Attempt to sponsor `feeCharged` stroops.
 * Returns { ok, bucket, mode }: mode is "sponsored" or "user-pays".
 * Never lets balances go negative.
 */
export function trySponsor(bucket, feeCharged) {
  if (bucket.txsLeft > 0 && bucket.budgetLeft >= feeCharged) {
    return {
      ok: true,
      mode: "sponsored",
      bucket: {
        txsLeft: bucket.txsLeft - 1,
        budgetLeft: bucket.budgetLeft - feeCharged,
      },
    };
  }
  return { ok: false, mode: "user-pays", bucket: { ...bucket } };
}

/** Top-up (promotions, referrals). Caps prevent unbounded buckets. */
export function topUp(bucket, { txs = 0, budgetStroops = 0 } = {}, caps = { txs: 10, budget: 100_000_000 }) {
  return {
    txsLeft: Math.min(bucket.txsLeft + txs, caps.txs),
    budgetLeft: Math.min(bucket.budgetLeft + budgetStroops, caps.budget),
  };
}
