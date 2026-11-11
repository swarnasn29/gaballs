use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{PromiseResult, testing_env};

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn owner() -> AccountId {
    acc("gaballs.testnet")
}
fn creator() -> AccountId {
    acc("creator.testnet")
}
const FAKE_WASM: &[u8] = b"\0asm\x01\0\0\0 machine code";

fn ctx(predecessor: AccountId, deposit: NearToken, input: &[u8]) {
    let mut context = VMContextBuilder::new()
        .current_account_id(owner())
        .predecessor_account_id(predecessor)
        .attached_deposit(deposit)
        .build();
    context.input = input.into();
    testing_env!(context);
}

fn ctx_callback(result: PromiseResult) {
    testing_env!(
        VMContextBuilder::new().current_account_id(owner()).predecessor_account_id(owner()).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
}

fn factory_with_code() -> Factory {
    ctx(owner(), NearToken::from_near(0), b"");
    let mut f = Factory::new(owner(), acc("nft.gaballs.testnet"), acc("usdt.gaballs.testnet"), owner());
    ctx(owner(), NearToken::from_near(0), FAKE_WASM);
    f.set_machine_code();
    ctx(owner(), NearToken::from_near(0), b"");
    f.set_vrf_config(test_vrf());
    f
}

fn test_vrf() -> VrfConfig {
    VrfConfig {
        outlayer_contract: acc("outlayer.testnet"),
        project_id: "zavodil2.testnet/vrf-ark".into(),
        pubkey_hex: "c0c5aeae1688c2f7cc2350aae1ee3ce96eddc0de84d678db873de48268f8cfa8".into(),
    }
}

fn launch(f: &mut Factory, symbol: &str, deposit: NearToken) {
    ctx(creator(), deposit, b"");
    let _ = f.launch("Gold Gacha".into(), symbol.into(), None, U128(0));
}

#[test]
fn set_machine_code_stores_len_and_hash() {
    let f = factory_with_code();
    let c = f.get_config();
    assert_eq!(c.machine_code_len, FAKE_WASM.len() as u64);
    assert_eq!(c.machine_code_sha256.unwrap().len(), 64);
}

#[test]
#[should_panic(expected = "Only the owner can set the machine code")]
fn set_machine_code_owner_only() {
    let mut f = factory_with_code();
    ctx(creator(), NearToken::from_near(0), FAKE_WASM);
    f.set_machine_code();
}

#[test]
#[should_panic(expected = "Input is not a wasm binary")]
fn set_machine_code_rejects_non_wasm() {
    let mut f = factory_with_code();
    ctx(owner(), NearToken::from_near(0), b"hello");
    f.set_machine_code();
}

#[test]
fn launch_cost_covers_code_reserve_nft_and_usdt() {
    let f = factory_with_code();
    let expected = env::storage_byte_cost()
        .saturating_mul(FAKE_WASM.len() as u128)
        .saturating_add(MACHINE_RESERVE)
        .saturating_add(NFT_MINT_DEPOSIT)
        .saturating_add(USDT_STORAGE_DEPOSIT);
    assert_eq!(f.get_launch_cost(), expected);
}

#[test]
#[should_panic(expected = "Attach at least")]
fn launch_requires_launch_cost() {
    let mut f = factory_with_code();
    let short = f.get_launch_cost().saturating_sub(NearToken::from_yoctonear(1));
    launch(&mut f, "GOLD", short);
}

#[test]
#[should_panic(expected = "symbol must be 2-12 letters or digits")]
fn launch_rejects_bad_symbol() {
    let mut f = factory_with_code();
    let cost = f.get_launch_cost();
    launch(&mut f, "GO.LD", cost);
}

#[test]
#[should_panic(expected = "Machine code not set")]
fn launch_requires_machine_code() {
    ctx(owner(), NearToken::from_near(0), b"");
    let mut f = Factory::new(owner(), acc("nft.gaballs.testnet"), acc("usdt.gaballs.testnet"), owner());
    launch(&mut f, "GOLD", NearToken::from_near(10));
}

#[test]
fn successful_launch_is_recorded() {
    let mut f = factory_with_code();
    ctx_callback(PromiseResult::Successful(vec![]));
    let machine = acc("gold.gaballs.testnet");
    assert!(f.on_launched(machine.clone(), creator(), "Gold Gacha".into(), "GOLD".into(), NearToken::from_near(3)));
    let list = f.get_machines(None, None);
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].account_id, machine);
    assert_eq!(list[0].nft_token_id, "machine:gold.gaballs.testnet");
}

#[test]
fn failed_launch_is_not_recorded() {
    let mut f = factory_with_code();
    ctx_callback(PromiseResult::Failed);
    assert!(!f.on_launched(acc("gold.gaballs.testnet"), creator(), "Gold".into(), "GOLD".into(), NearToken::from_near(3)));
    assert!(f.get_machines(None, None).is_empty());
}

#[test]
#[should_panic(expected = "A machine with this symbol already exists")]
fn launch_rejects_duplicate_symbol() {
    let mut f = factory_with_code();
    ctx_callback(PromiseResult::Successful(vec![]));
    f.on_launched(acc("gold.gaballs.testnet"), creator(), "Gold".into(), "GOLD".into(), NearToken::from_near(3));
    let cost = f.get_launch_cost();
    launch(&mut f, "gold", cost);
}

// ------------------------------------------------------------------ retry_machine_setup

fn gold() -> AccountId {
    acc("gold.gaballs.testnet")
}

/// A launched machine whose setup callbacks have not reported yet (both flags false).
fn launched() -> Factory {
    let mut f = factory_with_code();
    ctx_callback(PromiseResult::Successful(vec![]));
    f.on_launched(gold(), creator(), "Gold".into(), "GOLD".into(), NearToken::from_near(3));
    f
}

fn info(f: &Factory) -> MachineInfo {
    f.get_machine(gold()).unwrap()
}

#[test]
fn setup_flags_follow_callback_results() {
    let mut f = launched();
    assert!(!info(&f).nft_minted && !info(&f).usdt_registered);
    ctx_callback(PromiseResult::Successful(vec![]));
    assert!(f.on_usdt_registered(gold()));
    ctx_callback(PromiseResult::Failed);
    assert!(!f.on_nft_minted(gold()));
    assert!(info(&f).usdt_registered);
    assert!(!info(&f).nft_minted);
}

#[test]
fn retry_cost_covers_only_missing_steps() {
    let mut f = launched();
    assert_eq!(f.get_retry_cost(gold()), NFT_MINT_DEPOSIT.saturating_add(USDT_STORAGE_DEPOSIT));
    ctx_callback(PromiseResult::Successful(vec![]));
    f.on_usdt_registered(gold());
    assert_eq!(f.get_retry_cost(gold()), NFT_MINT_DEPOSIT);
}

#[test]
fn retry_after_failed_mint_succeeds_and_completes() {
    let mut f = launched();
    ctx_callback(PromiseResult::Successful(vec![]));
    f.on_usdt_registered(gold());
    ctx_callback(PromiseResult::Failed);
    f.on_nft_minted(gold());
    // Anyone (here a stranger) can pay for the retry; the NFT still goes to the recorded creator.
    ctx(acc("stranger.testnet"), NFT_MINT_DEPOSIT, b"");
    f.retry_machine_setup(gold());
    ctx_callback(PromiseResult::Successful(vec![]));
    assert!(f.on_nft_minted(gold()));
    assert!(info(&f).nft_minted && info(&f).usdt_registered);
    assert_eq!(info(&f).creator, creator());
}

#[test]
#[should_panic(expected = "Machine setup is already complete")]
fn retry_rejected_when_setup_complete() {
    let mut f = launched();
    ctx_callback(PromiseResult::Successful(vec![]));
    f.on_usdt_registered(gold());
    ctx_callback(PromiseResult::Successful(vec![]));
    f.on_nft_minted(gold());
    ctx(creator(), NFT_MINT_DEPOSIT, b"");
    f.retry_machine_setup(gold());
}

#[test]
#[should_panic(expected = "Attach at least")]
fn retry_requires_deposit() {
    let mut f = launched();
    ctx(creator(), NearToken::from_yoctonear(1), b"");
    f.retry_machine_setup(gold());
}

#[test]
#[should_panic(expected = "Unknown machine")]
fn retry_unknown_machine_fails() {
    let mut f = factory_with_code();
    ctx(creator(), NFT_MINT_DEPOSIT, b"");
    f.retry_machine_setup(acc("nope.gaballs.testnet"));
}

#[test]
fn vrf_config_is_stored_and_readable() {
    let f = factory_with_code();
    assert_eq!(f.get_vrf_config(), Some(test_vrf()));
}

#[test]
#[should_panic(expected = "Only the owner can set the VRF config")]
fn set_vrf_config_owner_only() {
    let mut f = factory_with_code();
    ctx(creator(), NearToken::from_near(0), b"");
    f.set_vrf_config(test_vrf());
}

#[test]
#[should_panic(expected = "pubkey_hex must be 32 bytes of hex")]
fn set_vrf_config_rejects_a_bad_key() {
    let mut f = factory_with_code();
    ctx(owner(), NearToken::from_near(0), b"");
    f.set_vrf_config(VrfConfig { pubkey_hex: "abcd".into(), ..test_vrf() });
}

#[test]
#[should_panic(expected = "VRF config not set")]
fn launch_requires_vrf_config() {
    ctx(owner(), NearToken::from_near(0), b"");
    let mut f = Factory::new(owner(), acc("nft.gaballs.testnet"), acc("usdt.gaballs.testnet"), owner());
    ctx(owner(), NearToken::from_near(0), FAKE_WASM);
    f.set_machine_code();
    let cost = f.get_launch_cost();
    launch(&mut f, "GOLD", cost);
}
