#![no_std]
//! Live external interfaces for Seidar.
//!
//! Faithful mirrors of the exact entrypoints Seidar calls on mainnet:
//! - Blend V2 pool `submit` (+ flash-loan receiver handshake)
//! - Reflector SEP-40 oracle (`lastprice`, `decimals`)
//! - Soroswap-style aggregator `swap_exact_tokens_for_tokens`
//!
//! Mainnet addresses + WASM hashes are pinned in
//! `contracts/configs/networks.json`. Regenerate these mirrors from upstream
//! IDL on every upstream release.

use soroban_sdk::{contractclient, contracttype, Address, Env};

/// Blend V2 request types (pool `submit` dispatch).
pub const REQUEST_SUPPLY: u32 = 0;
pub const REQUEST_WITHDRAW: u32 = 1;
pub const REQUEST_BORROW: u32 = 2;
pub const REQUEST_REPAY: u32 = 3;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PoolRequest {
    pub request_type: u32,
    pub address: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct FlashLoan {
    pub receiver: Address,
    pub asset: Address,
    pub amount: i128,
}

#[contractclient(name = "BlendPoolClient")]
pub trait BlendPool {
    fn submit(
        e: Env,
        from: Address,
        spender: Address,
        to: Address,
        requests: soroban_sdk::Vec<PoolRequest>,
    ) -> soroban_sdk::Map<Address, i128>;

    fn flash_loan(e: Env, from: Address, loan: FlashLoan, requests: soroban_sdk::Vec<PoolRequest>);
}

/// Reflector SEP-40 price payload.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PriceData {
    pub price: i128,
    pub timestamp: u64,
}

#[contractclient(name = "ReflectorClient")]
pub trait Reflector {
    fn lastprice(e: Env, asset: Address) -> Option<PriceData>;
    fn decimals(e: Env) -> u32;
}

#[contractclient(name = "AggregatorClient")]
pub trait Aggregator {
    fn swap_exact_tokens_for_tokens(
        e: Env,
        amount_in: i128,
        amount_out_min: i128,
        path: soroban_sdk::Vec<Address>,
        to: Address,
        deadline: u64,
    ) -> soroban_sdk::Vec<i128>;
}

/// Reject stale oracle reads. Markets fail closed without fresh prices.
pub fn is_fresh(now_ts: u64, price_ts: u64, max_age_s: u64) -> bool {
    price_ts <= now_ts && now_ts.saturating_sub(price_ts) <= max_age_s
}

/// Minimum acceptable out amount for `quoted` at `slippage_bps`.
pub fn min_out(quoted: i128, slippage_bps: i128) -> i128 {
    if quoted <= 0 {
        return 0;
    }
    quoted.saturating_mul(10_000 - slippage_bps.max(0).min(10_000)) / 10_000
}

/// Build an ordered boost leg: supply collateral, borrow debt to repay flash.
pub fn boost_requests(
    e: &Env,
    collateral: &Address,
    debt: &Address,
    supply_amount: i128,
    borrow_amount: i128,
) -> soroban_sdk::Vec<PoolRequest> {
    let mut v = soroban_sdk::Vec::new(e);
    v.push_back(PoolRequest {
        request_type: REQUEST_SUPPLY,
        address: collateral.clone(),
        amount: supply_amount,
    });
    v.push_back(PoolRequest {
        request_type: REQUEST_BORROW,
        address: debt.clone(),
        amount: borrow_amount,
    });
    v
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn request_type_constants_match_blend_v2() {
        assert_eq!(REQUEST_SUPPLY, 0);
        assert_eq!(REQUEST_WITHDRAW, 1);
        assert_eq!(REQUEST_BORROW, 2);
        assert_eq!(REQUEST_REPAY, 3);
    }

    #[test]
    fn boost_legs_are_ordered_supply_then_borrow() {
        let e = Env::default();
        let c = Address::generate(&e);
        let d = Address::generate(&e);
        let legs = boost_requests(&e, &c, &d, 100, 60);
        assert_eq!(legs.len(), 2);
        assert_eq!(legs.get(0).unwrap().request_type, REQUEST_SUPPLY);
        assert_eq!(legs.get(1).unwrap().request_type, REQUEST_BORROW);
    }

    #[test]
    fn staleness_gate() {
        assert!(is_fresh(1_000, 950, 120));
        assert!(!is_fresh(1_000, 800, 120));
        // Future-dated feeds are rejected (no pre-manufactured prices).
        assert!(!is_fresh(1_000, 1_050, 120));
    }

    #[test]
    fn slippage_floor() {
        assert_eq!(min_out(10_000, 50), 9_950);
        assert_eq!(min_out(10_000, 0), 10_000);
        assert_eq!(min_out(0, 50), 0);
        assert_eq!(min_out(10_000, 10_000), 0);
    }
}
