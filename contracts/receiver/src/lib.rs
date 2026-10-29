#![no_std]
//! Seidar leverage receiver: Blend's `exec_op` flash-loan callback for
//! seidar-leverage. A separate contract because Soroban forbids re-entry
//! (leverage -> pool -> leverage); seidar-leverage deploys it in its own
//! constructor and is the only contract that can stage an operation.
//!
//! `exec_op` runs only against the op staged in the same transaction, for the
//! exact user / token / amount, then clears it. It swaps the flashed debt
//! asset into the collateral on the pinned Soroswap aggregator and sends ALL
//! of the output to the user (Blend then pulls the supply from the user). It
//! never holds funds outside a single flash loan.

use seidar_leverage_iface::{aggregator_swap, Staged};
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env};

#[contracttype]
#[derive(Clone)]
enum Key {
    Leverage,
    Staged,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReceiverError {
    NoStagedOp = 1,
    BadArgs = 2,
    InsufficientOutput = 3,
}

#[contract]
pub struct SeidarLeverageReceiver;

#[contractimpl]
impl SeidarLeverageReceiver {
    pub fn __constructor(e: Env, leverage: Address) {
        e.storage().instance().set(&Key::Leverage, &leverage);
    }

    /// The seidar-leverage contract this receiver serves.
    pub fn leverage(e: Env) -> Address {
        e.storage().instance().get(&Key::Leverage).unwrap()
    }

    /// Stage the next op. Only the pinned leverage contract (direct caller).
    pub fn stage(e: Env, op: Staged) {
        let leverage: Address = e.storage().instance().get(&Key::Leverage).unwrap();
        leverage.require_auth();
        e.storage().temporary().set(&Key::Staged, &op);
    }

    /// Blend flash-loan callback; `caller` is the position owner (`from`).
    pub fn exec_op(e: Env, caller: Address, token: Address, amount: i128, _fee: i128) {
        let p: Staged = e
            .storage()
            .temporary()
            .get(&Key::Staged)
            .unwrap_or_else(|| panic_with_error!(&e, ReceiverError::NoStagedOp));
        e.storage().temporary().remove(&Key::Staged);
        if caller != p.user || token != p.debt || amount != p.amount {
            panic_with_error!(&e, ReceiverError::BadArgs);
        }
        let out = aggregator_swap(&e, &p.aggregator, &p.debt, amount, &p.collateral, p.min_out, &p.routes);
        if out < p.min_out {
            panic_with_error!(&e, ReceiverError::InsufficientOutput);
        }
        token::Client::new(&e, &p.collateral).transfer(&e.current_contract_address(), &p.user, &out);
    }
}
