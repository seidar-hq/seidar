# Seidar contracts

## seidar-leverage (+ seidar-leverage-receiver)

One-transaction leverage on Blend v2, both ways. The user's wallet signs one call:

```
open(user, pool, collateral, deposit, debt, borrow, swap, min_out, min_hf, deadline, approve_expiry)
  approve(collateral: user -> pool, deposit + min_out); stage swap (debt -> collateral)
  pool.flash_loan(user, {receiver, debt, borrow}, [SupplyCollateral(collateral, deposit + min_out)])
  then health_factor(user) >= min_hf

close(user, pool, collateral, debt, flash_amount, swap, min_out, repay, withdraw?, min_hf, deadline, approve_expiry)
  approve(debt: repay), approve(collateral: flash repay); stage swap (collateral -> debt)
  pool.flash_loan(user, {receiver, collateral, flash_amount},
                  [Repay(debt, repay), WithdrawCollateral(collateral, withdraw | all), Repay(collateral, flash)])
  allowances reset to 0; with debt left, health_factor(user) >= min_hf; returns 0 when fully closed
```

- The receiver runs Blend's `exec_op` callback (Soroban forbids re-entry). It makes the staged
  `SwapCall` (any DEX: contract, function, args), with only `pulls` of the flashed token
  authorized (at most the loan), measures the output by balance, reverts below `min_out`, pays all
  of it to the user and returns unspent input. `pending()` lets the leverage contract revert when a
  pool never called back.
- **No admin, no fees, no upgrade path, no DEX baked in.** The constructor deploys the receiver.
- **Never holds funds** outside one flash loan; tests check both contracts end at zero and no
  allowance to the pool is left.
- **Storage rent**: the contracts don't extend their own TTL; run `scripts/extend-ttl.mjs`.

Errors: leverage `#1 BadArgs`, `#2 Expired`, `#3 Unhealthy`, `#4 NotExecuted`, `#5 NoPosition`;
receiver `#1 NoStagedOp`, `#2 BadArgs`, `#3 InsufficientOutput`.

See AUDIT.md for the threat model, verified Blend behaviour and the deployment checklist.

### Build and test

```
cd contracts
stellar contract build                     # target/wasm32v1-none/release/*.wasm
cargo test --release -p seidar-leverage-fork-tests   # 27 tests on a mainnet fork
```

### Deploy

```
node contracts/scripts/deploy-cost.mjs                         # mainnet upload fees (simulation only)
node contracts/scripts/deploy.mjs testnet                      # free dry run
DEPLOYER_SECRET=S... node contracts/scripts/deploy.mjs mainnet # the real one (skips uploads already on chain)
node contracts/scripts/extend-ttl.mjs <contract> 120 [--send]  # keep alive (~every 100 days)
```

Then set the printed address as `BLEND_LEVERAGE_CONTRACT` in `services/api/wrangler.toml` `[vars]`
and deploy the Worker: Blend leverage opens and closes in one transaction.
