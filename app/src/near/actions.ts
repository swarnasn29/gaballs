'use client';

// User actions. Each one is ONE wallet approval: any missing registration (NEP-145 storage_deposit) is batched in
// front of the real call. Results are read from the transaction outcome, never assumed.

import { useCallback } from 'react';
import { useNearWallet } from '@/providers/near-provider';
import { factory, machine, nft, usdt, type Tx } from './contracts';
import { readPackOutcome, type ExecutionOutcome, type PackResult } from './outcome';

export class UserFacingError extends Error {}

function lastOutcome(outcomes: ExecutionOutcome[]): ExecutionOutcome {
  const last = outcomes[outcomes.length - 1];
  if (!last) throw new Error('The wallet returned no transaction result');
  return last;
}

export function useGaballsActions() {
  const { signedAccountId: account, signAndSendTransactions } = useNearWallet();

  const requireAccount = useCallback(() => {
    if (!account) throw new UserFacingError('Connect a wallet first');
    return account;
  }, [account]);

  /**
   * Opens `count` packs. A first-time buyer gets machine.storage_deposit + usdt.ft_transfer_call in one approval.
   * Returns what the contract reported (pack_opened events), a refund, or a failure.
   */
  const openPack = useCallback(
    async (machineId: string, count: number): Promise<PackResult> => {
      const me = requireAccount();
      const m = machine(machineId);
      const [info, registered, bounds, usdtBalance] = await Promise.all([
        m.get(),
        m.storageBalanceOf(me),
        m.storageBounds(),
        usdt.balanceOf(me),
      ]);
      const cost = BigInt(info.config.pack_price) * BigInt(count);
      if (BigInt(usdtBalance) < cost) {
        throw new UserFacingError('Not enough mock USDT. Use the faucet on "My stuff" (100 USDT per hour).');
      }
      const txs: Tx[] = [];
      if (!registered) txs.push(m.storageDepositTx(me, bounds.min));
      txs.push(usdt.openPackTx(machineId, count, info.config.pack_price));
      const outcomes = await signAndSendTransactions(txs);
      return readPackOutcome(lastOutcome(outcomes), me);
    },
    [requireAccount, signAndSendTransactions],
  );

  /** 100 mock USDT. Registers on the USDT contract first if needed (same approval). */
  const faucet = useCallback(async () => {
    const me = requireAccount();
    const [registered, bounds] = await Promise.all([usdt.storageBalanceOf(me), usdt.storageBounds()]);
    const txs: Tx[] = [];
    if (!registered) txs.push(usdt.storageDepositTx(me, bounds.min));
    txs.push(usdt.faucetTx());
    return lastOutcome(await signAndSendTransactions(txs));
  }, [requireAccount, signAndSendTransactions]);

  /** Claim a Machine NFT's fee balance (owner only). The claimer must be registered on USDT to receive it. */
  const claim = useCallback(
    async (tokenId: string) => {
      const me = requireAccount();
      const [registered, bounds] = await Promise.all([usdt.storageBalanceOf(me), usdt.storageBounds()]);
      const txs: Tx[] = [];
      if (!registered) txs.push(usdt.storageDepositTx(me, bounds.min));
      txs.push(nft.claimTx(tokenId));
      return lastOutcome(await signAndSendTransactions(txs));
    },
    [requireAccount, signAndSendTransactions],
  );

  const sweepFees = useCallback(
    async (machineId: string) => lastOutcome(await signAndSendTransactions([machine(machineId).sweepFeesTx()])),
    [signAndSendTransactions],
  );

  const transferMachineNft = useCallback(
    async (tokenId: string, receiverId: string) =>
      lastOutcome(await signAndSendTransactions([nft.transferTx(receiverId, tokenId)])),
    [signAndSendTransactions],
  );

  const launch = useCallback(
    async (a: { name: string; symbol: string; icon: string | null; creatorAllocation: string }) => {
      requireAccount();
      const cost = await factory.getLaunchCost();
      return lastOutcome(await signAndSendTransactions([factory.launchTx(a, cost)]));
    },
    [requireAccount, signAndSendTransactions],
  );

  /**
   * Sells `amount` token units back to `machineId`'s curve. `minUsdtOut` is the slippage guard (the contract fails
   * the sale if it would pay less). The seller must be registered on USDT to receive it: batched if needed.
   */
  const sell = useCallback(
    async (machineId: string, amount: string, minUsdtOut: string) => {
      const me = requireAccount();
      const [registered, bounds] = await Promise.all([usdt.storageBalanceOf(me), usdt.storageBounds()]);
      const txs: Tx[] = [];
      if (!registered) txs.push(usdt.storageDepositTx(me, bounds.min));
      txs.push(machine(machineId).sellTx(amount, minUsdtOut));
      return lastOutcome(await signAndSendTransactions(txs));
    },
    [requireAccount, signAndSendTransactions],
  );

  /** Refunds a pending pull whose VRF proof never arrived (anyone may call once the timeout block has passed). */
  const refundExpired = useCallback(
    async (machineId: string, requestId: number) => {
      requireAccount();
      return lastOutcome(await signAndSendTransactions([machine(machineId).refundExpiredTx(requestId)]));
    },
    [requireAccount, signAndSendTransactions],
  );

  return { account, openPack, faucet, claim, sweepFees, transferMachineNft, launch, sell, refundExpired };
}
