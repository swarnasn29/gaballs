//! Unit tests: one per docs/THREAT_MODEL.md threat that can be checked without a live chain.
//! (T3 end-to-end, T8 and the full transfer story are covered by the sandbox tests in tests/sandbox.)

use super::*;
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{PromiseResult, testing_env};

const DEPOSIT: NearToken = NearToken::from_millinear(100);

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn factory() -> AccountId {
    acc("gaballs.testnet")
}
fn usdt() -> AccountId {
    acc("usdt.gaballs.testnet")
}
fn machine() -> AccountId {
    acc("gold.gaballs.testnet")
}
fn seller() -> AccountId {
    acc("seller.testnet")
}
fn buyer() -> AccountId {
    acc("buyer.testnet")
}
fn token() -> TokenId {
    machine_token_id(&machine())
}

fn ctx(predecessor: AccountId, deposit: NearToken) {
    testing_env!(
        VMContextBuilder::new()
            .current_account_id(acc("nft.gaballs.testnet"))
            .predecessor_account_id(predecessor)
            .attached_deposit(deposit)
            .build()
    );
}

/// Context for a callback, with the given result of the promise it is waiting on.
fn ctx_callback(result: PromiseResult) {
    let nft = acc("nft.gaballs.testnet");
    testing_env!(
        VMContextBuilder::new().current_account_id(nft.clone()).predecessor_account_id(nft).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
}

/// NFT contract with one Machine NFT owned by `seller`.
fn setup() -> GaballsNft {
    ctx(factory(), NearToken::from_near(0));
    let mut c = GaballsNft::new(factory(), usdt());
    ctx(factory(), DEPOSIT);
    c.mint_machine_nft(seller(), machine());
    c
}

/// The machine sweeps `amount` USDT of fees into the token (via the USDT contract).
fn credit(c: &mut GaballsNft, amount: u128) -> u128 {
    ctx(usdt(), NearToken::from_near(0));
    let msg = json!({ "token_id": token() }).to_string();
    match c.ft_on_transfer(machine(), U128(amount), msg) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => unreachable!(),
    }
}

fn balance(c: &GaballsNft) -> u128 {
    c.get_fee_balance(token()).0
}

fn transfer(c: &mut GaballsNft, from: AccountId, to: AccountId, approval_id: Option<u64>) {
    ctx(from, NearToken::from_yoctonear(1));
    c.nft_transfer(to, token(), approval_id, None);
}

fn claim(c: &mut GaballsNft, who: AccountId) {
    ctx(who, NearToken::from_yoctonear(1));
    let _ = c.claim(token());
}

fn panics(f: impl FnOnce()) -> bool {
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).is_err()
}

// ---------------------------------------------------------------------------- basics

#[test]
fn credit_from_bound_machine_lands_on_token() {
    let mut c = setup();
    assert_eq!(credit(&mut c, 500_000_000), 0);
    assert_eq!(balance(&c), 500_000_000);
    let h = c.get_fee_history(token());
    assert_eq!(h.len(), 1);
    assert_eq!(h[0].kind, FeeEntryKind::Credit);
}

#[test]
fn fee_history_keeps_last_20() {
    let mut c = setup();
    for i in 1..=25 {
        credit(&mut c, i);
    }
    let h = c.get_fee_history(token());
    assert_eq!(h.len(), FEE_HISTORY_LEN);
    assert_eq!(h.first().unwrap().amount.0, 6);
    assert_eq!(h.last().unwrap().amount.0, 25);
}

// ---------------------------------------------------------------------------- T1: claim front-run on a listed sale

#[test]
fn claim_blocked_while_approved() {
    let mut c = setup();
    credit(&mut c, 500);
    ctx(seller(), DEPOSIT);
    c.nft_approve(token(), acc("market.testnet"), None);
    assert!(panics(|| claim(&mut c, seller())), "claim must fail while listed");
    assert_eq!(balance(&c), 500);
}

#[test]
fn revoke_invalidates_listing_approval_id() {
    let mut c = setup();
    let market = acc("market.testnet");
    ctx(seller(), DEPOSIT);
    c.nft_approve(token(), market.clone(), None); // approval_id 1 = the listing
    ctx(seller(), NearToken::from_yoctonear(1));
    c.nft_revoke_all(token());
    ctx(seller(), DEPOSIT);
    c.nft_approve(token(), market.clone(), None); // approval_id 2
    // The marketplace executes the old listing (approval_id 1): rejected.
    assert!(panics(|| transfer(&mut c, market.clone(), buyer(), Some(1))));
    assert_eq!(c.nft_token(token()).unwrap().owner_id, seller());
}

// ---------------------------------------------------------------------------- T2: approval left behind

#[test]
fn transfer_clears_approvals() {
    let mut c = setup();
    let alt = acc("seller-alt.testnet");
    ctx(seller(), DEPOSIT);
    c.nft_approve(token(), alt.clone(), None);
    transfer(&mut c, seller(), buyer(), None);
    assert!(c.nft_token(token()).unwrap().approved_account_ids.unwrap().is_empty());
    assert!(!c.nft_is_approved(token(), alt, None));
}

#[test]
fn old_approved_account_cannot_transfer_or_claim() {
    let mut c = setup();
    let alt = acc("seller-alt.testnet");
    credit(&mut c, 500);
    ctx(seller(), DEPOSIT);
    c.nft_approve(token(), alt.clone(), None);
    transfer(&mut c, seller(), buyer(), None);
    assert!(panics(|| transfer(&mut c, alt.clone(), seller(), None)), "stale approval must not move the token");
    assert!(panics(|| claim(&mut c, alt.clone())), "approved accounts never claim");
    assert_eq!(c.nft_token(token()).unwrap().owner_id, buyer());
    assert_eq!(balance(&c), 500);
}

// ---------------------------------------------------------------------------- T3: transfer during sweep

#[test]
fn sweep_credits_token_not_owner() {
    let mut c = setup();
    credit(&mut c, 300);
    transfer(&mut c, seller(), buyer(), None);
    credit(&mut c, 200); // a sweep that was in flight lands after the sale
    assert_eq!(balance(&c), 500);
    assert!(panics(|| claim(&mut c, seller())), "old owner cannot claim");
    claim(&mut c, buyer());
    assert_eq!(balance(&c), 0);
}

// ---------------------------------------------------------------------------- T4 / T5: failed claim restore

#[test]
fn failed_claim_restores_to_token_after_transfer() {
    let mut c = setup();
    credit(&mut c, 500);
    claim(&mut c, seller()); // balance -> 0, USDT transfer in flight
    transfer(&mut c, seller(), buyer(), None);
    ctx_callback(PromiseResult::Failed);
    assert!(!c.on_claim(token(), seller(), U128(500)));
    assert_eq!(balance(&c), 500, "restored to the token");
    assert!(panics(|| claim(&mut c, seller())));
    claim(&mut c, buyer()); // the new owner gets it
}

#[test]
fn failed_claim_restore_adds_not_sets() {
    let mut c = setup();
    credit(&mut c, 500);
    claim(&mut c, seller());
    credit(&mut c, 70); // a new sweep lands while the claim is in flight
    ctx_callback(PromiseResult::Failed);
    c.on_claim(token(), seller(), U128(500));
    assert_eq!(balance(&c), 570);
    let kinds: Vec<_> = c.get_fee_history(token()).into_iter().map(|e| e.kind).collect();
    assert_eq!(kinds, [FeeEntryKind::Credit, FeeEntryKind::Claim, FeeEntryKind::Credit, FeeEntryKind::ClaimRestored]);
}

#[test]
fn successful_claim_does_not_restore() {
    let mut c = setup();
    credit(&mut c, 500);
    claim(&mut c, seller());
    ctx_callback(PromiseResult::Successful(vec![]));
    assert!(c.on_claim(token(), seller(), U128(500)));
    assert_eq!(balance(&c), 0);
}

// ---------------------------------------------------------------------------- T6: double claim

#[test]
#[should_panic(expected = "Nothing to claim")]
fn double_claim_second_fails() {
    let mut c = setup();
    credit(&mut c, 500);
    claim(&mut c, seller());
    claim(&mut c, seller());
}

// ---------------------------------------------------------------------------- T7: fake revenue

#[test]
#[should_panic(expected = "Only the USDT contract can call ft_on_transfer")]
fn fake_ft_on_transfer_rejected() {
    let mut c = setup();
    ctx(seller(), NearToken::from_near(0));
    let _ = c.ft_on_transfer(machine(), U128(1_000_000), json!({ "token_id": token() }).to_string());
}

#[test]
fn usdt_from_non_machine_refunded() {
    let mut c = setup();
    ctx(usdt(), NearToken::from_near(0));
    let msg = json!({ "token_id": token() }).to_string();
    let refunded = match c.ft_on_transfer(seller(), U128(1_000_000), msg) {
        PromiseOrValue::Value(v) => v.0,
        PromiseOrValue::Promise(_) => unreachable!(),
    };
    assert_eq!(refunded, 1_000_000);
    assert_eq!(balance(&c), 0);
    assert!(c.get_fee_history(token()).is_empty());
}

#[test]
fn credit_with_bad_msg_or_unknown_token_refunded() {
    let mut c = setup();
    ctx(usdt(), NearToken::from_near(0));
    for msg in ["".to_string(), json!({ "token_id": "machine:other.testnet" }).to_string()] {
        match c.ft_on_transfer(machine(), U128(10), msg) {
            PromiseOrValue::Value(v) => assert_eq!(v.0, 10),
            PromiseOrValue::Promise(_) => unreachable!(),
        }
    }
}

// ---------------------------------------------------------------------------- T9: second Machine NFT

#[test]
#[should_panic(expected = "Only the factory can mint Machine NFTs")]
fn mint_machine_nft_only_factory() {
    let mut c = setup();
    ctx(seller(), DEPOSIT);
    c.mint_machine_nft(seller(), acc("other.gaballs.testnet"));
}

#[test]
#[should_panic(expected = "token_id must be unique")]
fn mint_machine_nft_twice_fails() {
    let mut c = setup();
    ctx(factory(), DEPOSIT);
    c.mint_machine_nft(seller(), machine());
}

#[test]
#[should_panic(expected = "Attach at least")]
fn mint_requires_storage_deposit() {
    ctx(factory(), NearToken::from_near(0));
    let mut c = GaballsNft::new(factory(), usdt());
    ctx(factory(), NearToken::from_yoctonear(1));
    c.mint_machine_nft(seller(), machine());
}

// ---------------------------------------------------------------------------- T10: transfer_call revert

#[test]
fn transfer_call_revert_keeps_balance_with_token() {
    let mut c = setup();
    credit(&mut c, 500);
    let receiver = acc("receiver-contract.testnet");
    ctx(seller(), NearToken::from_yoctonear(1));
    let _ = c.nft_transfer_call(receiver.clone(), token(), None, None, "return it".into());
    // The receiver answers `true` = "give it back".
    ctx_callback(PromiseResult::Successful(b"true".to_vec()));
    assert!(!c.nft_resolve_transfer(seller(), receiver, token(), Some(HashMap::new())));
    assert_eq!(c.nft_token(token()).unwrap().owner_id, seller());
    assert_eq!(balance(&c), 500, "balance never moves on transfer or revert");
}

// ---------------------------------------------------------------------------- T11 / T12: certificates

fn setup_with_cert() -> (GaballsNft, TokenId) {
    let mut c = setup();
    ctx(machine(), DEPOSIT);
    let t = c.mint_certificate(buyer(), machine(), 42);
    (c, t.token_id)
}

#[test]
fn certificate_minted_by_registered_machine() {
    let (c, id) = setup_with_cert();
    assert_eq!(id, "cert:gold.gaballs.testnet:42");
    assert_eq!(c.nft_token(id).unwrap().owner_id, buyer());
}

#[test]
#[should_panic(expected = "soulbound")]
fn certificate_transfer_fails() {
    let (mut c, id) = setup_with_cert();
    ctx(buyer(), NearToken::from_yoctonear(1));
    c.nft_transfer(seller(), id, None, None);
}

#[test]
#[should_panic(expected = "soulbound")]
fn certificate_transfer_call_fails() {
    let (mut c, id) = setup_with_cert();
    ctx(buyer(), NearToken::from_yoctonear(1));
    let _ = c.nft_transfer_call(seller(), id, None, None, String::new());
}

#[test]
#[should_panic(expected = "soulbound")]
fn certificate_approve_fails() {
    let (mut c, id) = setup_with_cert();
    ctx(buyer(), DEPOSIT);
    c.nft_approve(id, seller(), None);
}

#[test]
#[should_panic(expected = "Only Machine NFTs hold fees")]
fn claim_on_certificate_fails() {
    let (mut c, id) = setup_with_cert();
    ctx(buyer(), NearToken::from_yoctonear(1));
    let _ = c.claim(id);
}

#[test]
#[should_panic(expected = "Only a registered machine can mint certificates")]
fn mint_certificate_only_registered_machine() {
    let mut c = setup();
    let rogue = acc("rogue.testnet");
    ctx(rogue.clone(), DEPOSIT);
    c.mint_certificate(buyer(), rogue, 1);
}

#[test]
#[should_panic(expected = "Only a registered machine can mint certificates")]
fn machine_cannot_mint_certificate_for_another_machine() {
    let mut c = setup();
    ctx(machine(), DEPOSIT);
    c.mint_certificate(buyer(), acc("other.gaballs.testnet"), 1);
}

// ---------------------------------------------------------------------------- T13: non-owner claim

#[test]
#[should_panic(expected = "Only the current owner can claim")]
fn only_owner_can_claim() {
    let mut c = setup();
    credit(&mut c, 500);
    claim(&mut c, buyer());
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn claim_requires_one_yocto() {
    let mut c = setup();
    credit(&mut c, 500);
    ctx(seller(), NearToken::from_near(0));
    let _ = c.claim(token());
}
