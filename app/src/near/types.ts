// JSON shapes returned by the Gaballs contracts (contracts/*/src). u128 values arrive as decimal strings.

export type U128 = string;
export type AccountId = string;

export type TierName = 'Common' | 'Rare' | 'Epic' | 'Mythic';

export interface Tier {
  name: TierName;
  chance_bps: number;
  multiplier_bps: number;
}

export interface OddsView {
  tiers: Tier[];
  expected_multiplier_bps: number;
}

export interface MachineConfig {
  creator: AccountId;
  usdt_contract: AccountId;
  nft_contract: AccountId;
  platform_account: AccountId;
  nft_token_id: string;
  pack_price: U128;
  virtual_usdt_reserve: U128;
  curve_inventory: U128;
  vault_seed: U128;
  creator_allocation: U128;
  max_vault_draw_bps: number;
  nft_fee_bps: number;
  platform_fee_bps: number;
  launched_at_block: number;
  /** Phase 5 machines: where verifiable randomness comes from (absent on v1). */
  vrf?: VrfConfig;
  vrf_timeout_blocks?: number;
}

export interface Fees {
  nft_accrued: U128;
  platform_accrued: U128;
  nft_swept: U128;
  platform_swept: U128;
}

export interface Stats {
  packs_opened: number;
  tier_counts: number[];
  capped_pulls: number;
  total_usdt_in: U128;
  total_bought: U128;
  total_payout: U128;
  best_multiplier_bps: number;
  best_pull_id: number | null;
  /** Phase 5 machines only (absent on v1). */
  refunds?: number;
  total_usdt_refunded?: U128;
  sells?: number;
  total_tokens_sold?: U128;
  total_sell_usdt_gross?: U128;
  total_sell_usdt_paid?: U128;
}

export interface MachineView {
  machine: AccountId;
  config: MachineConfig;
  curve_usdt_reserve: U128;
  curve_tokens: U128;
  vault: U128;
  /** USDT per whole token × 10^18 */
  price_usdt_wad: U128;
  /** USDT units (6 decimals) */
  market_cap_usdt: U128;
  circulating_supply: U128;
  circulating_market_cap_usdt: U128;
  packs_opened: number;
  best_multiplier_bps: number;
  total_supply: U128;
  fees: Fees;
  stats: Stats;
  pull_nonce: number;
  /** Phase 5 machines (VRF + sell-back). Absent on the v1 machine, which used block randomness. */
  pending_usdt?: U128;
  pending_count?: number;
  request_nonce?: number;
}

export interface VrfConfig {
  outlayer_contract: AccountId;
  project_id: string;
  /** OutLayer's VRF public key, 32 bytes hex. */
  pubkey_hex: string;
}

/** A paid pack waiting for its VRF proof. */
export interface PendingPull {
  request_id: number;
  buyer: AccountId;
  count: number;
  usdt: U128;
  seed: string;
  requested_at_block: number;
  /** From this block anyone can call refund_expired. */
  refundable_from_block: number;
  refund_failed: boolean;
}

export interface SellQuote {
  amount: U128;
  usdt_gross: U128;
  nft_fee: U128;
  platform_fee: U128;
  /** What the seller receives (USDT units). */
  usdt_out: U128;
  price_after: U128;
}

export interface PackQuote {
  count: number;
  usdt_total: U128;
  fees: U128;
  usdt_to_curve: U128;
  bought: U128;
  expected_payout: U128;
  price_now: U128;
}

export interface PullRecord {
  pull_id: number;
  buyer: AccountId;
  usdt_in: U128;
  usdt_to_curve: U128;
  roll: number;
  tier: TierName;
  multiplier_bps: number;
  bought: U128;
  payout: U128;
  vault_after: U128;
  price_before: U128;
  price_after: U128;
  capped: boolean;
  certificate: boolean;
  seed: string;
  block: number;
  /** Phase 5 machines: the VRF request this pull settled, and its proof. */
  request_id?: number;
  vrf_alpha?: string;
  vrf_signature?: string;
}

export interface FtMetadata {
  spec: string;
  name: string;
  symbol: string;
  icon: string | null;
  decimals: number;
}

export interface StorageBalance {
  total: U128;
  available: U128;
}

export interface StorageBalanceBounds {
  min: U128;
  max: U128 | null;
}

export interface MachineInfo {
  account_id: AccountId;
  name: string;
  symbol: string;
  creator: AccountId;
  nft_token_id: string;
  launched_at_block: number;
  nft_minted: boolean;
  usdt_registered: boolean;
}

export interface FactoryConfig {
  owner: AccountId;
  nft_contract: AccountId;
  usdt_contract: AccountId;
  platform_account: AccountId;
  machine_code_len: number;
  machine_code_sha256: string | null;
  pack_price: U128;
  virtual_usdt_reserve: U128;
  vault_seed: U128;
  max_vault_draw_bps: number;
}

export interface NftTokenMetadata {
  title: string | null;
  description: string | null;
  extra: string | null;
  issued_at: string | null;
}

export interface NftToken {
  token_id: string;
  owner_id: AccountId;
  metadata: NftTokenMetadata | null;
  approved_account_ids: Record<AccountId, number> | null;
}

export type FeeEntryKind = 'Credit' | 'Claim' | 'ClaimRestored';

export interface FeeEntry {
  kind: FeeEntryKind;
  amount: U128;
  account: AccountId;
  balance_after: U128;
  block: number;
}
