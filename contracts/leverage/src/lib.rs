#![no_std]
//! Seidar leverage: open or close a leveraged Blend position in ONE transaction.
//!
//! `open` (signed by the user's wallet):
//!   1. approves the pool to pull `deposit + min_out` of the collateral;
//!   2. stages the swap in seidar-leverage-receiver;
//!   3. calls `pool.flash_loan(user, {receiver, debt, borrow}, [SupplyCollateral])`:
//!      Blend records `borrow` of debt against the user and sends it to the
//!      receiver, whose `exec_op` swaps it into collateral with the given swap
//!      call (any DEX) and pays it all to the user; Blend then supplies
//!      `deposit + min_out` as collateral and checks the position's health;
//!   4. checks the finished health against the user's `min_hf`.
//!
//! `close` (signed by the user's wallet), the reverse:
//!   1. approves the pool to pull the debt repayment and the flash repayment;
//!   2. stages the swap: flashed collateral -> at least `min_out` of the debt asset;
//!   3. calls `pool.flash_loan(user, {receiver, collateral, flash}, [Repay(debt),
//!      WithdrawCollateral(collateral), Repay(collateral)])`: Blend lends `flash`
//!      of the collateral asset to the receiver, which swaps it into the debt asset
//!      for the user; Blend then repays the debt, releases the collateral and repays
//!      the flash loan from it, settling each token net (the user receives the
//!      collateral left over and never needs to hold the flashed amount);
//!   4. resets the allowances and, when debt remains (partial close), checks the
//!      health against `min_hf`.
//!
//! Any failure reverts everything. No admin, no fees, no upgrades, and no DEX
//! baked in: the swap is a call described per transaction (see iface::SwapCall).
//! The receiver is deployed here, by this contract, so it can't be swapped.
//!
//! Storage rent: neither contract extends its own TTL (a user's transaction would pay the
//! rent); Seidar keeps both alive with contracts/scripts/extend-ttl.mjs.

use seidar_leverage_iface::{
    health_factor, BlendPoolClient, FlashLoan, ReceiverClient, Request, Staged, SwapCall,
    BLEND_MAX_PRICE_AGE, REQ_REPAY, REQ_SUPPLY_COLLATERAL, REQ_WITHDRAW_COLLATERAL, SCALAR_12, SCALAR_7,
};
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, token, vec, Address, BytesN, Env, Vec};

#[contracttype]
#[derive(Clone)]
enum Key {
    Receiver,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum LeverageError {
    BadArgs = 1,
    Expired = 2,
    Unhealthy = 3,
    /// The pool returned without running the staged swap (not a Blend pool).
    NotExecuted = 4,
    /// close with nothing to withdraw (no collateral of that asset in the pool).
    NoPosition = 5,
}

#[contract]
pub struct SeidarLeverage;

fn receiver(e: &Env) -> Address {
    e.storage().instance().get(&Key::Receiver).unwrap()
}

fn check_common(e: &Env, a: &Address, b: &Address, flash: i128, min_out: i128, swap: &SwapCall, deadline: u64) {
    if flash <= 0 || min_out <= 0 || a == b || swap.pulls.is_empty() {
        panic_with_error!(e, LeverageError::BadArgs);
    }
    if e.ledger().timestamp() > deadline {
        panic_with_error!(e, LeverageError::Expired);
    }
}

/// Stage the swap, run the flash loan, and make sure the pool really called back.
fn flash(e: &Env, user: &Address, pool: &Address, staged: Staged, requests: Vec<Request>) {
    let r = receiver(e);
    let rc = ReceiverClient::new(e, &r);
    let asset = staged.asset_in.clone();
    let amount = staged.amount;
    rc.stage(&staged);
    BlendPoolClient::new(e, pool).flash_loan(user, &FlashLoan { contract: r, asset, amount }, &requests);
    if rc.pending() {
        panic_with_error!(e, LeverageError::NotExecuted);
    }
}

#[contractimpl]
impl SeidarLeverage {
    /// Deploys this contract's own receiver from `receiver_wasm`.
    pub fn __constructor(e: Env, receiver_wasm: BytesN<32>) {
        let receiver = e
            .deployer()
            .with_current_contract(BytesN::from_array(&e, &[0u8; 32]))
            .deploy_v2(receiver_wasm, (e.current_contract_address(),));
        e.storage().instance().set(&Key::Receiver, &receiver);
    }

    pub fn receiver(e: Env) -> Address {
        receiver(&e)
    }

    /// Open (or add to) a leveraged position: `deposit` of the user's own
    /// `collateral` plus `borrow` of `debt` swapped (by `swap`, made by the receiver)
    /// into at least `min_out` more collateral, all supplied as collateral in `pool`.
    /// Returns the finished health factor (7 decimals). `approve_expiry` is the ledger the
    /// pool's allowance lapses at, fixed when the transaction is signed.
    #[allow(clippy::too_many_arguments)]
    pub fn open(
        e: Env,
        user: Address,
        pool: Address,
        collateral: Address,
        deposit: i128,
        debt: Address,
        borrow: i128,
        swap: SwapCall,
        min_out: i128,
        min_hf: i128,
        deadline: u64,
        approve_expiry: u32,
    ) -> i128 {
        user.require_auth();
        if deposit < 0 || min_hf < SCALAR_7 {
            panic_with_error!(&e, LeverageError::BadArgs);
        }
        check_common(&e, &collateral, &debt, borrow, min_out, &swap, deadline);
        let supply = deposit.checked_add(min_out).unwrap_or_else(|| panic_with_error!(&e, LeverageError::BadArgs));

        // Blend pulls flash-loan supplies with transfer_from, so it needs this allowance.
        token::Client::new(&e, &collateral).approve(&user, &pool, &supply, &approve_expiry);
        flash(
            &e,
            &user,
            &pool,
            Staged { user: user.clone(), asset_in: debt, amount: borrow, asset_out: collateral.clone(), swap, min_out },
            vec![&e, Request { request_type: REQ_SUPPLY_COLLATERAL, address: collateral, amount: supply }],
        );

        let hf = health_factor(&e, &pool, &user, BLEND_MAX_PRICE_AGE).unwrap_or_else(|| panic_with_error!(&e, LeverageError::Unhealthy));
        if hf < min_hf {
            panic_with_error!(&e, LeverageError::Unhealthy);
        }
        hf
    }

    /// Close (all or part of) a leveraged position: flash-borrow `flash_amount` of `collateral`,
    /// swap it (by `swap`) into at least `min_out` of `debt` for the user, repay `repay` of
    /// `debt` (an amount above the debt repays it all; Blend refunds the rest), withdraw
    /// `withdraw` of collateral (`None`: all of it), and repay the flash loan from it.
    /// Returns the remaining health factor, or 0 when no debt is left. With debt left it must
    /// be at least `min_hf`.
    #[allow(clippy::too_many_arguments)]
    pub fn close(
        e: Env,
        user: Address,
        pool: Address,
        collateral: Address,
        debt: Address,
        flash_amount: i128,
        swap: SwapCall,
        min_out: i128,
        repay: i128,
        withdraw: Option<i128>,
        min_hf: i128,
        deadline: u64,
        approve_expiry: u32,
    ) -> i128 {
        user.require_auth();
        if repay <= 0 || min_hf < SCALAR_7 || matches!(withdraw, Some(w) if w <= 0) {
            panic_with_error!(&e, LeverageError::BadArgs);
        }
        check_common(&e, &collateral, &debt, flash_amount, min_out, &swap, deadline);

        let blend = BlendPoolClient::new(&e, &pool);
        let withdraw = match withdraw {
            Some(w) => w,
            None => {
                // All of it: the underlying of the user's b-tokens, padded so Blend's rounding
                // can't leave dust (Blend caps a withdrawal at the balance).
                let r = blend.get_reserve(&collateral);
                let b = blend.get_positions(&user).collateral.get(r.config.index).unwrap_or(0);
                if b <= 0 {
                    panic_with_error!(&e, LeverageError::NoPosition);
                }
                let underlying = b.checked_mul(r.data.b_rate).unwrap_or_else(|| panic_with_error!(&e, LeverageError::BadArgs)) / SCALAR_12;
                underlying + underlying / 1_000 + 1
            }
        };
        // Repay the flash loan with a hair more than borrowed (Blend rounds the liability up and
        // refunds any excess), so no flash debt can be left behind.
        let flash_repay = flash_amount
            .checked_add(flash_amount / 10_000 + 1)
            .unwrap_or_else(|| panic_with_error!(&e, LeverageError::BadArgs));

        // Blend settles each token net: the user owes `repay` of debt (paid from the swap output)
        // and, at most, `flash_repay` of collateral (usually less than what is withdrawn).
        let debt_token = token::Client::new(&e, &debt);
        let coll_token = token::Client::new(&e, &collateral);
        debt_token.approve(&user, &pool, &repay, &approve_expiry);
        coll_token.approve(&user, &pool, &flash_repay, &approve_expiry);
        flash(
            &e,
            &user,
            &pool,
            Staged { user: user.clone(), asset_in: collateral.clone(), amount: flash_amount, asset_out: debt.clone(), swap, min_out },
            vec![
                &e,
                Request { request_type: REQ_REPAY, address: debt.clone(), amount: repay },
                Request { request_type: REQ_WITHDRAW_COLLATERAL, address: collateral.clone(), amount: withdraw },
                Request { request_type: REQ_REPAY, address: collateral.clone(), amount: flash_repay },
            ],
        );
        // Nothing may stay approved to the pool after this transaction.
        debt_token.approve(&user, &pool, &0, &approve_expiry);
        coll_token.approve(&user, &pool, &0, &approve_expiry);

        if blend.get_positions(&user).liabilities.is_empty() {
            return 0;
        }
        let hf = health_factor(&e, &pool, &user, BLEND_MAX_PRICE_AGE).unwrap_or_else(|| panic_with_error!(&e, LeverageError::Unhealthy));
        if hf < min_hf {
            panic_with_error!(&e, LeverageError::Unhealthy);
        }
        hf
    }
}
