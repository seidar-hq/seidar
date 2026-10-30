# seidar-leverage: internal audit (2026-10-30)

Scope: `leverage/` (open, close), `receiver/` (exec_op, stage, pending), `iface/` (Blend v2 bindings,
health factor, SwapCall), `scripts/deploy.mjs`, `scripts/extend-ttl.mjs`. Not an external audit.

## Design in one paragraph

The user signs one call. `open` flash-borrows the debt asset, swaps it into collateral and supplies
it; `close` flash-borrows the collateral asset, swaps it into the debt asset, repays, withdraws and
repays the flash loan. The Blend flash-loan callback lives in a separate receiver (Soroban forbids
re-entry) that the leverage constructor deploys itself. Neither contract has an admin, fees, upgrade
path or stored configuration besides the receiver address. The swap is a `SwapCall` (contract,
function, args, pulls) passed per transaction, so no DEX interface is baked in.

## Blend v2 behaviour relied on (verified in blend-contracts-v2 `main`)

| Fact | Source |
|---|---|
| `flash_loan(from, {contract, asset, amount}, requests)` records the borrow (pool + reserve must allow borrowing, utilisation < 100%), validates health with the requests applied, transfers to the receiver, calls `exec_op(from, asset, amount, 0)`, then settles the requests | `pool/src/pool/submit.rs` |
| Settlement nets per token: one `transfer_from(user)` for what the user owes, one `transfer` for what the user is owed (allowance needed only for the net amount owed) | `handle_transfer_with_allowance` |
| Repay above the debt: the user pays the request amount, the pool refunds the excess | `actions.rs apply_repay` |
| WithdrawCollateral above the balance is capped at the balance | `actions.rs apply_withdraw_collateral` |
| Oracle prints older than 24 h (or ≤ 0) are invalid | `pool.rs load_price` |
| RequestType: 2 SupplyCollateral, 3 WithdrawCollateral, 5 Repay | `actions.rs` |

## Threat model and findings

| # | Area | Question | Result |
|---|---|---|---|
| 1 | Auth | Can anyone open/close for someone else? | No: `user.require_auth()` first; approvals and `flash_loan(from = user)` are in the user's signed tree (test `user_signs_one_tree…`, `*_needs_the_users_signature`). |
| 2 | Receiver staging | Can an outsider stage or run an op? | `stage` requires the pinned leverage contract as direct invoker (test `only_the_leverage_contract_can_stage`); `exec_op` needs a staged op for the exact user/token/amount and clears it (test `receiver_rejects_unstaged_exec_op`). |
| 3 | Stale op | A pool that never calls `exec_op` could leave a staged op behind. | **Fixed**: after the flash loan the leverage checks `receiver.pending()` and reverts with `NotExecuted` (#4) (test `open_refuses_a_pool_that_never_runs_the_swap`). |
| 4 | Generic swap | Can the swap call take more than the loan, or funds sitting in the receiver? | The receiver pre-authorizes only `pulls` of the flashed token, together ≤ the flashed amount, each > 0 (test `swap_cannot_pull_more_than_the_loan`: stray funds untouched). No other receiver-authorized action exists. |
| 5 | Swap output | Fee-on-transfer, lying return values, partial fills? | Output measured by balance delta; below `min_out` reverts (#3 receiver); unspent input is returned to the user (tests `a_swap_that_pays_nothing…`, `unspent_swap_input…`, `refuses_when_swap_returns_less…`, `close_refuses_a_swap_below_min_out`). |
| 6 | Re-entry | Swap contract calling back into pool/leverage/receiver? | All are on the call stack: Soroban rejects re-entry. |
| 7 | Allowances | Anything left approved to the pool? | open: Blend pulls exactly `deposit + min_out` (asserted 0 after open). close: both allowances reset to 0 after the flash loan (asserted in every close test). |
| 8 | Close dust | Rounding leaving flash debt or collateral? | Flash repaid with +0.01% +1 (refunded); full withdraw padded +0.1% (capped by Blend). Tests assert zero debt in both assets and zero collateral after a full close (long and short). |
| 9 | Health | Could the contract refuse what Blend accepts, or accept unsafe positions? | Same 24 h price rule as Blend; open requires `min_hf ≥ 1.0` and checks it; partial close checks `min_hf` when debt remains; Blend itself also enforces health ≥ 1 inside the flash loan. |
| 10 | Arithmetic | Overflow / negative amounts? | `overflow-checks = true` in release; explicit checks on all user amounts (BadArgs #1 tests for every argument). |
| 11 | Deadline / expiry | Stale signed transactions? | `deadline` (ledger timestamp) and `approve_expiry` (ledger) fixed at signing (test `refuses_expired_deadline`). |
| 12 | Malicious pool | A user-specified fake pool. | It can only act on the user's own signed approvals, and any run that doesn't execute the staged swap reverts (#3). The app only ever passes real Blend pools. Residual: a phishing front end could get a user to sign against a fake pool, as with any dapp. |
| 13 | Storage rent | Who pays to keep the contracts alive? | **Changed**: the contracts no longer extend their own TTL (a user's transaction would have paid ~3.4 XLM every ~16 days at mainnet rent of ~0.0103 XLM/KB/day). Seidar runs `scripts/extend-ttl.mjs`; first needed ~120 days after upload. |
| 14 | Limits | CPU/memory within network limits? | open 12–25 M CPU, close 12–24 M CPU (limit 100 M), memory < 10 MB, asserted in tests. |
| 15 | Future-proofing | What could force a redeploy? | Not a DEX change (generic swap), not a new Blend v2 pool (pool is an argument), not oracle staleness differences. Only a Blend interface change (a "v3" pool with a different `flash_loan`) would need a new contract. |

## Out of scope / residual risk

- No external audit. The fork tests run the release WASMs on real mainnet state (Blend Fixed v2.1,
  Reflector, Soroswap aggregator) but are not a formal verification.
- One-step close needs the pool to allow borrowing (a flash loan is a borrow): on-ice or frozen
  pools, or a reserve with borrowing disabled, close with the manual Repay/Withdraw flow.
- Closing uses the collateral of one asset; a debt backed by several collaterals may need a
  partial close or a manual step first (the app says so before signing).

## Deployment checklist (one shot)

1. `stellar contract build` and `cargo test --release -p seidar-leverage-fork-tests` (27/27).
2. `node contracts/scripts/deploy-cost.mjs`: mainnet upload fees by simulation (30.76 XLM on
   2026-10-30 for 14,226 B + 6,294 B), plus ~0.01 XLM create and the 1 XLM account reserve.
3. `node contracts/scripts/deploy.mjs testnet`: full dry run of the exact WASMs (done 2026-10-30,
   CA3PRI5W5WHL3QSNPSF5SQXAAVUJUMW6BVYIGSSYUE4WI4KQGWIGY7ZX).
4. Mainnet: `DEPLOYER_SECRET=… node contracts/scripts/deploy.mjs mainnet`. A failed step can be
   re-run: uploads already on chain are skipped.
5. Set `BLEND_LEVERAGE_CONTRACT` in `services/api/wrangler.toml`, deploy the API, then simulate an
   open and a close build against mainnet before announcing it.
6. Every ~100 days: `node contracts/scripts/extend-ttl.mjs <contract> 120` (simulate), then with
   `--send` and the deployer key.
