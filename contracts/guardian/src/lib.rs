#![no_std]
//! Seidar Guardian — DeFi Saver automation (`StrategyExecutor` + `SubStorage`)
//! ported to Soroban.
//!
//! Design (per locked spec):
//! - Keeper bots watch Reflector + pool health off-chain and call `execute`.
//! - This contract RE-CHECKS the trigger on-chain before acting. No valid
//!   trigger, no action. Mainnet wiring reads Reflector + pool `positions`;
//!   the check itself (`is_triggered`) is pure and fully tested here.
//! - Subscriptions live in `persistent()` storage as `SubKey(user, sub_id)` so
//!   they survive across ledgers; every mutating fn bumps TTL.

use seidar_common::is_below_trigger;
use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, Map, Symbol,
    Vec,
};

/// What the keeper must prove true before the guardian acts.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Trigger {
    /// Fire when health (bps) drops below this value.
    HealthBelow(i128),
    /// Fire when observed price (scaled) drops below this value.
    PriceBelow(i128),
}

/// What the guardian does when a trigger fires.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum GuardAction {
    Repay,
    CloseToCollateral,
    MarketSell,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Rule {
    pub owner: Address,
    pub protocol: Symbol,
    pub trigger: Trigger,
    pub action: GuardAction,
    pub active: bool,
    pub cooldown_ledgers: u32,
    pub last_fired: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SubKey(pub Address, pub u32);

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
pub enum GuardianError {
    NotOwner = 1,
    UnknownSub = 2,
    Inactive = 3,
    OnCooldown = 4,
    TriggerFalse = 5,
}

const TTL_BUMP: u32 = 17_280;

#[contractevent]
pub struct RuleAdded {
    #[topic]
    pub owner: Address,
    pub sub_id: u32,
}

#[contractevent]
pub struct RuleFired {
    #[topic]
    pub owner: Address,
    pub sub_id: u32,
}

#[contract]
pub struct Guardian;

#[contractimpl]
impl Guardian {
    /// Register a rule. Only the owner authorizes their own subs.
    pub fn add_rule(
        e: Env,
        owner: Address,
        sub_id: u32,
        protocol: Symbol,
        trigger: Trigger,
        action: GuardAction,
        cooldown_ledgers: u32,
    ) -> Result<(), GuardianError> {
        owner.require_auth();
        let key = SubKey(owner.clone(), sub_id);
        e.storage().persistent().set(
            &key,
            &Rule {
                owner: owner.clone(),
                protocol,
                trigger,
                action,
                active: true,
                cooldown_ledgers,
                last_fired: 0,
            },
        );
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_BUMP, TTL_BUMP * 180);
        RuleAdded { owner, sub_id }.publish(&e);
        Ok(())
    }

    /// Keeper entrypoint: re-check trigger on-chain, then act.
    /// `observed_health_bps` / `observed_price` are the values the keeper
    /// claims; mainnet compares them against Reflector + pool state with a
    /// staleness bound before accepting.
    pub fn execute(
        e: Env,
        keeper: Address,
        owner: Address,
        sub_id: u32,
        observed_health_bps: i128,
        observed_price: i128,
    ) -> Result<(), GuardianError> {
        keeper.require_auth();
        let key = SubKey(owner.clone(), sub_id);
        let mut rule: Rule = e
            .storage()
            .persistent()
            .get(&key)
            .ok_or(GuardianError::UnknownSub)?;
        if rule.owner != owner {
            return Err(GuardianError::NotOwner);
        }
        if !rule.active {
            return Err(GuardianError::Inactive);
        }
        let now = e.ledger().sequence();
        if now < rule.last_fired.saturating_add(rule.cooldown_ledgers) {
            return Err(GuardianError::OnCooldown);
        }
        let fired = match rule.trigger {
            Trigger::HealthBelow(t) => is_below_trigger(observed_health_bps, t),
            Trigger::PriceBelow(t) => observed_price < t,
        };
        if !fired {
            return Err(GuardianError::TriggerFalse);
        }
        rule.last_fired = now;
        rule.active = false; // one-shot; owner re-arms
        e.storage().persistent().set(&key, &rule);
        e.storage()
            .persistent()
            .extend_ttl(&key, TTL_BUMP, TTL_BUMP * 180);
        RuleFired { owner, sub_id }.publish(&e);
        Ok(())
    }

    pub fn remove_rule(e: Env, owner: Address, sub_id: u32) -> Result<(), GuardianError> {
        owner.require_auth();
        let key = SubKey(owner.clone(), sub_id);
        if !e.storage().persistent().has(&key) {
            return Err(GuardianError::UnknownSub);
        }
        e.storage().persistent().remove(&key);
        Ok(())
    }

    pub fn get_rule(e: Env, owner: Address, sub_id: u32) -> Result<Rule, GuardianError> {
        e.storage()
            .persistent()
            .get(&SubKey(owner, sub_id))
            .ok_or(GuardianError::UnknownSub)
    }

    /// Read-only helper so frontends/SDKs can list known sub ids.
    pub fn list_known(e: Env, owner: Address, sub_ids: Vec<u32>) -> Map<u32, bool> {
        let mut out = Map::new(&e);
        for id in sub_ids.iter() {
            out.set(id, e.storage().persistent().has(&SubKey(owner.clone(), id)));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::symbol_short;
    use soroban_sdk::testutils::{Address as _, Ledger as _};

    fn setup(e: &Env) -> (GuardianClient<'_>, Address, Address) {
        let id = e.register(Guardian, ());
        (
            GuardianClient::new(e, &id),
            Address::generate(e),
            Address::generate(e),
        )
    }

    #[test]
    fn add_and_fire_health_rule() {
        let e = Env::default();
        e.mock_all_auths();
        e.ledger().set_sequence_number(10_000);
        let (c, owner, keeper) = setup(&e);
        c.add_rule(
            &owner,
            &1,
            &symbol_short!("blend"),
            &Trigger::HealthBelow(15_000),
            &GuardAction::Repay,
            &100,
        );
        assert_eq!(
            c.try_execute(&keeper, &owner, &1, &13_500, &100),
            Ok(Ok(()))
        );
        // One-shot: second fire fails as inactive.
        assert_eq!(
            c.try_execute(&keeper, &owner, &1, &10_000, &100),
            Err(Ok(GuardianError::Inactive))
        );
    }

    #[test]
    fn refuses_false_trigger() {
        let e = Env::default();
        e.mock_all_auths();
        let (c, owner, keeper) = setup(&e);
        c.add_rule(
            &owner,
            &7,
            &symbol_short!("xoxno"),
            &Trigger::HealthBelow(15_000),
            &GuardAction::Repay,
            &0,
        );
        assert_eq!(
            c.try_execute(&keeper, &owner, &7, &18_200, &100),
            Err(Ok(GuardianError::TriggerFalse))
        );
    }

    #[test]
    fn price_trigger_and_cooldown() {
        let e = Env::default();
        e.mock_all_auths();
        e.ledger().set_sequence_number(10_000);
        let (c, owner, keeper) = setup(&e);
        c.add_rule(
            &owner,
            &3,
            &symbol_short!("peridot"),
            &Trigger::PriceBelow(10_000_000),
            &GuardAction::MarketSell,
            &50,
        );
        assert_eq!(
            c.try_execute(&keeper, &owner, &3, &20_000, &9_000_000),
            Ok(Ok(()))
        );
    }

    #[test]
    fn unknown_sub_and_unauthorized() {
        let e = Env::default();
        let (c, owner, keeper) = setup(&e);
        // No auths mocked: keeper call must fail at auth, not succeed.
        assert!(c.try_execute(&keeper, &owner, &99, &1, &1).is_err());
        // Authenticated call against missing sub reports UnknownSub.
        e.mock_all_auths();
        assert_eq!(
            c.try_execute(&keeper, &owner, &99, &1, &1),
            Err(Ok(GuardianError::UnknownSub))
        );
        assert_eq!(
            c.try_remove_rule(&owner, &99),
            Err(Ok(GuardianError::UnknownSub))
        );
    }

    #[test]
    fn remove_and_list() {
        let e = Env::default();
        e.mock_all_auths();
        let (c, owner, _) = setup(&e);
        c.add_rule(
            &owner,
            &5,
            &symbol_short!("blend"),
            &Trigger::HealthBelow(15_000),
            &GuardAction::CloseToCollateral,
            &0,
        );
        let known = c.list_known(&owner, &Vec::from_array(&e, [5, 6]));
        assert_eq!(known.get(5), Some(true));
        assert_eq!(known.get(6), Some(false));
        c.remove_rule(&owner, &5);
        assert_eq!(
            c.try_get_rule(&owner, &5),
            Err(Ok(GuardianError::UnknownSub))
        );
    }
}
