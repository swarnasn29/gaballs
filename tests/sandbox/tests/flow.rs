//! End-to-end tests on a local NEAR sandbox node, using the real wasm from target/near
//! (build first: scripts/build-wasm.sh or scripts/build-wasm.ps1).
//!
//! Story (CLAUDE.md section 4 + Phase 2): launch → buyer gets mock USDT from the faucet → storage_deposit →
//! 20 packs → sweep_fees → creator claims → creator transfers the Machine NFT → new owner sweeps + claims →
//! old owner's claim fails. Plus: a forced Mythic mints a soulbound certificate that cannot be transferred.

use std::path::PathBuf;
use std::sync::Arc;

use near_api::types::transaction::result::ExecutionFinalResult;
use near_api::{AccountId, NearGas, NearToken, NetworkConfig, Signer};
use serde_json::{Value, json};
use testresult::TestResult;

const USDT: u128 = 1_000_000;
const PACK: u128 = 10 * USDT;
const NFT_FEE_PER_PACK: u128 = 50_000; // 0.5% of 10 USDT
const PLATFORM_FEE_PER_PACK: u128 = 20_000; // 0.2%

fn wasm(rel: &str) -> Vec<u8> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/near").join(rel);
    std::fs::read(&path).unwrap_or_else(|e| panic!("{}: {e}. Run scripts/build-wasm first.", path.display()))
}

fn id(s: &str) -> AccountId {
    s.parse().unwrap()
}

struct Env {
    _sandbox: near_sandbox::Sandbox,
    net: NetworkConfig,
    signer: Arc<Signer>,
    factory: AccountId,
    usdt: AccountId,
    nft: AccountId,
    platform: AccountId,
    creator: AccountId,
    buyer: AccountId,
    new_owner: AccountId,
}

impl Env {
    /// Calls `method` on `contract` as `who`. Returns the full outcome (success or failure).
    async fn call(
        &self,
        who: &AccountId,
        contract: &AccountId,
        method: &str,
        args: Value,
        deposit: NearToken,
    ) -> ExecutionFinalResult {
        near_api::Contract(contract.clone())
            .call_function(method, args)
            .transaction()
            .gas(NearGas::from_tgas(300))
            .deposit(deposit)
            .with_signer(who.clone(), self.signer.clone())
            .send_to(&self.net)
            .await
            .expect("rpc error")
            .into_full()
            .expect("transaction still pending")
    }

    /// True if the call failed (panicked) anywhere in its receipt chain's final outcome.
    async fn fails(&self, who: &AccountId, contract: &AccountId, method: &str, args: Value, deposit: NearToken) -> bool {
        self.call(who, contract, method, args, deposit).await.into_result().is_err()
    }

    async fn ok(&self, who: &AccountId, contract: &AccountId, method: &str, args: Value, deposit: NearToken) {
        let r = self.call(who, contract, method, args, deposit).await.into_result();
        assert!(r.is_ok(), "{method} by {who} failed: {:?}", r.err());
    }

    async fn view<T: serde::de::DeserializeOwned + Send + Sync>(&self, contract: &AccountId, method: &str, args: Value) -> T {
        near_api::Contract(contract.clone())
            .call_function(method, args)
            .read_only()
            .fetch_from(&self.net)
            .await
            .unwrap_or_else(|e| panic!("view {method}: {e}"))
            .data
    }

    async fn usdt_balance(&self, who: &AccountId) -> u128 {
        let v: String = self.view(&self.usdt, "ft_balance_of", json!({ "account_id": who })).await;
        v.parse().unwrap()
    }

    async fn fee_balance(&self, token_id: &str) -> u128 {
        let v: String = self.view(&self.nft, "get_fee_balance", json!({ "token_id": token_id })).await;
        v.parse().unwrap()
    }

    async fn register_usdt(&self, who: &AccountId) {
        self.ok(who, &self.usdt, "storage_deposit", json!({ "account_id": who }), NearToken::from_millinear(10)).await;
    }

    /// The buyer opens `count` packs (1-5) on `machine` by paying USDT with ft_transfer_call.
    async fn open_packs(&self, machine: &AccountId, count: u32) {
        let msg = json!({ "action": "open_pack", "count": count }).to_string();
        let amount = (PACK * u128::from(count)).to_string();
        let r = self
            .call(
                &self.buyer,
                &self.usdt,
                "ft_transfer_call",
                json!({ "receiver_id": machine, "amount": amount, "msg": msg }),
                NearToken::from_yoctonear(1),
            )
            .await
            .into_result();
        assert!(r.is_ok(), "open_packs failed: {:?}", r.err());
    }

    /// Launches GOLD as the creator and returns the machine account.
    async fn launch(&self) -> AccountId {
        let cost: NearToken = self.view(&self.factory, "get_launch_cost", json!({})).await;
        let r = self
            .call(
                &self.creator,
                &self.factory,
                "launch",
                json!({ "name": "Gold Gacha", "symbol": "GOLD", "icon": null, "creator_allocation": "0" }),
                cost,
            )
            .await
            .into_result();
        assert!(r.is_ok(), "launch failed: {:?}", r.err());
        println!("launch cost: {cost}");
        id(&format!("gold.{}", self.factory))
    }
}

/// Starts a sandbox, deploys mock USDT, NFT and factory (with `machine_wasm`), funds and registers accounts.
async fn setup(machine_wasm: Vec<u8>) -> TestResult<Env> {
    let sandbox = near_sandbox::Sandbox::start_sandbox().await?;
    let net = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
    let signer = Signer::from_secret_key(near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;

    let names = ["gaballs", "usdt", "nft", "platform", "creator", "buyer", "newowner"];
    for n in names {
        let balance = if n == "gaballs" || n == "creator" { 100 } else { 20 };
        sandbox.create_account(format!("{n}.sandbox").parse()?).initial_balance(NearToken::from_near(balance)).send().await?;
    }
    let env = Env {
        _sandbox: sandbox,
        net,
        signer: signer.clone(),
        factory: id("gaballs.sandbox"),
        usdt: id("usdt.sandbox"),
        nft: id("nft.sandbox"),
        platform: id("platform.sandbox"),
        creator: id("creator.sandbox"),
        buyer: id("buyer.sandbox"),
        new_owner: id("newowner.sandbox"),
    };

    for (account, code, init) in [
        (&env.usdt, wasm("gaballs_mock_usdt/gaballs_mock_usdt.wasm"), json!({})),
        (&env.nft, wasm("gaballs_nft/gaballs_nft.wasm"), json!({ "factory": env.factory, "usdt_contract": env.usdt })),
        (
            &env.factory,
            wasm("gaballs_factory/gaballs_factory.wasm"),
            json!({ "owner": env.factory, "nft_contract": env.nft, "usdt_contract": env.usdt, "platform_account": env.platform }),
        ),
    ] {
        near_api::Contract::deploy(account.clone())
            .use_code(code)
            .with_init_call("new", init)?
            .with_signer(signer.clone())
            .send_to(&env.net)
            .await?
            .assert_success();
    }

    // The machine wasm is passed as raw bytes, not JSON.
    near_api::Contract(env.factory.clone())
        .call_function_raw("set_machine_code", machine_wasm)
        .transaction()
        .gas(NearGas::from_tgas(300))
        .with_signer(env.factory.clone(), signer.clone())
        .send_to(&env.net)
        .await?
        .assert_success();

    for who in [&env.nft, &env.platform, &env.creator, &env.buyer, &env.new_owner] {
        env.register_usdt(who).await;
    }
    Ok(env)
}

#[tokio::test]
async fn launch_packs_sweep_claim_transfer_claim() -> TestResult {
    let env = setup(wasm("gaballs_machine/gaballs_machine.wasm")).await?;

    // 1. Launch.
    let machine = env.launch().await;
    let token_id = format!("machine:{machine}");
    let machines: Vec<Value> = env.view(&env.factory, "get_machines", json!({})).await;
    assert_eq!(machines.len(), 1);
    assert_eq!(machines[0]["account_id"], machine.as_str());
    let nft: Value = env.view(&env.nft, "nft_token", json!({ "token_id": token_id })).await;
    assert_eq!(nft["owner_id"], env.creator.as_str(), "creator owns the Machine NFT");

    // The machine account has no access keys at all: nobody can redeploy or change it.
    let keys = near_api::Account(machine.clone()).list_keys().fetch_from(&env.net).await?.data;
    assert!(keys.is_empty(), "machine must have no access keys, found {keys:?}");
    println!("1. launched {machine}; Machine NFT -> {}; access keys on machine: {}", env.creator, keys.len());

    // The deployed (production) machine has no test hook.
    let hook = env.fails(&env.buyer, &machine, "test_force_next_tier", json!({ "tier": 3 }), NearToken::from_near(0)).await;
    assert!(hook, "production machine must not have test_force_next_tier");

    // 2. Buyer gets mock USDT: faucet (100) plus 100 each from creator's and new owner's faucet calls.
    for who in [&env.buyer, &env.creator, &env.new_owner] {
        env.ok(who, &env.usdt, "faucet", json!({}), NearToken::from_near(0)).await;
    }
    for who in [&env.creator, &env.new_owner] {
        let args = json!({ "receiver_id": env.buyer, "amount": (100 * USDT).to_string() });
        env.ok(who, &env.usdt, "ft_transfer", args, NearToken::from_yoctonear(1)).await;
    }
    assert_eq!(env.usdt_balance(&env.buyer).await, 300 * USDT);

    // 3. storage_deposit on the machine token, then 4. twenty packs (4 x 5).
    env.ok(&env.buyer, &machine, "storage_deposit", json!({}), NearToken::from_millinear(10)).await;
    for _ in 0..4 {
        env.open_packs(&machine, 5).await;
    }
    let m: Value = env.view(&machine, "get_machine", json!({})).await;
    assert_eq!(m["stats"]["packs_opened"], 20);
    assert_eq!(m["fees"]["nft_accrued"], (20 * NFT_FEE_PER_PACK).to_string());
    let tokens: String = env.view(&machine, "ft_balance_of", json!({ "account_id": env.buyer })).await;
    assert_eq!(tokens, m["stats"]["total_payout"].as_str().unwrap(), "buyer holds exactly the payouts");
    println!("2-4. buyer paid 200 USDT for 20 packs, holds {tokens} token units; tiers {}", m["stats"]["tier_counts"]);

    // 5. Anyone can sweep. Creator fees land on the NFT; platform fees on the platform account.
    env.ok(&env.buyer, &machine, "sweep_fees", json!({}), NearToken::from_near(0)).await;
    assert_eq!(env.fee_balance(&token_id).await, 20 * NFT_FEE_PER_PACK);
    assert_eq!(env.usdt_balance(&env.platform).await, 20 * PLATFORM_FEE_PER_PACK);
    let m: Value = env.view(&machine, "get_machine", json!({})).await;
    assert_eq!(m["fees"]["nft_accrued"], "0");
    assert_eq!(m["fees"]["nft_swept"], (20 * NFT_FEE_PER_PACK).to_string());
    // The machine's real USDT holdings equal R + fees not yet swept.
    let r: u128 = m["curve_usdt_reserve"].as_str().unwrap().parse()?;
    assert_eq!(env.usdt_balance(&machine).await, r);
    println!("5. sweep: NFT fee balance {} (1.000000 USDT), platform got 0.400000 USDT", env.fee_balance(&token_id).await);

    // 6. Creator claims.
    let before = env.usdt_balance(&env.creator).await;
    env.ok(&env.creator, &env.nft, "claim", json!({ "token_id": token_id }), NearToken::from_yoctonear(1)).await;
    assert_eq!(env.usdt_balance(&env.creator).await - before, 20 * NFT_FEE_PER_PACK);
    assert_eq!(env.fee_balance(&token_id).await, 0);
    println!("6. creator claimed 1.000000 USDT");

    // 7. Creator transfers the Machine NFT to the new owner.
    let args = json!({ "receiver_id": env.new_owner, "token_id": token_id });
    env.ok(&env.creator, &env.nft, "nft_transfer", args, NearToken::from_yoctonear(1)).await;
    let nft: Value = env.view(&env.nft, "nft_token", json!({ "token_id": token_id })).await;
    assert_eq!(nft["owner_id"], env.new_owner.as_str());
    println!("7. creator transferred the Machine NFT to {}", env.new_owner);

    // 8. Ten more packs, then the new owner sweeps.
    env.open_packs(&machine, 5).await;
    env.open_packs(&machine, 5).await;
    env.ok(&env.new_owner, &machine, "sweep_fees", json!({}), NearToken::from_near(0)).await;
    assert_eq!(env.fee_balance(&token_id).await, 10 * NFT_FEE_PER_PACK);

    // The old owner cannot claim the new fees.
    let stolen = env.fails(&env.creator, &env.nft, "claim", json!({ "token_id": token_id }), NearToken::from_yoctonear(1)).await;
    assert!(stolen, "old owner must not be able to claim");
    assert_eq!(env.fee_balance(&token_id).await, 10 * NFT_FEE_PER_PACK);
    println!("8. 10 more packs swept: NFT fee balance 0.500000 USDT; old owner's claim FAILED (as intended)");

    // 9. New owner claims.
    let before = env.usdt_balance(&env.new_owner).await;
    env.ok(&env.new_owner, &env.nft, "claim", json!({ "token_id": token_id }), NearToken::from_yoctonear(1)).await;
    assert_eq!(env.usdt_balance(&env.new_owner).await - before, 10 * NFT_FEE_PER_PACK);
    println!("9. new owner claimed 0.500000 USDT");

    // 10. Old owner claims again (balance 0, not owner): still fails.
    let again = env.fails(&env.creator, &env.nft, "claim", json!({ "token_id": token_id }), NearToken::from_yoctonear(1)).await;
    assert!(again);

    let history: Vec<Value> = env.view(&env.nft, "get_fee_history", json!({ "token_id": token_id })).await;
    let kinds: Vec<&str> = history.iter().map(|h| h["kind"].as_str().unwrap()).collect();
    assert_eq!(kinds, ["Credit", "Claim", "Credit", "Claim"]);
    println!("10. old owner's second claim FAILED; fee history: {kinds:?}");
    Ok(())
}

#[tokio::test]
async fn forced_mythic_mints_soulbound_certificate() -> TestResult {
    // Test-only machine build (`--features test-hooks`): exposes test_force_next_tier.
    let env = setup(wasm("machine_test_hooks/gaballs_machine.wasm")).await?;
    let machine = env.launch().await;
    env.ok(&env.buyer, &env.usdt, "faucet", json!({}), NearToken::from_near(0)).await;
    env.ok(&env.buyer, &machine, "storage_deposit", json!({}), NearToken::from_millinear(10)).await;

    env.ok(&env.buyer, &machine, "test_force_next_tier", json!({ "tier": 3 }), NearToken::from_near(0)).await;
    env.open_packs(&machine, 1).await;

    let pulls: Vec<Value> = env.view(&machine, "get_recent_pulls", json!({})).await;
    assert_eq!(pulls[0]["tier"], "Mythic");
    assert_eq!(pulls[0]["certificate"], true);
    let bought: u128 = pulls[0]["bought"].as_str().unwrap().parse()?;
    let payout: u128 = pulls[0]["payout"].as_str().unwrap().parse()?;
    assert_eq!(payout, bought * 8, "uncapped 8x on a fresh vault");
    println!("Mythic pull: bought {bought}, payout {payout} (8x), vault after {}", pulls[0]["vault_after"]);

    let cert_id = format!("cert:{machine}:0");
    let cert: Value = env.view(&env.nft, "nft_token", json!({ "token_id": cert_id })).await;
    assert_eq!(cert["owner_id"], env.buyer.as_str(), "certificate minted to the buyer");

    let moved = env
        .fails(
            &env.buyer,
            &env.nft,
            "nft_transfer",
            json!({ "receiver_id": env.new_owner, "token_id": cert_id }),
            NearToken::from_yoctonear(1),
        )
        .await;
    assert!(moved, "certificates are soulbound");
    let cert: Value = env.view(&env.nft, "nft_token", json!({ "token_id": cert_id })).await;
    assert_eq!(cert["owner_id"], env.buyer.as_str());
    println!("certificate {cert_id} owned by {}; transfer attempt FAILED (soulbound)", env.buyer);
    Ok(())
}
