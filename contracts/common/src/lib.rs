#![no_std]
//! Pure position math for Seidar. No Soroban dependencies so this crate
//! always builds and tests with plain `cargo test`.
//!
//! All ratios are in basis points (bps): 10_000 = 100%.

/// Basis points denominator.
pub const BPS: i128 = 10_000;

/// Health factor in bps: `collateral_value * BPS / debt_value`.
/// Returns `None` when there is no debt (infinitely healthy).
pub fn health_factor(collateral_value: i128, debt_value: i128) -> Option<i128> {
    if debt_value <= 0 {
        return None;
    }
    if collateral_value <= 0 {
        return Some(0);
    }
    Some(collateral_value.saturating_mul(BPS) / debt_value)
}

/// True when a position at `health_bps` is below the liquidation/auto-repay
/// trigger (e.g. trigger 15000 = 150% collateralization).
pub fn is_below_trigger(health_bps: i128, trigger_bps: i128) -> bool {
    health_bps < trigger_bps
}

/// Extra collateral-denominated flash amount needed to reach `leverage_bps`
/// from a base collateral of `collateral`, given existing `debt_value`.
///
/// Simplified loop model: total_exposure = collateral + looped.
/// Returns 0 when already at/above target.
pub fn flash_amount_for_leverage(collateral: i128, debt_value: i128, leverage_bps: i128) -> i128 {
    if leverage_bps <= BPS || collateral <= 0 {
        return 0;
    }
    let target_exposure = collateral.saturating_mul(leverage_bps) / BPS;
    let current_exposure = collateral.saturating_add(debt_value);
    target_exposure.saturating_sub(current_exposure).max(0)
}

/// Resulting health after adding `added_debt` against `added_collateral`.
pub fn health_after_boost(
    collateral_value: i128,
    debt_value: i128,
    added_collateral: i128,
    added_debt: i128,
) -> Option<i128> {
    health_factor(
        collateral_value.saturating_add(added_collateral),
        debt_value.saturating_add(added_debt),
    )
}

/// Seidar service fee tier in bps, mirroring DeFi Saver semantics:
/// 1 = stable-stable, 10 = correlated, 25 = uncorrelated.
pub fn service_fee_bps(is_stable_pair: bool, is_correlated: bool) -> i128 {
    if is_stable_pair {
        1
    } else if is_correlated {
        10
    } else {
        25
    }
}

/// Extra automation surcharge in bps applied on keeper-executed actions.
pub fn automation_fee_bps() -> i128 {
    5
}

/// Fee amount for `amount` at `fee_bps`, rounded down.
pub fn fee_amount(amount: i128, fee_bps: i128) -> i128 {
    if amount <= 0 || fee_bps <= 0 {
        return 0;
    }
    amount.saturating_mul(fee_bps) / BPS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_no_debt_is_none() {
        assert_eq!(health_factor(1000, 0), None);
    }

    #[test]
    fn health_200pc_collateral() {
        assert_eq!(health_factor(2000, 1000), Some(20_000));
    }

    #[test]
    fn health_zero_collateral() {
        assert_eq!(health_factor(0, 1000), Some(0));
    }

    #[test]
    fn trigger_fires_below_threshold() {
        assert!(is_below_trigger(13_500, 15_000));
        assert!(!is_below_trigger(15_000, 15_000));
        assert!(!is_below_trigger(18_200, 15_000));
    }

    #[test]
    fn flash_for_3x_from_spot() {
        // 100 collateral, 0 debt, target 3x -> exposure 300, need 200 looped.
        assert_eq!(flash_amount_for_leverage(100, 0, 30_000), 200);
    }

    #[test]
    fn flash_zero_when_at_target() {
        assert_eq!(flash_amount_for_leverage(100, 200, 30_000), 0);
        assert_eq!(flash_amount_for_leverage(100, 0, 10_000), 0);
    }

    #[test]
    fn boost_lowers_health() {
        let before = health_factor(2000, 1000).unwrap();
        let after = health_after_boost(2000, 1000, 500, 500).unwrap();
        assert!(after < before);
        assert_eq!(after, 16_666);
    }

    #[test]
    fn fee_tiers_match_spec() {
        assert_eq!(service_fee_bps(true, false), 1);
        assert_eq!(service_fee_bps(false, true), 10);
        assert_eq!(service_fee_bps(false, false), 25);
        assert_eq!(automation_fee_bps(), 5);
        assert_eq!(fee_amount(10_000_000, 25), 25_000);
        assert_eq!(fee_amount(0, 25), 0);
    }
}
