//! Gaballs NFT contract (CLAUDE.md section 3.2, docs/THREAT_MODEL.md).
//!
//! Two kinds of token:
//! - `machine:<machine_account>` — the transferable Machine Ownership NFT. Creator fees are credited to the
//!   *token* (not its owner) and only the current owner can `claim` them. Unclaimed fees move with the token.
//! - `cert:<machine_account>:<pull_id>` — a soulbound Mythic certificate: no transfer, no approvals, no fees.

use std::collections::HashMap;

use near_contract_standards::non_fungible_token::approval::NonFungibleTokenApproval;
use near_contract_standards::non_fungible_token::core::{NonFungibleTokenCore, NonFungibleTokenResolver};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::events::NftMint;
use near_contract_standards::non_fungible_token::metadata::{
    NFT_METADATA_SPEC, NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata,
};
use near_contract_standards::non_fungible_token::{NonFungibleToken, Token, TokenId};
use near_sdk::json_types::U128;
use near_sdk::serde::Deserialize;
use near_sdk::serde_json::{self, json};
use near_sdk::store::{LazyOption, LookupMap, LookupSet};
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, assert_one_yocto, env,
    ext_contract, near, require,
};

#[cfg(test)]
mod tests;

pub const MACHINE_PREFIX: &str = "machine:";
pub const CERT_PREFIX: &str = "cert:";
pub const FEE_HISTORY_LEN: usize = 20;
/// Extra bytes a Machine NFT mint must prepay so its fee history (max 20 entries) never drains the contract.
pub const FEE_HISTORY_RESERVE_BYTES: u64 = 4_000;

const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_FOR_ON_CLAIM: Gas = Gas::from_tgas(10);

pub const ERR_NOT_USDT: &str = "Only the USDT contract can call ft_on_transfer";
pub const ERR_SOULBOUND: &str = "Mythic certificates are soulbound and cannot be transferred or approved";

#[ext_contract(ext_usdt)]
#[allow(dead_code)]
trait Usdt {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    OwnerById,
    TokenMetadata,
    Enumeration,
    Approvals,
    ContractMetadata,
    Machines,
    FeeBalance,
    FeeHistory,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug, PartialEq)]
pub enum FeeEntryKind {
    /// Fees swept in from the machine.
    Credit,
    /// Owner claimed; USDT sent.
    Claim,
    /// The claim's USDT transfer failed; the amount was added back to the token.
    ClaimRestored,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct FeeEntry {
    pub kind: FeeEntryKind,
    pub amount: U128,
    /// The machine for a credit, the owner for a claim.
    pub account: AccountId,
    pub balance_after: U128,
    pub block: u64,
}

#[near(serializers = [json])]
pub struct Config {
    pub factory: AccountId,
    pub usdt_contract: AccountId,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct FeeMsg {
    token_id: TokenId,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct GaballsNft {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    factory: AccountId,
    usdt_contract: AccountId,
    /// Machines launched by the factory. Only these may mint certificates.
    machines: LookupSet<AccountId>,
    fee_balance: LookupMap<TokenId, u128>,
    fee_history: LookupMap<TokenId, Vec<FeeEntry>>,
}

pub fn machine_token_id(machine: &AccountId) -> TokenId {
    format!("{MACHINE_PREFIX}{machine}")
}

fn is_certificate(token_id: &str) -> bool {
    token_id.starts_with(CERT_PREFIX)
}

#[near]
impl GaballsNft {
    #[init]
    pub fn new(factory: AccountId, usdt_contract: AccountId) -> Self {
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Gaballs".to_string(),
            symbol: "GABALLS".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        };
        metadata.assert_valid();
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::OwnerById,
                factory.clone(),
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approvals),
            ),
            metadata: LazyOption::new(StorageKey::ContractMetadata, Some(metadata)),
            factory,
            usdt_contract,
            machines: LookupSet::new(StorageKey::Machines),
            fee_balance: LookupMap::new(StorageKey::FeeBalance),
            fee_history: LookupMap::new(StorageKey::FeeHistory),
        }
    }

    /// Factory only. Registers `machine` and mints its single Machine NFT to `receiver_id`.
    /// The attached deposit pays for storage (plus the fee-history reserve); the rest is refunded.
    #[payable]
    pub fn mint_machine_nft(&mut self, receiver_id: AccountId, machine: AccountId) -> Token {
        require!(env::predecessor_account_id() == self.factory, "Only the factory can mint Machine NFTs");
        let token_id = machine_token_id(&machine);
        let start = env::storage_usage();
        self.machines.insert(machine.clone());
        self.fee_balance.insert(token_id.clone(), 0);
        let metadata = TokenMetadata {
            title: Some(format!("Gaballs Machine: {machine}")),
            description: Some(format!(
                "Ownership of the gacha machine {machine}. Earns 0.5% of every pack in USDT; the current owner can claim."
            )),
            extra: Some(json!({ "kind": "machine", "machine": machine }).to_string()),
            ..empty_metadata()
        };
        let token = self.tokens.internal_mint_with_refund(token_id, receiver_id, Some(metadata), None);
        self.charge_storage(start, FEE_HISTORY_RESERVE_BYTES);
        NftMint { owner_id: &token.owner_id, token_ids: &[&token.token_id], memo: Some("machine") }.emit();
        token
    }

    /// Registered machines only (predecessor must be `machine`). Mints a soulbound Mythic certificate.
    #[payable]
    pub fn mint_certificate(&mut self, receiver_id: AccountId, machine: AccountId, pull_id: u64) -> Token {
        let caller = env::predecessor_account_id();
        require!(caller == machine && self.machines.contains(&machine), "Only a registered machine can mint certificates");
        let start = env::storage_usage();
        let metadata = TokenMetadata {
            title: Some(format!("Mythic pull #{pull_id}")),
            description: Some(format!("Soulbound certificate: Mythic (8x) on {machine}, pull #{pull_id}.")),
            extra: Some(json!({ "kind": "certificate", "machine": machine, "pull_id": pull_id }).to_string()),
            ..empty_metadata()
        };
        let token = self.tokens.internal_mint_with_refund(
            format!("{CERT_PREFIX}{machine}:{pull_id}"),
            receiver_id,
            Some(metadata),
            None,
        );
        self.charge_storage(start, 0);
        NftMint { owner_id: &token.owner_id, token_ids: &[&token.token_id], memo: Some("mythic certificate") }.emit();
        token
    }

    /// Sends the token's whole fee balance (USDT) to its current owner.
    /// Owner only, 1 yoctoNEAR, and only while the token has no approvals (a listed token cannot be emptied:
    /// THREAT_MODEL T1). The balance is zeroed first and added back if the USDT transfer fails (T3–T6).
    #[payable]
    pub fn claim(&mut self, token_id: TokenId) -> Promise {
        assert_one_yocto();
        require!(token_id.starts_with(MACHINE_PREFIX), "Only Machine NFTs hold fees");
        let owner = self.tokens.owner_by_id.get(&token_id).unwrap_or_else(|| env::panic_str("Token not found"));
        require!(env::predecessor_account_id() == owner, "Only the current owner can claim");
        let approvals = self.tokens.approvals_by_id.as_ref().and_then(|a| a.get(&token_id)).unwrap_or_default();
        require!(approvals.is_empty(), "Revoke all approvals (cancel listings) before claiming");
        let amount = self.fee_balance.get(&token_id).copied().unwrap_or(0);
        require!(amount > 0, "Nothing to claim");

        self.fee_balance.insert(token_id.clone(), 0);
        self.push_history(&token_id, FeeEntryKind::Claim, amount, owner.clone());

        ext_usdt::ext(self.usdt_contract.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .ft_transfer(owner.clone(), U128(amount), Some(format!("gaballs claim {token_id}")))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_FOR_ON_CLAIM).on_claim(token_id, owner, U128(amount)))
    }

    /// Callback for `claim`. On failure the amount is *added back* to the token (not set), so fees credited in the
    /// meantime are kept, and it goes to whoever owns the token now.
    #[private]
    pub fn on_claim(&mut self, token_id: TokenId, owner: AccountId, amount: U128) -> bool {
        if env::promise_result_checked(0, 0).is_ok() {
            return true;
        }
        let restored = self.fee_balance.get(&token_id).copied().unwrap_or(0) + amount.0;
        self.fee_balance.insert(token_id.clone(), restored);
        self.push_history(&token_id, FeeEntryKind::ClaimRestored, amount.0, owner);
        false
    }

    // ------------------------------------------------------------------ views

    pub fn get_fee_balance(&self, token_id: TokenId) -> U128 {
        U128(self.fee_balance.get(&token_id).copied().unwrap_or(0))
    }

    /// Last 20 credits / claims / restores, oldest first.
    pub fn get_fee_history(&self, token_id: TokenId) -> Vec<FeeEntry> {
        self.fee_history.get(&token_id).cloned().unwrap_or_default()
    }

    pub fn is_registered_machine(&self, machine: AccountId) -> bool {
        self.machines.contains(&machine)
    }

    pub fn get_config(&self) -> Config {
        Config { factory: self.factory.clone(), usdt_contract: self.usdt_contract.clone() }
    }
}

impl GaballsNft {
    /// Requires the attached deposit to cover storage added since `start` (+ `reserve_bytes`); refunds the rest.
    fn charge_storage(&self, start: u64, reserve_bytes: u64) {
        let used = env::storage_usage().saturating_sub(start) + reserve_bytes;
        let cost = env::storage_byte_cost().saturating_mul(u128::from(used));
        let deposit = env::attached_deposit();
        require!(deposit >= cost, format!("Attach at least {cost} for storage"));
        let refund = deposit.saturating_sub(cost);
        if refund > NearToken::from_yoctonear(1) {
            Promise::new(env::predecessor_account_id()).transfer(refund).detach();
        }
    }

    fn push_history(&mut self, token_id: &TokenId, kind: FeeEntryKind, amount: u128, account: AccountId) {
        let balance_after = U128(self.fee_balance.get(token_id).copied().unwrap_or(0));
        let entry = FeeEntry { kind, amount: U128(amount), account, balance_after, block: env::block_height() };
        let history = self.fee_history.entry(token_id.clone()).or_default();
        history.push(entry);
        if history.len() > FEE_HISTORY_LEN {
            history.remove(0);
        }
    }

    /// Validates a fee credit. `Err` → the USDT is refunded.
    fn validate_credit(&self, sender_id: &AccountId, msg: &str) -> Result<TokenId, String> {
        let FeeMsg { token_id } = serde_json::from_str(msg).map_err(|e| format!("bad msg: {e}"))?;
        let machine = token_id.strip_prefix(MACHINE_PREFIX).ok_or("not a Machine NFT")?;
        if self.tokens.owner_by_id.get(&token_id).is_none() {
            return Err(format!("{token_id} does not exist"));
        }
        if machine != sender_id.as_str() {
            return Err(format!("{sender_id} is not the machine bound to {token_id}"));
        }
        Ok(token_id)
    }
}

fn empty_metadata() -> TokenMetadata {
    TokenMetadata {
        title: None,
        description: None,
        media: None,
        media_hash: None,
        copies: Some(1),
        issued_at: Some(env::block_timestamp_ms().to_string()),
        expires_at: None,
        starts_at: None,
        updated_at: None,
        extra: None,
        reference: None,
        reference_hash: None,
    }
}

// ---------------------------------------------------------------------- USDT receiver (fee credits)

#[near]
impl near_contract_standards::fungible_token::receiver::FungibleTokenReceiver for GaballsNft {
    /// Credits swept creator fees to a Machine NFT. Only USDT, only from the machine bound to the token
    /// (THREAT_MODEL T7). Anything else is refunded in full. `msg` = `{"token_id":"machine:<machine>"}`.
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.usdt_contract, ERR_NOT_USDT);
        match self.validate_credit(&sender_id, &msg) {
            Err(reason) => {
                env::log_str(&format!("refund {}: {reason}", amount.0));
                PromiseOrValue::Value(amount)
            }
            Ok(token_id) => {
                let balance = self.fee_balance.get(&token_id).copied().unwrap_or(0) + amount.0;
                self.fee_balance.insert(token_id.clone(), balance);
                self.push_history(&token_id, FeeEntryKind::Credit, amount.0, sender_id);
                PromiseOrValue::Value(U128(0))
            }
        }
    }
}

// ---------------------------------------------------------------------- NEP-171 / 177 / 178 / 181

#[near]
impl NonFungibleTokenCore for GaballsNft {
    #[payable]
    fn nft_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>) {
        require!(!is_certificate(&token_id), ERR_SOULBOUND);
        self.tokens.nft_transfer(receiver_id, token_id, approval_id, memo)
    }

    #[payable]
    fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        require!(!is_certificate(&token_id), ERR_SOULBOUND);
        self.tokens.nft_transfer_call(receiver_id, token_id, approval_id, memo, msg)
    }

    fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.tokens.nft_token(token_id)
    }
}

#[near]
impl NonFungibleTokenResolver for GaballsNft {
    #[private]
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        self.tokens.nft_resolve_transfer(previous_owner_id, receiver_id, token_id, approved_account_ids)
    }
}

#[near]
impl NonFungibleTokenApproval for GaballsNft {
    #[payable]
    fn nft_approve(&mut self, token_id: TokenId, account_id: AccountId, msg: Option<String>) -> Option<Promise> {
        require!(!is_certificate(&token_id), ERR_SOULBOUND);
        self.tokens.nft_approve(token_id, account_id, msg)
    }

    #[payable]
    fn nft_revoke(&mut self, token_id: TokenId, account_id: AccountId) {
        self.tokens.nft_revoke(token_id, account_id)
    }

    #[payable]
    fn nft_revoke_all(&mut self, token_id: TokenId) {
        self.tokens.nft_revoke_all(token_id)
    }

    fn nft_is_approved(&self, token_id: TokenId, approved_account_id: AccountId, approval_id: Option<u64>) -> bool {
        self.tokens.nft_is_approved(token_id, approved_account_id, approval_id)
    }
}

#[near]
impl NonFungibleTokenEnumeration for GaballsNft {
    fn nft_total_supply(&self) -> U128 {
        self.tokens.nft_total_supply()
    }

    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens(from_index, limit)
    }

    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.tokens.nft_supply_for_owner(account_id)
    }

    fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.tokens.nft_tokens_for_owner(account_id, from_index, limit)
    }
}

#[near]
impl NonFungibleTokenMetadataProvider for GaballsNft {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().clone().unwrap()
    }
}
