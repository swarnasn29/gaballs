//! Gaballs factory (CLAUDE.md section 3.3).
//!
//! Holds the machine wasm and launches machines: `launch()` creates `<symbol>.<factory>`, deploys the machine,
//! initializes it with the fixed default economics (docs/PARAMETERS.md), registers it with USDT and mints its
//! Machine NFT to the creator. No access key is ever added to a machine account, so its code and parameters
//! can never change after launch.

use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::store::IterableMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, env, ext_contract, near, require,
};

#[cfg(test)]
mod tests;

/// Raw storage key of the machine wasm (kept out of the contract state struct so it is not loaded on every call).
const CODE_KEY: &[u8] = b"machine_code";

// Fixed launch economics (docs/PARAMETERS.md, "Default").
pub const PACK_PRICE: u128 = 10_000_000; // 10 USDT
pub const VIRTUAL_USDT_RESERVE: u128 = 3_000_000_000; // 3,000 USDT
pub const ONE_TOKEN: u128 = 1_000_000_000_000_000_000;
pub const VAULT_SEED: u128 = 100_000_000 * ONE_TOKEN;
pub const MAX_VAULT_DRAW_BPS: u32 = 2_500;
pub const MAX_CREATOR_ALLOCATION: u128 = 100_000_000 * ONE_TOKEN;

/// NEAR the machine keeps beyond its code storage: contract state, recent pulls, certificate mints.
pub const MACHINE_RESERVE: NearToken = NearToken::from_near(1);
pub const NFT_MINT_DEPOSIT: NearToken = NearToken::from_millinear(50);
pub const USDT_STORAGE_DEPOSIT: NearToken = NearToken::from_millinear(13);

const GAS_FOR_MACHINE_INIT: Gas = Gas::from_tgas(30);
const GAS_FOR_ON_LAUNCHED: Gas = Gas::from_tgas(60);
const GAS_FOR_NFT_MINT: Gas = Gas::from_tgas(20);
const GAS_FOR_STORAGE_DEPOSIT: Gas = Gas::from_tgas(10);

#[ext_contract(ext_nft)]
#[allow(dead_code)]
trait GaballsNft {
    fn mint_machine_nft(&mut self, receiver_id: AccountId, machine: AccountId);
}

#[ext_contract(ext_usdt)]
#[allow(dead_code)]
trait Usdt {
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>);
}

#[near]
#[derive(BorshStorageKey)]
enum StorageKey {
    Machines,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Debug)]
pub struct MachineInfo {
    pub account_id: AccountId,
    pub name: String,
    pub symbol: String,
    pub creator: AccountId,
    pub nft_token_id: String,
    pub launched_at_block: u64,
}

#[near(serializers = [json])]
pub struct FactoryConfig {
    pub owner: AccountId,
    pub nft_contract: AccountId,
    pub usdt_contract: AccountId,
    pub platform_account: AccountId,
    pub machine_code_len: u64,
    /// sha256 of the stored machine wasm (hex). Compare with `sha256sum gaballs_machine.wasm`.
    pub machine_code_sha256: Option<String>,
    pub pack_price: U128,
    pub virtual_usdt_reserve: U128,
    pub vault_seed: U128,
    pub max_vault_draw_bps: u32,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Factory {
    owner: AccountId,
    nft_contract: AccountId,
    usdt_contract: AccountId,
    platform_account: AccountId,
    machines: IterableMap<AccountId, MachineInfo>,
    machine_code_len: u64,
    machine_code_sha256: Option<[u8; 32]>,
}

#[near]
impl Factory {
    #[init]
    pub fn new(owner: AccountId, nft_contract: AccountId, usdt_contract: AccountId, platform_account: AccountId) -> Self {
        Self {
            owner,
            nft_contract,
            usdt_contract,
            platform_account,
            machines: IterableMap::new(StorageKey::Machines),
            machine_code_len: 0,
            machine_code_sha256: None,
        }
    }

    /// Owner only. The raw machine wasm is the call's input (not JSON), e.g.
    /// `near contract call-function as-transaction <factory> set_machine_code file-args gaballs_machine.wasm ...`.
    /// Phase 7: becomes one-time-only before the factory's keys are deleted.
    pub fn set_machine_code(&mut self) {
        require!(env::predecessor_account_id() == self.owner, "Only the owner can set the machine code");
        let code = env::input().unwrap_or_default();
        require!(code.starts_with(b"\0asm"), "Input is not a wasm binary");
        self.machine_code_len = code.len() as u64;
        self.machine_code_sha256 = Some(env::sha256_array(&code));
        env::storage_write(CODE_KEY, &code);
    }

    /// Launches `<symbol>.<factory>`. Attach at least `get_launch_cost()`; the caller becomes the creator and
    /// receives the Machine NFT plus `creator_allocation` tokens (0–100M, 18 decimals).
    #[payable]
    pub fn launch(&mut self, name: String, symbol: String, icon: Option<String>, creator_allocation: U128) -> Promise {
        let creator = env::predecessor_account_id();
        let deposit = env::attached_deposit();
        let cost = self.get_launch_cost();
        require!(deposit >= cost, format!("Attach at least {} yoctoNEAR (get_launch_cost)", cost.as_yoctonear()));
        require!(
            (2..=12).contains(&symbol.len()) && symbol.chars().all(|c| c.is_ascii_alphanumeric()),
            "symbol must be 2-12 letters or digits"
        );
        require!(!name.trim().is_empty() && name.len() <= 64, "name must be 1-64 characters");
        require!(creator_allocation.0 <= MAX_CREATOR_ALLOCATION, "creator_allocation is above 100M tokens");

        let machine: AccountId = format!("{}.{}", symbol.to_ascii_lowercase(), env::current_account_id())
            .parse()
            .unwrap_or_else(|_| env::panic_str("symbol does not make a valid account id"));
        require!(!self.machines.contains_key(&machine), "A machine with this symbol already exists");

        let code = env::storage_read(CODE_KEY).unwrap_or_else(|| env::panic_str("Machine code not set"));
        let init_args = json!({
            "args": {
                "name": name,
                "symbol": symbol,
                "icon": icon,
                "creator": creator,
                "creator_allocation": creator_allocation,
                "usdt_contract": self.usdt_contract,
                "nft_contract": self.nft_contract,
                "platform_account": self.platform_account,
                "pack_price": U128(PACK_PRICE),
                "virtual_usdt_reserve": U128(VIRTUAL_USDT_RESERVE),
                "vault_seed": U128(VAULT_SEED),
                "max_vault_draw_bps": MAX_VAULT_DRAW_BPS,
            }
        });
        let machine_balance = deposit.saturating_sub(NFT_MINT_DEPOSIT).saturating_sub(USDT_STORAGE_DEPOSIT);

        // One batch: if any action fails, nothing is created and the NEAR comes back to the factory.
        // Deliberately no add_full_access_key / add_access_key: the machine account is keyless.
        Promise::new(machine.clone())
            .create_account()
            .transfer(machine_balance)
            .deploy_contract(code)
            .function_call("new".to_string(), init_args.to_string().into_bytes(), NearToken::from_near(0), GAS_FOR_MACHINE_INIT)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_ON_LAUNCHED)
                    .on_launched(machine, creator, name, symbol, deposit),
            )
    }

    /// Callback for `launch`. On success: record the machine, register it on USDT, mint the Machine NFT.
    /// On failure: refund the creator's whole deposit.
    #[private]
    pub fn on_launched(
        &mut self,
        machine: AccountId,
        creator: AccountId,
        name: String,
        symbol: String,
        deposit: NearToken,
    ) -> bool {
        if env::promise_result_checked(0, 0).is_err() {
            env::log_str(&format!("launch of {machine} failed; refunding {deposit}"));
            Promise::new(creator).transfer(deposit).detach();
            return false;
        }
        let info = MachineInfo {
            account_id: machine.clone(),
            name,
            symbol,
            creator: creator.clone(),
            nft_token_id: format!("machine:{machine}"),
            launched_at_block: env::block_height(),
        };
        self.machines.insert(machine.clone(), info);
        ext_usdt::ext(self.usdt_contract.clone())
            .with_attached_deposit(USDT_STORAGE_DEPOSIT)
            .with_static_gas(GAS_FOR_STORAGE_DEPOSIT)
            .storage_deposit(Some(machine.clone()), Some(true))
            .detach();
        ext_nft::ext(self.nft_contract.clone())
            .with_attached_deposit(NFT_MINT_DEPOSIT)
            .with_static_gas(GAS_FOR_NFT_MINT)
            .mint_machine_nft(creator, machine)
            .detach();
        true
    }

    // ------------------------------------------------------------------ views

    /// NEAR to attach to `launch`: machine code storage + machine reserve + NFT mint + USDT registration.
    pub fn get_launch_cost(&self) -> NearToken {
        require!(self.machine_code_len > 0, "Machine code not set");
        env::storage_byte_cost()
            .saturating_mul(u128::from(self.machine_code_len))
            .saturating_add(MACHINE_RESERVE)
            .saturating_add(NFT_MINT_DEPOSIT)
            .saturating_add(USDT_STORAGE_DEPOSIT)
    }

    pub fn get_machines(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<MachineInfo> {
        self.machines
            .values()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50) as usize)
            .cloned()
            .collect()
    }

    pub fn get_machine(&self, machine: AccountId) -> Option<MachineInfo> {
        self.machines.get(&machine).cloned()
    }

    pub fn get_config(&self) -> FactoryConfig {
        FactoryConfig {
            owner: self.owner.clone(),
            nft_contract: self.nft_contract.clone(),
            usdt_contract: self.usdt_contract.clone(),
            platform_account: self.platform_account.clone(),
            machine_code_len: self.machine_code_len,
            machine_code_sha256: self.machine_code_sha256.map(|h| h.iter().map(|b| format!("{b:02x}")).collect()),
            pack_price: U128(PACK_PRICE),
            virtual_usdt_reserve: U128(VIRTUAL_USDT_RESERVE),
            vault_seed: U128(VAULT_SEED),
            max_vault_draw_bps: MAX_VAULT_DRAW_BPS,
        }
    }
}
