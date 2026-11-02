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
| 4 | Generic swap | Can the swap call take more than the loan, or funds sitting in the receiver? | The receiver pre-authorizes only `pulls` of the flashed token, together ≤ the flashed amount, each > 0 (test `swap_cannot_pull_more_than_the_loan`: stray funds untouched). No other receiver-authorized action exists. **Re-audit 2026-11-01**: the other tests mock all auths, so this host rule was never exercised; `pulls_are_enforced_by_real_auth` now runs open with only the user's signature mocked and a malicious swap: an exact pull passes auth (then fails on output, #3), a pull of more than authorized or to another address is refused by the host, stray funds untouched. **External review 2026-11-02**: that held only with a real pool. A fake pool could call `exec_op` WITHOUT lending, so the receiver treated stray funds as the loan (refunding them as "unspent", or letting the pulls take them). **Fixed**: `stage` records the receiver's balance of the input token and `exec_op` requires the loan on top of it (`NotFunded` #4 receiver; tests `a_fake_pool_cannot_drain_stray_funds_from_the_receiver`, both variants, and `stray_funds_dont_block_or_join_a_real_open_and_close`). |
| 5 | Swap output | Fee-on-transfer, lying return values, partial fills? | Output measured by balance delta; below `min_out` reverts (#3 receiver); unspent input is returned to the user (tests `a_swap_that_pays_nothing…`, `unspent_swap_input…`, `refuses_when_swap_returns_less…`, `close_refuses_a_swap_below_min_out`). |
| 6 | Re-entry | Swap contract calling back into pool/leverage/receiver? | All are on the call stack: Soroban rejects re-entry. |
| 7 | Allowances | Anything left approved to the pool? | open: Blend pulls exactly `deposit + min_out` (asserted 0 after open). Not reset afterwards on purpose: only a fake pool would leave it, and a fake pool the user signed for can pull it during the call anyway, so a reset adds a signed entry to every open and protects nothing. close: both allowances reset to 0 after the flash loan (asserted in every close test). |
| 8 | Close dust | Rounding leaving flash debt or collateral? | Flash repaid with +0.01% +2 stroops (refunded). **2026-11-02**: was +1, which for a loan under 10,000 stroops could leave 1 d-token of flash debt (Blend mints the liability rounded up, burns the repayment rounded down; ~0.4% of such sizes at USDC's rate), so a full close would revert #3; 2 stroops cover a d-token while the debt rate is below 2.0 (test `a_tiny_flash_close_leaves_no_flash_debt` finds such a size on the fork and closes with it); full withdraw padded +0.1% (capped by Blend). Tests assert zero debt in both assets and zero collateral after a full close (long and short). |
| 9 | Health | Could the contract refuse what Blend accepts, or accept unsafe positions? | Same 24 h price rule as Blend; open requires `min_hf ≥ 1.0` and checks it; partial close checks `min_hf` when debt remains; Blend itself also enforces health ≥ 1 inside the flash loan. |
| 10 | Arithmetic | Overflow / negative amounts? | `overflow-checks = true` in release; explicit checks on all user amounts (BadArgs #1 tests for every argument). |
| 11 | Deadline / expiry | Stale signed transactions? | `deadline` (ledger timestamp) and `approve_expiry` (ledger) fixed at signing (test `refuses_expired_deadline`). |
| 12 | Malicious pool | A user-specified fake pool. | It can only act on the user's own signed approvals, and any run that doesn't execute the staged swap reverts (#4 NotExecuted); since 2026-11-02 a callback without the loan delivered reverts too (#4 NotFunded, row 4), so it can't reach funds left in the shared receiver. The app only ever passes real Blend pools. Residual: a phishing front end could get a user to sign against a fake pool, as with any dapp. |
| 13 | Storage rent | Who pays to keep the contracts alive? | **Changed**: the contracts no longer extend their own TTL (a user's transaction would have paid ~3.4 XLM every ~16 days at mainnet rent of ~0.0103 XLM/KB/day). Seidar runs `scripts/extend-ttl.mjs`; first needed ~120 days after upload. |
| 14 | Limits | CPU/memory within network limits? | open 12–25 M CPU, close 12–24 M CPU (limit 100 M), memory < 10 MB, asserted in tests. |
| 16 | Direct-invoker auth (2026-11-01) | The receiver calls the swap contract directly, and Soroban authorizes a contract for any call it makes directly. A swap whose contract IS the flashed or output token (`transfer` / `approve` from the receiver) would skip `pulls`. | Not exploitable before (such a call delivers no output, so `min_out` reverts the whole transaction), but the `pulls` guarantee didn't hold as written. **Fixed**: the receiver refuses a swap contract equal to either token (`BadArgs` #2; test `the_swap_cannot_be_a_call_on_either_token`). Receiver WASM 6,294 → 6,323 B (6,811 B after the 2026-11-02 delivery check). |
| 15 | Future-proofing | What could force a redeploy? | Not a DEX change (generic swap), not a new Blend v2 pool (pool is an argument), not oracle staleness differences. Only a Blend interface change (a "v3" pool with a different `flash_loan`) would need a new contract. |

## External review (2026-11-02): what was changed and what was left

An outside AI review (12 findings, none critical) and a follow-up review were checked against the code and Blend's source.

| Finding | Decision |
|---|---|
| Fake pool drains stray receiver funds | **Fixed** (row 4). |
| `open` doesn't reset the allowance | Left (row 7). |
| Dust flash repay (+1) | **Fixed**: +2 (row 8). |
| `withdraw: None` padding uses `+` | **Fixed**: `checked_add` (same revert, clean error code). |
| `pulls.to` unrestricted | Left: requiring `to == swap.contract` breaks routers that pull to a pair, and buys nothing: the user signs the swap call, and `min_out` is the economic guard. |
| `deposit = 0`, `min_hf ≥ 1.0` | Left: intentional (boost with existing collateral; Blend enforces 1.00001; 1.3 is app policy). |
| API partial-close guard | **Fixed** in the API: refuses unless the withdrawal covers `flash + 0.01% + 2`. |
| API `amountOutMin` parsing | **Fixed**: strict integer, anything else is "no route". |
| API ignores `min_collateral` | Left: the simulation fails with Blend #1224, which the API already words, and the app shows the pool minimum. |
| Loop fallback can end below 1.3 | Left: only runs while no contract is configured. |
| Manual TTL | Unchanged (row 13). The contracts hold no funds; positions live in Blend, so an archived contract only blocks one-step open/close until restored, never a withdrawal. |

## Mainnet deployment (2026-11-02)

seidar-leverage `CB2XUBNX5WI77MAPZ76X67CUPWGOGDFBK7TIBQ2UTFAVGTIPFTTQCOMZ`, receiver
`CA2DDRJS5W57WRSEXJJX7V62KXXPFO4IXF5NSPU7PZOOO7JUP6ZNXTTC`, deployed by
`GDZHOPYA2T6OTWT5GLYDDOV4DDRLBAS5DHBQMPVQQGKLRDPPALUISB6W` for 27.29 XLM. Code fetched back from
chain: leverage `21f8cc855fd6fcc81cbbefe4c37bee8841489f752e49257ed76bc691bbf3ba68`, receiver
`cdb667eec47cc5b95833230c562988ac9a87494911e45056c1a8571555a71707` (the audited builds). Receiver
points back to the leverage contract, `pending` false, unstaged `exec_op` refused #1.



- No external audit. The fork tests run the release WASMs on real mainnet state (Blend Fixed v2.1,
  Reflector, Soroswap aggregator) but are not a formal verification.
- One-step close needs the pool to allow borrowing (a flash loan is a borrow): on-ice or frozen
  pools, or a reserve with borrowing disabled, close with the manual Repay/Withdraw flow.
- Closing uses the collateral of one asset; a debt backed by several collaterals may need a
  partial close or a manual step first (the app says so before signing).

## Deployment checklist (one shot)

1. `stellar contract build` and `cargo test --release -p seidar-leverage-fork-tests` (34/34 on 2026-11-02).
2. `node contracts/scripts/deploy-cost.mjs`: mainnet upload fees by simulation (31.31 XLM on
   2026-11-02 for 14,230 B + 6,811 B), plus ~0.01 XLM create and the 1 XLM account reserve.
   WASM sha256: leverage `21f8cc855fd6fcc81cbbefe4c37bee8841489f752e49257ed76bc691bbf3ba68`,
   receiver `cdb667eec47cc5b95833230c562988ac9a87494911e45056c1a8571555a71707` (deploy.mjs prints both).
3. `node contracts/scripts/deploy.mjs testnet`: full dry run of the exact WASMs (redone 2026-11-02 with the
   final WASMs: CAJVGZZ4XDERVJIW5ZOY7FR4T45XUGAX3LCUOMCPB2X6VUQT3IN3XAE4, receiver
   CASFZWKJBXYWJ3RDYD5TJEGUQWXBYXDON7V4WWME7C3C4DVJMZQD2Z2A; receiver/leverage wiring read back,
   `pending` false, unstaged `exec_op` refused #1).
4. Mainnet: `DEPLOYER_SECRET=… node contracts/scripts/deploy.mjs mainnet`. A failed step can be
   re-run: uploads already on chain are skipped.
5. Set `BLEND_LEVERAGE_CONTRACT` in `services/api/wrangler.toml`, deploy the API, then simulate an
   open and a close build against mainnet before announcing it.
6. Every ~100 days: `node contracts/scripts/extend-ttl.mjs <contract> 120` (simulate), then with
   `--send` and the deployer key.
