//! Unit tests for CLAUDE.md section 4 (machine contract), including Phase 5: VRF settlement and sell-back.

use super::*;
use ed25519_dalek::{Signer, SigningKey};
use near_contract_standards::fungible_token::FungibleTokenCore;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::storage_management::StorageManagement;
use near_sdk::test_utils::{VMContextBuilder, get_logs};
use near_sdk::{NearToken, PromiseOrValue, PromiseResult, RuntimeFeesConfig, test_vm_config, testing_env};

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

/// Stands in for OutLayer's VRF key. `forger()` is a different key: its proofs must be rejected.
fn vrf_key() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}
fn forger() -> SigningKey {
    SigningKey::from_bytes(&[9u8; 32])
}
fn hex(b: &[u8]) -> String {
    to_hex(b)
}

fn builder(predecessor: AccountId, seed: u64) -> VMContextBuilder {
    let mut random = [0u8; 32];
    random[..8].copy_from_slice(&seed.to_le_bytes());
    let mut b = VMContextBuilder::new();
    b.current_account_id(machine_id())
        .predecessor_account_id(predecessor)
        .random_seed(random)
        .block_height(1_000 + seed)
        .account_balance(NearToken::from_near(5))
        .attached_deposit(NearToken::from_yoctonear(1));
    b
}

/// Fresh call context. `seed` varies env::random_seed() and the block height like real blocks would.
fn ctx(predecessor: AccountId, seed: u64) {
    testing_env!(builder(predecessor, seed).build());
}

/// A callback context: the machine calling itself, with `result` as the promise result it receives.
fn callback_ctx(seed: u64, result: PromiseResult) {
    testing_env!(
        builder(machine_id(), seed).build(),
        test_vm_config(),
        RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
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
        vrf: VrfConfig {
            outlayer_contract: acc("outlayer.testnet"),
            project_id: "zavodil2.testnet/vrf-ark".into(),
            pubkey_hex: hex(vrf_key().verifying_key().as_bytes()),
        },
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

/// OutLayer's JSON result for `pending`, signed by `key`. `alpha` follows the worker's format.
fn proof_for(pending: &PendingPull, key: &SigningKey) -> Vec<u8> {
    let alpha = format!("vrf:{}:{}:{}", 50_000 + pending.request_id, pending.buyer, pending.seed);
    proof_with_alpha(&alpha, key)
}
fn proof_with_alpha(alpha: &str, key: &SigningKey) -> Vec<u8> {
    let sig = key.sign(alpha.as_bytes());
    json!({
        "results": [{ "alpha": alpha, "signature_hex": hex(&sig.to_bytes()), "value": 1234 }],
        "verification": {}
    })
    .to_string()
    .into_bytes()
}

/// Simulates the USDT contract calling ft_on_transfer. Returns the unused (refunded) amount.
fn request(m: &mut Machine, who: &AccountId, amount: u128, msg: &str, seed: u64) -> u128 {
    ctx(usdt(), seed);
    match m.ft_on_transfer(who.clone(), U128(amount), msg.to_string()) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("expected a value"),
    }
}

/// OutLayer's answer arrives for `request_id`.
fn deliver(m: &mut Machine, request_id: u64, result: PromiseResult, seed: u64) -> bool {
    callback_ctx(seed, result);
    m.on_vrf_result(request_id)
}

/// A full pack purchase: payment, then a valid VRF proof. Returns the amount refunded at payment time.
fn pay(m: &mut Machine, who: &AccountId, amount: u128, msg: &str, seed: u64) -> u128 {
    let refund = request(m, who, amount, msg, seed);
    if refund == 0 {
        let pending = m.get_pending_pull(m.request_nonce - 1).expect("pending pull recorded");
        assert!(deliver(m, pending.request_id, PromiseResult::Successful(proof_for(&pending, &vrf_key())), seed));
    }
    refund
}

fn no_vrf() -> VrfInfo {
    VrfInfo { request_id: 0, alpha: String::new(), signature_hex: String::new() }
}

fn bal(m: &Machine, a: &AccountId) -> u128 {
    m.token.ft_balance_of(a.clone()).0
}

/// Token invariant: supply is constant, the machine holds exactly curve + vault, and
/// curve + vault + every balance = 1B. USDT invariant: R + all fees = USDT received for settled packs - USDT paid
/// to sellers; USDT held for pending pulls is tracked separately and equals the sum of the pending entries.
fn check_invariants(m: &Machine, buyers: usize) {
    assert_eq!(m.token.total_supply, TOTAL_SUPPLY, "total supply changed");
    assert_eq!(bal(m, &machine_id()), m.curve_tokens + m.vault, "machine balance != curve + vault");
    let held: u128 = bal(m, &creator()) + (0..buyers).map(|i| bal(m, &buyer(i))).sum::<u128>();
    assert_eq!(m.curve_tokens + m.vault + held, TOTAL_SUPPLY, "curve + vault + balances != 1B");
    let f = &m.fees;
    // USDT received for settled packs - USDT paid to sellers = R + every fee (accrued or swept).
    assert_eq!(
        m.curve_usdt + f.nft_accrued.0 + f.platform_accrued.0 + f.nft_swept.0 + f.platform_swept.0,
        m.stats.total_usdt_in.0 - m.stats.total_sell_usdt_paid.0,
        "USDT invariant broken"
    );
    assert_eq!(m.pending_usdt, m.pending.values().map(|p| p.usdt.0).sum::<u128>(), "pending USDT != sum of pending");
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
    // 20,000 VRF signatures x 5 packs each (the most one payment can buy) = 100,000 rolls, derived exactly as
    // on_vrf_result does.
    let m = launch_with_buyers(0);
    let key = vrf_key();
    let mut counts = [0u64; 4];
    const SIGNATURES: u64 = 20_000;
    for i in 0..SIGNATURES {
        if i % 500 == 0 {
            ctx(usdt(), i); // fresh gas budget
        }
        let sig = key.sign(format!("vrf:{i}:buyer0.gaballs.testnet:gold.gaballs.testnet-{i}").as_bytes()).to_bytes();
        for (roll, _) in vrf::rolls(&sig, 5) {
            counts[odds::tier_for_roll(&m.odds, roll)] += 1;
        }
    }
    let rolls = SIGNATURES * 5;
    for (tier, &n) in m.odds.iter().zip(counts.iter()) {
        let observed_bps = n * 10_000 / rolls;
        let diff = observed_bps.abs_diff(u64::from(tier.chance_bps));
        println!("{:<7} expected {:>5.2}%  observed {:>5.2}%  ({n} rolls)", tier.name,
            f64::from(tier.chance_bps) / 100.0, n as f64 * 100.0 / rolls as f64);
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
    assert_eq!((m.pull_nonce, m.request_nonce), (0, 0));
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
        // Force a Mythic: call the settlement step directly, skipping the VRF roll (on_vrf_result normally
        // advances the nonce, so do that here too).
        m.pull_nonce = i + 1;
        let r = m.settle_pack(&buyer(0), i, 9_999, odds::MYTHIC, [0; 32], no_vrf());
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
        "price_before", "price_after", "capped", "seed", "block", "request_id", "vrf_alpha", "vrf_signature"] {
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
        m.settle_pack(&buyer(0), i, 9_999, odds::MYTHIC, [0; 32], no_vrf());
    }
    // First Mythic is uncapped (8x); the 3rd is capped, so the best stays 8x from pull 0.
    let v = m.get_machine();
    assert_eq!(v.best_multiplier_bps, 80_000);
    assert_eq!(m.stats.best_pull_id, Some(0));
    assert!(m.get_recent_pulls()[0].capped);
}

// ------------------------------------------------------------------ Phase 5: VRF settlement

/// Pays for `count` packs and returns the pending pull (no proof delivered yet).
fn pending_after_payment(m: &mut Machine, who: &AccountId, count: u32, seed: u64) -> PendingPull {
    assert_eq!(request(m, who, PACK * u128::from(count), &pack_msg(count), seed), 0, "payment accepted");
    m.get_pending_pull(m.request_nonce - 1).expect("pending pull")
}

/// The refund transfer's outcome arrives.
fn refund_result(m: &mut Machine, pending: &PendingPull, ok: bool, reason: &str, seed: u64) -> bool {
    callback_ctx(seed, if ok { PromiseResult::Successful(vec![]) } else { PromiseResult::Failed });
    m.on_refund_sent(pending.clone(), reason.to_string())
}

fn logged(needle: &str) -> bool {
    get_logs().iter().any(|l| l.contains(needle))
}

#[test]
fn payment_creates_a_pending_pull_and_a_vrf_request() {
    let mut m = launch_with_buyers(1);
    let p = pending_after_payment(&mut m, &buyer(0), 3, 1);
    assert_eq!(p.count, 3);
    assert_eq!(p.usdt.0, 3 * PACK);
    assert_eq!(p.seed, "gold.gaballs.testnet-0");
    assert_eq!(p.refundable_from_block, p.requested_at_block + VRF_TIMEOUT_BLOCKS);
    assert!(logged("\"event\":\"pack_requested\""));
    // Nothing settled yet: no packs, no fees, USDT held as pending.
    assert_eq!(m.stats.packs_opened, 0);
    assert_eq!(m.pending_usdt, 3 * PACK);
    assert_eq!(m.curve_usdt, 0);
    check_invariants(&m, 1);
}

#[test]
fn vrf_valid_proof_settles_with_rolls_derived_from_the_signature() {
    let mut m = launch_with_buyers(1);
    let p = pending_after_payment(&mut m, &buyer(0), 2, 1);
    let raw = proof_for(&p, &vrf_key());
    assert!(deliver(&mut m, p.request_id, PromiseResult::Successful(raw.clone()), 2));
    assert_eq!(m.stats.packs_opened, 2);
    assert_eq!(m.pending_usdt, 0);
    assert!(m.get_pending_pull(p.request_id).is_none());
    // The rolls are exactly SHA-256(signature) -> h_i -> mod 10,000; OutLayer's "value": 1234 is ignored.
    let resp: serde_json::Value = serde_json::from_slice(&raw).unwrap();
    let sig: [u8; 64] =
        vrf::from_hex(resp["results"][0]["signature_hex"].as_str().unwrap()).unwrap().try_into().unwrap();
    let expected = vrf::rolls(&sig, 2);
    let pulls = m.get_recent_pulls(); // newest first
    for (i, pull) in pulls.iter().rev().enumerate() {
        assert_eq!(pull.roll, expected[i].0);
        assert_eq!(pull.seed, hex(&expected[i].1));
        assert_eq!(pull.request_id, p.request_id);
        assert_eq!(pull.vrf_alpha, resp["results"][0]["alpha"].as_str().unwrap());
        assert_eq!(pull.vrf_signature, hex(&sig));
    }
    check_invariants(&m, 1);
}

#[test]
fn vrf_forged_proof_is_rejected_and_refunded() {
    let mut m = launch_with_buyers(1);
    let p = pending_after_payment(&mut m, &buyer(0), 1, 1);
    // Right format, right request, but signed by a key that is not OutLayer's.
    assert!(!deliver(&mut m, p.request_id, PromiseResult::Successful(proof_for(&p, &forger())), 2));
    assert!(logged("VRF signature does not verify"));
    assert_eq!(m.stats.packs_opened, 0);
    assert!(m.get_pending_pull(p.request_id).is_none(), "removed: the refund is on its way");
    assert_eq!(bal(&m, &buyer(0)), 0, "no tokens paid out");
    assert!(refund_result(&mut m, &p, true, "VRF signature does not verify", 3));
    assert_eq!((m.stats.refunds, m.stats.total_usdt_refunded.0), (1, PACK));
    assert!(logged("\"event\":\"pack_refunded\""));
    check_invariants(&m, 1);
}

#[test]
fn vrf_proof_for_another_request_or_a_tampered_alpha_is_rejected() {
    let mut m = launch_with_buyers(2);
    let p0 = pending_after_payment(&mut m, &buyer(0), 1, 1);
    let p1 = pending_after_payment(&mut m, &buyer(1), 1, 2);
    // A genuine OutLayer signature, but for request 1's seed, delivered as request 0's answer.
    assert!(!deliver(&mut m, p0.request_id, PromiseResult::Successful(proof_for(&p1, &vrf_key())), 3));
    assert!(logged("VRF proof is for a different request"));
    // Genuine signature over one alpha, presented with a different alpha.
    let good = proof_for(&p1, &vrf_key());
    let mut v: serde_json::Value = serde_json::from_slice(&good).unwrap();
    v["results"][0]["alpha"] = json!(format!("vrf:1:{}:{}", p1.buyer, p1.seed));
    assert!(!deliver(&mut m, p1.request_id, PromiseResult::Successful(v.to_string().into_bytes()), 4));
    assert!(logged("VRF signature does not verify"));
    assert_eq!(m.stats.packs_opened, 0);
    for bad in [
        "vrf::buyer0.gaballs.testnet:s",
        "vrf:12x:buyer0.gaballs.testnet:s",
        "vr:1:buyer0.gaballs.testnet:s",
        "vrf:1::s",
        "vrf:1:Not An Account:s",
        "vrf:1:buyer0.gaballs.testnet:s-extra",
        "vrf:1:buyer0.gaballs.testnet:",
    ] {
        assert!(!vrf::alpha_is_for(bad, "s"), "{bad}");
    }
    // Any valid signer is fine: the seed is what binds a proof to one pull.
    for good in ["vrf:1:buyer0.gaballs.testnet:s", "vrf:1:gold.gaballs.testnet:s", "vrf:1:someone.testnet:s"] {
        assert!(vrf::alpha_is_for(good, "s"), "{good}");
    }
}

#[test]
fn vrf_garbage_or_failed_result_is_refunded() {
    let mut m = launch_with_buyers(1);
    let p = pending_after_payment(&mut m, &buyer(0), 1, 1);
    assert!(!deliver(&mut m, p.request_id, PromiseResult::Successful(b"not json".to_vec()), 2));
    assert!(logged("VRF result is not valid JSON"));
    let p = pending_after_payment(&mut m, &buyer(0), 1, 3);
    assert!(!deliver(&mut m, p.request_id, PromiseResult::Failed, 4));
    assert!(logged("OutLayer VRF request failed"));
    assert_eq!(m.stats.packs_opened, 0);
    assert_eq!(m.pending_usdt, 0);
}

#[test]
fn vrf_duplicate_callback_is_ignored() {
    let mut m = launch_with_buyers(1);
    let p = pending_after_payment(&mut m, &buyer(0), 1, 1);
    let raw = proof_for(&p, &vrf_key());
    assert!(deliver(&mut m, p.request_id, PromiseResult::Successful(raw.clone()), 2));
    let (packs, paid) = (m.stats.packs_opened, bal(&m, &buyer(0)));
    // The same proof delivered again settles nothing.
    assert!(!deliver(&mut m, p.request_id, PromiseResult::Successful(raw), 3));
    assert!(logged("not pending (already settled or refunded)"));
    assert_eq!((m.stats.packs_opened, bal(&m, &buyer(0))), (packs, paid));
    check_invariants(&m, 1);
}

#[test]
fn vrf_timeout_refund_by_anyone_and_late_result_is_ignored() {
    let mut m = launch_with_buyers(1);
    let p = pending_after_payment(&mut m, &buyer(0), 2, 1);
    // Too early.
    testing_env!(builder(acc("anyone.testnet"), 5).block_height(p.refundable_from_block - 1).build());
    let early = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| m.refund_expired(p.request_id)));
    assert!(early.is_err(), "refund before the timeout must fail");
    // After the timeout, a stranger triggers it.
    testing_env!(builder(acc("anyone.testnet"), 5).block_height(p.refundable_from_block).build());
    m.refund_expired(p.request_id);
    assert!(m.get_pending_pull(p.request_id).is_none());
    assert_eq!(m.pending_usdt, 0);
    assert!(refund_result(&mut m, &p, true, "VRF timeout", 6));
    assert_eq!(m.stats.total_usdt_refunded.0, 2 * PACK);
    // The proof turns up late: ignored, no second payout.
    assert!(!deliver(&mut m, p.request_id, PromiseResult::Successful(proof_for(&p, &vrf_key())), 7));
    assert_eq!(m.stats.packs_opened, 0);
    assert_eq!(bal(&m, &buyer(0)), 0);
    check_invariants(&m, 1);
}

#[test]
fn failed_refund_goes_back_to_pending_and_can_be_retried_at_once() {
    let mut m = launch_with_buyers(1);
    let p = pending_after_payment(&mut m, &buyer(0), 1, 1);
    assert!(!deliver(&mut m, p.request_id, PromiseResult::Failed, 2));
    assert!(!refund_result(&mut m, &p, false, "OutLayer VRF request failed", 3));
    let back = m.get_pending_pull(p.request_id).expect("back in pending");
    assert!(back.refund_failed);
    assert_eq!(m.pending_usdt, PACK);
    // No waiting for the timeout to retry.
    ctx(acc("anyone.testnet"), 4);
    m.refund_expired(p.request_id);
    assert!(m.get_pending_pull(p.request_id).is_none());
    check_invariants(&m, 1);
}

#[test]
fn payment_is_refunded_when_the_machine_cannot_pay_for_vrf() {
    let mut m = launch_with_buyers(1);
    testing_env!(builder(usdt(), 1).account_balance(NearToken::from_millinear(1)).build());
    let refund = match m.ft_on_transfer(buyer(0), U128(PACK), pack_msg(1)) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => panic!("expected a value"),
    };
    assert_eq!(refund, PACK);
    assert_eq!(m.request_nonce, 0);
    assert!(logged("too low to pay for VRF"));
}

#[test]
fn pending_pulls_are_listed_per_buyer() {
    let mut m = launch_with_buyers(2);
    pending_after_payment(&mut m, &buyer(0), 1, 1);
    pending_after_payment(&mut m, &buyer(1), 2, 2);
    pending_after_payment(&mut m, &buyer(0), 3, 3);
    assert_eq!(m.get_pending(None).len(), 3);
    let mine: Vec<u64> = m.get_pending(Some(buyer(0))).iter().map(|p| p.request_id).collect();
    assert_eq!(mine, vec![0, 2]);
    assert_eq!(m.get_machine().pending_count, 3);
    assert_eq!(m.get_machine().pending_usdt.0, 6 * PACK);
}

// ------------------------------------------------------------------ Phase 5: sell-back

/// Reference: usdt_out = floor((V+R) * s / (T+s)), the same quantity as (V+R) - ceil((V+R)*T/(T+s)).
fn reference_usdt_out(v: u128, r: u128, t: u128, s: u128) -> u128 {
    (curve::U256::from(v + r) * curve::U256::from(s) / (curve::U256::from(t) + curve::U256::from(s))).as_u128()
}

#[test]
fn curve_sell_matches_reference_and_rounds_for_the_contract() {
    let mut rng = Rng(99);
    for _ in 0..20_000 {
        let v = rng.range(1_000 * USDT, 100_000 * USDT);
        let r = rng.range(0, 10_000_000 * USDT);
        let t = rng.range(ONE_TOKEN, 900_000_000 * ONE_TOKEN);
        let s = rng.range(1, 100_000_000 * ONE_TOKEN);
        let out = curve::usdt_out(v, r, t, s);
        assert_eq!(out, reference_usdt_out(v, r, t, s), "v={v} r={r} t={t} s={s}");
        // The product never shrinks: (V+R-out) * (T+s) >= (V+R) * T.
        let k = curve::U256::from(v) + curve::U256::from(r);
        assert!(
            (k - curve::U256::from(out)) * (curve::U256::from(t) + curve::U256::from(s)) >= k * curve::U256::from(t)
        );
    }
}

/// Buys `packs` packs for buyer 0 so the curve holds real USDT; returns the buyer's token balance.
fn buy_some(m: &mut Machine, packs: u64) -> u128 {
    for i in 0..packs {
        assert_eq!(pay(m, &buyer(0), PACK, &pack_msg(1), 10 + i), 0);
    }
    bal(m, &buyer(0))
}

/// The seller calls sell() (1 yoctoNEAR attached).
fn sell(m: &mut Machine, who: &AccountId, amount: u128, min_out: u128, seed: u64) {
    ctx(who.clone(), seed);
    let _ = m.sell(U128(amount), U128(min_out));
}

#[test]
fn sell_pays_the_curve_price_minus_fees() {
    let mut m = launch_with_buyers(1);
    let held = buy_some(&mut m, 10);
    let amount = held / 2;
    let (r0, t0) = (m.curve_usdt, m.curve_tokens);
    let (nft0, plat0, price0) = (m.fees.nft_accrued.0, m.fees.platform_accrued.0, m.price());
    let q = m.quote_sell(U128(amount));
    let gross = curve::usdt_out(3_000 * USDT, r0, t0, amount);
    assert_eq!(q.usdt_gross.0, gross);
    assert_eq!(q.nft_fee.0, gross * 50 / 10_000);
    assert_eq!(q.platform_fee.0, gross * 20 / 10_000);
    assert_eq!(q.usdt_out.0, gross - q.nft_fee.0 - q.platform_fee.0);

    sell(&mut m, &buyer(0), amount, q.usdt_out.0, 50);
    assert_eq!(bal(&m, &buyer(0)), held - amount);
    assert_eq!(m.curve_usdt, r0 - gross);
    assert_eq!(m.curve_tokens, t0 + amount);
    assert_eq!(m.fees.nft_accrued.0, nft0 + q.nft_fee.0);
    assert_eq!(m.fees.platform_accrued.0, plat0 + q.platform_fee.0);
    assert!(m.price() < price0, "selling lowers the price");
    assert_eq!(m.price(), q.price_after.0);
    assert!(logged("\"event\":\"tokens_sold\""));
    // The transfer succeeds.
    callback_ctx(51, PromiseResult::Successful(vec![]));
    let paid = m.on_sell_transfer(buyer(0), U128(amount), q.usdt_gross, q.nft_fee, q.platform_fee);
    assert_eq!(paid, q.usdt_out);
    check_invariants(&m, 1);
}

#[test]
#[should_panic(expected = "slippage")]
fn sell_slippage_guard() {
    let mut m = launch_with_buyers(1);
    let held = buy_some(&mut m, 3);
    let q = m.quote_sell(U128(held));
    sell(&mut m, &buyer(0), held, q.usdt_out.0 + 1, 50);
}

#[test]
#[should_panic(expected = "the curve holds only")]
fn sell_that_would_push_the_reserve_below_zero_is_rejected() {
    // Straight after launch R = 0: the creator's 100M tokens would need USDT the curve does not have.
    let mut m = launch_with_buyers(0);
    sell(&mut m, &creator(), 100_000_000 * ONE_TOKEN, 0, 1);
}

#[test]
fn a_full_round_trip_never_pays_out_more_than_the_reserve() {
    // Buyer buys, then sells everything back: R never goes negative, and the curve keeps all fees.
    let mut m = launch_with_buyers(1);
    let held = buy_some(&mut m, 20);
    let q = m.quote_sell(U128(held));
    assert!(q.usdt_gross.0 <= m.curve_usdt);
    sell(&mut m, &buyer(0), held, 0, 60);
    callback_ctx(61, PromiseResult::Successful(vec![]));
    m.on_sell_transfer(buyer(0), U128(held), q.usdt_gross, q.nft_fee, q.platform_fee);
    assert_eq!(bal(&m, &buyer(0)), 0);
    println!(
        "round trip: paid {} USDT for 20 packs, sold back for {} USDT; curve keeps {} USDT",
        usdt_str(20 * PACK),
        usdt_str(q.usdt_out.0),
        usdt_str(m.curve_usdt)
    );
    assert!(q.usdt_out.0 < 20 * PACK);
    check_invariants(&m, 1);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn sell_requires_one_yocto() {
    let mut m = launch_with_buyers(1);
    let held = buy_some(&mut m, 2);
    testing_env!(builder(buyer(0), 70).attached_deposit(NearToken::from_yoctonear(0)).build());
    let _ = m.sell(U128(held), U128(0));
}

#[test]
#[should_panic(expected = "The account doesn't have enough balance")]
fn cannot_sell_more_than_you_hold() {
    let mut m = launch_with_buyers(1);
    let held = buy_some(&mut m, 2);
    sell(&mut m, &buyer(0), held + 1, 0, 70);
}

#[test]
fn failed_sell_transfer_restores_everything() {
    let mut m = launch_with_buyers(1);
    let held = buy_some(&mut m, 10);
    let snapshot = |m: &Machine| {
        (m.curve_usdt, m.curve_tokens, m.fees.nft_accrued.0, m.fees.platform_accrued.0, bal(m, &buyer(0)), m.price())
    };
    let before = snapshot(&m);
    let amount = held / 3;
    let q = m.quote_sell(U128(amount));
    sell(&mut m, &buyer(0), amount, 0, 80);
    callback_ctx(81, PromiseResult::Failed);
    let paid = m.on_sell_transfer(buyer(0), U128(amount), q.usdt_gross, q.nft_fee, q.platform_fee);
    assert_eq!(paid.0, 0);
    assert_eq!(snapshot(&m), before);
    assert_eq!(m.stats.sells, 0);
    assert!(logged("\"event\":\"sell_undone\""));
    check_invariants(&m, 1);
}

#[test]
fn failed_sell_after_a_sweep_restores_what_the_machine_still_holds() {
    let mut m = launch_with_buyers(1);
    let held = buy_some(&mut m, 10);
    let amount = held / 3;
    let q = m.quote_sell(U128(amount));
    sell(&mut m, &buyer(0), amount, 0, 80);
    ctx(acc("anyone.testnet"), 81);
    m.sweep_fees(); // the sale's fees leave the machine before the sell callback
    callback_ctx(82, PromiseResult::Failed);
    m.on_sell_transfer(buyer(0), U128(amount), q.usdt_gross, q.nft_fee, q.platform_fee);
    assert_eq!(bal(&m, &buyer(0)), held, "seller has all tokens back");
    check_invariants(&m, 1);
}

#[test]
fn walkthrough_one_sell() {
    let mut m = launch_with_buyers(1);
    let held = buy_some(&mut m, 5);
    let amount = held / 2;
    let q = m.quote_sell(U128(amount));
    let (r0, price0) = (m.curve_usdt, m.price());
    sell(&mut m, &buyer(0), amount, q.usdt_out.0, 90);
    println!("--- one sell (after 5 packs on a fresh machine) ---");
    println!("tokens sold            : {}", tokens(amount));
    println!("price before           : {:.10} USDT/token", price0 as f64 / 1e18);
    println!(
        "USDT out of the curve  : {} USDT (R {} -> {})",
        usdt_str(q.usdt_gross.0),
        usdt_str(r0),
        usdt_str(m.curve_usdt)
    );
    println!("fee to Machine NFT     : {} USDT (0.50%)", usdt_str(q.nft_fee.0));
    println!("fee to platform        : {} USDT (0.20%)", usdt_str(q.platform_fee.0));
    println!("seller receives        : {} USDT", usdt_str(q.usdt_out.0));
    println!("price after            : {:.10} USDT/token", m.price() as f64 / 1e18);
    check_invariants(&m, 1);
}

// ------------------------------------------------------------------ Squads: the proof's signer is not the buyer

#[test]
fn vrf_proof_for_another_request_of_the_same_buyer_is_rejected() {
    let mut m = launch_with_buyers(1);
    let p0 = pending_after_payment(&mut m, &buyer(0), 1, 1);
    let p1 = pending_after_payment(&mut m, &buyer(0), 1, 2);
    // Genuine OutLayer signature, same buyer, same machine, but request 1's seed delivered as request 0's answer.
    assert!(!deliver(&mut m, p0.request_id, PromiseResult::Successful(proof_for(&p1, &vrf_key())), 3));
    assert!(logged("VRF proof is for a different request"));
    assert_eq!(m.stats.packs_opened, 0);
}

#[test]
fn vrf_proof_from_another_machine_is_rejected() {
    let mut m = launch_with_buyers(1);
    let p = pending_after_payment(&mut m, &buyer(0), 1, 1);
    // Genuine OutLayer signature for the same request number on a different machine (its seed names that machine).
    let alpha = format!("vrf:50000:{}:other.gaballs.testnet-{}", p.buyer, p.request_id);
    assert!(!deliver(&mut m, p.request_id, PromiseResult::Successful(proof_with_alpha(&alpha, &vrf_key())), 2));
    assert!(logged("VRF proof is for a different request"));
    assert_eq!(m.stats.packs_opened, 0);
}

#[test]
fn vrf_proof_naming_a_different_signer_with_the_right_seed_is_accepted_and_pays_the_buyer() {
    // A Sputnik DAO pays (sender_id = the DAO), but the transaction that executes the proposal is signed by the member
    // who cast the deciding vote, and OutLayer puts that signer in the alpha.
    ctx(acc("gaballs.testnet"), 0);
    let mut m = Machine::new(default_args());
    let dao = acc("squad.sputnikv2.testnet");
    m.token.internal_register_account(&dao);
    let p = pending_after_payment(&mut m, &dao, 2, 1);
    let alpha = format!("vrf:50000:buyer2.gaballs.testnet:{}", p.seed);
    assert!(deliver(&mut m, p.request_id, PromiseResult::Successful(proof_with_alpha(&alpha, &vrf_key())), 2));
    assert_eq!(m.stats.packs_opened, 2);
    let paid: u128 = m.get_recent_pulls().iter().map(|r| r.payout.0).sum();
    assert_eq!(bal(&m, &dao), paid, "the prize goes to the buyer (the DAO), not to the signer");
    assert_eq!(bal(&m, &acc("buyer2.gaballs.testnet")), 0);
    assert!(m.get_recent_pulls().iter().all(|r| r.buyer == dao && r.vrf_alpha == alpha));
    // Supply invariant with the DAO as the only holder besides the creator (check_invariants only knows buyer(i)).
    assert_eq!(m.curve_tokens + m.vault + bal(&m, &creator()) + bal(&m, &dao), TOTAL_SUPPLY);
}
