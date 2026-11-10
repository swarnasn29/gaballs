//! Mock USDT (testnet): a standard NEP-141 token with 6 decimals and a rate-limited `faucet()`.
//! It exists only so testnet users can pay for packs. It has no value.

use near_contract_standards::fungible_token::events::FtMint;
use near_contract_standards::fungible_token::metadata::{
    FT_METADATA_SPEC, FungibleTokenMetadata, FungibleTokenMetadataProvider,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, NearToken, PanicOnDefault, PromiseOrValue, env, near, require,
};

/// 100 USDT with 6 decimals.
pub const FAUCET_AMOUNT: u128 = 100_000_000;
/// One faucet call per account per hour.
pub const FAUCET_COOLDOWN_NS: u64 = 60 * 60 * 1_000_000_000;

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Accounts,
    LastFaucet,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockUsdt {
    token: FungibleToken,
    last_faucet: LookupMap<AccountId, u64>,
}

#[near]
impl MockUsdt {
    #[init]
    pub fn new() -> Self {
        Self {
            token: FungibleToken::new(StorageKey::Accounts),
            last_faucet: LookupMap::new(StorageKey::LastFaucet),
        }
    }

    /// Mints 100 Mock USDT to the caller. The caller must be registered (`storage_deposit`) first.
    /// Each account can call it once per hour.
    pub fn faucet(&mut self) -> U128 {
        let account_id = env::predecessor_account_id();
        require!(
            self.token.accounts.contains_key(&account_id),
            "Register with storage_deposit before using the faucet"
        );
        let now = env::block_timestamp();
        if let Some(last) = self.last_faucet.get(&account_id) {
            require!(
                now.saturating_sub(*last) >= FAUCET_COOLDOWN_NS,
                "Faucet is limited to one call per hour per account"
            );
        }
        self.last_faucet.insert(account_id.clone(), now);
        self.token.internal_deposit(&account_id, FAUCET_AMOUNT);
        FtMint { owner_id: &account_id, amount: U128(FAUCET_AMOUNT), memo: Some("faucet") }.emit();
        U128(self.token.ft_balance_of(account_id).0)
    }

    /// Nanosecond timestamp of the account's last faucet call, if any.
    pub fn faucet_last_used(&self, account_id: AccountId) -> Option<u64> {
        self.last_faucet.get(&account_id).copied()
    }
}

#[near]
impl FungibleTokenCore for MockUsdt {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for MockUsdt {
    #[private]
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let (used, _burned) =
            self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for MockUsdt {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for MockUsdt {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Mock USDT (testnet)".to_string(),
            symbol: "USDT".to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 6,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn alice() -> AccountId {
        "alice.testnet".parse().unwrap()
    }

    fn ctx(predecessor: AccountId, now_ns: u64) {
        testing_env!(
            VMContextBuilder::new()
                .current_account_id("usdt.gaballs.testnet".parse().unwrap())
                .predecessor_account_id(predecessor)
                .block_timestamp(now_ns)
                .build()
        );
    }

    fn registered() -> MockUsdt {
        ctx(alice(), 0);
        let mut c = MockUsdt::new();
        c.token.internal_register_account(&alice());
        c
    }

    #[test]
    fn metadata_is_clearly_mock_with_6_decimals() {
        ctx(alice(), 0);
        let m = MockUsdt::new().ft_metadata();
        assert_eq!(m.decimals, 6);
        assert_eq!(m.name, "Mock USDT (testnet)");
    }

    #[test]
    fn faucet_mints_100_usdt() {
        let mut c = registered();
        ctx(alice(), 1);
        assert_eq!(c.faucet().0, 100_000_000);
        assert_eq!(c.ft_total_supply().0, 100_000_000);
    }

    #[test]
    #[should_panic(expected = "one call per hour")]
    fn faucet_is_rate_limited() {
        let mut c = registered();
        ctx(alice(), 1);
        c.faucet();
        ctx(alice(), 1 + FAUCET_COOLDOWN_NS - 1);
        c.faucet();
    }

    #[test]
    fn faucet_works_again_after_cooldown() {
        let mut c = registered();
        ctx(alice(), 1);
        c.faucet();
        ctx(alice(), 1 + FAUCET_COOLDOWN_NS);
        assert_eq!(c.faucet().0, 200_000_000);
    }

    #[test]
    #[should_panic(expected = "Register with storage_deposit")]
    fn faucet_requires_registration() {
        ctx(alice(), 0);
        let mut c = MockUsdt::new();
        c.faucet();
    }
}
