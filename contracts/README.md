# Seidar contracts

## seidar-leverage (+ seidar-leverage-receiver)

One-transaction leverage on Blend v2. The user's wallet signs one call:

```
leverage.open(user, pool, collateral, deposit, debt, borrow, routes, min_out, min_hf, deadline, approve_expiry)
  ├─ collateral.approve(user → pool, deposit + min_out)          // Blend pulls flash-loan supplies with transfer_from
  ├─ receiver.stage({ user, debt, borrow, collateral, routes, min_out })
  └─ pool.flash_loan(user, { receiver, debt, borrow }, [SupplyCollateral(collateral, deposit + min_out)])
       ├─ Blend records `borrow` of debt for the user and sends it to the receiver
       ├─ receiver.exec_op → Soroswap aggregator swap debt → collateral (≥ min_out) → all of it to the user
       └─ Blend pulls deposit + min_out from the user as collateral, checks health
  then: health_factor(user) ≥ min_hf, else everything reverts
```

- **Why two contracts:** Soroban forbids re-entry (leverage → pool → leverage), so Blend's
  `exec_op` callback lives in a separate receiver. The leverage constructor deploys that receiver
  itself, pinned to it, so neither can be pointed at a different counterpart.
- **No admin, no fees, no upgrade path.** The Soroswap aggregator is fixed at deployment.
- **Never holds funds** outside one flash loan; the tests check both contracts end at zero.
- `exec_op` only runs the op staged in the same transaction (exact user / asset / amount), and only
  the leverage contract can stage. A direct `exec_op` call fails with `NoStagedOp`.
- Swap output above `min_out` (the quote's slippage buffer) stays in the user's wallet.

Errors: leverage `#1 BadArgs`, `#2 Expired`, `#3 Unhealthy`; receiver `#1 NoStagedOp`, `#2 BadArgs`,
`#3 InsufficientOutput`. The aggregator's `#7` means the swap paid less than `min_out`.

### Build and test

```
cd contracts
stellar contract build                     # target/wasm32v1-none/release/*.wasm
cargo test --release -p seidar-leverage-fork-tests
```

The fork tests (`fork/tests/leverage.rs`) load real mainnet ledger entries
(`fork/fixtures/mainnet.json`: Blend Fixed v2.1, Reflector, XLM/USDC SACs, the Soroswap aggregator
and the Soroswap + Aqua pools of its live routes) and run the release WASMs on top: long XLM over
Soroswap / Aqua / split routes, short XLM (USDC collateral), adding to a position, refusals (health,
min_out, deadline, bad args, missing signature, outsider staging, direct exec_op), the user's auth
tree, and the network CPU / memory limits.

### Deploy

```
node contracts/scripts/deploy-cost.mjs                         # mainnet upload fees (simulation only)
node contracts/scripts/deploy.mjs testnet                      # free dry run
DEPLOYER_SECRET=S... node contracts/scripts/deploy.mjs mainnet # the real one
```

Then set the printed address on the API (`BLEND_LEVERAGE_CONTRACT` in `services/api/wrangler.toml`
`[vars]`) and deploy the Worker; Blend leverage switches from the multi-transaction loop to one
transaction.
