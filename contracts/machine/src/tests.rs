//! Unit tests for CLAUDE.md section 4 (the parts that apply to the machine contract in Phase 1).

use super::*;
use near_contract_standards::fungible_token::FungibleTokenCore;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::storage_management::StorageManagement;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{NearToken, PromiseOrValue, testing_env};

const PACK: u128 = 10_000_000; // 10 USDT
const USDT: u128 = 1_000_000;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn machine_id() -> AccountId {
    acc("gold.gaballs.testnet")
}
fn usdt() -> AccountId {
    acc("usdt.gaballs.testnet")
}
fn creator() -> AccountId {
    acc("creator.testnet")
}
fn buyer(i: usize) -> AccountId {
    acc(&format!("buyer{i}.gaballs.testnet"))
}

/// Fresh call context. `seed` varies env::random_seed() and the block height like real blocks would.
fn ctx(predecessor: AccountId, seed: u64) {
    let mut random = [0u8; 32];
    random[..8].copy_from_slice(&seed.to_le_bytes());
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(machine_id())
            .predecessor_account_id(predecessor)
            .random_seed(random)
            .block_height(1_000 + seed)
            .attached_deposit(NearToken::from_yoctonear(1))
            .build()
    );
}

fn default_args() -> LaunchArgs {
    LaunchArgs {
        name: "Gold Gacha".into(),
        symbol: "GOLD".into(),
        icon: None,
        creator: creator(),
        creator_allocation: U128(100_000_000 * ONE_TOKEN),
        usdt_contract: usdt(),
        nft_contract: acc("nft.gaballs.testnet"),
        platform_account: acc("gaballs.testnet"),
        pack_price: U128(PACK),
        virtual_usdt_reserve: U128(3_000 * USDT),
        vault_seed: U128(100_000_000 * ONE_TOKEN),
        max_vault_draw_bps: 2_500,
    }
}

fn launch_with_buyers(n: usize) -> Machine {
    ctx(acc("gaballs.testnet"), 0);
    let mut m = Machine::new(default_args());
    for i in 0..n {
        m.token.internal_register_account(&buyer(i));
    }
    m
}

fn pack_msg(count: u32) -> String {
    format!(r#"{{"action":"open_pack","count":{count}}}"#)
}

/// Simulates the USDT contract calling ft_on_transfer. Returns the unused (refunded) amount.
fn pay(m: &mut Machine, who: &AccountId, amount: u128, msg: &str, seed: u64) -> u128 {
    ctx(usdt(), seed);
    match m.ft_on_transfer(who.clone(), U128(amount), msg.to_string()) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("expected a value"),
    }
}

fn bal(m: &Machine, a: &AccountId) -> u128 {
    m.token.ft_balance_of(a.clone()).0
}

/// Token invariant: supply is constant, the machine holds exactly curve + vault, and
/// curve + vault + every balance = 1B. USDT invariant: R + accrued fees + swept fees = USDT received.
fn check_invariants(m: &Machine, buyers: usize) {
    assert_eq!(m.token.total_supply, TOTAL_SUPPLY, "total supply changed");
    assert_eq!(bal(m, &machine_id()), m.curve_tokens + m.vault, "machine balance != curve + vault");
    let held: u128 = bal(m, &creator()) + (0..buyers).map(|i| bal(m, &buyer(i))).sum::<u128>();
    assert_eq!(m.curve_tokens + m.vault + held, TOTAL_SUPPLY, "curve + vault + balances != 1B");
    let f = &m.fees;
    assert_eq!(
        m.curve_usdt + f.nft_accrued.0 + f.platform_accrued.0 + f.nft_swept.0 + f.platform_swept.0,
        m.stats.total_usdt_in.0,
        "USDT invariant broken"
    );
}

fn tokens(x: u128) -> String {
    format!("{}.{:06}", x / ONE_TOKEN, (x % ONE_TOKEN) / 1_000_000_000_000)
}
fn usdt_str(x: u128) -> String {
    format!("{}.{:06}", x / USDT, x % USDT)
}

// ------------------------------------------------------------------ curve maths

/// Small deterministic PRNG for test inputs (xorshift64*).
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545F4914F6CDD1D)
    }
    fn range(&mut self, lo: u128, hi: u128) -> u128 {
        lo + (u128::from(self.next()) << 64 | u128::from(self.next())) % (hi - lo)
    }
}

/// Reference: bought = floor(T * u / (V + R + u)), the same quantity as T - ceil(k*T/(k+u)) written another
/// way, computed in plain u128 (valid while T * u fits, which holds for these inputs).
fn reference_tokens_out(v: u128, r: u128, t: u128, u: u128) -> u128 {
    t * u / (v + r + u)
}

#[test]
fn curve_buy_matches_reference_implementation() {
    let mut rng = Rng(42);
    for _ in 0..20_000 {
        let v = rng.range(1_000 * USDT, 100_000 * USDT);
        let r = rng.range(0, 10_000_000 * USDT);
        let t = rng.range(ONE_TOKEN, 900_000_000 * ONE_TOKEN);
        let u = rng.range(1, 10_000 * USDT);
        assert_eq!(curve::tokens_out(v, r, t, u), reference_tokens_out(v, r, t, u), "v={v} r={r} t={t} u={u}");
    }
}

#[test]
fn curve_rounding_favours_the_contract() {
    // After a buy, (V+R+u) * (T-bought) must be >= (V+R) * T: the product never shrinks, so the buyer
    // can never extract more than the exact curve allows.
    let mut rng = Rng(7);
    for _ in 0..20_000 {
        let v = rng.range(1, 100_000 * USDT);
        let r = rng.range(0, 10_000_000 * USDT);
        let t = rng.range(1, 900_000_000 * ONE_TOKEN);
        let u = rng.range(1, 10_000 * USDT);
        let b = curve::tokens_out(v, r, t, u);
        let k = curve::U256::from(v) + curve::U256::from(r);
        assert!((k + curve::U256::from(u)) * curve::U256::from(t - b) >= k * curve::U256::from(t));
    }
}

#[test]
fn curve_no_overflow_at_large_r() {
    // 1 billion USDT already in the curve: (V+R)*T is ~8e41, far above u128::MAX (~3.4e38).
    let v = 3_000 * USDT;
    let r = 1_000_000_000 * USDT;
    let t = 800_000_000 * ONE_TOKEN;
    assert!((v + r).checked_mul(t).is_none(), "test must exercise the >u128 path");
    let u = 9_930_000;
    assert_eq!(curve::tokens_out(v, r, t, u), reference_tokens_out(v, r, t, u));
    assert!(curve::price_wad(v, r, t) > 0);
}

#[test]
fn launch_price_is_v_over_t() {
    let m = launch_with_buyers(0);
    // 3,000 USDT / 800M tokens = 0.00000375 USDT per token = 3.75e12 in wad.
    assert_eq!(m.get_machine().price_usdt_wad.0, 3_750_000_000_000);
}

// ------------------------------------------------------------------ odds

#[test]
fn odds_100k_rolls_within_half_a_percentage_point() {
    let m = launch_with_buyers(0);
    let b = buyer(0);
    let mut counts = [0u64; 4];
    const ROLLS: u64 = 100_000;
    for nonce in 0..ROLLS {
        if nonce % 1_000 == 0 {
            ctx(usdt(), nonce); // fresh gas budget and a new block seed every 1,000 rolls
        }
        let (roll, _) = Machine::draw_roll(&b, nonce);
        counts[odds::tier_for_roll(&m.odds, roll)] += 1;
    }
    for (tier, &n) in m.odds.iter().zip(counts.iter()) {
        let observed_bps = n * 10_000 / ROLLS;
        let diff = observed_bps.abs_diff(u64::from(tier.chance_bps));
        println!("{:<7} expected {:>5.2}%  observed {:>5.2}%  ({n} rolls)", tier.name,
            f64::from(tier.chance_bps) / 100.0, n as f64 * 100.0 / ROLLS as f64);
        assert!(diff <= 50, "{} off by {diff} bps", tier.name);
    }
}

#[test]
fn expected_multiplier_is_0_955() {
    let m = launch_with_buyers(0);
    assert_eq!(m.get_odds().expected_multiplier_bps, 9_550);
}

// ------------------------------------------------------------------ pulls and invariants

#[test]
fn supply_and_usdt_invariants_hold_after_every_pull() {
    const BUYERS: usize = 3;
    let mut m = launch_with_buyers(BUYERS);
    check_invariants(&m, BUYERS);
    let mut rng = Rng(2026);
    let mut calls = 0u64;
    while m.stats.packs_opened < 2_000 {
        let count = (rng.next() % 5 + 1) as u32;
        let who = buyer((rng.next() % BUYERS as u64) as usize);
        let refund = pay(&mut m, &who, PACK * u128::from(count), &pack_msg(count), calls);
        assert_eq!(refund, 0);
        check_invariants(&m, BUYERS);
        calls += 1;
        if calls % 97 == 0 {
            m.sweep_fees();
            check_invariants(&m, BUYERS);
        }
    }
    let s = &m.stats;
    println!(
        "{} packs in {calls} calls | tiers {:?} | capped {} | vault {} | realized multiplier {:.4}",
        s.packs_opened, s.tier_counts, s.capped_pulls, tokens(m.vault),
        s.total_payout.0 as f64 / s.total_bought.0 as f64
    );
}

#[test]
#[should_panic(expected = "Only the machine's USDT contract can call ft_on_transfer")]
fn fake_ft_on_transfer_from_non_usdt_caller_is_rejected() {
    let mut m = launch_with_buyers(1);
    // An attacker calls the machine directly, claiming they sent 10 USDT. No USDT moved.
    ctx(buyer(0), 1);
    let _ = m.ft_on_transfer(buyer(0), U128(PACK), pack_msg(1));
}

#[test]
fn fake_usdt_lookalike_contract_is_rejected() {
    let mut m = launch_with_buyers(1);
    ctx(acc("usdt.attacker.testnet"), 1);
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        m.ft_on_transfer(buyer(0), U128(PACK), pack_msg(1))
    }));
    assert!(r.is_err());
}

#[test]
fn wrong_amount_is_refunded_in_full() {
    let mut m = launch_with_buyers(1);
    for (amount, count) in [(PACK - 1, 1), (PACK + 1, 1), (PACK, 2), (PACK * 3, 2)] {
        assert_eq!(pay(&mut m, &buyer(0), amount, &pack_msg(count), 1), amount);
    }
    assert_eq!(m.pull_nonce, 0);
    assert_eq!(bal(&m, &buyer(0)), 0);
    assert_eq!(m.stats.total_usdt_in.0, 0);
    check_invariants(&m, 1);
}

#[test]
fn bad_msg_or_count_is_refunded_in_full() {
    let mut m = launch_with_buyers(1);
    for msg in [
        "".to_string(),
        "not json".to_string(),
        r#"{"action":"sell","count":1}"#.to_string(),
        pack_msg(0),
        pack_msg(6),
    ] {
        assert_eq!(pay(&mut m, &buyer(0), PACK, &msg, 1), PACK, "msg {msg:?}");
    }
    assert_eq!(m.pull_nonce, 0);
}

#[test]
fn unregistered_buyer_is_refunded_in_full() {
    let mut m = launch_with_buyers(0);
    let stranger = acc("stranger.testnet");
    assert_eq!(pay(&mut m, &stranger, PACK, &pack_msg(1), 1), PACK);
    assert_eq!(m.pull_nonce, 0);
    assert_eq!(bal(&m, &stranger), 0);
}

#[test]
fn vault_cap_is_respected_during_a_mythic_streak() {
    let mut m = launch_with_buyers(1);
    let mut saw_capped = false;
    for i in 0..15u64 {
        ctx(usdt(), i);
        let vault_before = m.vault;
        // Force a Mythic: call the settlement step directly, skipping the random roll (open_one_pack
        // normally advances the nonce, so do that here too).
        m.pull_nonce = i + 1;
        let r = m.settle_pack(&buyer(0), i, 9_999, odds::MYTHIC, [0; 32]);
        let draw = r.payout.0 - r.bought.0;
        assert!(draw <= vault_before / 4, "pull {i} drew more than 25% of the vault");
        assert_eq!(r.vault_after.0, vault_before - draw);
        if r.capped {
            assert_eq!(draw, curve::bps_of(vault_before, 2_500));
            assert!(r.payout.0 < curve::bps_of(r.bought.0, 80_000));
            saw_capped = true;
        } else {
            assert_eq!(r.payout.0, curve::bps_of(r.bought.0, 80_000));
        }
        check_invariants(&m, 1);
    }
    assert!(saw_capped, "15 Mythics in a row should hit the cap");
    assert!(m.vault > 0);
    assert_eq!(m.stats.capped_pulls as usize, m.get_recent_pulls().iter().filter(|p| p.capped).count());
}

#[test]
fn recent_pulls_ring_buffer_keeps_last_50_newest_first() {
    let mut m = launch_with_buyers(1);
    for i in 0..12 {
        assert_eq!(pay(&mut m, &buyer(0), PACK * 5, &pack_msg(5), i), 0);
    }
    let pulls = m.get_recent_pulls();
    assert_eq!(m.pull_nonce, 60);
    assert_eq!(pulls.len(), 50);
    assert_eq!(pulls.first().unwrap().pull_id, 59);
    assert_eq!(pulls.last().unwrap().pull_id, 10);
}

#[test]
fn quote_matches_the_tokens_actually_bought() {
    let mut m = launch_with_buyers(1);
    let q = m.quote_pack(3);
    assert_eq!(q.fees.0, 3 * 70_000);
    assert_eq!(pay(&mut m, &buyer(0), PACK * 3, &pack_msg(3), 5), 0);
    let bought: u128 = m.get_recent_pulls().iter().map(|p| p.bought.0).sum();
    assert_eq!(q.bought.0, bought);
}

#[test]
fn pack_opened_is_a_nep297_event() {
    let mut m = launch_with_buyers(1);
    pay(&mut m, &buyer(0), PACK, &pack_msg(1), 3);
    let logs = get_logs();
    let ev = logs.iter().find(|l| l.contains("\"event\":\"pack_opened\"")).expect("pack_opened logged");
    assert!(ev.starts_with("EVENT_JSON:"));
    let v: serde_json::Value = serde_json::from_str(&ev["EVENT_JSON:".len()..]).unwrap();
    assert_eq!(v["standard"], "gaballs");
    assert_eq!(v["version"], "1.0.0");
    for field in ["buyer", "usdt_in", "tier", "multiplier_bps", "bought", "payout", "vault_after",
        "price_before", "price_after", "capped", "seed", "block"] {
        assert!(!v["data"][0][field].is_null(), "missing {field}");
    }
}

#[test]
fn sweep_fees_stub_moves_accruals_to_swept() {
    let mut m = launch_with_buyers(1);
    pay(&mut m, &buyer(0), PACK * 2, &pack_msg(2), 1);
    assert_eq!(m.fees.nft_accrued.0, 100_000);
    assert_eq!(m.fees.platform_accrued.0, 40_000);
    let f = m.sweep_fees();
    assert_eq!((f.nft_accrued.0, f.platform_accrued.0), (0, 0));
    assert_eq!((f.nft_swept.0, f.platform_swept.0), (100_000, 40_000));
    check_invariants(&m, 1);
}

// ------------------------------------------------------------------ token safety

#[test]
#[should_panic(expected = "cannot be sent to the machine account")]
fn tokens_cannot_be_sent_to_the_machine_account() {
    let mut m = launch_with_buyers(1);
    pay(&mut m, &buyer(0), PACK, &pack_msg(1), 1);
    ctx(buyer(0), 2);
    m.ft_transfer(machine_id(), U128(1), None);
}

#[test]
#[should_panic(expected = "storage_unregister is disabled")]
fn storage_unregister_is_disabled() {
    let mut m = launch_with_buyers(1);
    ctx(buyer(0), 1);
    m.storage_unregister(Some(true));
}

#[test]
fn launch_mints_exactly_1b_split_as_configured() {
    let m = launch_with_buyers(0);
    assert_eq!(m.token.total_supply, TOTAL_SUPPLY);
    assert_eq!(m.curve_tokens, 800_000_000 * ONE_TOKEN);
    assert_eq!(m.vault, 100_000_000 * ONE_TOKEN);
    assert_eq!(bal(&m, &creator()), 100_000_000 * ONE_TOKEN);
    assert_eq!(m.config.nft_token_id, "machine:gold.gaballs.testnet");
    assert!(get_logs().iter().any(|l| l.contains("\"event\":\"machine_launched\"")));
}

#[test]
fn smaller_creator_allocation_goes_to_the_curve() {
    ctx(acc("gaballs.testnet"), 0);
    let m = Machine::new(LaunchArgs { creator_allocation: U128(25_000_000 * ONE_TOKEN), ..default_args() });
    assert_eq!(m.curve_tokens, 875_000_000 * ONE_TOKEN);
}

#[test]
#[should_panic(expected = "creator_allocation is above 100M")]
fn creator_allocation_above_100m_is_rejected() {
    ctx(acc("gaballs.testnet"), 0);
    Machine::new(LaunchArgs { creator_allocation: U128(100_000_001 * ONE_TOKEN), ..default_args() });
}

// ------------------------------------------------------------------ walkthrough for the checkpoint

#[test]
fn walkthrough_first_pull() {
    let mut m = launch_with_buyers(1);
    let refund = pay(&mut m, &buyer(0), PACK, &pack_msg(1), 1);
    let p = &m.get_recent_pulls()[0];
    let (nft_fee, platform_fee) = (m.fees.nft_accrued.0, m.fees.platform_accrued.0);
    println!("--- one pull (default parameters, first pack on a fresh machine) ---");
    println!("USDT in                : {} USDT", usdt_str(p.usdt_in.0));
    println!("fee to Machine NFT     : {} USDT (0.50%)", usdt_str(nft_fee));
    println!("fee to platform        : {} USDT (0.20%)", usdt_str(platform_fee));
    println!("USDT into the curve    : {} USDT", usdt_str(p.usdt_to_curve.0));
    println!("price before           : {:.10} USDT/token", p.price_before.0 as f64 / 1e18);
    println!("tokens bought          : {}", tokens(p.bought.0));
    println!("price after            : {:.10} USDT/token", p.price_after.0 as f64 / 1e18);
    println!("roll                   : {} of 0..9999 -> {} ({}x)", p.roll, p.tier, p.multiplier_bps as f64 / 1e4);
    println!("payout to buyer        : {}", tokens(p.payout.0));
    println!("vault before -> after  : {} -> {}", tokens(100_000_000 * ONE_TOKEN), tokens(p.vault_after.0));
    println!("capped                 : {}", p.capped);
    println!("refund returned        : {refund}");
    println!("seed                   : {}", p.seed);
    assert_eq!(refund, 0);
    assert_eq!(bal(&m, &buyer(0)), p.payout.0);
    check_invariants(&m, 1);
}

// ------------------------------------------------------------------ machine card fields (frontend)

#[test]
fn machine_card_fields_at_launch() {
    let m = launch_with_buyers(0).get_machine();
    // 3,000 USDT / 800M tokens = 0.00000375 USDT; x 1B = 3,750 USDT.
    assert_eq!(m.market_cap_usdt.0, 3_750 * USDT);
    // Only the creator's 100M circulate at launch: 375 USDT.
    assert_eq!(m.circulating_supply.0, 100_000_000 * ONE_TOKEN);
    assert_eq!(m.circulating_market_cap_usdt.0, 375 * USDT);
    assert_eq!(m.packs_opened, 0);
    assert_eq!(m.best_multiplier_bps, 0);
    assert_eq!(m.vault.0, 100_000_000 * ONE_TOKEN);
    assert_eq!(m.price_usdt_wad.0, 3_750_000_000_000);
}

#[test]
fn machine_card_fields_track_pulls() {
    let mut m = launch_with_buyers(1);
    pay(&mut m, &buyer(0), PACK * 5, &pack_msg(5), 1);
    let v = m.get_machine();
    assert_eq!(v.packs_opened, 5);
    assert!(v.market_cap_usdt.0 > 3_750 * USDT, "price went up");
    assert_eq!(v.circulating_supply.0, 100_000_000 * ONE_TOKEN + bal(&m, &buyer(0)));
    let best = m.get_recent_pulls().iter().map(|p| p.payout.0 * 10_000 / p.bought.0).max().unwrap();
    assert_eq!(u128::from(v.best_multiplier_bps), best);
}

#[test]
fn best_multiplier_is_the_effective_one_after_the_cap() {
    let mut m = launch_with_buyers(1);
    for i in 0..3u64 {
        ctx(usdt(), i);
        m.pull_nonce = i + 1;
        m.settle_pack(&buyer(0), i, 9_999, odds::MYTHIC, [0; 32]);
    }
    // First Mythic is uncapped (8x); the 3rd is capped, so the best stays 8x from pull 0.
    let v = m.get_machine();
    assert_eq!(v.best_multiplier_bps, 80_000);
    assert_eq!(m.stats.best_pull_id, Some(0));
    assert!(m.get_recent_pulls()[0].capped);
}
