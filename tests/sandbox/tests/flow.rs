//! End-to-end tests on a local NEAR sandbox node, using the real wasm from target/near
//! (build first: scripts/build-wasm.sh or scripts/build-wasm.ps1).
//!
//! Story (CLAUDE.md section 4 + Phase 2): launch → buyer gets mock USDT from the faucet → storage_deposit →
//! 20 packs → sweep_fees → creator claims → creator transfers the Machine NFT → new owner sweeps + claims →
//! old owner's claim fails. Plus: a forced Mythic mints a soulbound certificate that cannot be transferred.
//! Phase 5: VRF proofs settle packs on-chain (valid / forged / failed / timeout refund) and sell-back pays out.
//!
//! OutLayer is played by `contracts/mock-outlayer`: each test signs the VRF response with its own test key (which
//! the factory hands to every machine as its VRF public key) and registers it for the next request's seed before
//! paying for a pack.

use std::path::PathBuf;
use std::sync::Arc;

use near_api::types::transaction::result::ExecutionFinalResult;
use ed25519_dalek::{Signer as _, SigningKey};
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

/// The test's stand-in for OutLayer's VRF key, and a different key whose proofs must be rejected.
fn vrf_key() -> SigningKey {
    SigningKey::from_bytes(&[7u8; 32])
}
fn forger() -> SigningKey {
    SigningKey::from_bytes(&[9u8; 32])
}
fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// What happens to the next VRF request.
enum Vrf<'a> {
    Valid,
    SignedBy(&'a SigningKey),
    Fail,
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
    outlayer: AccountId,
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

    /// Queues the mock OutLayer's answer for `machine`'s next VRF request. `signer` is who signs the transaction that
    /// pays (OutLayer names the transaction signer in the alpha): the buyer, or the member whose vote executes a DAO
    /// proposal.
    async fn queue_vrf(&self, machine: &AccountId, signer: &AccountId, vrf: Vrf<'_>) {
        let m: Value = self.view(machine, "get_machine", json!({})).await;
        let request_id = m["request_nonce"].as_u64().unwrap();
        let response = match vrf {
            Vrf::Fail => None,
            Vrf::Valid | Vrf::SignedBy(_) => {
                let key = if let Vrf::SignedBy(k) = vrf { k.clone() } else { vrf_key() };
                let alpha = format!("vrf:{}:{signer}:{machine}-{request_id}", 70_000 + request_id);
                let sig = key.sign(alpha.as_bytes()).to_bytes();
                Some(json!({ "results": [{ "alpha": alpha, "signature_hex": hex(&sig), "value": 0 }] }).to_string())
            }
        };
        let seed = format!("{machine}-{request_id}");
        self.ok(&self.outlayer, &self.outlayer, "push_response", json!({ "seed": seed, "response": response }), NearToken::from_near(0))
            .await;
    }

    /// Pays for `count` packs; the VRF answer must already be queued. Returns the outcome.
    async fn pay_for_packs(&self, machine: &AccountId, count: u32) -> ExecutionFinalResult {
        let msg = json!({ "action": "open_pack", "count": count }).to_string();
        let amount = (PACK * u128::from(count)).to_string();
        self.call(
            &self.buyer,
            &self.usdt,
            "ft_transfer_call",
            json!({ "receiver_id": machine, "amount": amount, "msg": msg }),
            NearToken::from_yoctonear(1),
        )
        .await
    }

    /// The buyer opens `count` packs (1-5) on `machine` by paying USDT with ft_transfer_call; a valid VRF proof
    /// settles them in the same transaction's receipts.
    async fn open_packs(&self, machine: &AccountId, count: u32) {
        self.queue_vrf(machine, &self.buyer, Vrf::Valid).await;
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

    let names = ["gaballs", "usdt", "nft", "platform", "creator", "buyer", "newowner", "outlayer"];
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
        outlayer: id("outlayer.sandbox"),
    };

    for (account, code, init) in [
        (&env.usdt, wasm("gaballs_mock_usdt/gaballs_mock_usdt.wasm"), json!({})),
        (&env.nft, wasm("gaballs_nft/gaballs_nft.wasm"), json!({ "factory": env.factory, "usdt_contract": env.usdt })),
        (
            &env.factory,
            wasm("gaballs_factory/gaballs_factory.wasm"),
            json!({ "owner": env.factory, "nft_contract": env.nft, "usdt_contract": env.usdt, "platform_account": env.platform }),
        ),
        (&env.outlayer, wasm("gaballs_mock_outlayer/gaballs_mock_outlayer.wasm"), json!({})),
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
    let vrf = json!({ "outlayer_contract": env.outlayer, "project_id": "test.sandbox/vrf-ark", "pubkey_hex": hex(vrf_key().verifying_key().as_bytes()) });
    env.ok(&env.factory, &env.factory, "set_vrf_config", json!({ "vrf": vrf }), NearToken::from_near(0)).await;

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
    assert_eq!(machines[0]["nft_minted"], true, "launch callback confirmed the NFT mint");
    assert_eq!(machines[0]["usdt_registered"], true, "launch callback confirmed USDT registration");
    let retry = env.fails(&env.creator, &env.factory, "retry_machine_setup", json!({ "machine": machine }), NearToken::from_millinear(100)).await;
    assert!(retry, "retry is refused once setup is complete");
    let nft: Value = env.view(&env.nft, "nft_token", json!({ "token_id": token_id })).await;
    assert_eq!(nft["owner_id"], env.creator.as_str(), "creator owns the Machine NFT");

    // The machine account has no access keys at all: nobody can redeploy or change it.
    let keys = near_api::Account(machine.clone()).list_keys().fetch_from(&env.net).await?.data;
    assert!(keys.is_empty(), "machine must have no access keys, found {keys:?}");
    println!("1. launched {machine}; Machine NFT -> {}; setup confirmed (nft_minted, usdt_registered); access keys on machine: {}", env.creator, keys.len());

    // The deployed (production) machine has no test hooks.
    let hook = env.fails(&env.buyer, &machine, "test_force_next_tier", json!({ "tier": 3 }), NearToken::from_near(0)).await;
    assert!(hook, "production machine must not have test_force_next_tier");
    let hook = env.fails(&env.buyer, &machine, "test_drop_next_vrf_callback", json!({}), NearToken::from_near(0)).await;
    assert!(hook, "production machine must not have test_drop_next_vrf_callback");

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

/// Buyer: 100 mock USDT and registered on the machine token.
async fn fund_buyer(env: &Env, machine: &AccountId) {
    env.ok(&env.buyer, &env.usdt, "faucet", json!({}), NearToken::from_near(0)).await;
    env.ok(&env.buyer, machine, "storage_deposit", json!({}), NearToken::from_millinear(10)).await;
}

fn events(outcome: &ExecutionFinalResult, name: &str) -> Vec<Value> {
    outcome
        .logs()
        .iter()
        .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
        .filter_map(|j| serde_json::from_str::<Value>(j).ok())
        .filter(|e| e["standard"] == "gaballs" && e["event"] == name)
        .map(|e| e["data"][0].clone())
        .collect()
}

#[tokio::test]
async fn vrf_valid_forged_failed_and_timeout_on_chain() -> TestResult {
    // test-hooks build only for step 4 (test_drop_next_vrf_callback); steps 1-3 behave like production.
    let env = setup(wasm("machine_test_hooks/gaballs_machine.wasm")).await?;
    let machine = env.launch().await;
    fund_buyer(&env, &machine).await;
    let usdt0 = env.usdt_balance(&env.buyer).await;

    // 1. Valid proof: requested and settled in the same transaction's receipts.
    env.queue_vrf(&machine, &env.buyer, Vrf::Valid).await;
    let out = env.pay_for_packs(&machine, 2).await;
    assert!(out.clone().into_result().is_ok(), "{:?}", out.clone().into_result().err());
    assert_eq!(events(&out, "pack_requested").len(), 1);
    let opened = events(&out, "pack_opened");
    assert_eq!(opened.len(), 2, "both packs settled by the proof");
    let pubkey = vrf_key().verifying_key();
    for p in &opened {
        let alpha = p["vrf_alpha"].as_str().unwrap();
        let sig: Vec<u8> = (0..128).step_by(2).map(|i| u8::from_str_radix(&p["vrf_signature"].as_str().unwrap()[i..i + 2], 16).unwrap()).collect();
        let sig = ed25519_dalek::Signature::from_bytes(&sig.try_into().unwrap());
        assert!(pubkey.verify_strict(alpha.as_bytes(), &sig).is_ok(), "anyone can verify the proof off-chain");
        assert!(alpha.ends_with(&format!(":{machine}-0")));
    }
    assert_eq!(env.usdt_balance(&env.buyer).await, usdt0 - 2 * PACK);
    println!("1. valid proof: 2 packs settled ({} / {}), alpha {}", opened[0]["tier"], opened[1]["tier"], opened[0]["vrf_alpha"]);

    // 2. Forged proof (signed by another key): rejected on-chain, USDT refunded, no tokens.
    let tokens_before: String = env.view(&machine, "ft_balance_of", json!({ "account_id": env.buyer })).await;
    let usdt1 = env.usdt_balance(&env.buyer).await;
    env.queue_vrf(&machine, &env.buyer, Vrf::SignedBy(&forger())).await;
    let out = env.pay_for_packs(&machine, 1).await;
    assert!(events(&out, "pack_opened").is_empty());
    let refunded = events(&out, "pack_refunded");
    assert_eq!(refunded[0]["reason"], "VRF signature does not verify");
    assert_eq!(refunded[0]["delivered"], true);
    assert_eq!(env.usdt_balance(&env.buyer).await, usdt1, "USDT came back");
    let tokens_after: String = env.view(&machine, "ft_balance_of", json!({ "account_id": env.buyer })).await;
    assert_eq!(tokens_after, tokens_before);
    println!("2. forged proof: rejected, 10 USDT refunded");

    // 3. OutLayer fails: refunded.
    env.queue_vrf(&machine, &env.buyer, Vrf::Fail).await;
    let out = env.pay_for_packs(&machine, 1).await;
    assert_eq!(events(&out, "pack_refunded")[0]["reason"], "OutLayer VRF request failed");
    assert_eq!(env.usdt_balance(&env.buyer).await, usdt1);
    println!("3. OutLayer failure: refunded");

    // 4. No callback ever arrives: the pull stays pending; after the timeout a stranger refunds it.
    env.ok(&env.buyer, &machine, "test_drop_next_vrf_callback", json!({}), NearToken::from_near(0)).await;
    env.queue_vrf(&machine, &env.buyer, Vrf::Valid).await;
    let out = env.pay_for_packs(&machine, 1).await;
    let req = events(&out, "pack_requested")[0].clone();
    let request_id = req["request_id"].as_u64().unwrap();
    assert!(events(&out, "pack_opened").is_empty() && events(&out, "pack_refunded").is_empty());
    let pending: Vec<Value> = env.view(&machine, "get_pending", json!({ "account_id": env.buyer })).await;
    assert_eq!(pending.len(), 1);
    assert_eq!(env.usdt_balance(&env.buyer).await, usdt1 - PACK);
    let early = env.fails(&env.platform, &machine, "refund_expired", json!({ "request_id": request_id }), NearToken::from_near(0)).await;
    assert!(early, "refund before the timeout is refused");
    env._sandbox.fast_forward(301).await?;
    let out = env.call(&env.platform, &machine, "refund_expired", json!({ "request_id": request_id }), NearToken::from_near(0)).await;
    assert!(out.clone().into_result().is_ok());
    assert_eq!(events(&out, "pack_refunded")[0]["reason"], "VRF timeout");
    assert_eq!(env.usdt_balance(&env.buyer).await, usdt1, "timeout refund delivered");
    let pending: Vec<Value> = env.view(&machine, "get_pending", json!({})).await;
    assert!(pending.is_empty());
    let m: Value = env.view(&machine, "get_machine", json!({})).await;
    assert_eq!(m["stats"]["refunds"], 3);
    assert_eq!(m["pending_usdt"], "0");
    println!("4. no callback: refund_expired refused early, accepted after 301 blocks (by a stranger); 10 USDT back");
    Ok(())
}

#[tokio::test]
async fn sell_back_on_chain() -> TestResult {
    let env = setup(wasm("gaballs_machine/gaballs_machine.wasm")).await?;
    let machine = env.launch().await;
    fund_buyer(&env, &machine).await;
    for _ in 0..2 {
        env.open_packs(&machine, 5).await;
    }
    let held: u128 = env.view::<String>(&machine, "ft_balance_of", json!({ "account_id": env.buyer })).await.parse()?;
    let amount = held / 2;
    let q: Value = env.view(&machine, "quote_sell", json!({ "amount": amount.to_string() })).await;
    let usdt_out: u128 = q["usdt_out"].as_str().unwrap().parse()?;

    // Slippage guard: asking for 1 unit more than the quote fails and changes nothing.
    let args = json!({ "amount": amount.to_string(), "min_usdt_out": (usdt_out + 1).to_string() });
    assert!(env.fails(&env.buyer, &machine, "sell", args, NearToken::from_yoctonear(1)).await);
    let still: String = env.view(&machine, "ft_balance_of", json!({ "account_id": env.buyer })).await;
    assert_eq!(still, held.to_string());

    let usdt0 = env.usdt_balance(&env.buyer).await;
    let args = json!({ "amount": amount.to_string(), "min_usdt_out": usdt_out.to_string() });
    let out = env.call(&env.buyer, &machine, "sell", args, NearToken::from_yoctonear(1)).await;
    assert!(out.clone().into_result().is_ok(), "{:?}", out.clone().into_result().err());
    let sold = events(&out, "tokens_sold");
    assert_eq!(sold[0]["usdt_out"], q["usdt_out"]);
    assert_eq!(env.usdt_balance(&env.buyer).await - usdt0, usdt_out);
    let left: String = env.view(&machine, "ft_balance_of", json!({ "account_id": env.buyer })).await;
    assert_eq!(left, (held - amount).to_string());
    // The machine's real USDT = R + unswept fees (nothing pending).
    let m: Value = env.view(&machine, "get_machine", json!({})).await;
    let r: u128 = m["curve_usdt_reserve"].as_str().unwrap().parse()?;
    let fees: u128 = m["fees"]["nft_accrued"].as_str().unwrap().parse::<u128>()? + m["fees"]["platform_accrued"].as_str().unwrap().parse::<u128>()?;
    assert_eq!(env.usdt_balance(&machine).await, r + fees);
    println!("sold {amount} token units for {usdt_out} USDT units (quote {}); slippage-guarded attempt FAILED as intended", q["usdt_out"]);
    Ok(())
}

#[tokio::test]
async fn longest_symbol_launch_mints_the_machine_nft() -> TestResult {
    // Regression: the Machine NFT's storage grows with the machine account's length. A 12-character symbol (the
    // maximum) must still mint in the launch itself, without retry_machine_setup.
    let env = setup(wasm("gaballs_machine/gaballs_machine.wasm")).await?;
    let cost: NearToken = env.view(&env.factory, "get_launch_cost", json!({})).await;
    let args = json!({ "name": "A machine with a rather long name for its card", "symbol": "ABCDEFGHIJKL", "icon": null, "creator_allocation": "0" });
    env.ok(&env.creator, &env.factory, "launch", args, cost).await;
    let machine = id(&format!("abcdefghijkl.{}", env.factory));
    let info: Value = env.view(&env.factory, "get_machine", json!({ "machine": machine })).await;
    assert_eq!(info["nft_minted"], true, "Machine NFT minted at launch: {info}");
    assert_eq!(info["usdt_registered"], true);
    println!("12-character symbol launched with cost {cost}: nft_minted, usdt_registered");
    Ok(())
}

// ------------------------------------------------------------------ Squads: a real Sputnik DAO buys packs

/// The Sputnik DAO v2 contract testnet's factory deploys by default (sputnikv2.testnet `get_default_code_hash` =
/// AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH, version 3.31, commit 7764926). Fetched with `get_code`; see
/// tests/sandbox/res/README.md.
fn sputnik_wasm() -> Vec<u8> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("res/sputnikdao2-v3.31.wasm");
    std::fs::read(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

fn b64(v: &Value) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(v.to_string())
}

/// One FunctionCall action for a Sputnik proposal.
fn action(method: &str, args: Value, deposit: u128, tgas: u64) -> Value {
    json!({ "method_name": method, "args": b64(&args), "deposit": deposit.to_string(), "gas": (tgas * 1_000_000_000_000).to_string() })
}

const BOND: NearToken = NearToken::from_millinear(100);

impl Env {
    /// `who` proposes a FunctionCall on `receiver`; returns the proposal id.
    async fn propose(&self, dao: &AccountId, who: &AccountId, description: &str, receiver: &AccountId, actions: Vec<Value>) -> u64 {
        let kind = json!({ "FunctionCall": { "receiver_id": receiver, "actions": actions } });
        let r = self.call(who, dao, "add_proposal", json!({ "proposal": { "description": description, "kind": kind } }), BOND).await;
        assert!(r.clone().into_result().is_ok(), "add_proposal failed: {:?}", r.into_result().err());
        let last: u64 = self.view(dao, "get_last_proposal_id", json!({})).await;
        last - 1
    }

    async fn vote(&self, dao: &AccountId, who: &AccountId, id: u64) -> ExecutionFinalResult {
        self.call(who, dao, "act_proposal", json!({ "id": id, "action": "VoteApprove" }), NearToken::from_near(0)).await
    }

    async fn status(&self, dao: &AccountId, id: u64) -> String {
        let p: Value = self.view(dao, "get_proposal", json!({ "id": id })).await;
        p["status"].as_str().unwrap_or("?").to_string()
    }

    async fn token_balance(&self, token: &AccountId, who: &AccountId) -> u128 {
        let v: String = self.view(token, "ft_balance_of", json!({ "account_id": who })).await;
        v.parse().unwrap()
    }
}

#[tokio::test]
async fn sputnik_dao_squad_opens_packs_by_vote_and_receives_the_prize() -> TestResult {
    // test-hooks machine only to force one Mythic (certificate to the DAO); the VRF path is the production one.
    let env = setup(wasm("machine_test_hooks/gaballs_machine.wasm")).await?;
    let machine = env.launch().await;
    let (a, b, c) = (env.creator.clone(), env.buyer.clone(), env.new_owner.clone());

    // 1. The squad: a real Sputnik DAO, council a/b/c, 2 of 3 approvals, 0.1 NEAR proposal bond, council-only proposals.
    let dao = id("squad.sandbox");
    env._sandbox.create_account(dao.as_str().parse()?).initial_balance(NearToken::from_near(10)).send().await?;
    let policy = json!({
        "roles": [{
            "name": "council",
            "kind": { "Group": [a, b, c] },
            "permissions": ["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:VoteRemove", "*:Finalize"],
            "vote_policy": {}
        }],
        "default_vote_policy": { "weight_kind": "RoleWeight", "quorum": "0", "threshold": "2" },
        "proposal_bond": BOND.as_yoctonear().to_string(),
        "proposal_period": "604800000000000",
        "bounty_bond": BOND.as_yoctonear().to_string(),
        "bounty_forgiveness_period": "86400000000000"
    });
    near_api::Contract::deploy(dao.clone())
        .use_code(sputnik_wasm())
        .with_init_call("new", json!({ "config": { "name": "gaballs-squad", "purpose": "Group gacha", "metadata": "" }, "policy": policy }))?
        .with_signer(env.signer.clone())
        .send_to(&env.net)
        .await?
        .assert_success();
    let pol: Value = env.view(&dao, "get_policy", json!({})).await;
    assert_eq!(pol["default_vote_policy"]["threshold"], "2");
    println!("1. DAO {dao}: council {a}, {b}, {c}; threshold 2 of 3; bond 0.1 NEAR");

    // 2. Anyone pays the DAO's storage on USDT and on the machine token; members chip in USDT.
    env.register_usdt(&dao).await;
    env.ok(&b, &machine, "storage_deposit", json!({ "account_id": dao }), NearToken::from_millinear(10)).await;
    for who in [&b, &c] {
        env.ok(who, &env.usdt, "faucet", json!({}), NearToken::from_near(0)).await;
        env.ok(who, &env.usdt, "ft_transfer", json!({ "receiver_id": dao, "amount": (100 * USDT).to_string() }), NearToken::from_yoctonear(1)).await;
    }
    assert_eq!(env.usdt_balance(&dao).await, 200 * USDT);
    println!("2. members chipped in: DAO holds 200 USDT");

    // 3. Gas search: the ft_transfer_call action needs enough gas for USDT -> machine -> VRF request (150 Tgas) and
    //    its callback (60 Tgas), all inside the 300 Tgas vote transaction. One pack per try, cheapest first.
    let pack_msg = json!({ "action": "open_pack", "count": 1 }).to_string();
    let mut works = None;
    for tgas in [200u64, 230, 245, 255, 265, 275] {
        let before: Value = env.view(&machine, "get_machine", json!({})).await;
        let id = env
            .propose(&dao, &a, &format!("1 pack, {tgas} Tgas"), &env.usdt, vec![action(
                "ft_transfer_call",
                json!({ "receiver_id": machine, "amount": PACK.to_string(), "msg": pack_msg }),
                1,
                tgas,
            )])
            .await;
        env.vote(&dao, &b, id).await;
        env.queue_vrf(&machine, &c, Vrf::Valid).await; // c casts the deciding vote, so c signs the paying transaction
        let out = env.vote(&dao, &c, id).await;
        let after: Value = env.view(&machine, "get_machine", json!({})).await;
        let opened = after["stats"]["packs_opened"].as_u64().unwrap() - before["stats"]["packs_opened"].as_u64().unwrap();
        println!(
            "   {tgas} Tgas: vote tx {}, proposal {}, packs opened {opened}",
            if out.clone().into_result().is_ok() { "ok" } else { "FAILED" },
            env.status(&dao, id).await
        );
        if opened == 1 && works.is_none() {
            works = Some(tgas);
        }
    }
    let min_tgas = works.expect("no gas level opened a pack");
    println!("3. smallest action gas that opens a VRF pack by DAO vote: {min_tgas} Tgas");

    // 4. The real squad pull: 5 packs at the recommended gas, one forced Mythic so the certificate goes to the DAO.
    let squad_tgas = 275;
    let held_before = env.token_balance(&machine, &dao).await;
    env.ok(&b, &machine, "test_force_next_tier", json!({ "tier": 3 }), NearToken::from_near(0)).await;
    let id = env
        .propose(&dao, &a, "Open 5 packs", &env.usdt, vec![action(
            "ft_transfer_call",
            json!({ "receiver_id": machine, "amount": (5 * PACK).to_string(), "msg": json!({ "action": "open_pack", "count": 5 }).to_string() }),
            1,
            squad_tgas,
        )])
        .await;
    assert_eq!(env.status(&dao, id).await, "InProgress");
    env.vote(&dao, &b, id).await;
    assert_eq!(env.status(&dao, id).await, "InProgress", "one vote of two is not enough");
    env.queue_vrf(&machine, &c, Vrf::Valid).await;
    let out = env.vote(&dao, &c, id).await;
    assert!(out.clone().into_result().is_ok(), "{:?}", out.into_result().err());
    assert_eq!(env.status(&dao, id).await, "Approved");
    let opened = events(&out, "pack_opened");
    assert_eq!(opened.len(), 5, "the deciding vote's transaction settles all 5 packs");
    assert!(opened.iter().all(|p| p["buyer"] == dao.as_str()));
    assert!(opened[0]["vrf_alpha"].as_str().unwrap().contains(&format!(":{c}:{machine}-")), "alpha names the voter");
    let payout: u128 = opened.iter().map(|p| p["payout"].as_str().unwrap().parse::<u128>().unwrap()).sum();
    let held = env.token_balance(&machine, &dao).await;
    assert_eq!(held - held_before, payout, "the prize landed in the DAO");
    let tiers: Vec<&str> = opened.iter().map(|p| p["tier"].as_str().unwrap()).collect();
    let cert_pull = opened.iter().find(|p| p["tier"] == "Mythic").expect("forced Mythic")["pull_id"].as_u64().unwrap();
    let cert: Value = env.view(&env.nft, "nft_token", json!({ "token_id": format!("cert:{machine}:{cert_pull}") })).await;
    assert_eq!(cert["owner_id"], dao.as_str(), "the Mythic certificate belongs to the squad");
    println!("4. proposal {id}: 2 of 3 approved; 5 packs {tiers:?}; {payout} token units to the DAO; certificate cert:{machine}:{cert_pull} owned by the DAO");

    // 5. Split part of the prize equally: one proposal on the machine token. Members may not be registered on the token yet,
    //    so the batch first registers each one (storage_deposit, registration_only: paid by the DAO, refunded if
    //    already registered), then makes the three transfers. One failed action would fail the whole batch.
    let bounds: Value = env.view(&machine, "storage_balance_bounds", json!({})).await;
    let min: u128 = bounds["min"].as_str().unwrap().parse()?;
    let share = held / 5; // 20% each: 60% split, the other 40% is sold back to the curve in step 6
    let before: Vec<u128> = futures_balances(&env, &machine, [&a, &b, &c]).await;
    let mut transfers: Vec<Value> = [&a, &b, &c]
        .iter()
        .map(|m| action("storage_deposit", json!({ "account_id": m, "registration_only": true }), min, 10))
        .collect();
    transfers.extend(
        [&a, &b, &c]
            .iter()
            .map(|m| action("ft_transfer", json!({ "receiver_id": m, "amount": share.to_string(), "memo": "squad split" }), 1, 15)),
    );
    let id = env.propose(&dao, &b, "Split the prize", &machine, transfers).await;
    env.vote(&dao, &a, id).await;
    let out = env.vote(&dao, &c, id).await;
    let status = env.status(&dao, id).await;
    assert_eq!(status, "Approved", "split proposal {status}: {:?}", out.into_result().err().map(|e| format!("{e:?}").chars().take(600).collect::<String>()));
    let after: Vec<u128> = futures_balances(&env, &machine, [&a, &b, &c]).await;
    for i in 0..3 {
        assert_eq!(after[i] - before[i], share);
    }
    println!("5. proposal {id}: split {share} token units to each member");

    // 6. Sell the rest of the treasury's tokens back: USDT returns to the DAO.
    let left = env.token_balance(&machine, &dao).await;
    let q: Value = env.view(&machine, "quote_sell", json!({ "amount": left.to_string() })).await;
    let usdt_before = env.usdt_balance(&dao).await;
    let id = env
        .propose(&dao, &a, "Sell the rest back", &machine, vec![action(
            "sell",
            json!({ "amount": left.to_string(), "min_usdt_out": q["usdt_out"] }),
            1,
            100,
        )])
        .await;
    env.vote(&dao, &b, id).await;
    env.vote(&dao, &c, id).await;
    let got = env.usdt_balance(&dao).await - usdt_before;
    assert_eq!(got.to_string(), q["usdt_out"].as_str().unwrap());
    println!("6. proposal {id}: sold {left} token units, {got} USDT units back in the treasury");

    // 7. Co-own a machine: the creator gives the Machine NFT to the DAO; fees from a pull are swept and claimed by vote.
    let token_id = format!("machine:{machine}");
    env.ok(&a, &env.nft, "nft_transfer", json!({ "receiver_id": dao, "token_id": token_id }), NearToken::from_yoctonear(1)).await;
    env.ok(&b, &machine, "sweep_fees", json!({}), NearToken::from_near(0)).await; // fees from all packs so far
    let fees = env.fee_balance(&token_id).await;
    assert!(fees > 0);
    let usdt_before = env.usdt_balance(&dao).await;
    let id = env
        .propose(&dao, &c, "Claim machine fees", &env.nft, vec![action("claim", json!({ "token_id": token_id }), 1, 60)])
        .await;
    env.vote(&dao, &a, id).await;
    env.vote(&dao, &b, id).await;
    assert_eq!(env.usdt_balance(&dao).await - usdt_before, fees);
    assert_eq!(env.fee_balance(&token_id).await, 0);
    println!("7. proposal {id}: the DAO owns {token_id} and claimed {fees} USDT units of fees by vote");
    Ok(())
}

async fn futures_balances(env: &Env, token: &AccountId, who: [&AccountId; 3]) -> Vec<u128> {
    let mut out = vec![];
    for w in who {
        out.push(env.token_balance(token, w).await);
    }
    out
}
