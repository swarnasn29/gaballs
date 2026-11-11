//! Gaballs machine + token (CLAUDE.md section 3.1).
//!
//! One contract is both the memecoin (NEP-141/145/148) and the gacha machine. A pack is paid in USDT via
//! `ft_transfer_call` → `ft_on_transfer`, buys tokens on this machine's own bonding curve, and a roll on
//! the fixed odds table multiplies what the buyer receives. The prize vault absorbs the difference.
//!
//! Token accounting: the machine's own account holds the curve inventory plus the vault, so
//! `ft_balance_of(machine) == curve_tokens + vault` at all times and total supply never changes.
//!
//! Randomness (Phase 5): a paid pack becomes a *pending pull* and one OutLayer VRF request. The callback verifies
//! the proof on-chain and settles the packs, or refunds the USDT. If no callback arrives, anyone can trigger the
//! refund after `VRF_TIMEOUT_BLOCKS`. See `vrf.rs`.

mod curve;
mod events;
mod ft;
mod odds;
#[cfg(test)]
mod tests;
mod vrf;

use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::{FT_METADATA_SPEC, FungibleTokenMetadata};
use near_sdk::json_types::U128;
use near_sdk::serde::Deserialize;
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LazyOption, Vector};
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue, env,
    ext_contract, near, require,
};

pub use odds::Tier;

/// 1,000,000,000 tokens with 18 decimals.
pub const TOTAL_SUPPLY: u128 = 1_000_000_000 * ONE_TOKEN;
pub const ONE_TOKEN: u128 = 1_000_000_000_000_000_000;
pub const DECIMALS: u8 = 18;
pub const MAX_CREATOR_ALLOCATION: u128 = 100_000_000 * ONE_TOKEN;
pub const NFT_FEE_BPS: u32 = 50;
pub const PLATFORM_FEE_BPS: u32 = 20;
pub const MAX_PACKS_PER_CALL: u32 = 5;
pub const RECENT_PULLS: u32 = 50;
#[cfg(feature = "test-hooks")]
const FORCED_TIER_KEY: &[u8] = b"__test_forced_tier";
#[cfg(feature = "test-hooks")]
const DROP_CALLBACK_KEY: &[u8] = b"__test_drop_vrf_callback";

pub const ERR_NOT_USDT: &str = "Only the machine's USDT contract can call ft_on_transfer";

/// NEAR the machine attaches to a Mythic certificate mint (storage on the NFT contract; the excess is refunded).
pub const CERT_MINT_DEPOSIT: NearToken = NearToken::from_millinear(20);
/// NEAR (beyond what its storage locks) the machine keeps in reserve; below it, certificate mints are skipped.
pub const MIN_OPERATING_BALANCE: NearToken = NearToken::from_millinear(100);
const GAS_FOR_CERT_MINT: Gas = Gas::from_tgas(15);
const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_FOR_FT_TRANSFER_CALL: Gas = Gas::from_tgas(60);
const GAS_FOR_SWEEP_CALLBACK: Gas = Gas::from_tgas(10);
const GAS_FOR_SELL_CALLBACK: Gas = Gas::from_tgas(15);
const GAS_FOR_REFUND_CALLBACK: Gas = Gas::from_tgas(10);

/// NEAR attached to each OutLayer VRF request (one per pack payment). OutLayer charges what the run uses
/// (~0.0011 NEAR on testnet) and refunds the rest to the machine.
pub const VRF_DEPOSIT: NearToken = NearToken::from_millinear(10);
const GAS_FOR_VRF_REQUEST: Gas = Gas::from_tgas(150);
const GAS_FOR_VRF_CALLBACK: Gas = Gas::from_tgas(60);
/// After this many blocks (~5 minutes) without a settled result, anyone can refund a pending pull.
pub const VRF_TIMEOUT_BLOCKS: u64 = 300;
/// Largest OutLayer result the callback reads.
const MAX_VRF_RESULT_BYTES: usize = 16 * 1024;

#[ext_contract(ext_outlayer)]
#[allow(dead_code)]
trait OutLayer {
    fn request_execution(
        &mut self,
        source: near_sdk::serde_json::Value,
        resource_limits: Option<near_sdk::serde_json::Value>,
        input_data: Option<String>,
        secrets_ref: Option<near_sdk::serde_json::Value>,
        response_format: Option<String>,
        payer_account_id: Option<AccountId>,
    );
}

#[ext_contract(ext_usdt)]
#[allow(dead_code)]
trait Usdt {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn ft_transfer_call(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>, msg: String)
    -> PromiseOrValue<U128>;
}

#[ext_contract(ext_nft)]
#[allow(dead_code)]
trait GaballsNft {
    fn mint_certificate(&mut self, receiver_id: AccountId, machine: AccountId, pull_id: u64);
}

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Accounts,
    Metadata,
    RecentPulls,
    Pending,
}

/// Where verifiable randomness comes from. Fixed at launch like everything else (no setter).
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct VrfConfig {
    /// OutLayer contract: `outlayer.testnet` / `outlayer.near`.
    pub outlayer_contract: AccountId,
    /// OutLayer project that runs the VRF module, e.g. `zavodil2.testnet/vrf-ark`.
    pub project_id: String,
    /// OutLayer's VRF public key (32 bytes, hex), from `GET https://testnet-api.outlayer.ai/vrf/pubkey`.
    pub pubkey_hex: String,
}

/// A paid pack waiting for its VRF proof.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct PendingPull {
    pub request_id: u64,
    pub buyer: AccountId,
    pub count: u32,
    /// USDT held for this request (pack_price * count).
    pub usdt: U128,
    /// The user seed sent to OutLayer; the proof's alpha must end in it.
    pub seed: String,
    pub requested_at_block: u64,
    /// Block from which anyone can call `refund_expired`.
    pub refundable_from_block: u64,
    /// A refund transfer was attempted and failed; `refund_expired` can retry it.
    pub refund_failed: bool,
}

/// Launch arguments. Everything here is fixed forever once `new` runs: there are no setters.
#[near(serializers = [json])]
pub struct LaunchArgs {
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub creator: AccountId,
    /// 0 to 100M tokens (18 decimals). Whatever the creator does not take stays on the curve.
    pub creator_allocation: U128,
    pub usdt_contract: AccountId,
    pub nft_contract: AccountId,
    pub platform_account: AccountId,
    /// In USDT units (6 decimals). 10 USDT = 10_000_000.
    pub pack_price: U128,
    /// Virtual USDT reserve V (6 decimals). Default 3,000 USDT.
    pub virtual_usdt_reserve: U128,
    /// Tokens (18 decimals) put in the prize vault at launch. Default 100M.
    pub vault_seed: U128,
    /// Largest share of the current vault a single winning pull may take. Default 2,500 (25%).
    pub max_vault_draw_bps: u32,
    pub vrf: VrfConfig,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Config {
    pub creator: AccountId,
    pub usdt_contract: AccountId,
    pub nft_contract: AccountId,
    pub platform_account: AccountId,
    pub nft_token_id: String,
    pub pack_price: U128,
    pub virtual_usdt_reserve: U128,
    pub curve_inventory: U128,
    pub vault_seed: U128,
    pub creator_allocation: U128,
    pub max_vault_draw_bps: u32,
    pub nft_fee_bps: u32,
    pub platform_fee_bps: u32,
    pub launched_at_block: u64,
    pub vrf: VrfConfig,
    pub vrf_timeout_blocks: u64,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct Fees {
    pub nft_accrued: U128,
    pub platform_accrued: U128,
    pub nft_swept: U128,
    pub platform_swept: U128,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct Stats {
    pub packs_opened: u64,
    /// Pulls per tier, in odds-table order.
    pub tier_counts: Vec<u64>,
    pub capped_pulls: u64,
    pub total_usdt_in: U128,
    pub total_bought: U128,
    pub total_payout: U128,
    /// Highest multiplier actually paid (payout / bought, in bps, after any vault cap). 0 before the first pull.
    pub best_multiplier_bps: u32,
    pub best_pull_id: Option<u64>,
    /// Pack payments refunded because the VRF result failed, did not verify, or timed out.
    pub refunds: u64,
    pub total_usdt_refunded: U128,
    pub sells: u64,
    pub total_tokens_sold: U128,
    /// USDT taken out of the curve by sells, before fees.
    pub total_sell_usdt_gross: U128,
    /// USDT actually paid to sellers (gross minus fees).
    pub total_sell_usdt_paid: U128,
}

/// One pull, as stored in the recent-pulls ring buffer and emitted in `pack_opened`.
#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct PullRecord {
    pub pull_id: u64,
    pub buyer: AccountId,
    /// USDT paid for this pack, before fees.
    pub usdt_in: U128,
    /// USDT that entered the curve, after fees.
    pub usdt_to_curve: U128,
    pub roll: u16,
    pub tier: String,
    pub multiplier_bps: u32,
    pub bought: U128,
    pub payout: U128,
    pub vault_after: U128,
    pub price_before: U128,
    pub price_after: U128,
    pub capped: bool,
    /// A Mythic certificate mint was requested for this pull.
    pub certificate: bool,
    /// h_i = SHA-256(SHA-256(vrf_signature) ++ [i]); roll = first 8 bytes mod 10,000 (see vrf.rs).
    pub seed: String,
    pub block: u64,
    /// The pending request this pull settled (several pulls share one when a payment buys up to 5 packs).
    pub request_id: u64,
    /// The VRF proof: anyone can check ed25519_verify(vrf_signature, vrf_alpha, config.vrf.pubkey_hex).
    pub vrf_alpha: String,
    pub vrf_signature: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Machine {
    token: FungibleToken,
    metadata: LazyOption<FungibleTokenMetadata>,
    config: Config,
    odds: Vec<Tier>,
    /// R: real USDT reserve held by the curve.
    curve_usdt: u128,
    /// T: tokens still on the curve.
    curve_tokens: u128,
    vault: u128,
    fees: Fees,
    stats: Stats,
    recent_pulls: Vector<PullRecord>,
    pull_nonce: u64,
    /// VRF public key bytes (from config.vrf.pubkey_hex).
    vrf_pubkey: [u8; 32],
    pending: IterableMap<u64, PendingPull>,
    /// USDT held for pending pulls (not yet in the curve or fees).
    pending_usdt: u128,
    request_nonce: u64,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct PackMsg {
    action: String,
    count: u32,
}

#[near]
impl Machine {
    #[init]
    pub fn new(args: LaunchArgs) -> Self {
        let creator_allocation = args.creator_allocation.0;
        let vault_seed = args.vault_seed.0;
        require!(creator_allocation <= MAX_CREATOR_ALLOCATION, "creator_allocation is above 100M tokens");
        require!(vault_seed > 0, "vault_seed must be positive");
        require!(vault_seed + creator_allocation < TOTAL_SUPPLY, "vault_seed + creator_allocation leave no curve");
        require!(args.pack_price.0 > 0, "pack_price must be positive");
        require!(args.virtual_usdt_reserve.0 > 0, "virtual_usdt_reserve must be positive");
        require!(
            args.max_vault_draw_bps > 0 && args.max_vault_draw_bps <= odds::BPS,
            "max_vault_draw_bps must be in 1..=10000"
        );
        let vrf_pubkey: [u8; 32] = vrf::from_hex(&args.vrf.pubkey_hex)
            .and_then(|b| b.try_into().ok())
            .unwrap_or_else(|| env::panic_str("vrf.pubkey_hex must be 32 bytes of hex"));
        require!(!args.vrf.project_id.is_empty(), "vrf.project_id is empty");

        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: args.name,
            symbol: args.symbol,
            icon: args.icon,
            reference: None,
            reference_hash: None,
            decimals: DECIMALS,
        };
        metadata.assert_valid();

        let machine_id = env::current_account_id();
        let curve_inventory = TOTAL_SUPPLY - vault_seed - creator_allocation;
        let odds = odds::default_odds();
        require!(odds.iter().map(|t| u32::from(t.chance_bps)).sum::<u32>() == odds::BPS, "odds must sum to 10000");

        let config = Config {
            creator: args.creator,
            usdt_contract: args.usdt_contract,
            nft_contract: args.nft_contract,
            platform_account: args.platform_account,
            nft_token_id: format!("machine:{machine_id}"),
            pack_price: args.pack_price,
            virtual_usdt_reserve: args.virtual_usdt_reserve,
            curve_inventory: U128(curve_inventory),
            vault_seed: args.vault_seed,
            creator_allocation: args.creator_allocation,
            max_vault_draw_bps: args.max_vault_draw_bps,
            nft_fee_bps: NFT_FEE_BPS,
            platform_fee_bps: PLATFORM_FEE_BPS,
            launched_at_block: env::block_height(),
            vrf: args.vrf,
            vrf_timeout_blocks: VRF_TIMEOUT_BLOCKS,
        };

        let mut this = Self {
            token: FungibleToken::new(StorageKey::Accounts),
            metadata: LazyOption::new(StorageKey::Metadata, Some(metadata)),
            stats: Stats { tier_counts: vec![0; odds.len()], ..Default::default() },
            odds,
            curve_usdt: 0,
            curve_tokens: curve_inventory,
            vault: vault_seed,
            fees: Fees::default(),
            recent_pulls: Vector::new(StorageKey::RecentPulls),
            pull_nonce: 0,
            vrf_pubkey,
            pending: IterableMap::new(StorageKey::Pending),
            pending_usdt: 0,
            request_nonce: 0,
            config,
        };

        // Mint the whole supply once: curve + vault to the machine itself, the allocation to the creator.
        this.token.internal_register_account(&machine_id);
        this.token.internal_deposit(&machine_id, curve_inventory + vault_seed);
        let creator = this.config.creator.clone();
        if creator != machine_id {
            this.token.internal_register_account(&creator);
        }
        if creator_allocation > 0 {
            this.token.internal_deposit(&creator, creator_allocation);
        }
        FtMint::emit_many(&[
            FtMint { owner_id: &machine_id, amount: U128(curve_inventory + vault_seed), memo: Some("curve + vault") },
            FtMint { owner_id: &creator, amount: U128(creator_allocation), memo: Some("creator allocation") },
        ]);

        events::emit(
            "machine_launched",
            &json!({
                "machine": machine_id,
                "config": &this.config,
                "odds": &this.odds,
                "total_supply": U128(TOTAL_SUPPLY),
            }),
        );
        this
    }

    /// Anyone can call. Sends accrued creator fees to the Machine NFT (`ft_transfer_call` to the NFT contract with
    /// `{"token_id": "<machine nft id>"}`) and platform fees to the platform account. Accruals move to "swept"
    /// immediately; each callback moves back whatever was not delivered, so a failed transfer loses nothing.
    pub fn sweep_fees(&mut self) -> Fees {
        let nft = self.fees.nft_accrued.0;
        let platform = self.fees.platform_accrued.0;
        self.fees.nft_accrued = U128(0);
        self.fees.platform_accrued = U128(0);
        self.fees.nft_swept = U128(self.fees.nft_swept.0 + nft);
        self.fees.platform_swept = U128(self.fees.platform_swept.0 + platform);

        if nft > 0 {
            let msg = json!({ "token_id": self.config.nft_token_id }).to_string();
            ext_usdt::ext(self.config.usdt_contract.clone())
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(GAS_FOR_FT_TRANSFER_CALL)
                .ft_transfer_call(self.config.nft_contract.clone(), U128(nft), Some("gaballs creator fees".into()), msg)
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_FOR_SWEEP_CALLBACK)
                        .on_nft_fees_swept(U128(nft)),
                )
                .detach();
        }
        if platform > 0 {
            ext_usdt::ext(self.config.usdt_contract.clone())
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(GAS_FOR_FT_TRANSFER)
                .ft_transfer(self.config.platform_account.clone(), U128(platform), Some("gaballs platform fees".into()))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_FOR_SWEEP_CALLBACK)
                        .on_platform_fees_swept(U128(platform)),
                )
                .detach();
        }
        self.fees.clone()
    }

    /// `ft_transfer_call` returns how much the NFT contract kept; anything unused (or everything, on failure)
    /// goes back to `nft_accrued`.
    #[private]
    pub fn on_nft_fees_swept(&mut self, amount: U128, #[callback_result] used: Result<U128, PromiseError>) -> U128 {
        let delivered = used.map(|u| u.0.min(amount.0)).unwrap_or(0);
        let undelivered = amount.0 - delivered;
        if undelivered > 0 {
            self.fees.nft_swept = U128(self.fees.nft_swept.0 - undelivered);
            self.fees.nft_accrued = U128(self.fees.nft_accrued.0 + undelivered);
        }
        events::emit(
            "fees_swept",
            &json!({
                "to": "nft",
                "nft_token_id": self.config.nft_token_id,
                "amount": amount,
                "delivered": U128(delivered),
                "restored": U128(undelivered),
            }),
        );
        U128(delivered)
    }

    #[private]
    pub fn on_platform_fees_swept(&mut self, amount: U128) -> U128 {
        let delivered = if env::promise_result_checked(0, 0).is_ok() { amount.0 } else { 0 };
        let undelivered = amount.0 - delivered;
        if undelivered > 0 {
            self.fees.platform_swept = U128(self.fees.platform_swept.0 - undelivered);
            self.fees.platform_accrued = U128(self.fees.platform_accrued.0 + undelivered);
        }
        events::emit(
            "fees_swept",
            &json!({
                "to": "platform",
                "platform_account": self.config.platform_account,
                "amount": amount,
                "delivered": U128(delivered),
                "restored": U128(undelivered),
            }),
        );
        U128(delivered)
    }

    // ---------------------------------------------------------------- VRF settlement

    /// OutLayer's answer for `request_id`. Never panics: a missing, malformed or unverifiable proof refunds the
    /// USDT. A request that was already settled or refunded (duplicate or late callback) is ignored.
    /// Returns true when the packs were opened.
    #[private]
    pub fn on_vrf_result(&mut self, request_id: u64) -> bool {
        let Some(pending) = self.pending.remove(&request_id) else {
            env::log_str(&format!("VRF result for request {request_id} ignored: not pending (already settled or refunded)"));
            return false;
        };
        self.pending_usdt -= pending.usdt.0;
        let checked = match env::promise_result_checked(0, MAX_VRF_RESULT_BYTES) {
            Ok(raw) => vrf::verify(&raw, &self.vrf_pubkey, &pending.seed),
            Err(_) => Err("OutLayer VRF request failed".to_string()),
        };
        let proof = match checked {
            Ok(proof) => proof,
            Err(reason) => {
                self.refund(pending, &reason);
                return false;
            }
        };
        // The curve may have moved since the request; refund rather than settle a pack that buys nothing.
        if let Err(reason) = self.check_curve_for(pending.count) {
            self.refund(pending, &reason);
            return false;
        }
        let rolls = vrf::rolls(&proof.signature, pending.count);
        let signature_hex = to_hex(&proof.signature);
        for (roll, h) in rolls {
            let pull_id = self.pull_nonce;
            self.pull_nonce += 1;
            #[allow(unused_mut)]
            let mut tier = odds::tier_for_roll(&self.odds, roll);
            #[cfg(feature = "test-hooks")]
            if let Some(forced) = env::storage_read(FORCED_TIER_KEY) {
                env::storage_remove(FORCED_TIER_KEY);
                tier = usize::from(forced[0]);
            }
            let vrf = VrfInfo { request_id, alpha: proof.alpha.clone(), signature_hex: signature_hex.clone() };
            self.settle_pack(&pending.buyer, pull_id, roll, tier, h, vrf);
        }
        true
    }

    /// Anyone can call once `refundable_from_block` has passed (or to retry a refund whose transfer failed):
    /// returns the pending pull's USDT to the buyer. A VRF result arriving later is ignored.
    pub fn refund_expired(&mut self, request_id: u64) {
        let pending = self.pending.get(&request_id).cloned().unwrap_or_else(|| env::panic_str("no such pending pull"));
        require!(
            pending.refund_failed || env::block_height() >= pending.refundable_from_block,
            format!("not refundable before block {}", pending.refundable_from_block)
        );
        self.pending.remove(&request_id);
        self.pending_usdt -= pending.usdt.0;
        self.refund(pending, "VRF timeout");
    }

    /// The refund transfer's result. On failure the pull goes back to pending (flagged), so `refund_expired` can
    /// retry it at once; nothing is lost.
    #[private]
    pub fn on_refund_sent(&mut self, pending: PendingPull, reason: String) -> bool {
        let ok = env::promise_result_checked(0, 0).is_ok();
        if ok {
            self.stats.refunds += 1;
            self.stats.total_usdt_refunded = U128(self.stats.total_usdt_refunded.0 + pending.usdt.0);
        } else {
            self.pending_usdt += pending.usdt.0;
            self.pending.insert(pending.request_id, PendingPull { refund_failed: true, ..pending.clone() });
        }
        events::emit(
            "pack_refunded",
            &json!({
                "request_id": pending.request_id,
                "buyer": pending.buyer,
                "count": pending.count,
                "usdt": pending.usdt,
                "reason": reason,
                "delivered": ok,
            }),
        );
        ok
    }

    // ---------------------------------------------------------------- sell-back

    /// Sells `amount` tokens back to the curve. usdt_out = (V+R) - (V+R)*T/(T+s) (seller gets the floor); the sale is
    /// rejected if usdt_out > R. Fees (0.5% Machine NFT, 0.2% platform) come out of usdt_out; the seller receives the
    /// rest, which must be at least `min_usdt_out` (slippage guard). Attach 1 yoctoNEAR. If the USDT transfer fails,
    /// the callback restores the curve and fees and returns the tokens.
    #[payable]
    pub fn sell(&mut self, amount: U128, min_usdt_out: U128) -> Promise {
        near_sdk::assert_one_yocto();
        let seller = env::predecessor_account_id();
        let machine = env::current_account_id();
        require!(seller != machine, "the machine cannot sell to itself");
        require!(amount.0 > 0, "amount must be positive");
        let q = self.quote_sell_inner(amount.0).unwrap_or_else(|e| env::panic_str(&e));
        require!(
            q.usdt_out >= min_usdt_out.0,
            format!("slippage: would receive {} USDT units, below min_usdt_out {}", q.usdt_out, min_usdt_out.0)
        );

        let price_before = self.price();
        // Tokens go back into the machine's balance (curve inventory). Panics if the seller has too few.
        self.token.internal_transfer(&seller, &machine, amount.0, Some("gaballs sell".to_string()));
        self.curve_tokens += amount.0;
        self.curve_usdt -= q.usdt_gross;
        self.fees.nft_accrued = U128(self.fees.nft_accrued.0 + q.nft_fee);
        self.fees.platform_accrued = U128(self.fees.platform_accrued.0 + q.platform_fee);
        self.stats.sells += 1;
        self.stats.total_tokens_sold = U128(self.stats.total_tokens_sold.0 + amount.0);
        self.stats.total_sell_usdt_gross = U128(self.stats.total_sell_usdt_gross.0 + q.usdt_gross);
        self.stats.total_sell_usdt_paid = U128(self.stats.total_sell_usdt_paid.0 + q.usdt_out);

        events::emit(
            "tokens_sold",
            &json!({
                "seller": seller,
                "amount": amount,
                "usdt_gross": U128(q.usdt_gross),
                "nft_fee": U128(q.nft_fee),
                "platform_fee": U128(q.platform_fee),
                "usdt_out": U128(q.usdt_out),
                "price_before": U128(price_before),
                "price_after": U128(self.price()),
                "block": env::block_height(),
            }),
        );

        ext_usdt::ext(self.config.usdt_contract.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(seller.clone(), U128(q.usdt_out), Some("gaballs sell".into()))
            .then(Self::ext(machine).with_static_gas(GAS_FOR_SELL_CALLBACK).on_sell_transfer(
                seller,
                amount,
                U128(q.usdt_gross),
                U128(q.nft_fee),
                U128(q.platform_fee),
            ))
    }

    /// Returns the USDT paid to the seller (0 if the transfer failed and the sale was undone).
    #[private]
    pub fn on_sell_transfer(
        &mut self,
        seller: AccountId,
        amount: U128,
        usdt_gross: U128,
        nft_fee: U128,
        platform_fee: U128,
    ) -> U128 {
        let paid = usdt_gross.0 - nft_fee.0 - platform_fee.0;
        if env::promise_result_checked(0, 0).is_ok() {
            return U128(paid);
        }
        // Undo. Fees swept in the meantime already left the machine; only what is still accrued can be pulled back,
        // and the curve gets back exactly the USDT still held for this sale.
        let nft_back = nft_fee.0.min(self.fees.nft_accrued.0);
        let platform_back = platform_fee.0.min(self.fees.platform_accrued.0);
        self.fees.nft_accrued = U128(self.fees.nft_accrued.0 - nft_back);
        self.fees.platform_accrued = U128(self.fees.platform_accrued.0 - platform_back);
        self.curve_usdt += paid + nft_back + platform_back;
        self.curve_tokens -= amount.0;
        self.token.internal_transfer(&env::current_account_id(), &seller, amount.0, Some("gaballs sell undone".into()));
        self.stats.sells -= 1;
        self.stats.total_tokens_sold = U128(self.stats.total_tokens_sold.0 - amount.0);
        self.stats.total_sell_usdt_gross = U128(self.stats.total_sell_usdt_gross.0 - usdt_gross.0);
        self.stats.total_sell_usdt_paid = U128(self.stats.total_sell_usdt_paid.0 - paid);
        events::emit(
            "sell_undone",
            &json!({ "seller": seller, "amount": amount, "usdt_gross": usdt_gross, "reason": "USDT transfer failed" }),
        );
        U128(0)
    }

    /// TEST BUILDS ONLY (`--features test-hooks`): the next pull lands on `tier` instead of its random roll.
    /// Production wasm is built without this feature, so the method does not exist on deployed machines.
    #[cfg(feature = "test-hooks")]
    pub fn test_force_next_tier(&mut self, tier: u8) {
        require!(usize::from(tier) < self.odds.len(), "no such tier");
        env::storage_write(FORCED_TIER_KEY, &[tier]);
    }

    /// TEST BUILDS ONLY: the next VRF request is sent without a callback, so its pull stays pending. Lets the
    /// sandbox test the "no callback ever arrives" timeout refund, which a healthy chain never produces on its own.
    #[cfg(feature = "test-hooks")]
    pub fn test_drop_next_vrf_callback(&mut self) {
        env::storage_write(DROP_CALLBACK_KEY, &[1]);
    }

    // ---------------------------------------------------------------- views

    pub fn get_machine(&self) -> MachineView {
        MachineView {
            machine: env::current_account_id(),
            config: self.config.clone(),
            curve_usdt_reserve: U128(self.curve_usdt),
            curve_tokens: U128(self.curve_tokens),
            vault: U128(self.vault),
            price_usdt_wad: U128(self.price()),
            market_cap_usdt: U128(self.value_in_usdt(TOTAL_SUPPLY)),
            circulating_supply: U128(self.circulating_supply()),
            circulating_market_cap_usdt: U128(self.value_in_usdt(self.circulating_supply())),
            packs_opened: self.stats.packs_opened,
            best_multiplier_bps: self.stats.best_multiplier_bps,
            total_supply: U128(self.token.total_supply),
            fees: self.fees.clone(),
            stats: self.stats.clone(),
            pull_nonce: self.pull_nonce,
            pending_usdt: U128(self.pending_usdt),
            pending_count: self.pending.len(),
            request_nonce: self.request_nonce,
        }
    }

    /// What selling `amount` tokens would pay right now: gross USDT out of the curve, fees, and what the seller
    /// receives. Fails (with the reason) if the curve does not hold enough real USDT.
    pub fn quote_sell(&self, amount: U128) -> SellQuote {
        let q = self.quote_sell_inner(amount.0).unwrap_or_else(|e| env::panic_str(&e));
        SellQuote {
            amount,
            usdt_gross: U128(q.usdt_gross),
            nft_fee: U128(q.nft_fee),
            platform_fee: U128(q.platform_fee),
            usdt_out: U128(q.usdt_out),
            price_after: U128(q.price_after),
        }
    }

    /// Pending pulls, oldest first; only `account_id`'s if given.
    pub fn get_pending(&self, account_id: Option<AccountId>) -> Vec<PendingPull> {
        let mut out: Vec<PendingPull> =
            self.pending.values().filter(|p| account_id.as_ref().is_none_or(|a| &p.buyer == a)).cloned().collect();
        out.sort_by_key(|p| p.request_id);
        out
    }

    pub fn get_pending_pull(&self, request_id: u64) -> Option<PendingPull> {
        self.pending.get(&request_id).cloned()
    }

    pub fn get_odds(&self) -> OddsView {
        OddsView { tiers: self.odds.clone(), expected_multiplier_bps: odds::expected_multiplier_bps(&self.odds) }
    }

    /// What `count` packs would buy right now (no randomness): fees, USDT into the curve, tokens bought,
    /// and the expected payout at the odds table's expected multiplier.
    pub fn quote_pack(&self, count: u32) -> PackQuote {
        require!(count >= 1 && count <= MAX_PACKS_PER_CALL, "count must be 1..=5");
        let (nft_fee, platform_fee, to_curve) = self.split_pack_price();
        let (v, mut r, mut t) = (self.config.virtual_usdt_reserve.0, self.curve_usdt, self.curve_tokens);
        let mut bought = 0u128;
        for _ in 0..count {
            let b = curve::tokens_out(v, r, t, to_curve);
            r += to_curve;
            t -= b;
            bought += b;
        }
        let n = u128::from(count);
        PackQuote {
            count,
            usdt_total: U128(self.config.pack_price.0 * n),
            fees: U128((nft_fee + platform_fee) * n),
            usdt_to_curve: U128(to_curve * n),
            bought: U128(bought),
            expected_payout: U128(curve::bps_of(bought, odds::expected_multiplier_bps(&self.odds))),
            price_now: U128(self.price()),
        }
    }

    /// Up to the last 50 pulls, newest first.
    pub fn get_recent_pulls(&self) -> Vec<PullRecord> {
        let oldest = self.pull_nonce.saturating_sub(u64::from(RECENT_PULLS));
        (oldest..self.pull_nonce)
            .rev()
            .filter_map(|id| self.recent_pulls.get((id % u64::from(RECENT_PULLS)) as u32).cloned())
            .collect()
    }
}

#[near(serializers = [json])]
pub struct MachineView {
    pub machine: AccountId,
    pub config: Config,
    pub curve_usdt_reserve: U128,
    pub curve_tokens: U128,
    pub vault: U128,
    /// USDT per whole token, scaled by 10^18.
    pub price_usdt_wad: U128,
    /// price x total supply (1B), in USDT units (6 decimals).
    pub market_cap_usdt: U128,
    /// Tokens outside the curve and the vault (held by the creator and buyers).
    pub circulating_supply: U128,
    /// price x circulating supply, in USDT units (6 decimals).
    pub circulating_market_cap_usdt: U128,
    pub packs_opened: u64,
    /// Highest multiplier actually paid so far, in bps (80,000 = 8x).
    pub best_multiplier_bps: u32,
    pub total_supply: U128,
    pub fees: Fees,
    pub stats: Stats,
    pub pull_nonce: u64,
    /// USDT held for pulls waiting for their VRF proof.
    pub pending_usdt: U128,
    pub pending_count: u32,
    pub request_nonce: u64,
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
pub struct SellQuote {
    pub amount: U128,
    /// USDT leaving the curve, before fees.
    pub usdt_gross: U128,
    pub nft_fee: U128,
    pub platform_fee: U128,
    /// What the seller receives.
    pub usdt_out: U128,
    pub price_after: U128,
}

/// Sell maths in plain integers (see `quote_sell_inner`).
pub(crate) struct SellCalc {
    pub usdt_gross: u128,
    pub nft_fee: u128,
    pub platform_fee: u128,
    pub usdt_out: u128,
    pub price_after: u128,
}

/// The VRF proof a set of pulls was settled with.
pub(crate) struct VrfInfo {
    pub request_id: u64,
    pub alpha: String,
    pub signature_hex: String,
}

#[near(serializers = [json])]
pub struct OddsView {
    pub tiers: Vec<Tier>,
    pub expected_multiplier_bps: u32,
}

#[near(serializers = [json])]
pub struct PackQuote {
    pub count: u32,
    pub usdt_total: U128,
    pub fees: U128,
    pub usdt_to_curve: U128,
    pub bought: U128,
    pub expected_payout: U128,
    pub price_now: U128,
}

// -------------------------------------------------------------------- internals

impl Machine {
    fn price(&self) -> u128 {
        curve::price_wad(self.config.virtual_usdt_reserve.0, self.curve_usdt, self.curve_tokens)
    }

    /// `tokens` valued at the current spot price, in USDT units (6 decimals): tokens * (V + R) / T.
    fn value_in_usdt(&self, tokens: u128) -> u128 {
        curve::mul_div(tokens, self.config.virtual_usdt_reserve.0 + self.curve_usdt, self.curve_tokens)
    }

    fn circulating_supply(&self) -> u128 {
        TOTAL_SUPPLY - self.curve_tokens - self.vault
    }

    /// (nft fee, platform fee, USDT into the curve) for one pack. Fees round down.
    fn split_pack_price(&self) -> (u128, u128, u128) {
        let price = self.config.pack_price.0;
        let nft_fee = curve::bps_of(price, self.config.nft_fee_bps);
        let platform_fee = curve::bps_of(price, self.config.platform_fee_bps);
        (nft_fee, platform_fee, price - nft_fee - platform_fee)
    }

    /// Checks everything that could make a pull fail *before* any state changes, so a pack either fully
    /// settles or the whole payment is refunded. Returns the pack count or the refund reason.
    fn validate_pack_request(&self, buyer: &AccountId, amount: u128, msg: &str) -> Result<u32, String> {
        let req: PackMsg = serde_json::from_str(msg).map_err(|e| format!("bad msg: {e}"))?;
        if req.action != "open_pack" {
            return Err(format!("unknown action '{}'", req.action));
        }
        if req.count == 0 || req.count > MAX_PACKS_PER_CALL {
            return Err("count must be 1..=5".to_string());
        }
        let expected = self.config.pack_price.0 * u128::from(req.count);
        if amount != expected {
            return Err(format!("amount {amount} != pack_price * count = {expected}"));
        }
        if !self.token.accounts.contains_key(buyer) {
            return Err(format!("{buyer} is not registered on this token (call storage_deposit first)"));
        }
        if buyer == &env::current_account_id() {
            return Err("the machine cannot buy from itself".to_string());
        }
        self.check_curve_for(req.count)?;
        // The machine pays OutLayer from its own NEAR; without enough, refund now rather than strand the USDT.
        if free_near_balance() < MIN_OPERATING_BALANCE.saturating_add(VRF_DEPOSIT) {
            return Err("machine NEAR balance too low to pay for VRF (anyone can top it up)".to_string());
        }
        Ok(req.count)
    }

    /// A curve that is nearly sold out could give 0 tokens for a pack; refund instead of panicking.
    fn check_curve_for(&self, count: u32) -> Result<(), String> {
        let (_, _, to_curve) = self.split_pack_price();
        let (v, mut r, mut t) = (self.config.virtual_usdt_reserve.0, self.curve_usdt, self.curve_tokens);
        for _ in 0..count {
            let b = curve::tokens_out(v, r, t, to_curve);
            if b == 0 {
                return Err("curve inventory too low for this pack".to_string());
            }
            r += to_curve;
            t -= b;
        }
        Ok(())
    }

    /// Records a pending pull for a validated payment and asks OutLayer for one VRF proof. The USDT stays with the
    /// machine (ft_on_transfer returns 0); `on_vrf_result` settles it or refunds it.
    pub(crate) fn request_pull(&mut self, buyer: AccountId, usdt: u128, count: u32) -> PendingPull {
        let request_id = self.request_nonce;
        self.request_nonce += 1;
        let machine = env::current_account_id();
        let block = env::block_height();
        let pending = PendingPull {
            request_id,
            buyer,
            count,
            usdt: U128(usdt),
            seed: vrf::seed_for(&machine, request_id),
            requested_at_block: block,
            refundable_from_block: block + VRF_TIMEOUT_BLOCKS,
            refund_failed: false,
        };
        self.pending.insert(request_id, pending.clone());
        self.pending_usdt += usdt;
        events::emit("pack_requested", &pending);

        let input = json!({ "seed": pending.seed, "max": odds::BPS - 1 }).to_string();
        let request = ext_outlayer::ext(self.config.vrf.outlayer_contract.clone())
            .with_attached_deposit(VRF_DEPOSIT)
            .with_static_gas(GAS_FOR_VRF_REQUEST)
            .request_execution(
                json!({ "Project": { "project_id": self.config.vrf.project_id } }),
                Some(json!({ "max_instructions": 1_000_000_000u64, "max_memory_mb": 128, "max_execution_seconds": 30 })),
                Some(input),
                None,
                Some("Json".to_string()),
                None,
            );
        #[cfg(feature = "test-hooks")]
        if env::storage_remove(DROP_CALLBACK_KEY) {
            request.detach();
            return pending;
        }
        request.then(Self::ext(machine).with_static_gas(GAS_FOR_VRF_CALLBACK).on_vrf_result(request_id)).detach();
        pending
    }

    /// Sends a pending pull's USDT back to the buyer. The caller has already removed it from `pending`.
    fn refund(&mut self, pending: PendingPull, reason: &str) {
        env::log_str(&format!("refund request {}: {reason}", pending.request_id));
        ext_usdt::ext(self.config.usdt_contract.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(pending.buyer.clone(), pending.usdt, Some("gaballs pack refund".into()))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_REFUND_CALLBACK)
                    .on_refund_sent(pending, reason.to_string()),
            )
            .detach();
    }

    pub(crate) fn quote_sell_inner(&self, amount: u128) -> Result<SellCalc, String> {
        if amount == 0 {
            return Err("amount must be positive".to_string());
        }
        let (v, r, t) = (self.config.virtual_usdt_reserve.0, self.curve_usdt, self.curve_tokens);
        let usdt_gross = curve::usdt_out(v, r, t, amount);
        if usdt_gross > r {
            return Err(format!("the curve holds only {r} USDT units; this sale needs {usdt_gross}"));
        }
        let nft_fee = curve::bps_of(usdt_gross, self.config.nft_fee_bps);
        let platform_fee = curve::bps_of(usdt_gross, self.config.platform_fee_bps);
        let usdt_out = usdt_gross - nft_fee - platform_fee;
        if usdt_out == 0 {
            return Err("this sale is too small to pay out any USDT".to_string());
        }
        let price_after = curve::price_wad(v, r - usdt_gross, t + amount);
        Ok(SellCalc { usdt_gross, nft_fee, platform_fee, usdt_out, price_after })
    }

    /// Buys on the curve, applies the tier multiplier against the vault, pays the buyer and records the
    /// pull. Callers must have checked the curve (`check_curve_for`); nothing in here can panic for a valid request.
    pub(crate) fn settle_pack(
        &mut self,
        buyer: &AccountId,
        pull_id: u64,
        roll: u16,
        tier: usize,
        seed: [u8; 32],
        vrf: VrfInfo,
    ) -> PullRecord {
        let (nft_fee, platform_fee, to_curve) = self.split_pack_price();
        self.fees.nft_accrued = U128(self.fees.nft_accrued.0 + nft_fee);
        self.fees.platform_accrued = U128(self.fees.platform_accrued.0 + platform_fee);

        // 1. Market buy on the curve.
        let price_before = self.price();
        let bought = curve::tokens_out(self.config.virtual_usdt_reserve.0, self.curve_usdt, self.curve_tokens, to_curve);
        self.curve_usdt += to_curve;
        self.curve_tokens -= bought;

        // 2. Multiply against the vault.
        let multiplier_bps = self.odds[tier].multiplier_bps;
        let raw_payout = curve::bps_of(bought, multiplier_bps);
        let (payout, capped) = if raw_payout < bought {
            self.vault += bought - raw_payout;
            (raw_payout, false)
        } else {
            let extra = raw_payout - bought;
            let limit = curve::bps_of(self.vault, self.config.max_vault_draw_bps);
            let draw = extra.min(limit);
            self.vault -= draw;
            (bought + draw, extra > limit)
        };

        // 3. Pay the buyer: an internal ledger move from the machine's balance (curve + vault).
        let machine_id = env::current_account_id();
        if payout > 0 {
            self.token.internal_transfer(&machine_id, buyer, payout, Some("gaballs pack payout".to_string()));
        }

        // 4. Mythic: mint a soulbound certificate. Detached: a failed mint never undoes the token payout.
        let certificate = tier == odds::MYTHIC && free_near_balance() >= MIN_OPERATING_BALANCE.saturating_add(CERT_MINT_DEPOSIT);
        if certificate {
            ext_nft::ext(self.config.nft_contract.clone())
                .with_attached_deposit(CERT_MINT_DEPOSIT)
                .with_static_gas(GAS_FOR_CERT_MINT)
                .mint_certificate(buyer.clone(), machine_id.clone(), pull_id)
                .detach();
        } else if tier == odds::MYTHIC {
            env::log_str("certificate mint skipped: machine NEAR balance too low");
        }

        // 5. Stats, ring buffer, event.
        self.stats.packs_opened += 1;
        self.stats.tier_counts[tier] += 1;
        self.stats.capped_pulls += u64::from(capped);
        self.stats.total_usdt_in = U128(self.stats.total_usdt_in.0 + self.config.pack_price.0);
        self.stats.total_bought = U128(self.stats.total_bought.0 + bought);
        self.stats.total_payout = U128(self.stats.total_payout.0 + payout);
        let effective_bps = curve::mul_div(payout, u128::from(odds::BPS), bought) as u32;
        if self.stats.best_pull_id.is_none() || effective_bps > self.stats.best_multiplier_bps {
            self.stats.best_multiplier_bps = effective_bps;
            self.stats.best_pull_id = Some(pull_id);
        }

        let record = PullRecord {
            pull_id,
            buyer: buyer.clone(),
            usdt_in: self.config.pack_price,
            usdt_to_curve: U128(to_curve),
            roll,
            tier: self.odds[tier].name.clone(),
            multiplier_bps,
            bought: U128(bought),
            payout: U128(payout),
            vault_after: U128(self.vault),
            price_before: U128(price_before),
            price_after: U128(self.price()),
            capped,
            certificate,
            seed: to_hex(&seed),
            block: env::block_height(),
            request_id: vrf.request_id,
            vrf_alpha: vrf.alpha,
            vrf_signature: vrf.signature_hex,
        };
        let slot = (pull_id % u64::from(RECENT_PULLS)) as u32;
        if slot < self.recent_pulls.len() {
            self.recent_pulls.set(slot, record.clone());
        } else {
            self.recent_pulls.push(record.clone());
        }
        events::emit("pack_opened", &record);
        record
    }
}

/// NEAR not locked for storage: account balance minus storage_usage * byte cost.
fn free_near_balance() -> NearToken {
    env::account_balance().saturating_sub(env::storage_byte_cost().saturating_mul(u128::from(env::storage_usage())))
}

fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    bytes.iter().flat_map(|b| [HEX[(b >> 4) as usize] as char, HEX[(b & 0xf) as usize] as char]).collect()
}
