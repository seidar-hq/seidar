#![no_std]
//! Blend v2 pool, SEP-40 oracle and Soroswap aggregator bindings for the
//! Seidar leverage contracts, field-for-field from blend-capital/
//! blend-contracts-v2 and the mainnet aggregator's interface (as verified in
//! real_seidar's contracts/blend_iface). Plus the one-shot aggregator swap and
//! Blend's own health-factor maths.

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contractclient, contracttype, token, vec, Address, BytesN, Env, IntoVal, Map, Symbol, Vec,
};

/// Blend v2 RequestType values (pool/src/pool/actions.rs).
pub const REQ_SUPPLY_COLLATERAL: u32 = 2;
pub const REQ_BORROW: u32 = 4;
pub const REQ_REPAY: u32 = 5;

pub const SCALAR_7: i128 = 10_000_000;
pub const SCALAR_12: i128 = 1_000_000_000_000;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Request {
    pub request_type: u32,
    pub address: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct FlashLoan {
    pub contract: Address,
    pub asset: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Positions {
    pub liabilities: Map<u32, i128>,
    pub collateral: Map<u32, i128>,
    pub supply: Map<u32, i128>,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PoolConfig {
    pub oracle: Address,
    pub min_collateral: i128,
    pub bstop_rate: u32,
    pub status: u32,
    pub max_positions: u32,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ReserveConfig {
    pub index: u32,
    pub decimals: u32,
    pub c_factor: u32,
    pub l_factor: u32,
    pub util: u32,
    pub max_util: u32,
    pub r_base: u32,
    pub r_one: u32,
    pub r_two: u32,
    pub r_three: u32,
    pub reactivity: u32,
    pub supply_cap: i128,
    pub enabled: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct ReserveData {
    pub d_rate: i128,
    pub b_rate: i128,
    pub ir_mod: i128,
    pub b_supply: i128,
    pub d_supply: i128,
    pub backstop_credit: i128,
    pub last_time: u64,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Reserve {
    pub asset: Address,
    pub config: ReserveConfig,
    pub data: ReserveData,
    pub scalar: i128,
}

#[contractclient(name = "BlendPoolClient")]
pub trait BlendPool {
    fn get_config(e: Env) -> PoolConfig;
    fn get_reserve_list(e: Env) -> Vec<Address>;
    fn get_reserve(e: Env, asset: Address) -> Reserve;
    fn get_positions(e: Env, address: Address) -> Positions;
    fn submit(e: Env, from: Address, spender: Address, to: Address, requests: Vec<Request>) -> Positions;
    fn flash_loan(e: Env, from: Address, flash_loan: FlashLoan, requests: Vec<Request>) -> Positions;
}

/// SEP-40 asset key.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Asset {
    Stellar(Address),
    Other(Symbol),
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PriceData {
    pub price: i128,
    pub timestamp: u64,
}

#[contractclient(name = "OracleClient")]
pub trait PriceFeed {
    fn decimals(e: Env) -> u32;
    fn lastprice(e: Env, asset: Asset) -> Option<PriceData>;
}

// Soroswap aggregator route types (mainnet CARVQXFP…DDC4 interface).

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SoroswapHop {
    pub pair: Address,
    pub token_in: Address,
    pub token_out: Address,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AquaHop {
    /// (sorted pool tokens, pool hash, token out) per step.
    pub steps: Vec<(Vec<Address>, BytesN<32>, Address)>,
    pub token_in: Address,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SushiHop {
    pub pool: Address,
    pub token_in: Address,
    pub token_out: Address,
    pub zero_for_one: bool,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PhoenixHop {
    pub pool: Address,
    pub token_in: Address,
    pub token_out: Address,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct CometHop {
    pub pool: Address,
    pub token_in: Address,
    pub token_out: Address,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Hop {
    Soroswap(SoroswapHop),
    Aqua(AquaHop),
    Sushi(SushiHop),
    Phoenix(PhoenixHop),
    Comet(CometHop),
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Route {
    pub amount_in: i128,
    pub hops: Vec<Hop>,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Partner {
    pub bps: u32,
    pub id: Symbol,
}

#[contractclient(name = "AggregatorClient")]
pub trait Aggregator {
    #[allow(clippy::too_many_arguments)]
    fn swap_exact_in(
        e: Env,
        user: Address,
        token_in: Address,
        amount_in: i128,
        token_out: Address,
        min_out: i128,
        routes: Vec<Route>,
        partner: Option<Partner>,
    ) -> i128;
}

/// Sell `amount` of `token_in` held by the current contract on the
/// aggregator along `routes`; returns the `token_out` received, measured by
/// balance (never the aggregator's return value). The aggregator pulls the
/// input once (token_in.transfer(me, aggregator, amount)); exactly that
/// transfer is pre-authorized, so any other pull fails the transaction.
pub fn aggregator_swap(
    e: &Env,
    aggregator: &Address,
    token_in: &Address,
    amount: i128,
    token_out: &Address,
    min_out: i128,
    routes: &Vec<Route>,
) -> i128 {
    let me = e.current_contract_address();
    let out_token = token::Client::new(e, token_out);
    let before = out_token.balance(&me);
    e.authorize_as_current_contract(vec![
        e,
        InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext {
                contract: token_in.clone(),
                fn_name: Symbol::new(e, "transfer"),
                args: (me.clone(), aggregator.clone(), amount).into_val(e),
            },
            sub_invocations: Vec::new(e),
        }),
    ]);
    AggregatorClient::new(e, aggregator).swap_exact_in(&me, token_in, &amount, token_out, &min_out, routes, &None);
    out_token.balance(&me) - before
}

/// Oracle price of `asset` (oracle decimals), None when missing or stale.
pub fn price(e: &Env, oracle: &Address, asset: &Address, max_age: u64) -> Option<i128> {
    let p = OracleClient::new(e, oracle).lastprice(&Asset::Stellar(asset.clone()))?;
    let now = e.ledger().timestamp();
    if p.price <= 0 || p.timestamp > now || now - p.timestamp > max_age {
        return None;
    }
    Some(p.price)
}

/// Health factor of `account` in `pool`, 7 decimals (1.0 = 10_000_000),
/// computed like Blend: effective collateral (b_rate x c_factor) over
/// effective liabilities (d_rate / l_factor), both priced by the pool oracle.
/// None with no liabilities or a missing/stale price (callers fail closed).
pub fn health_factor(e: &Env, pool: &Address, account: &Address, max_age: u64) -> Option<i128> {
    let client = BlendPoolClient::new(e, pool);
    let positions = client.get_positions(account);
    if positions.liabilities.is_empty() {
        return None;
    }
    let oracle = client.get_config().oracle;
    let list = client.get_reserve_list();
    let mut coll_base: i128 = 0;
    let mut liab_base: i128 = 0;
    for (idx, b_tokens) in positions.collateral.iter() {
        if b_tokens <= 0 {
            continue;
        }
        let asset = list.get(idx)?;
        let r = client.get_reserve(&asset);
        let px = price(e, &oracle, &asset, max_age)?;
        let underlying = b_tokens.checked_mul(r.data.b_rate)? / SCALAR_12;
        let effective = underlying.checked_mul(r.config.c_factor as i128)? / SCALAR_7;
        coll_base = coll_base.checked_add(px.checked_mul(effective)? / r.scalar)?;
    }
    for (idx, d_tokens) in positions.liabilities.iter() {
        if d_tokens <= 0 {
            continue;
        }
        let asset = list.get(idx)?;
        let r = client.get_reserve(&asset);
        let px = price(e, &oracle, &asset, max_age)?;
        // Ceil, like Blend's liability side.
        let underlying = (d_tokens.checked_mul(r.data.d_rate)? + SCALAR_12 - 1) / SCALAR_12;
        let l = r.config.l_factor as i128;
        if l <= 0 {
            return None;
        }
        let effective = (underlying.checked_mul(SCALAR_7)? + l - 1) / l;
        liab_base = liab_base.checked_add((px.checked_mul(effective)? + r.scalar - 1) / r.scalar)?;
    }
    if liab_base <= 0 {
        return None;
    }
    Some(coll_base.checked_mul(SCALAR_7)? / liab_base)
}

/// One staged leverage swap, set by seidar-leverage and run by
/// seidar-leverage-receiver inside Blend's `exec_op` callback: swap the
/// flashed `amount` of `debt` into `collateral` along `routes` (at least
/// `min_out`) and send all of it to `user`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Staged {
    pub user: Address,
    pub aggregator: Address,
    pub debt: Address,
    pub amount: i128,
    pub collateral: Address,
    pub routes: Vec<Route>,
    pub min_out: i128,
}

#[contractclient(name = "ReceiverClient")]
pub trait LeverageReceiver {
    fn stage(e: Env, op: Staged);
}
