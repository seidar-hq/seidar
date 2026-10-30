#![no_std]
//! Seidar leverage: open a leveraged Blend position in ONE transaction.
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
//! Any failure reverts everything. Swap output above `min_out` (at most the
//! slippage) stays in the user's wallet.
//!
//! No admin, no fees, no upgrades, and no DEX baked in: the swap is a call
//! described per transaction (see iface::SwapCall), so a new aggregator or venue
//! needs no redeploy. The receiver is deployed here, by this contract, so it
//! can't be swapped.

use seidar_leverage_iface::{
    health_factor, keep_alive, BlendPoolClient, FlashLoan, ReceiverClient, Request, Staged, SwapCall, BLEND_MAX_PRICE_AGE,
    REQ_SUPPLY_COLLATERAL, SCALAR_7,
};
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, token, vec, Address, BytesN, Env};

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
}

#[contract]
pub struct SeidarLeverage;

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
        e.storage().instance().get(&Key::Receiver).unwrap()
    }

    /// Open (or add to) a leveraged position: `deposit` of the user's own
    /// `collateral` plus `borrow` of `debt` swapped (by `swap`, made by the receiver)
    /// into at least `min_out` more collateral, all supplied as collateral in `pool`. Returns the
    /// finished health factor (7 decimals). `approve_expiry` is the ledger the
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
        keep_alive(&e);
        if deposit < 0 || borrow <= 0 || min_out <= 0 || collateral == debt || min_hf < SCALAR_7 || swap.pulls.is_empty() {
            panic_with_error!(&e, LeverageError::BadArgs);
        }
        if e.ledger().timestamp() > deadline {
            panic_with_error!(&e, LeverageError::Expired);
        }
        let supply = deposit.checked_add(min_out).unwrap_or_else(|| panic_with_error!(&e, LeverageError::BadArgs));
        let receiver: Address = e.storage().instance().get(&Key::Receiver).unwrap();

        // Blend pulls flash-loan supplies with transfer_from, so it needs this allowance.
        token::Client::new(&e, &collateral).approve(&user, &pool, &supply, &approve_expiry);
        ReceiverClient::new(&e, &receiver).stage(&Staged {
            user: user.clone(),
            debt: debt.clone(),
            amount: borrow,
            collateral: collateral.clone(),
            swap,
            min_out,
        });
        BlendPoolClient::new(&e, &pool).flash_loan(
            &user,
            &FlashLoan { contract: receiver, asset: debt, amount: borrow },
            &vec![&e, Request { request_type: REQ_SUPPLY_COLLATERAL, address: collateral, amount: supply }],
        );

        let hf = health_factor(&e, &pool, &user, BLEND_MAX_PRICE_AGE)
            .unwrap_or_else(|| panic_with_error!(&e, LeverageError::Unhealthy));
        if hf < min_hf {
            panic_with_error!(&e, LeverageError::Unhealthy);
        }
        hf
    }
}
