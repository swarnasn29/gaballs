//! Gaballs machine + token (CLAUDE.md section 3.1).
//!
//! One contract is both the memecoin (NEP-141/145/148) and the gacha machine. A pack is paid in USDT via
//! `ft_transfer_call` → `ft_on_transfer`, buys tokens on this machine's own bonding curve, and a roll on
//! the fixed odds table multiplies what the buyer receives. The prize vault absorbs the difference.
//!
//! Token accounting: the machine's own account holds the curve inventory plus the vault, so
//! `ft_balance_of(machine) == curve_tokens + vault` at all times and total supply never changes.

mod curve;
mod events;
mod ft;
mod odds;
#[cfg(test)]
mod tests;

use near_contract_standards::fungible_token::FungibleToken;
use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::{FT_METADATA_SPEC, FungibleTokenMetadata};
use near_sdk::json_types::U128;
use near_sdk::serde::Deserialize;
use near_sdk::serde_json::{self, json};
use near_sdk::store::{LazyOption, Vector};
use near_sdk::{AccountId, BorshStorageKey, PanicOnDefault, env, near, require};

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

pub const ERR_NOT_USDT: &str = "Only the machine's USDT contract can call ft_on_transfer";

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Accounts,
    Metadata,
    RecentPulls,
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
    pub seed: String,
    pub block: u64,
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

    /// Moves accrued fees to the "swept" counters and emits `fees_swept`.
    /// Phase 1 stub: amounts are recorded only; the USDT transfers to the Machine NFT and the platform
    /// account (with a restore-on-failure callback) are wired in Phase 2.
    pub fn sweep_fees(&mut self) -> Fees {
        let nft = self.fees.nft_accrued.0;
        let platform = self.fees.platform_accrued.0;
        self.fees.nft_accrued = U128(0);
        self.fees.platform_accrued = U128(0);
        self.fees.nft_swept = U128(self.fees.nft_swept.0 + nft);
        self.fees.platform_swept = U128(self.fees.platform_swept.0 + platform);
        events::emit(
            "fees_swept",
            &json!({
                "nft_token_id": self.config.nft_token_id,
                "nft_amount": U128(nft),
                "platform_account": self.config.platform_account,
                "platform_amount": U128(platform),
                "transferred": false,
            }),
        );
        self.fees.clone()
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
            total_supply: U128(self.token.total_supply),
            fees: self.fees.clone(),
            stats: self.stats.clone(),
            pull_nonce: self.pull_nonce,
        }
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
    pub total_supply: U128,
    pub fees: Fees,
    pub stats: Stats,
    pub pull_nonce: u64,
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
        // A curve that is nearly sold out could give 0 tokens for a pack; refund instead of panicking.
        let (_, _, to_curve) = self.split_pack_price();
        let (v, mut r, mut t) = (self.config.virtual_usdt_reserve.0, self.curve_usdt, self.curve_tokens);
        for _ in 0..req.count {
            let b = curve::tokens_out(v, r, t, to_curve);
            if b == 0 {
                return Err("curve inventory too low for this pack".to_string());
            }
            r += to_curve;
            t -= b;
        }
        Ok(req.count)
    }

    /// The only source of randomness. seed = sha256(random_seed ++ buyer ++ nonce);
    /// roll = first 8 bytes of the seed as a big-endian u64, mod 10,000.
    /// Phase 5 swaps this for OutLayer VRF without touching anything else.
    pub(crate) fn draw_roll(buyer: &AccountId, nonce: u64) -> (u16, [u8; 32]) {
        let mut data = env::random_seed();
        data.extend_from_slice(buyer.as_bytes());
        data.extend_from_slice(&nonce.to_le_bytes());
        let seed = env::sha256_array(&data);
        let first8: [u8; 8] = seed[..8].try_into().unwrap();
        ((u64::from_be_bytes(first8) % u64::from(odds::BPS)) as u16, seed)
    }

    fn open_one_pack(&mut self, buyer: &AccountId) -> PullRecord {
        let pull_id = self.pull_nonce;
        self.pull_nonce += 1;
        let (roll, seed) = Self::draw_roll(buyer, pull_id);
        let tier = odds::tier_for_roll(&self.odds, roll);
        self.settle_pack(buyer, pull_id, roll, tier, seed)
    }

    /// Buys on the curve, applies the tier multiplier against the vault, pays the buyer and records the
    /// pull. Callers must have run `validate_pack_request`; nothing in here can panic for a valid request.
    pub(crate) fn settle_pack(
        &mut self,
        buyer: &AccountId,
        pull_id: u64,
        roll: u16,
        tier: usize,
        seed: [u8; 32],
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

        // 4. Stats, ring buffer, event.
        self.stats.packs_opened += 1;
        self.stats.tier_counts[tier] += 1;
        self.stats.capped_pulls += u64::from(capped);
        self.stats.total_usdt_in = U128(self.stats.total_usdt_in.0 + self.config.pack_price.0);
        self.stats.total_bought = U128(self.stats.total_bought.0 + bought);
        self.stats.total_payout = U128(self.stats.total_payout.0 + payout);

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
            seed: to_hex(&seed),
            block: env::block_height(),
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

fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    bytes.iter().flat_map(|b| [HEX[(b >> 4) as usize] as char, HEX[(b & 0xf) as usize] as char]).collect()
}
