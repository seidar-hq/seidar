#![no_std]
//! Seidar leverage receiver: Blend's `exec_op` flash-loan callback for
//! seidar-leverage. A separate contract because Soroban forbids re-entry
//! (leverage -> pool -> leverage); seidar-leverage deploys it in its own
//! constructor and is the only contract that can stage an operation.
//!
//! `exec_op` runs only against the op staged in the same transaction, for the
//! exact user / token / amount, then clears it. It makes the staged swap call
//! (any DEX: the call is data, not code), with only the staged `pulls` of the
//! flashed token pre-authorized (together at most the flashed amount). It
//! measures the output received by balance, reverts below `min_out`, sends ALL
//! of it to the user, and returns any flashed token the swap didn't spend to the
//! user too (Blend then settles the user's requests). It never holds funds
//! outside a single flash loan.

use seidar_leverage_iface::{Staged, SwapCall};
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env, IntoVal, Symbol, Val, Vec,
};

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

/// Pre-authorize exactly `swap.pulls` of `token_in` from this contract, make the swap call, and
/// return (output received, input left unspent), both measured by balance.
fn run_swap(e: &Env, token_in: &Address, amount: i128, token_out: &Address, swap: &SwapCall) -> (i128, i128) {
    let me = e.current_contract_address();
    let input = token::Client::new(e, token_in);
    let output = token::Client::new(e, token_out);
    let in_before = input.balance(&me);
    let out_before = output.balance(&me);

    let mut total: i128 = 0;
    let mut auths: Vec<InvokerContractAuthEntry> = Vec::new(e);
    for p in swap.pulls.iter() {
        if p.amount <= 0 {
            panic_with_error!(e, ReceiverError::BadArgs);
        }
        total = total.checked_add(p.amount).unwrap_or_else(|| panic_with_error!(e, ReceiverError::BadArgs));
        auths.push_back(InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: token_in.clone(),
                fn_name: Symbol::new(e, "transfer"),
                args: (me.clone(), p.to.clone(), p.amount).into_val(e),
            },
            sub_invocations: Vec::new(e),
        }));
    }
    // Never more than this loan: tokens anyone left here can't be pulled through a swap.
    if total <= 0 || total > amount {
        panic_with_error!(e, ReceiverError::BadArgs);
    }
    e.authorize_as_current_contract(auths);
    e.invoke_contract::<Val>(&swap.contract, &swap.function, swap.args.clone());

    let received = output.balance(&me) - out_before;
    let spent = in_before - input.balance(&me);
    (received, amount - spent)
}

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

    /// True while a staged op has not been run: seidar-leverage checks this after the flash loan,
    /// so a pool that never called back can't leave a stale op behind.
    pub fn pending(e: Env) -> bool {
        e.storage().temporary().has(&Key::Staged)
    }

    /// Blend flash-loan callback; `caller` is the position owner (`from`).
    pub fn exec_op(e: Env, caller: Address, token: Address, amount: i128, _fee: i128) {
        let p: Staged = e
            .storage()
            .temporary()
            .get(&Key::Staged)
            .unwrap_or_else(|| panic_with_error!(&e, ReceiverError::NoStagedOp));
        e.storage().temporary().remove(&Key::Staged);
        if caller != p.user || token != p.asset_in || amount != p.amount {
            panic_with_error!(&e, ReceiverError::BadArgs);
        }
        let (out, unspent) = run_swap(&e, &p.asset_in, amount, &p.asset_out, &p.swap);
        if out < p.min_out {
            panic_with_error!(&e, ReceiverError::InsufficientOutput);
        }
        let me = e.current_contract_address();
        token::Client::new(&e, &p.asset_out).transfer(&me, &p.user, &out);
        // Input the swap didn't use belongs to the user (it was flash-borrowed against them).
        if unspent > 0 {
            token::Client::new(&e, &p.asset_in).transfer(&me, &p.user, &unspent);
        }
    }
}
