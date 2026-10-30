//! seidar-leverage against a mainnet fork: real Blend Fixed v2.1 pool,
//! Reflector oracle, XLM/USDC SACs, Soroswap aggregator + the Soroswap and
//! Aqua pools its live routes used (fixtures/mainnet.json). The leverage and
//! receiver run as their release WASMs (build first: `stellar contract build`).

extern crate std;

use base64::Engine;
use seidar_leverage_iface::{health_factor, price, BlendPoolClient, Hop, Pull, Route, Staged, SwapCall, SCALAR_12, SCALAR_7};
use soroban_ledger_snapshot::LedgerSnapshot;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
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
    // Nothing is left in the contracts.
    for c in [&s.leverage, &s.receiver] {
        assert_eq!(token::Client::new(&s.f.e, &o.collateral).balance(c), 0);
        assert_eq!(token::Client::new(&s.f.e, &o.debt).balance(c), 0);
    }
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
        debt: s.f.usdc.clone(),
        amount: 1,
        collateral: s.f.xlm.clone(),
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
    let mut o = Open::new(&s, Via::SoroswapPair, &xlm, &usdc, 1_000_0000000, 20, 300);
    // A call that returns without swapping (a token balance read): nothing received -> revert.
    o.swap = SwapCall {
        contract: usdc.clone(),
        function: Symbol::new(e, "balance"),
        args: (s.receiver.clone(),).into_val(e),
        pulls: Vec::from_array(e, [Pull { to: s.f.aggregator.clone(), amount: o.borrow }]),
    };
    assert_eq!(code(try_open(&s, &o).expect_err("no output")), 3);
    assert_eq!(debt_of(&s, &usdc), 0);
}
