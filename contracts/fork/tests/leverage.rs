//! seidar-leverage against a mainnet fork: real Blend Fixed v2.1 pool,
//! Reflector oracle, XLM/USDC SACs, Soroswap aggregator + the Soroswap and
//! Aqua pools its live routes used (fixtures/mainnet.json). The leverage and
//! receiver run as their release WASMs (build first: `stellar contract build`).

extern crate std;

use base64::Engine;
use seidar_leverage_iface::{health_factor, price, BlendPoolClient, Hop, Pull, Route, Staged, SwapCall, SCALAR_12, SCALAR_7};
use soroban_ledger_snapshot::LedgerSnapshot;
use soroban_sdk::{
    testutils::Address as _,
    token,
    xdr::{LedgerEntry, LedgerKey, Limits, ReadXdr, ScVal},
    Address, BytesN, Env, IntoVal, Symbol, TryFromVal, Val, Vec,
};

const LEVERAGE_WASM: &[u8] = include_bytes!("../../target/wasm32v1-none/release/seidar_leverage.wasm");
const RECEIVER_WASM: &[u8] = include_bytes!("../../target/wasm32v1-none/release/seidar_leverage_receiver.wasm");

/// The aggregator's protocol fee (10 bps on mainnet), taken from the input before routing.
const AGG_FEE_BPS: i128 = 10;

struct FixtureRoute {
    token_in: Address,
    token_out: Address,
    hops: std::vec::Vec<std::string::String>,
    routes: Vec<Route>,
}

struct Fork {
    e: Env,
    pool: Address,
    aggregator: Address,
    xlm: Address,
    usdc: Address,
    whale: Address,
    routes: std::vec::Vec<FixtureRoute>,
}

fn load_fork() -> Fork {
    let raw = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/mainnet.json")).unwrap();
    let j: serde_json::Value = serde_json::from_str(&raw).unwrap();
    let b64 = base64::engine::general_purpose::STANDARD;
    let mut entries = std::vec::Vec::new();
    for x in j["entries"].as_array().unwrap() {
        let key = LedgerKey::from_xdr(b64.decode(x["key"].as_str().unwrap()).unwrap(), Limits::none()).unwrap();
        let entry = LedgerEntry::from_xdr(b64.decode(x["entry"].as_str().unwrap()).unwrap(), Limits::none()).unwrap();
        let live = x["liveUntil"].as_u64().map(|v| (v as u32).max(u32::MAX / 2));
        entries.push((std::boxed::Box::new(key), (std::boxed::Box::new(entry), live)));
    }
    let l = &j["ledger"];
    let mut network_id = [0u8; 32];
    let nid = l["networkId"].as_str().unwrap();
    for i in 0..32 {
        network_id[i] = u8::from_str_radix(&nid[i * 2..i * 2 + 2], 16).unwrap();
    }
    let e = Env::from_ledger_snapshot(LedgerSnapshot {
        // Mainnet runs protocol 29; the soroban-sdk 28 host caps at 28.
        protocol_version: (l["protocolVersion"].as_u64().unwrap() as u32).min(28),
        sequence_number: l["sequence"].as_u64().unwrap() as u32,
        timestamp: l["timestamp"].as_u64().unwrap(),
        network_id,
        base_reserve: 5_000_000,
        min_persistent_entry_ttl: 2_073_600,
        min_temp_entry_ttl: 17_280,
        max_entry_ttl: 3_110_400,
        ledger_entries: entries,
    });
    let a = |k: &str| Address::from_str(&e, j[k].as_str().unwrap());
    let mut routes = std::vec::Vec::new();
    for r in j["routes"].as_array().unwrap() {
        let sc = ScVal::from_xdr(b64.decode(r["xdr"].as_str().unwrap()).unwrap(), Limits::none()).unwrap();
        let v = Val::try_from_val(&e, &sc).unwrap();
        routes.push(FixtureRoute {
            token_in: Address::from_str(&e, r["tokenIn"].as_str().unwrap()),
            token_out: Address::from_str(&e, r["tokenOut"].as_str().unwrap()),
            hops: r["hops"].as_array().unwrap().iter().map(|h| h.as_str().unwrap().into()).collect(),
            routes: Vec::<Route>::try_from_val(&e, &v).unwrap(),
        });
    }
    Fork { pool: a("pool"), aggregator: a("aggregator"), xlm: a("xlm"), usdc: a("usdc"), whale: a("whale"), routes, e }
}

#[derive(Clone, Copy, Debug)]
enum Via {
    SoroswapPair,
    SoroswapSplit,
    Aqua,
}

/// A live route of shape `via` from `from` to `to`, re-sized for `amount` (net of the aggregator fee).
fn route(f: &Fork, via: Via, from: &Address, to: &Address, amount: i128) -> Vec<Route> {
    let pick = |r: &FixtureRoute| match via {
        Via::SoroswapPair => r.hops.len() == 1 && r.hops[0].starts_with("soroswap:") && !r.hops[0].contains('>'),
        Via::SoroswapSplit => r.hops.len() > 1 && r.hops.iter().all(|h| h.starts_with("soroswap:")),
        Via::Aqua => r.hops.iter().all(|h| h.starts_with("aqua:")),
    };
    let fr = f.routes.iter().find(|r| &r.token_in == from && &r.token_out == to && pick(r)).expect("route in fixture");
    let legs: std::vec::Vec<(i128, Vec<Hop>)> = fr.routes.iter().map(|x| (x.amount_in, x.hops)).collect();
    let net = amount - amount * AGG_FEE_BPS / 10_000;
    let total: i128 = legs.iter().map(|l| l.0).sum();
    let mut out = Vec::new(&f.e);
    let mut left = net;
    for (i, (share, hops)) in legs.iter().enumerate() {
        let amt = if i + 1 == legs.len() { left } else { net * share / total };
        left -= amt;
        out.push_back(Route { amount_in: amt, hops: hops.clone() });
    }
    out
}

struct Setup {
    f: Fork,
    leverage: Address,
    receiver: Address,
    user: Address,
}

fn setup() -> Setup {
    let f = load_fork();
    let e = &f.e;
    e.cost_estimate().budget().reset_unlimited();
    e.mock_all_auths();
    let receiver_hash: BytesN<32> = e.deployer().upload_contract_wasm(RECEIVER_WASM);
    let leverage = e.register(LEVERAGE_WASM, (receiver_hash,));
    let receiver: Address = e.invoke_contract(&leverage, &Symbol::new(e, "receiver"), Vec::new(e));
    let user = Address::generate(e);
    token::Client::new(e, &f.xlm).transfer(&f.whale, &user, &50_000_0000000);
    Setup { f, leverage, receiver, user }
}

/// Oracle value of `amount` of `from` in units of `to` (both 7 decimals here).
fn oracle_convert(s: &Setup, from: &Address, to: &Address, amount: i128) -> i128 {
    let e = &s.f.e;
    let oracle = BlendPoolClient::new(e, &s.f.pool).get_config().oracle;
    amount * price(e, &oracle, from, 86_400).unwrap() / price(e, &oracle, to, 86_400).unwrap()
}

struct Open {
    collateral: Address,
    deposit: i128,
    debt: Address,
    borrow: i128,
    swap: SwapCall,
    min_out: i128,
    min_hf: i128,
    deadline: u64,
}

/// The Soroswap aggregator swap as the receiver makes it: swap_exact_in(receiver, debt, amount,
/// collateral, min_out, routes, None), pulling exactly `amount` of debt (what the app builds).
fn aggregator_call(s: &Setup, debt: &Address, amount: i128, collateral: &Address, min_out: i128, routes: Vec<Route>) -> SwapCall {
    let e = &s.f.e;
    SwapCall {
        contract: s.f.aggregator.clone(),
        function: Symbol::new(e, "swap_exact_in"),
        args: (s.receiver.clone(), debt.clone(), amount, collateral.clone(), min_out, routes, Option::<Val>::None).into_val(e),
        pulls: Vec::from_array(e, [Pull { to: s.f.aggregator.clone(), amount }]),
    }
}

impl Open {
    /// Leverage `lev` (x10, e.g. 20 = 2.0x) on `deposit`, min_out at oracle x (1 - slip_bps).
    fn new(s: &Setup, via: Via, collateral: &Address, debt: &Address, deposit: i128, lev10: i128, slip_bps: i128) -> Open {
        let borrow = oracle_convert(s, collateral, debt, deposit) * (lev10 - 10) / 10;
        let fair = oracle_convert(s, debt, collateral, borrow);
        let min_out = fair * (10_000 - slip_bps) / 10_000;
        Open {
            collateral: collateral.clone(),
            deposit,
            debt: debt.clone(),
            borrow,
            swap: aggregator_call(s, debt, borrow, collateral, min_out, route(&s.f, via, debt, collateral, borrow)),
            min_out,
            min_hf: 11_000_000,
            deadline: s.f.e.ledger().timestamp() + 300,
        }
    }
}

fn try_open(s: &Setup, o: &Open) -> Result<i128, soroban_sdk::Error> {
    let e = &s.f.e;
    let args: Vec<Val> = (
        s.user.clone(),
        s.f.pool.clone(),
        o.collateral.clone(),
        o.deposit,
        o.debt.clone(),
        o.borrow,
        o.swap.clone(),
        o.min_out,
        o.min_hf,
        o.deadline,
        e.ledger().sequence() + 20,
    )
        .into_val(e);
    e.cost_estimate().budget().reset_unlimited();
    let r = e.try_invoke_contract::<i128, soroban_sdk::Error>(&s.leverage, &Symbol::new(e, "open"), args);
    let cpu = e.cost_estimate().budget().cpu_instruction_cost();
    let mem = e.cost_estimate().budget().memory_bytes_cost();
    std::println!("open cost: cpu {cpu} mem {mem}");
    match r {
        Ok(Ok(hf)) => {
            assert!(cpu < 100_000_000 && mem < 40 * 1024 * 1024, "open over network limits");
            Ok(hf)
        }
        Ok(Err(_)) => panic!("bad return conversion"),
        Err(_) if std::env::var("LEV_DEBUG").is_ok() => {
            std::println!("{:#?}", e.host().get_diagnostic_events());
            Err(soroban_sdk::Error::from_contract_error(0))
        }
        Err(Ok(err)) => Err(err),
        Err(Err(_)) => Err(soroban_sdk::Error::from_contract_error(0)),
    }
}

fn collateral_of(s: &Setup, asset: &Address) -> i128 {
    let pool = BlendPoolClient::new(&s.f.e, &s.f.pool);
    let r = pool.get_reserve(asset);
    pool.get_positions(&s.user).collateral.get(r.config.index).unwrap_or(0) * r.data.b_rate / SCALAR_12
}

fn debt_of(s: &Setup, asset: &Address) -> i128 {
    let pool = BlendPoolClient::new(&s.f.e, &s.f.pool);
    let r = pool.get_reserve(asset);
    let d = pool.get_positions(&s.user).liabilities.get(r.config.index).unwrap_or(0);
    (d * r.data.d_rate + SCALAR_12 - 1) / SCALAR_12
}

fn bal(s: &Setup, t: &Address) -> i128 {
    token::Client::new(&s.f.e, t).balance(&s.user)
}

fn assert_opened(s: &Setup, o: &Open, hf: i128, wallet_before: i128) {
    let coll = collateral_of(s, &o.collateral);
    let debt = debt_of(s, &o.debt);
    std::println!(
        "collateral {coll} (want {}), debt {debt} (borrow {}), hf {hf}, leverage {:.2}x",
        o.deposit + o.min_out,
        o.borrow,
        coll as f64 / o.deposit as f64
    );
    // Blend rounds b-tokens down by a stroop or two.
    assert!((coll - (o.deposit + o.min_out)).abs() <= 2, "collateral = deposit + min_out");
    assert!(debt >= o.borrow && debt <= o.borrow + 2, "debt = the flash loan");
    assert!(hf >= o.min_hf);
    assert_eq!(Some(hf), health_factor(&s.f.e, &s.f.pool, &s.user, 86_400));
    // The swap surplus over min_out stays in the wallet; nothing else moves.
    let after = bal(s, &o.collateral);
    assert!(after >= wallet_before - o.deposit - o.min_out, "wallet lost more than deposit + min_out");
    // min_out here sits at oracle -3..5%, so the surplus is that buffer plus the DEX-vs-oracle gap.
    // wallet: - deposit - (deposit + min_out supplied) ... precisely: -deposit - min_out + out.
    let surplus = after - (wallet_before - o.deposit - o.min_out) - o.min_out;
    assert!(surplus >= 0, "the swap paid less than min_out");
    std::println!("swap surplus left in the wallet: {surplus} ({:.2}% of min_out)", surplus as f64 * 100.0 / o.min_out as f64);
    assert!(surplus <= o.min_out / 10, "surplus is more than the slippage buffer");
    // Nothing is left in the contracts, and the pool's allowance was used up exactly.
    for c in [&s.leverage, &s.receiver] {
        assert_eq!(token::Client::new(&s.f.e, &o.collateral).balance(c), 0);
        assert_eq!(token::Client::new(&s.f.e, &o.debt).balance(c), 0);
    }
    assert_eq!(token::Client::new(&s.f.e, &o.collateral).allowance(&s.user, &s.f.pool), 0, "allowance left after open");
}

// ---------- happy paths ----------

#[test]
fn long_xlm_2x_soroswap() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    let before = bal(&s, &xlm);
    let hf = try_open(&s, &o).expect("open");
    assert_opened(&s, &o, hf, before);
    assert_eq!(bal(&s, &usdc), 0, "the borrowed USDC never sits in the wallet");
}

#[test]
fn long_xlm_aqua_route() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let o = Open::new(&s, Via::Aqua, &xlm, &usdc, 1_000_0000000, 18, 300);
    let before = bal(&s, &xlm);
    let hf = try_open(&s, &o).expect("open");
    assert_opened(&s, &o, hf, before);
}

#[test]
fn long_xlm_split_route_large() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let o = Open::new(&s, Via::SoroswapSplit, &xlm, &usdc, 20_000_0000000, 15, 500);
    let before = bal(&s, &xlm);
    let hf = try_open(&s, &o).expect("open");
    assert_opened(&s, &o, hf, before);
}

#[test]
fn short_xlm_usdc_collateral() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    // Fund USDC by swapping XLM through the aggregator from the user (mocked auth).
    let e = &s.f.e;
    // Funded through Aqua so the Soroswap pair the leverage swap uses keeps its price.
    let r = route(&s.f, Via::Aqua, &xlm, &usdc, 10_000_0000000);
    let got: i128 = e.invoke_contract(
        &s.f.aggregator,
        &Symbol::new(e, "swap_exact_in"),
        (s.user.clone(), xlm.clone(), 10_000_0000000i128, usdc.clone(), 1i128, r, Option::<Val>::None).into_val(e),
    );
    assert!(got > 0 && bal(&s, &usdc) == got);
    let o = Open::new(&s, Via::SoroswapPair, &usdc, &xlm, got / 2, 18, 300);
    let before = bal(&s, &usdc);
    let hf = try_open(&s, &o).expect("open");
    assert_opened(&s, &o, hf, before);
}

#[test]
fn adds_to_an_existing_position() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let a = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 15, 300);
    try_open(&s, &a).expect("first open");
    let coll0 = collateral_of(&s, &xlm);
    let debt0 = debt_of(&s, &usdc);
    let b = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 500_0000000, 15, 300);
    let hf = try_open(&s, &b).expect("second open");
    assert!((collateral_of(&s, &xlm) - coll0 - b.deposit - b.min_out).abs() <= 3);
    assert!(debt_of(&s, &usdc) >= debt0 + b.borrow);
    assert!(hf >= b.min_hf);
}

#[test]
fn zero_deposit_loops_existing_collateral() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let a = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 12, 300);
    try_open(&s, &a).expect("first open");
    let mut b = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 12, 300);
    b.deposit = 0;
    try_open(&s, &b).expect("boost with no new deposit");
}

// ---------- refusals ----------

/// LeverageError / ReceiverError codes.
fn code(err: soroban_sdk::Error) -> u32 {
    err.get_code()
}

#[test]
fn refuses_below_min_health() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let mut o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    o.min_hf = 30_000_000;
    let before = bal(&s, &xlm);
    let err = try_open(&s, &o).expect_err("health 3.0 is out of reach at 2x");
    assert_eq!(code(err), 3);
    assert_eq!(bal(&s, &xlm), before, "reverted");
    assert_eq!(debt_of(&s, &usdc), 0);
}

#[test]
fn refuses_too_much_leverage_blend_health() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    // 6x on XLM (c_factor 0.75): Blend itself rejects the flash loan.
    let mut o = Open::new(&s, Via::SoroswapSplit, &xlm, &usdc, 1_000_0000000, 60, 500);
    o.min_hf = SCALAR_7;
    assert!(try_open(&s, &o).is_err());
    assert_eq!(debt_of(&s, &usdc), 0);
}

#[test]
fn refuses_when_swap_returns_less_than_min_out() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let mut o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    o.min_out = o.min_out * 2;
    assert!(try_open(&s, &o).is_err());
    assert_eq!(debt_of(&s, &usdc), 0);
}

#[test]
fn refuses_expired_deadline() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let mut o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    o.deadline = s.f.e.ledger().timestamp() - 1;
    assert_eq!(code(try_open(&s, &o).expect_err("expired")), 2);
}

#[test]
fn refuses_bad_args() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let cases: [fn(&mut Open); 6] = [
        |o| o.borrow = 0,
        |o| o.min_out = 0,
        |o| o.deposit = -1,
        |o| o.min_hf = SCALAR_7 - 1,
        |o| o.debt = o.collateral.clone(),
        |o| o.swap.pulls = Vec::new(o.swap.pulls.env()),
    ];
    for f in cases {
        let mut o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
        f(&mut o);
        assert_eq!(code(try_open(&s, &o).expect_err("bad args")), 1);
    }
}

#[test]
fn receiver_rejects_unstaged_exec_op() {
    let s = setup();
    let e = &s.f.e;
    token::Client::new(e, &s.f.xlm).transfer(&s.f.whale, &s.receiver, &10_0000000);
    let r = e.try_invoke_contract::<(), soroban_sdk::Error>(
        &s.receiver,
        &Symbol::new(e, "exec_op"),
        (s.user.clone(), s.f.xlm.clone(), 10_0000000i128, 0i128).into_val(e),
    );
    assert!(matches!(r, Err(Ok(err)) if err.get_code() == 1), "{r:?}");
}

#[test]
fn only_the_leverage_contract_can_stage() {
    let s = setup();
    let e = &s.f.e;
    e.set_auths(&[]);
    let op = Staged {
        user: s.user.clone(),
        asset_in: s.f.usdc.clone(),
        amount: 1,
        asset_out: s.f.xlm.clone(),
        swap: aggregator_call(&s, &s.f.usdc, 1, &s.f.xlm, 1, Vec::new(e)),
        min_out: 1,
    };
    let r = e.try_invoke_contract::<(), soroban_sdk::Error>(&s.receiver, &Symbol::new(e, "stage"), (op,).into_val(e));
    assert!(r.is_err(), "an outsider staged an op");
}

#[test]
fn open_needs_the_users_signature() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    s.f.e.set_auths(&[]);
    assert!(try_open(&s, &o).is_err(), "opened without the user's auth");
}

#[test]
fn user_signs_one_tree_open_approve_flash_loan() {
    let s = setup();
    let e = &s.f.e;
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    try_open(&s, &o).expect("open");
    let auths = e.auths();
    std::println!("{auths:#?}");
    // Exactly one authorizer: the user, rooted at leverage.open.
    assert_eq!(auths.len(), 1);
    let (who, inv) = &auths[0];
    assert_eq!(who, &s.user);
    match &inv.function {
        soroban_sdk::testutils::AuthorizedFunction::Contract((c, f, _)) => {
            assert_eq!(c, &s.leverage);
            assert_eq!(f, &Symbol::new(e, "open"));
        }
        _ => panic!("root is not leverage.open"),
    }
    let subs: std::vec::Vec<std::string::String> = inv
        .sub_invocations
        .iter()
        .map(|x| match &x.function {
            soroban_sdk::testutils::AuthorizedFunction::Contract((_, f, _)) => std::format!("{f:?}"),
            _ => "other".into(),
        })
        .collect();
    std::println!("user signs: open -> {subs:?}");
    assert_eq!(subs.len(), 2, "approve + flash_loan");
}

#[test]
fn constructor_pins_its_own_receiver() {
    let s = setup();
    let e = &s.f.e;
    let back: Address = e.invoke_contract(&s.receiver, &Symbol::new(e, "leverage"), Vec::new(e));
    assert_eq!(back, s.leverage);
    // Silence unused-import lint for Ledger in some cfgs.
    let _ = e.ledger().sequence();
}

// ---------- generic swap call ----------

#[test]
fn unspent_swap_input_goes_back_to_the_user() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let mut o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    // Swap only 90% of the loan: the other 10% of USDC must land in the wallet, not the receiver.
    let part = o.borrow * 9 / 10;
    o.min_out = o.min_out * 9 / 10;
    o.swap = aggregator_call(&s, &usdc, part, &xlm, o.min_out, route(&s.f, Via::SoroswapPair, &usdc, &xlm, part));
    try_open(&s, &o).expect("open");
    assert_eq!(bal(&s, &usdc), o.borrow - part, "unspent USDC returned to the user");
    for c in [&s.leverage, &s.receiver] {
        assert_eq!(token::Client::new(&s.f.e, &usdc).balance(c), 0);
        assert_eq!(token::Client::new(&s.f.e, &xlm).balance(c), 0);
    }
}

#[test]
fn swap_cannot_pull_more_than_the_loan() {
    let s = setup();
    let e = &s.f.e;
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    // Stray USDC sitting in the receiver must stay out of reach of a swap call (auths are mocked,
    // so the SAC admin mint just works here).
    token::StellarAssetClient::new(e, &usdc).mint(&s.receiver, &100_0000000);
    let mut o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    o.swap.pulls = Vec::from_array(e, [Pull { to: s.f.aggregator.clone(), amount: o.borrow + 1 }]);
    assert_eq!(code(try_open(&s, &o).expect_err("over-pull")), 2);
    o.swap.pulls = Vec::from_array(e, [Pull { to: s.f.aggregator.clone(), amount: 0 }]);
    assert_eq!(code(try_open(&s, &o).expect_err("zero pull")), 2);
    assert_eq!(debt_of(&s, &usdc), 0);
    assert_eq!(token::Client::new(e, &usdc).balance(&s.receiver), 100_0000000, "stray funds untouched");
}

#[test]
fn a_swap_that_pays_nothing_is_refused() {
    let s = setup();
    let e = &s.f.e;
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let evil = e.register(evil::Evil, ());
    let mut o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    // A call that returns without swapping: nothing received -> revert.
    o.swap = SwapCall {
        contract: evil,
        function: Symbol::new(e, "noop"),
        args: Vec::new(e),
        pulls: Vec::from_array(e, [Pull { to: s.f.aggregator.clone(), amount: o.borrow }]),
    };
    assert_eq!(code(try_open(&s, &o).expect_err("no output")), 3);
    assert_eq!(debt_of(&s, &usdc), 0);
}

#[test]
fn the_swap_cannot_be_a_call_on_either_token() {
    let s = setup();
    let e = &s.f.e;
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let thief = Address::generate(e);
    // Called directly by the receiver, a token would authorize it as the receiver with no
    // pre-authorization at all (direct invoker), skipping `pulls`: refused before the call.
    for (token, func) in [(usdc.clone(), "transfer"), (usdc.clone(), "approve"), (xlm.clone(), "transfer")] {
        let mut o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
        let args: Vec<Val> = if func == "approve" {
            (s.receiver.clone(), thief.clone(), o.borrow, e.ledger().sequence() + 100).into_val(e)
        } else {
            (s.receiver.clone(), thief.clone(), o.borrow).into_val(e)
        };
        o.swap = SwapCall { contract: token, function: Symbol::new(e, func), args, pulls: o.swap.pulls.clone() };
        assert_eq!(code(try_open(&s, &o).expect_err("token as the swap")), 2, "{func}");
    }
    assert_eq!(token::Client::new(e, &usdc).balance(&thief), 0);
    assert_eq!(debt_of(&s, &usdc), 0);
}

/// open with ONLY the user's signature mocked (exactly the tree they sign: open -> approve +
/// flash_loan). Every contract-address auth inside, the receiver's included, is real host auth.
fn try_open_real_auth(s: &Setup, o: &Open) -> Result<i128, soroban_sdk::Error> {
    use seidar_leverage_iface::{FlashLoan, Request, REQ_SUPPLY_COLLATERAL};
    use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
    let e = &s.f.e;
    let expiry = e.ledger().sequence() + 20;
    let supply = o.deposit + o.min_out;
    let args: Vec<Val> = (
        s.user.clone(),
        s.f.pool.clone(),
        o.collateral.clone(),
        o.deposit,
        o.debt.clone(),
        o.borrow,
        o.swap.clone(),
        o.min_out,
        o.min_hf,
        o.deadline,
        expiry,
    )
        .into_val(e);
    let approve = MockAuthInvoke {
        contract: &o.collateral,
        fn_name: "approve",
        args: (s.user.clone(), s.f.pool.clone(), supply, expiry).into_val(e),
        sub_invokes: &[],
    };
    let flash = MockAuthInvoke {
        contract: &s.f.pool,
        fn_name: "flash_loan",
        args: (
            s.user.clone(),
            FlashLoan { contract: s.receiver.clone(), asset: o.debt.clone(), amount: o.borrow },
            Vec::from_array(e, [Request { request_type: REQ_SUPPLY_COLLATERAL, address: o.collateral.clone(), amount: supply }]),
        )
            .into_val(e),
        sub_invokes: &[],
    };
    let subs = [approve, flash];
    let root = MockAuthInvoke { contract: &s.leverage, fn_name: "open", args: args.clone(), sub_invokes: &subs };
    e.mock_auths(&[MockAuth { address: &s.user, invoke: &root }]);
    e.cost_estimate().budget().reset_unlimited();
    match e.try_invoke_contract::<i128, soroban_sdk::Error>(&s.leverage, &Symbol::new(e, "open"), args) {
        Ok(Ok(hf)) => Ok(hf),
        Ok(Err(_)) => panic!("bad return conversion"),
        Err(Ok(err)) => Err(err),
        Err(Err(_)) => Err(soroban_sdk::Error::from_contract_error(0)),
    }
}

#[test]
fn pulls_are_enforced_by_real_auth() {
    use soroban_sdk::xdr::ScErrorType;
    let s = setup();
    let e = &s.f.e;
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let evil = e.register(evil::Evil, ());
    // Stray USDC in the receiver (minted while all auths are still mocked).
    token::StellarAssetClient::new(e, &usdc).mint(&s.receiver, &100_0000000);
    let base = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);

    // Sanity: the real aggregator swap opens under real auth (the user tree above is exact).
    let hf = try_open_real_auth(&s, &base).expect("open under real auth");
    assert!(hf >= base.min_hf);
    let opened_debt = debt_of(&s, &usdc);
    assert!(opened_debt >= base.borrow);

    let with = |amount: i128, to: &Address| {
        let mut o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
        o.swap = SwapCall {
            contract: evil.clone(),
            function: Symbol::new(e, "steal"),
            args: (s.receiver.clone(), usdc.clone(), amount).into_val(e),
            pulls: Vec::from_array(e, [Pull { to: to.clone(), amount: o.borrow }]),
        };
        o
    };
    // Positive control: a pull exactly as pre-authorized goes through; then no output -> #3.
    let o = with(base.borrow, &evil);
    let err = try_open_real_auth(&s, &with(o.borrow, &evil)).expect_err("no output");
    assert!(err.is_type(ScErrorType::Contract) && code(err) == 3, "exact pull should pass auth: {err:?}");
    // One stroop more than pre-authorized (reaching for the stray funds): the host refuses it.
    let err = try_open_real_auth(&s, &with(o.borrow + 100_0000000, &evil)).expect_err("over-pull");
    assert!(!(err.is_type(ScErrorType::Contract) && code(err) == 3), "an over-pull got past auth: {err:?}");
    // The right amount but to a recipient other than the pre-authorized one: refused too.
    let err = try_open_real_auth(&s, &with(o.borrow, &s.f.aggregator)).expect_err("other recipient");
    assert!(!(err.is_type(ScErrorType::Contract) && code(err) == 3), "a pull to another address got past auth: {err:?}");

    assert_eq!(token::Client::new(e, &usdc).balance(&s.receiver), 100_0000000, "stray funds untouched");
    assert_eq!(token::Client::new(e, &usdc).balance(&evil), 0);
    assert_eq!(debt_of(&s, &usdc), opened_debt, "no extra debt from the refused runs");
}

mod evil {
    use soroban_sdk::{contract, contractimpl, token, Address, Env};

    /// A "swap" that does nothing, or pulls `amount` of `token` from `from` to itself.
    #[contract]
    pub struct Evil;

    #[contractimpl]
    impl Evil {
        pub fn noop(_e: Env) {}
        pub fn steal(e: Env, from: Address, token: Address, amount: i128) {
            token::Client::new(&e, &token).transfer(&from, &e.current_contract_address(), &amount);
        }
        /// Pays `amount` of `out` to `to` from this contract's own balance.
        pub fn gift(e: Env, out: Address, to: Address, amount: i128) {
            token::Client::new(&e, &out).transfer(&e.current_contract_address(), &to, &amount);
        }
        /// A stand-in DEX: takes `amount_in` of `token_in` from `from` (a pre-authorized pull) and
        /// pays `amount_out` of `out` back to `from` from this contract's own balance.
        pub fn trade(e: Env, from: Address, token_in: Address, amount_in: i128, out: Address, amount_out: i128) {
            let me = e.current_contract_address();
            token::Client::new(&e, &token_in).transfer(&from, &me, &amount_in);
            token::Client::new(&e, &out).transfer(&me, &from, &amount_out);
        }
        /// Tries to take `amount` of `token` from `from` (the user's auth is NOT staged) and then
        /// pays `out_amount` of `out` to `to` (the receiver) so the output check would pass.
        pub fn steal_and_gift(e: Env, from: Address, token: Address, amount: i128, out: Address, to: Address, out_amount: i128) {
            token::Client::new(&e, &token).transfer(&from, &e.current_contract_address(), &amount);
            token::Client::new(&e, &out).transfer(&e.current_contract_address(), &to, &out_amount);
        }
    }
}

// ---------- a pool that never calls back ----------

mod fake_pool {
    use seidar_leverage_iface::{FlashLoan, Positions, Request};
    use soroban_sdk::{contract, contractimpl, Address, Env, Map, Vec};

    #[contract]
    pub struct FakePool;

    #[contractimpl]
    impl FakePool {
        pub fn flash_loan(e: Env, _from: Address, _flash_loan: FlashLoan, _requests: Vec<Request>) -> Positions {
            Positions { liabilities: Map::new(&e), collateral: Map::new(&e), supply: Map::new(&e) }
        }
    }
}

#[test]
fn open_refuses_a_pool_that_never_runs_the_swap() {
    let s = setup();
    let e = &s.f.e;
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let fake = e.register(fake_pool::FakePool, ());
    let o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    let args: Vec<Val> = (
        s.user.clone(),
        fake,
        o.collateral.clone(),
        o.deposit,
        o.debt.clone(),
        o.borrow,
        o.swap.clone(),
        o.min_out,
        o.min_hf,
        o.deadline,
        e.ledger().sequence() + 20,
    )
        .into_val(e);
    let r = e.try_invoke_contract::<i128, soroban_sdk::Error>(&s.leverage, &Symbol::new(e, "open"), args);
    assert!(matches!(r, Err(Ok(err)) if err.get_code() == 4), "{r:?}");
    let pending: bool = e.invoke_contract(&s.receiver, &Symbol::new(e, "pending"), Vec::new(e));
    assert!(!pending, "no stale op left in the receiver");
}

// ---------- close ----------

struct Close {
    collateral: Address,
    debt: Address,
    flash: i128,
    swap: SwapCall,
    min_out: i128,
    repay: i128,
    withdraw: Option<i128>,
    min_hf: i128,
}

impl Close {
    /// Repay `repay` of debt by swapping flashed collateral (oracle value + `slip_bps`), withdraw `withdraw`.
    fn new(s: &Setup, collateral: &Address, debt: &Address, repay: i128, withdraw: Option<i128>, slip_bps: i128) -> Close {
        let min_out = repay;
        let flash = oracle_convert(s, debt, collateral, min_out) * (10_000 + slip_bps) / 10_000;
        Close {
            collateral: collateral.clone(),
            debt: debt.clone(),
            flash,
            swap: aggregator_call(s, collateral, flash, debt, min_out, route(&s.f, Via::SoroswapPair, collateral, debt, flash)),
            min_out,
            repay,
            withdraw,
            min_hf: 11_000_000,
        }
    }

    /// Everything: the debt plus a small buffer (interest, rounding; Blend refunds the excess), all collateral.
    fn all(s: &Setup, collateral: &Address, debt: &Address) -> Close {
        let owed = debt_of(s, debt);
        Close::new(s, collateral, debt, owed + owed / 500 + 1, None, 300)
    }
}

fn try_close(s: &Setup, c: &Close) -> Result<i128, soroban_sdk::Error> {
    let e = &s.f.e;
    let mut args: Vec<Val> = Vec::new(e);
    args.push_back(s.user.clone().into_val(e));
    args.push_back(s.f.pool.clone().into_val(e));
    args.push_back(c.collateral.clone().into_val(e));
    args.push_back(c.debt.clone().into_val(e));
    args.push_back(c.flash.into_val(e));
    args.push_back(c.swap.clone().into_val(e));
    args.push_back(c.min_out.into_val(e));
    args.push_back(c.repay.into_val(e));
    args.push_back(c.withdraw.into_val(e));
    args.push_back(c.min_hf.into_val(e));
    args.push_back((e.ledger().timestamp() + 300).into_val(e));
    args.push_back((e.ledger().sequence() + 20).into_val(e));
    e.cost_estimate().budget().reset_unlimited();
    let r = e.try_invoke_contract::<i128, soroban_sdk::Error>(&s.leverage, &Symbol::new(e, "close"), args);
    let cpu = e.cost_estimate().budget().cpu_instruction_cost();
    let mem = e.cost_estimate().budget().memory_bytes_cost();
    std::println!("close cost: cpu {cpu} mem {mem}");
    match r {
        Ok(Ok(hf)) => {
            assert!(cpu < 100_000_000 && mem < 40 * 1024 * 1024, "close over network limits");
            Ok(hf)
        }
        Ok(Err(_)) => panic!("bad return conversion"),
        Err(_) if std::env::var("LEV_DEBUG").is_ok() => {
            std::println!("{:#?}", e.host().get_diagnostic_events());
            Err(soroban_sdk::Error::from_contract_error(0))
        }
        Err(Ok(err)) => Err(err),
        Err(Err(_)) => Err(soroban_sdk::Error::from_contract_error(0)),
    }
}

fn assert_clean(s: &Setup, tokens: [&Address; 2]) {
    let e = &s.f.e;
    for t in tokens {
        let c = token::Client::new(e, t);
        for a in [&s.leverage, &s.receiver] {
            assert_eq!(c.balance(a), 0, "a contract kept funds");
        }
        assert_eq!(c.allowance(&s.user, &s.f.pool), 0, "an allowance to the pool was left");
    }
    let pending: bool = e.invoke_contract(&s.receiver, &Symbol::new(e, "pending"), Vec::new(e));
    assert!(!pending);
}

#[test]
fn closes_a_long_in_one_transaction() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    try_open(&s, &o).expect("open");
    let coll = collateral_of(&s, &xlm);
    let wallet = bal(&s, &xlm);
    let c = Close::all(&s, &xlm, &usdc);
    let hf = try_close(&s, &c).expect("close");
    assert_eq!(hf, 0, "no debt left");
    assert_eq!(debt_of(&s, &usdc), 0);
    assert_eq!(debt_of(&s, &xlm), 0, "flash loan fully repaid");
    assert_eq!(collateral_of(&s, &xlm), 0, "all collateral withdrawn");
    let got = bal(&s, &xlm) - wallet;
    std::println!("collateral {coll}, flashed {}, wallet +{got} XLM, USDC left {}", c.flash, bal(&s, &usdc));
    // The wallet gets the collateral back minus what was sold to repay the debt.
    assert!(got > 0 && got >= coll - c.flash - c.flash / 1000 - 10, "wallet received the rest of the collateral");
    assert_clean(&s, [&xlm, &usdc]);
}

#[test]
fn closes_a_short_in_one_transaction() {
    let s = setup();
    let e = &s.f.e;
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let r = route(&s.f, Via::Aqua, &xlm, &usdc, 10_000_0000000);
    let got: i128 = e.invoke_contract(
        &s.f.aggregator,
        &Symbol::new(e, "swap_exact_in"),
        (s.user.clone(), xlm.clone(), 10_000_0000000i128, usdc.clone(), 1i128, r, Option::<Val>::None).into_val(e),
    );
    let o = Open::new(&s, Via::SoroswapPair, &usdc, &xlm, got / 2, 18, 300);
    try_open(&s, &o).expect("open short");
    let c = Close::all(&s, &usdc, &xlm);
    assert_eq!(try_close(&s, &c).expect("close short"), 0);
    assert_eq!(debt_of(&s, &xlm), 0);
    assert_eq!(debt_of(&s, &usdc), 0);
    assert_eq!(collateral_of(&s, &usdc), 0);
    assert_clean(&s, [&xlm, &usdc]);
}

#[test]
fn closes_part_of_a_position() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    try_open(&s, &o).expect("open");
    let owed = debt_of(&s, &usdc);
    let coll = collateral_of(&s, &xlm);
    let mut c = Close::new(&s, &xlm, &usdc, owed / 2, None, 300);
    c.withdraw = Some(c.flash + coll / 10);
    let hf = try_close(&s, &c).expect("partial close");
    let left = debt_of(&s, &usdc);
    std::println!("debt {owed} -> {left}, collateral {coll} -> {}, hf {hf}", collateral_of(&s, &xlm));
    assert!(left > 0 && left <= owed - owed / 2 + 2, "half the debt repaid");
    assert!(hf >= c.min_hf);
    assert_eq!(debt_of(&s, &xlm), 0, "flash loan fully repaid");
    assert_clean(&s, [&xlm, &usdc]);
}

#[test]
fn close_refuses_a_swap_below_min_out() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    try_open(&s, &o).expect("open");
    let owed = debt_of(&s, &usdc);
    let mut c = Close::all(&s, &xlm, &usdc);
    c.min_out = c.min_out * 2;
    c.repay = c.min_out;
    assert!(try_close(&s, &c).is_err());
    assert!(debt_of(&s, &usdc) >= owed, "reverted, position unchanged");
}

#[test]
fn close_with_no_position_is_refused() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let c = Close::new(&s, &xlm, &usdc, 100_0000000, None, 300);
    assert_eq!(code(try_close(&s, &c).expect_err("nothing to close")), 5);
}

#[test]
fn close_refuses_bad_args() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let cases: [fn(&mut Close); 6] = [
        |c| c.repay = 0,
        |c| c.flash = 0,
        |c| c.min_out = 0,
        |c| c.withdraw = Some(0),
        |c| c.min_hf = SCALAR_7 - 1,
        |c| c.debt = c.collateral.clone(),
    ];
    for f in cases {
        let mut c = Close::new(&s, &xlm, &usdc, 100_0000000, None, 300);
        f(&mut c);
        assert_eq!(code(try_close(&s, &c).expect_err("bad args")), 1);
    }
}

#[test]
fn close_needs_the_users_signature() {
    let s = setup();
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    try_open(&s, &o).expect("open");
    let c = Close::all(&s, &xlm, &usdc);
    s.f.e.set_auths(&[]);
    assert!(try_close(&s, &c).is_err(), "closed without the user's signature");
}

// ---------- adversarial: a fake pool draining the receiver ----------

mod drain_pool {
    use seidar_leverage_iface::{FlashLoan, PoolConfig, Positions, Request, Reserve, ReserveConfig, ReserveData};
    use soroban_sdk::{contract, contractimpl, Address, Env, IntoVal, Map, Symbol, Val, Vec};

    #[contract]
    pub struct DrainPool;

    fn reserve(_e: &Env, asset: &Address) -> Reserve {
        Reserve {
            asset: asset.clone(),
            config: ReserveConfig {
                index: 0,
                decimals: 7,
                c_factor: 10_000_000,
                l_factor: 10_000_000,
                util: 0,
                max_util: 0,
                r_base: 0,
                r_one: 0,
                r_two: 0,
                r_three: 0,
                reactivity: 0,
                supply_cap: i128::MAX,
                enabled: true,
            },
            data: ReserveData {
                d_rate: 1_000_000_000_000,
                b_rate: 1_000_000_000_000,
                ir_mod: 0,
                b_supply: 0,
                d_supply: 0,
                backstop_credit: 0,
                last_time: 0,
            },
            scalar: 10_000_000,
        }
    }

    fn positions(e: &Env) -> Positions {
        let mut collateral = Map::new(e);
        collateral.set(0u32, 1_000_000_000_000_000i128);
        let mut liabilities = Map::new(e);
        liabilities.set(1u32, 10_000_000i128);
        Positions { liabilities, collateral, supply: Map::new(e) }
    }

    #[contractimpl]
    impl DrainPool {
        pub fn __constructor(e: Env, oracle: Address, xlm: Address, usdc: Address) {
            e.storage().instance().set(&0u32, &oracle);
            e.storage().instance().set(&1u32, &xlm);
            e.storage().instance().set(&2u32, &usdc);
        }

        pub fn get_config(e: Env) -> PoolConfig {
            PoolConfig {
                oracle: e.storage().instance().get(&0u32).unwrap(),
                min_collateral: 0,
                bstop_rate: 0,
                status: 0,
                max_positions: 10,
            }
        }

        pub fn get_reserve_list(e: Env) -> Vec<Address> {
            Vec::from_array(
                &e,
                [
                    e.storage().instance().get(&1u32).unwrap(),
                    e.storage().instance().get(&2u32).unwrap(),
                ],
            )
        }

        pub fn get_reserve(e: Env, asset: Address) -> Reserve {
            reserve(&e, &asset)
        }

        pub fn get_positions(e: Env, _address: Address) -> Positions {
            positions(&e)
        }

        /// "Flashes" nothing: it just calls the receiver back with the requested amount.
        pub fn flash_loan(e: Env, from: Address, flash_loan: FlashLoan, _requests: Vec<Request>) -> Positions {
            let _: Val = e.invoke_contract(
                &flash_loan.contract,
                &Symbol::new(&e, "exec_op"),
                (from, flash_loan.asset, flash_loan.amount, 0i128).into_val(&e),
            );
            positions(&e)
        }
    }
}

/// A fake pool calling exec_op without lending anything, with a "swap" that either just pays
/// min_out (so the receiver would refund the "unspent loan" out of stray funds) or pulls the
/// "loan" (stray funds) through the pre-authorized pulls. Both are refused before the swap runs.
#[test]
fn a_fake_pool_cannot_drain_stray_funds_from_the_receiver() {
    let s = setup();
    let e = &s.f.e;
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let oracle = BlendPoolClient::new(e, &s.f.pool).get_config().oracle;
    let fake = e.register(drain_pool::DrainPool, (oracle, xlm.clone(), usdc.clone()));

    // Somebody accidentally sent 100 USDC to the shared receiver.
    token::StellarAssetClient::new(e, &usdc).mint(&s.receiver, &100_0000000);
    let evil = e.register(evil::Evil, ());
    token::Client::new(e, &xlm).transfer(&s.f.whale, &evil, &10);
    let attacker = Address::generate(e);
    let borrow = 100_0000000i128;
    let swaps = [
        // Pays one stroop of XLM, spends nothing: the receiver would "refund" 100 USDC.
        SwapCall {
            contract: evil.clone(),
            function: Symbol::new(e, "gift"),
            args: (xlm.clone(), s.receiver.clone(), 1i128).into_val(e),
            pulls: Vec::from_array(e, [Pull { to: evil.clone(), amount: borrow }]),
        },
        // Pulls the "loan" (really the stray USDC) and pays one stroop of XLM.
        SwapCall {
            contract: evil.clone(),
            function: Symbol::new(e, "trade"),
            args: (s.receiver.clone(), usdc.clone(), borrow, xlm.clone(), 1i128).into_val(e),
            pulls: Vec::from_array(e, [Pull { to: evil.clone(), amount: borrow }]),
        },
    ];
    for swap in swaps {
        let args: Vec<Val> = (
            attacker.clone(),
            fake.clone(),
            xlm.clone(),
            0i128,
            usdc.clone(),
            borrow,
            swap,
            1i128,
            11_000_000i128,
            e.ledger().timestamp() + 300,
            e.ledger().sequence() + 20,
        )
            .into_val(e);
        e.cost_estimate().budget().reset_unlimited();
        let r = e.try_invoke_contract::<i128, soroban_sdk::Error>(&s.leverage, &Symbol::new(e, "open"), args);
        // ReceiverError::NotFunded (#4): the loan never arrived.
        assert!(matches!(r, Err(Ok(err)) if err.get_code() == 4), "{r:?}");
    }
    assert_eq!(token::Client::new(e, &usdc).balance(&s.receiver), 100_0000000, "stray funds untouched");
    assert_eq!(token::Client::new(e, &usdc).balance(&attacker), 0);
    assert_eq!(token::Client::new(e, &usdc).balance(&evil), 0);
    assert_eq!(token::Client::new(e, &xlm).balance(&evil), 10);
    let pending: bool = e.invoke_contract(&s.receiver, &Symbol::new(e, "pending"), Vec::new(e));
    assert!(!pending, "no stale op left in the receiver");
}

/// With stray funds in the receiver, a real open and a real close still work and leave the stray
/// funds exactly where they were (the delivery check counts them out, it doesn't trip on them).
#[test]
fn stray_funds_dont_block_or_join_a_real_open_and_close() {
    let s = setup();
    let e = &s.f.e;
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    token::StellarAssetClient::new(e, &usdc).mint(&s.receiver, &100_0000000);
    token::Client::new(e, &xlm).transfer(&s.f.whale, &s.receiver, &50_0000000);
    let o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    let before = bal(&s, &xlm);
    try_open(&s, &o).expect("open");
    assert!(bal(&s, &xlm) >= before - o.deposit - o.min_out);
    assert_eq!(bal(&s, &usdc), 0, "no stray USDC reached the user");
    let c = Close::all(&s, &xlm, &usdc);
    assert_eq!(try_close(&s, &c).expect("close"), 0);
    assert_eq!(debt_of(&s, &usdc), 0);
    assert_eq!(debt_of(&s, &xlm), 0);
    assert_eq!(token::Client::new(e, &usdc).balance(&s.receiver), 100_0000000, "stray USDC untouched");
    assert_eq!(token::Client::new(e, &xlm).balance(&s.receiver), 50_0000000, "stray XLM untouched");
}

// ---------- adversarial: the swap reaching for the user's auth ----------

#[test]
fn a_swap_cannot_use_the_users_auth() {
    let s = setup();
    let e = &s.f.e;
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let evil = e.register(evil::Evil, ());
    // The user holds USDC the malicious swap will try to take.
    token::StellarAssetClient::new(e, &usdc).mint(&s.user, &1_000_0000000);
    let mut o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    // Enough XLM to pay min_out, so only the theft stands between the swap and success.
    token::Client::new(e, &xlm).transfer(&s.f.whale, &evil, &o.min_out);
    o.swap = SwapCall {
        contract: evil.clone(),
        function: Symbol::new(e, "steal_and_gift"),
        args: (s.user.clone(), usdc.clone(), 1_000_0000000i128, xlm.clone(), s.receiver.clone(), o.min_out).into_val(e),
        pulls: Vec::from_array(e, [Pull { to: evil.clone(), amount: o.borrow }]),
    };
    let err = try_open_real_auth(&s, &o).expect_err("the swap moved the user's USDC");
    std::println!("refused: {err:?}");
    assert_eq!(token::Client::new(e, &usdc).balance(&s.user), 1_000_0000000);
    assert_eq!(token::Client::new(e, &usdc).balance(&evil), 0);
    assert_eq!(token::Client::new(e, &xlm).balance(&evil), o.min_out);
    assert_eq!(debt_of(&s, &usdc), 0);
}

// ---------- close under the exact signed auth tree ----------

fn try_close_real_auth(s: &Setup, c: &Close, withdraw: i128) -> Result<i128, soroban_sdk::Error> {
    use seidar_leverage_iface::{FlashLoan, Request, REQ_REPAY, REQ_WITHDRAW_COLLATERAL};
    use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
    let e = &s.f.e;
    let expiry = e.ledger().sequence() + 20;
    let deadline = e.ledger().timestamp() + 300;
    let flash_repay = c.flash + c.flash / 10_000 + 2;
    let args: Vec<Val> = (
        s.user.clone(),
        s.f.pool.clone(),
        c.collateral.clone(),
        c.debt.clone(),
        c.flash,
        c.swap.clone(),
        c.min_out,
        c.repay,
        Some(withdraw),
        c.min_hf,
        deadline,
        expiry,
    )
        .into_val(e);
    let approve_debt = MockAuthInvoke {
        contract: &c.debt,
        fn_name: "approve",
        args: (s.user.clone(), s.f.pool.clone(), c.repay, expiry).into_val(e),
        sub_invokes: &[],
    };
    let approve_coll = MockAuthInvoke {
        contract: &c.collateral,
        fn_name: "approve",
        args: (s.user.clone(), s.f.pool.clone(), flash_repay, expiry).into_val(e),
        sub_invokes: &[],
    };
    let flash = MockAuthInvoke {
        contract: &s.f.pool,
        fn_name: "flash_loan",
        args: (
            s.user.clone(),
            FlashLoan { contract: s.receiver.clone(), asset: c.collateral.clone(), amount: c.flash },
            Vec::from_array(
                e,
                [
                    Request { request_type: REQ_REPAY, address: c.debt.clone(), amount: c.repay },
                    Request { request_type: REQ_WITHDRAW_COLLATERAL, address: c.collateral.clone(), amount: withdraw },
                    Request { request_type: REQ_REPAY, address: c.collateral.clone(), amount: flash_repay },
                ],
            ),
        )
            .into_val(e),
        sub_invokes: &[],
    };
    let reset_debt = MockAuthInvoke {
        contract: &c.debt,
        fn_name: "approve",
        args: (s.user.clone(), s.f.pool.clone(), 0i128, expiry).into_val(e),
        sub_invokes: &[],
    };
    let reset_coll = MockAuthInvoke {
        contract: &c.collateral,
        fn_name: "approve",
        args: (s.user.clone(), s.f.pool.clone(), 0i128, expiry).into_val(e),
        sub_invokes: &[],
    };
    let subs = [approve_debt, approve_coll, flash, reset_debt, reset_coll];
    let root = MockAuthInvoke { contract: &s.leverage, fn_name: "close", args: args.clone(), sub_invokes: &subs };
    e.mock_auths(&[MockAuth { address: &s.user, invoke: &root }]);
    e.cost_estimate().budget().reset_unlimited();
    match e.try_invoke_contract::<i128, soroban_sdk::Error>(&s.leverage, &Symbol::new(e, "close"), args) {
        Ok(Ok(hf)) => Ok(hf),
        Ok(Err(_)) => panic!("bad return conversion"),
        Err(Ok(err)) => Err(err),
        Err(Err(_)) => Err(soroban_sdk::Error::from_contract_error(0)),
    }
}

#[test]
fn close_works_under_real_auth_with_the_full_signed_tree() {
    let s = setup();
    let e = &s.f.e;
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    let o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    try_open(&s, &o).expect("open");
    let blend = BlendPoolClient::new(e, &s.f.pool);
    let r = blend.get_reserve(&xlm);
    let b = blend.get_positions(&s.user).collateral.get(r.config.index).unwrap();
    let underlying = b * r.data.b_rate / SCALAR_12;
    let withdraw = underlying + underlying / 1_000 + 1;
    let c = Close::all(&s, &xlm, &usdc);
    let hf = try_close_real_auth(&s, &c, withdraw).expect("close under real auth");
    assert_eq!(hf, 0);
    assert_eq!(debt_of(&s, &usdc), 0);
    assert_eq!(collateral_of(&s, &xlm), 0);
    assert_clean(&s, [&xlm, &usdc]);
}

// ---------- a tiny flash loan leaves no flash debt ----------

/// Blend mints the flash liability rounded UP (ceil(flash / d_rate)) and burns the repayment
/// rounded DOWN, so for a loan under 10,000 stroops the fixed part of the buffer decides it. Find
/// a loan size where a 1-stroop buffer would leave one d-token of debt behind on this fork's live
/// rates, and close with exactly that flash: nothing may be left (the contract pads by 2).
#[test]
fn a_tiny_flash_close_leaves_no_flash_debt() {
    let s = setup();
    let e = &s.f.e;
    let (xlm, usdc) = (s.f.xlm.clone(), s.f.usdc.clone());
    // A short: USDC collateral (its d_rate is the further from 1.0, so the window is widest).
    let r = route(&s.f, Via::Aqua, &xlm, &usdc, 10_000_0000000);
    let got: i128 = e.invoke_contract(
        &s.f.aggregator,
        &Symbol::new(e, "swap_exact_in"),
        (s.user.clone(), xlm.clone(), 10_000_0000000i128, usdc.clone(), 1i128, r, Option::<Val>::None).into_val(e),
    );
    let o = Open::new(&s, Via::SoroswapPair, &usdc, &xlm, got / 2, 15, 300);
    try_open(&s, &o).expect("open short");

    let d_rate = BlendPoolClient::new(e, &s.f.pool).get_reserve(&usdc).data.d_rate;
    let up = |x: i128| (x * SCALAR_12 + d_rate - 1) / d_rate;
    let down = |x: i128| x * SCALAR_12 / d_rate;
    let flash = (1_000..10_000i128)
        .find(|&f| down(f + f / 10_000 + 1) < up(f))
        .expect("a loan size where a 1-stroop buffer leaves dust");
    assert!(down(flash + flash / 10_000 + 2) >= up(flash), "2 stroops cover it");
    std::println!("d_rate {d_rate}: flash {flash} would leave dust with +1");

    // A stand-in DEX pays 1 XLM for the flashed USDC; repay 1 XLM of the debt.
    let evil = e.register(evil::Evil, ());
    token::Client::new(e, &xlm).transfer(&s.f.whale, &evil, &1_0000000);
    let repay = 1_0000000i128;
    let c = Close {
        collateral: usdc.clone(),
        debt: xlm.clone(),
        flash,
        swap: SwapCall {
            contract: evil.clone(),
            function: Symbol::new(e, "trade"),
            args: (s.receiver.clone(), usdc.clone(), flash, xlm.clone(), repay).into_val(e),
            pulls: Vec::from_array(e, [Pull { to: evil.clone(), amount: flash }]),
        },
        min_out: repay,
        repay,
        withdraw: Some(flash * 2),
        min_hf: 11_000_000,
    };
    let owed = debt_of(&s, &xlm);
    try_close(&s, &c).expect("tiny partial close");
    assert_eq!(debt_of(&s, &usdc), 0, "no flash debt left");
    let blend = BlendPoolClient::new(e, &s.f.pool);
    let idx = blend.get_reserve(&usdc).config.index;
    assert!(blend.get_positions(&s.user).liabilities.get(idx).is_none(), "no USDC d-tokens left");
    assert!(debt_of(&s, &xlm) <= owed - repay + 2);
    assert_clean(&s, [&xlm, &usdc]);
}
