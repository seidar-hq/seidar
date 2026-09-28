# Seidar contracts — threat model + audit notes

Live testnet deployment: `contracts/configs/networks.json`
(`recipe_executor`, `guardian`, `flash_receiver` + proving txs).

## Trust model

- Users always custody funds. Contracts move value only inside a
  user-authorized invocation (`require_auth` at every state-changing entry).
- Keepers can trigger but never steal: `guardian.execute` re-checks the
  trigger on-chain and only runs the pre-registered action.
- Relayers pay XLM fees; they cannot alter signed auth (auth digest binds
  `context_rule_ids`).
- Admin/upgrade: contracts are immutable on deploy in v1 (no
  `update_current_contract_wasm` path). Upgrades = new deployment + config
  pin rotation. This is deliberate for audit scope.

## Invariants (all covered by `cargo test`)

1. `recipe_executor`: non-empty recipes; FlashLoan first and at most once;
   `param_src_index` only references earlier actions; reentrancy guard set
   and always released; user auth required.
2. `guardian`: unknown subs rejected; non-owners rejected; inactive/one-shot
   subs cannot refire; cooldowns enforced; false triggers rejected; TTL
   bumped on every state write (no silent archival).
3. `flash_receiver`: pool must authorize; non-positive amounts rejected;
   nested callbacks rejected.
4. `live` mirrors: Blend request ordering (supply→borrow); Reflector reads
   gated by `is_fresh` (stale + future-dated rejected); swaps carry
   `min_out` slippage floors.

## Known limitations (mainnet gates)

- `live` mirrors must be regenerated from upstream WASM IDL per release and
  hashes pinned; CI must fail on drift (WASM-hash check job required).
- Mainnet `guardian.execute` must compare keeper-observed values against
  Reflector + pool `positions` with a staleness bound — current scaffold
  takes observations as args (testnet-trusted keeper).
- Noestable `test_snapshots/` are committed; snapshot churn must be reviewed,
  never blindly accepted (`cargo test` writes them on first run).
- Fee tiers (1/10/25 + 5 automation) are policy constants; changing them is
  a redeploy + disclosure, not a silent patch.

## Auditor checklist

- [ ] Re-run `cargo test --workspace` (26+ tests) + `stellar contract build`.
- [ ] Review `SubKey` storage growth / rent griefing bounds.
- [ ] Review `threshold/weight` divergence handling in smart-account policies.
- [ ] Fuzz `health_factor`/`flash_amount_for_leverage` boundaries (0, MAX).
- [ ] Verify `networks.json` pins match deployed WASM hashes.
- [ ] Verify testnet proving txs on stellar.expert links in configs.
