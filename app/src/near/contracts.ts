// Typed client for every Gaballs view and call. Views run over RPC (src/near/rpc.ts); calls return transaction
// descriptions that the wallet signs (src/providers/near-provider.tsx → signAndSendTransactions).

import { FACTORY_ID, NFT_ID, USDT_ID } from '@/config';
import { view } from './rpc';
import type {
  AccountId,
  FactoryConfig,
  FeeEntry,
  FtMetadata,
  MachineInfo,
  MachineView,
  NftToken,
  OddsView,
  PackQuote,
  PendingPull,
  PullRecord,
  SellQuote,
  StorageBalance,
  StorageBalanceBounds,
  U128,
} from './types';

export const TGAS = 1_000_000_000_000n;
export const ONE_YOCTO = '1';

/** A transaction for the wallet (near-connect action format). */
export interface Tx {
  receiverId: AccountId;
  actions: {
    type: 'FunctionCall';
    params: { methodName: string; args: object; gas: string; deposit: string };
  }[];
}

function fnCall(receiverId: AccountId, methodName: string, args: object, deposit = '0', tgas = 100n): Tx {
  return {
    receiverId,
    actions: [{ type: 'FunctionCall', params: { methodName, args, gas: (tgas * TGAS).toString(), deposit } }],
  };
}

// ------------------------------------------------------------------------------------------------ factory

export const factory = {
  id: FACTORY_ID,
  getLaunchCost: () => view<U128>(FACTORY_ID, 'get_launch_cost'),
  getMachines: (fromIndex = 0, limit = 50) =>
    view<MachineInfo[]>(FACTORY_ID, 'get_machines', { from_index: fromIndex, limit }),
  getMachine: (machine: AccountId) => view<MachineInfo | null>(FACTORY_ID, 'get_machine', { machine }),
  getConfig: () => view<FactoryConfig>(FACTORY_ID, 'get_config'),
  getRetryCost: (machine: AccountId) => view<U128>(FACTORY_ID, 'get_retry_cost', { machine }),

  launchTx: (a: { name: string; symbol: string; icon: string | null; creatorAllocation: U128 }, deposit: U128) =>
    fnCall(
      FACTORY_ID,
      'launch',
      { name: a.name, symbol: a.symbol, icon: a.icon, creator_allocation: a.creatorAllocation },
      deposit,
      300n,
    ),
  retryMachineSetupTx: (machine: AccountId, deposit: U128) =>
    fnCall(FACTORY_ID, 'retry_machine_setup', { machine }, deposit, 100n),
};

// ------------------------------------------------------------------------------------------------ machine

export function machine(id: AccountId) {
  return {
    id,
    get: () => view<MachineView>(id, 'get_machine'),
    odds: () => view<OddsView>(id, 'get_odds'),
    quote: (count: number) => view<PackQuote>(id, 'quote_pack', { count }),
    recentPulls: () => view<PullRecord[]>(id, 'get_recent_pulls'),
    metadata: () => view<FtMetadata>(id, 'ft_metadata'),
    balanceOf: (accountId: AccountId) => view<U128>(id, 'ft_balance_of', { account_id: accountId }),
    totalSupply: () => view<U128>(id, 'ft_total_supply'),
    storageBalanceOf: (accountId: AccountId) =>
      view<StorageBalance | null>(id, 'storage_balance_of', { account_id: accountId }),
    storageBounds: () => view<StorageBalanceBounds>(id, 'storage_balance_bounds'),
    /** Phase 5 machines only. */
    pendingPull: (requestId: number) => view<PendingPull | null>(id, 'get_pending_pull', { request_id: requestId }),
    pending: (accountId?: AccountId) => view<PendingPull[]>(id, 'get_pending', { account_id: accountId ?? null }),
    quoteSell: (amount: U128) => view<SellQuote>(id, 'quote_sell', { amount }),

    /** Sell tokens back to the curve; fails on-chain if the payout would be below `minUsdtOut`. */
    sellTx: (amount: U128, minUsdtOut: U128) =>
      fnCall(id, 'sell', { amount, min_usdt_out: minUsdtOut }, ONE_YOCTO, 100n),
    /** Anyone can refund a pending pull once its timeout block has passed. */
    refundExpiredTx: (requestId: number) => fnCall(id, 'refund_expired', { request_id: requestId }, '0', 100n),
    storageDepositTx: (accountId: AccountId, deposit: U128) =>
      fnCall(id, 'storage_deposit', { account_id: accountId, registration_only: true }, deposit, 30n),
    sweepFeesTx: () => fnCall(id, 'sweep_fees', {}, '0', 150n),
    transferTx: (receiverId: AccountId, amount: U128) =>
      fnCall(id, 'ft_transfer', { receiver_id: receiverId, amount }, ONE_YOCTO, 30n),
  };
}

// ------------------------------------------------------------------------------------------------ mock USDT

export const usdt = {
  id: USDT_ID,
  metadata: () => view<FtMetadata>(USDT_ID, 'ft_metadata'),
  balanceOf: (accountId: AccountId) => view<U128>(USDT_ID, 'ft_balance_of', { account_id: accountId }),
  storageBalanceOf: (accountId: AccountId) =>
    view<StorageBalance | null>(USDT_ID, 'storage_balance_of', { account_id: accountId }),
  storageBounds: () => view<StorageBalanceBounds>(USDT_ID, 'storage_balance_bounds'),
  /** Nanosecond timestamp of the account's last faucet call, or null. */
  faucetLastUsed: (accountId: AccountId) => view<number | null>(USDT_ID, 'faucet_last_used', { account_id: accountId }),

  storageDepositTx: (accountId: AccountId, deposit: U128) =>
    fnCall(USDT_ID, 'storage_deposit', { account_id: accountId, registration_only: true }, deposit, 30n),
  faucetTx: () => fnCall(USDT_ID, 'faucet', {}, '0', 30n),
  transferTx: (receiverId: AccountId, amount: U128) =>
    fnCall(USDT_ID, 'ft_transfer', { receiver_id: receiverId, amount, memo: 'squad chip-in' }, ONE_YOCTO, 30n),
  /** Pays for `count` packs: USDT ft_transfer_call → machine.ft_on_transfer. */
  openPackTx: (machineId: AccountId, count: number, packPrice: U128) =>
    fnCall(
      USDT_ID,
      'ft_transfer_call',
      {
        receiver_id: machineId,
        amount: (BigInt(packPrice) * BigInt(count)).toString(),
        msg: JSON.stringify({ action: 'open_pack', count }),
      },
      ONE_YOCTO,
      300n,
    ),
};

// ------------------------------------------------------------------------------------------------ NFT

export const nft = {
  id: NFT_ID,
  token: (tokenId: string) => view<NftToken | null>(NFT_ID, 'nft_token', { token_id: tokenId }),
  tokensForOwner: (accountId: AccountId) =>
    view<NftToken[]>(NFT_ID, 'nft_tokens_for_owner', { account_id: accountId, from_index: '0', limit: 100 }),
  feeBalance: (tokenId: string) => view<U128>(NFT_ID, 'get_fee_balance', { token_id: tokenId }),
  feeHistory: (tokenId: string) => view<FeeEntry[]>(NFT_ID, 'get_fee_history', { token_id: tokenId }),

  claimTx: (tokenId: string) => fnCall(NFT_ID, 'claim', { token_id: tokenId }, ONE_YOCTO, 60n),
  transferTx: (receiverId: AccountId, tokenId: string) =>
    fnCall(NFT_ID, 'nft_transfer', { receiver_id: receiverId, token_id: tokenId }, ONE_YOCTO, 30n),
};

export const isMachineToken = (t: NftToken) => t.token_id.startsWith('machine:');
export const isCertificate = (t: NftToken) => t.token_id.startsWith('cert:');
