//! NEP-141 / NEP-145 / NEP-148 for the machine's token, plus the USDT receiver that opens packs.

use near_contract_standards::fungible_token::metadata::{FungibleTokenMetadata, FungibleTokenMetadataProvider};
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::fungible_token::{FungibleTokenCore, FungibleTokenResolver};
use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement};
use near_sdk::json_types::U128;
use near_sdk::{AccountId, NearToken, PromiseOrValue, env, near, require};

use crate::{ERR_NOT_USDT, Machine, MachineExt};

const ERR_TO_MACHINE: &str = "Tokens cannot be sent to the machine account directly";

#[near]
impl FungibleTokenReceiver for Machine {
    /// Pays for 1–5 packs. `msg` = `{"action":"open_pack","count":N}` and `amount` must equal
    /// `pack_price * N`. Anything invalid returns the full amount (the USDT contract refunds it).
    /// Returns "0" when the payment was accepted: the packs open when the VRF proof arrives (`pack_opened`), or the
    /// USDT is refunded (`pack_refunded`). Watch for the `pack_requested` event's `request_id`.
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.config.usdt_contract, ERR_NOT_USDT);
        match self.validate_pack_request(&sender_id, amount.0, &msg) {
            Err(reason) => {
                env::log_str(&format!("refund {}: {reason}", amount.0));
                PromiseOrValue::Value(amount)
            }
            Ok(count) => {
                self.request_pull(sender_id, amount.0, count);
                PromiseOrValue::Value(U128(0))
            }
        }
    }
}

#[near]
impl FungibleTokenCore for Machine {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        require!(receiver_id != env::current_account_id(), ERR_TO_MACHINE);
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
        require!(receiver_id != env::current_account_id(), ERR_TO_MACHINE);
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
impl FungibleTokenResolver for Machine {
    #[private]
    fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        // Senders can never unregister (see storage_unregister), so the standard's burn branch is unreachable
        // and total supply stays fixed.
        let (used, _burned) = self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for Machine {
    #[payable]
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    /// Disabled: unregistering (especially with `force`) would burn tokens and break the fixed 1B supply.
    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        let _ = force;
        env::panic_str("storage_unregister is disabled: the token supply is fixed at 1B")
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for Machine {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().clone().unwrap()
    }
}
