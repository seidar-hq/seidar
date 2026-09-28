#![no_std]
//! Seidar lending adapters — one common interface over Blend V2, XOXNO and
//! Peridot, mirroring DeFi Saver's per-protocol `Action` folders.
//!
//! Each adapter pins the protocol's pool address, oracle and risk caps in
//! `configs/networks.json` (WASM-hash pinning enforced in CI). Health is
//! normalized to basis points via `seidar-common` so the guardian and the
//! frontend can compare across protocols.

use soroban_sdk::{contracttype, Address, Env, Symbol};
use seidar_common::health_factor;

/// Which lending protocol a position lives on.
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Protocol {
    Blend,
    Xoxno,
    Peridot,
}

/// Risk caps pinned per protocol (mainnet values live in configs/).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ProtocolConfig {
    pub protocol: Protocol,
    pub pool: Address,
    pub oracle: Address,
    pub max_ltv_bps: i128,
    pub liq_threshold_bps: i128,
}

pub fn blend_config(e: &Env, pool: Address, oracle: Address) -> ProtocolConfig {
    let _ = e;
    ProtocolConfig {
        protocol: Protocol::Blend,
        pool,
        oracle,
        max_ltv_bps: 7_500,
        liq_threshold_bps: 15_000,
    }
}

pub fn xoxno_config(e: &Env, pool: Address, oracle: Address) -> ProtocolConfig {
    let _ = e;
    ProtocolConfig {
        protocol: Protocol::Xoxno,
        pool,
        oracle,
        max_ltv_bps: 8_000,
        liq_threshold_bps: 15_000,
    }
}

pub fn peridot_config(e: &Env, pool: Address, oracle: Address) -> ProtocolConfig {
    let _ = e;
    ProtocolConfig {
        protocol: Protocol::Peridot,
        pool,
        oracle,
        max_ltv_bps: 7_000,
        liq_threshold_bps: 14_000,
    }
}

/// Normalized health for a position. Pure — safe to call from guardian,
/// views and off-chain queriers alike.
pub fn normalized_health(collateral_value: i128, debt_value: i128) -> Option<i128> {
    health_factor(collateral_value, debt_value)
}

/// Borrow limit: how much debt value `collateral_value` supports at `max_ltv`.
pub fn borrow_limit(collateral_value: i128, max_ltv_bps: i128) -> i128 {
    if collateral_value <= 0 {
        return 0;
    }
    collateral_value.saturating_mul(max_ltv_bps) / 10_000
}

/// True when `debt_value` can be taken against `collateral_value`.
pub fn within_ltv(collateral_value: i128, debt_value: i128, max_ltv_bps: i128) -> bool {
    debt_value <= borrow_limit(collateral_value, max_ltv_bps)
}

/// Canonical symbol used for per-protocol context rules and events.
pub fn protocol_symbol(e: &Env, protocol: Protocol) -> Symbol {
    match protocol {
        Protocol::Blend => Symbol::new(e, "blend"),
        Protocol::Xoxno => Symbol::new(e, "xoxno"),
        Protocol::Peridot => Symbol::new(e, "peridot"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[test]
    fn configs_pin_expected_caps() {
        let e = Env::default();
        let pool = Address::generate(&e);
        let oracle = Address::generate(&e);
        assert_eq!(blend_config(&e, pool.clone(), oracle.clone()).max_ltv_bps, 7_500);
        assert_eq!(xoxno_config(&e, pool.clone(), oracle.clone()).max_ltv_bps, 8_000);
        assert_eq!(peridot_config(&e, pool, oracle).max_ltv_bps, 7_000);
    }

    #[test]
    fn borrow_limits_and_ltv() {
        assert_eq!(borrow_limit(10_000, 7_500), 7_500);
        assert!(within_ltv(10_000, 7_500, 7_500));
        assert!(!within_ltv(10_000, 7_501, 7_500));
        assert_eq!(borrow_limit(0, 7_500), 0);
    }

    #[test]
    fn health_normalizes_across_protocols() {
        assert_eq!(normalized_health(2000, 1000), Some(20_000));
        assert_eq!(normalized_health(1000, 1000), Some(10_000));
        assert_eq!(normalized_health(1000, 0), None);
    }

    #[test]
    fn symbols_are_canonical() {
        let e = Env::default();
        assert_eq!(protocol_symbol(&e, Protocol::Blend), Symbol::new(&e, "blend"));
        assert_eq!(protocol_symbol(&e, Protocol::Xoxno), Symbol::new(&e, "xoxno"));
        assert_eq!(
            protocol_symbol(&e, Protocol::Peridot),
            Symbol::new(&e, "peridot")
        );
    }
}
