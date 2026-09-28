#![no_std]
//! Seidar flash-loan receiver — the `exec_op(from, asset, amount)` callback
//! Blend V2 invokes during `Pool.submit()` with a flash loan.
//!
//! Security notes (enforced + tested):
//! - The caller (lending pool) must authorize: `pool.require_auth()`.
//! - A reentrancy guard rejects nested callbacks (Soroban has no auto guard).
//! - The receiver records the callback so the executor can settle the recipe
//!   (swap/supply/borrow legs) before returning to the pool.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct FlashCallback {
    pub from: Address,
    pub asset: Address,
    pub amount: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum ReceiverError {
    Reentered = 1,
    InvalidAmount = 2,
}

const LOCK: Symbol = symbol_short!("flock");
const LAST: Symbol = symbol_short!("last");
const EVENT_CB: Symbol = symbol_short!("flashcb");

#[contract]
pub struct FlashReceiver;

#[contractimpl]
impl FlashReceiver {
    /// Blend pool callback. `pool` authorizes; nested calls are rejected.
    pub fn exec_op(
        e: Env,
        pool: Address,
        from: Address,
        asset: Address,
        amount: i128,
    ) -> Result<(), ReceiverError> {
        pool.require_auth();
        if amount <= 0 {
            return Err(ReceiverError::InvalidAmount);
        }
        if e.storage().instance().has(&LOCK) {
            return Err(ReceiverError::Reentered);
        }
        e.storage().instance().set(&LOCK, &true);
        e.storage().instance().set(
            &LAST,
            &FlashCallback {
                from: from.clone(),
                asset: asset.clone(),
                amount,
            },
        );
        e.events().publish((EVENT_CB, pool), amount);
        e.storage().instance().remove(&LOCK);
        Ok(())
    }

    pub fn last_callback(e: Env) -> Option<FlashCallback> {
        e.storage().instance().get(&LAST)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn records_callback_with_pool_auth() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(FlashReceiver, ());
        let c = FlashReceiverClient::new(&e, &id);
        let pool = Address::generate(&e);
        let from = Address::generate(&e);
        let asset = Address::generate(&e);
        c.exec_op(&pool, &from, &asset, &5_0000000);
        let last = c.last_callback().unwrap();
        assert_eq!(last.amount, 5_0000000);
        assert_eq!(last.from, from);
    }

    #[test]
    fn requires_pool_auth() {
        let e = Env::default();
        let id = e.register(FlashReceiver, ());
        let c = FlashReceiverClient::new(&e, &id);
        let pool = Address::generate(&e);
        assert!(c
            .try_exec_op(&pool, &pool, &pool, &1_0000000)
            .is_err());
    }

    #[test]
    fn rejects_non_positive_amount() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(FlashReceiver, ());
        let c = FlashReceiverClient::new(&e, &id);
        let pool = Address::generate(&e);
        assert_eq!(
            c.try_exec_op(&pool, &pool, &pool, &0),
            Err(Ok(ReceiverError::InvalidAmount))
        );
    }
}
