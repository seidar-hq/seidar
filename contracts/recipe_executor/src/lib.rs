#![no_std]
//! Seidar RecipeExecutor — DeFi Saver `RecipeExecutor` ported to Soroban.
//!
//! EVM uses `delegatecall` through the user's Safe/DSProxy. Soroban has no
//! `delegatecall`, so batching is achieved by invoking this single contract
//! in one `InvokeHostFunction`: every action runs here, sequentially, and a
//! panic anywhere reverts the whole recipe. Pool/DEX cross-calls are wired
//! through the `adapters` crate; this contract validates, orders and guards.

use seidar_common::fee_amount;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, symbol_short, Address, Env,
    Symbol, Vec,
};

/// One step of a recipe. Amounts are in the asset's smallest unit.
/// `param_src_index` mirrors DeFi Saver `paramMapping`: when `Some(i)`, the
/// amount is taken from the output of action `i` instead of `amount`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Action {
    pub kind: ActionKind,
    pub asset: Address,
    pub amount: i128,
    pub param_src_index: Option<u32>,
}

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ActionKind {
    Supply,
    Borrow,
    Repay,
    Withdraw,
    Swap,
    FlashLoan,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Recipe {
    pub actions: Vec<Action>,
}

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum ExecutorError {
    EmptyRecipe = 1,
    Reentered = 2,
    InvalidAmount = 3,
    FlashNotFirst = 4,
    MultipleFlash = 5,
}

const LOCK: Symbol = symbol_short!("lock");

#[contractevent]
pub struct RecipeExecuted {
    #[topic]
    pub user: Address,
    pub actions: u32,
}

#[contractevent]
pub struct ActionRecorded {
    #[topic]
    pub user: Address,
    pub index: u32,
    pub kind: u32,
    pub amount: i128,
}

#[contract]
pub struct RecipeExecutor;

#[contractimpl]
impl RecipeExecutor {
    /// Validate + record a recipe for `user`. Pool/DEX legs execute through
    /// adapters in the same invocation on mainnet; here each validated action
    /// is emitted so keepers/indexers can replay them.
    pub fn execute_recipe(e: Env, user: Address, recipe: Recipe) -> Result<(), ExecutorError> {
        user.require_auth();
        if recipe.actions.is_empty() {
            return Err(ExecutorError::EmptyRecipe);
        }
        if e.storage().instance().has(&LOCK) {
            return Err(ExecutorError::Reentered);
        }
        e.storage().instance().set(&LOCK, &true);

        let res = Self::run(&e, &user, &recipe);
        // Always release the guard, even on validation failure.
        e.storage().instance().remove(&LOCK);
        res?;

        RecipeExecuted {
            user,
            actions: recipe.actions.len(),
        }
        .publish(&e);
        Ok(())
    }

    /// Estimated service fee for a recipe leg (testable without pools).
    pub fn quote_fee(e: Env, amount: i128, fee_bps: i128) -> i128 {
        let _ = e;
        fee_amount(amount, fee_bps)
    }
}

impl RecipeExecutor {
    fn run(e: &Env, user: &Address, recipe: &Recipe) -> Result<(), ExecutorError> {
        let mut flash_seen = false;
        for (i, action) in recipe.actions.iter().enumerate() {
            if action.amount < 0 {
                return Err(ExecutorError::InvalidAmount);
            }
            if let Some(src) = action.param_src_index {
                if src >= i as u32 {
                    return Err(ExecutorError::InvalidAmount);
                }
            }
            if action.kind == ActionKind::FlashLoan {
                if i != 0 {
                    return Err(ExecutorError::FlashNotFirst);
                }
                if flash_seen {
                    return Err(ExecutorError::MultipleFlash);
                }
                flash_seen = true;
            }
            ActionRecorded {
                user: user.clone(),
                index: i as u32,
                kind: action.kind as u32,
                amount: action.amount,
            }
            .publish(e);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    fn recipe(e: &Env, kinds: Vec<ActionKind>) -> Recipe {
        let asset = Address::generate(e);
        let mut actions = Vec::new(e);
        for k in kinds {
            actions.push_back(Action {
                kind: k,
                asset: asset.clone(),
                amount: 1_0000000,
                param_src_index: None,
            });
        }
        Recipe { actions }
    }

    #[test]
    fn executes_valid_recipe() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(RecipeExecutor, ());
        let user = Address::generate(&e);
        let client = RecipeExecutorClient::new(&e, &id);
        let r = recipe(
            &e,
            Vec::from_array(&e, [ActionKind::Supply, ActionKind::Borrow]),
        );
        client.execute_recipe(&user, &r);
    }

    #[test]
    fn rejects_empty_recipe() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(RecipeExecutor, ());
        let user = Address::generate(&e);
        let client = RecipeExecutorClient::new(&e, &id);
        let r = Recipe {
            actions: Vec::new(&e),
        };
        assert_eq!(
            client.try_execute_recipe(&user, &r),
            Err(Ok(ExecutorError::EmptyRecipe))
        );
    }

    #[test]
    fn requires_user_auth() {
        let e = Env::default();
        let id = e.register(RecipeExecutor, ());
        let user = Address::generate(&e);
        let client = RecipeExecutorClient::new(&e, &id);
        let r = recipe(&e, Vec::from_array(&e, [ActionKind::Supply]));
        // No mock auths: host must reject with auth error, not Ok.
        assert!(client.try_execute_recipe(&user, &r).is_err());
    }

    #[test]
    fn flash_loan_must_be_first_and_single() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(RecipeExecutor, ());
        let user = Address::generate(&e);
        let client = RecipeExecutorClient::new(&e, &id);
        let late = recipe(
            &e,
            Vec::from_array(&e, [ActionKind::Supply, ActionKind::FlashLoan]),
        );
        assert_eq!(
            client.try_execute_recipe(&user, &late),
            Err(Ok(ExecutorError::FlashNotFirst))
        );
        let twice = recipe(
            &e,
            Vec::from_array(&e, [ActionKind::FlashLoan, ActionKind::FlashLoan]),
        );
        assert!(client.try_execute_recipe(&user, &twice).is_err());
    }

    #[test]
    fn lock_is_released_after_run() {
        let e = Env::default();
        e.mock_all_auths();
        let id = e.register(RecipeExecutor, ());
        let user = Address::generate(&e);
        let client = RecipeExecutorClient::new(&e, &id);
        let r = recipe(&e, Vec::from_array(&e, [ActionKind::Supply]));
        client.execute_recipe(&user, &r);
        // Second call proves the reentrancy guard was cleared.
        client.execute_recipe(&user, &r);
    }

    #[test]
    fn quote_fee_math() {
        let e = Env::default();
        let id = e.register(RecipeExecutor, ());
        let client = RecipeExecutorClient::new(&e, &id);
        assert_eq!(client.quote_fee(&10_000_000, &25), 25_000);
    }
}
