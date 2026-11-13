'use client';

// User actions. Each one is ONE wallet approval: any missing registration (NEP-145 storage_deposit) is batched in
// front of the real call. Results are read from the transaction outcome, never assumed.

import { useCallback } from 'react';
import { useNearWallet } from '@/providers/near-provider';
import { FEATURED_MACHINE } from '@/config';
import { factory, machine, nft, usdt, type Tx } from './contracts';
import { createSquadTx, squadIdFor, voteTx } from './sputnik';
import { readPackOutcome, type ExecutionOutcome, type PackResult } from './outcome';
import { MAX_STORAGE_DEPOSIT, PACK_PRICE_UNITS, isLaunchedMachine, isMachineId, isSquadId } from '@/lib/trust';

export class UserFacingError extends Error {}

/** Refuses anything that is not a Gaballs machine (an id from a link could point at a lookalike contract). */
async function requireMachine(machineId: string, launched = false) {
  if (!isMachineId(machineId) || (launched && !(await isLaunchedMachine(machineId))))
    throw new UserFacingError(`${machineId} is not a Gaballs machine, so nothing was signed.`);
}

/** A storage registration costs ~0.00125 NEAR; a contract asking for more than MAX_STORAGE_DEPOSIT is refused. */
function requireSmallDeposit(min: string) {
  if (BigInt(min) > MAX_STORAGE_DEPOSIT) throw new UserFacingError('Refused: the contract asked for an unusually large storage deposit.');
}

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
      await requireMachine(machineId, true);
      const m = machine(machineId);
      const [info, registered, bounds, usdtBalance] = await Promise.all([
        m.get(),
        m.storageBalanceOf(me),
        m.storageBounds(),
        usdt.balanceOf(me),
      ]);
      // Every Gaballs machine charges exactly 10 USDT a pack; a different price means it is not ours.
      if (BigInt(info.config.pack_price) !== PACK_PRICE_UNITS) throw new UserFacingError('Refused: unexpected pack price.');
      if (!registered) requireSmallDeposit(bounds.min);
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
    async (machineId: string) => {
      await requireMachine(machineId);
      return lastOutcome(await signAndSendTransactions([machine(machineId).sweepFeesTx()]));
    },
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
      await requireMachine(machineId);
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
      await requireMachine(machineId);
      return lastOutcome(await signAndSendTransactions([machine(machineId).refundExpiredTx(requestId)]));
    },
    [requireAccount, signAndSendTransactions],
  );

  // ---------------------------------------------------------------------------------------------- squads (Sputnik DAO)

  /**
   * Creates a squad DAO on the Sputnik factory (6 NEAR) and, in the same approval, pays its storage on mock USDT and on
   * the flagship machine's token so it can receive USDT and prizes right away.
   */
  const createSquad = useCallback(
    async (name: string, members: string[], threshold: number, title: string) => {
      requireAccount();
      const dao = squadIdFor(name);
      const [usdtBounds, tokenBounds] = await Promise.all([usdt.storageBounds(), machine(FEATURED_MACHINE).storageBounds()]);
      const outcomes = await signAndSendTransactions([
        createSquadTx(name, members, threshold, title),
        usdt.storageDepositTx(dao, usdtBounds.min),
        machine(FEATURED_MACHINE).storageDepositTx(dao, tokenBounds.min),
      ]);
      return { dao, outcome: lastOutcome(outcomes), first: outcomes[0] };
    },
    [requireAccount, signAndSendTransactions],
  );

  /** Sends one proposal transaction (built in src/near/sputnik.ts; carries the 0.1 NEAR bond). */
  const propose = useCallback(
    async (tx: Tx) => {
      requireAccount();
      return lastOutcome(await signAndSendTransactions([tx]));
    },
    [requireAccount, signAndSendTransactions],
  );

  const vote = useCallback(
    async (dao: string, id: number, approve: boolean) => {
      requireAccount();
      if (!isSquadId(dao)) throw new UserFacingError(`${dao} is not a Sputnik DAO squad.`);
      return lastOutcome(await signAndSendTransactions([voteTx(dao, id, approve)]));
    },
    [requireAccount, signAndSendTransactions],
  );

  /** Sends mock USDT to the squad's treasury (registers the squad on USDT first if needed). */
  const chipIn = useCallback(
    async (dao: string, amount: string) => {
      requireAccount();
      if (!isSquadId(dao)) throw new UserFacingError(`${dao} is not a Sputnik DAO squad, so nothing was sent.`);
      const [registered, bounds] = await Promise.all([usdt.storageBalanceOf(dao), usdt.storageBounds()]);
      const txs: Tx[] = [];
      if (!registered) txs.push(usdt.storageDepositTx(dao, bounds.min));
      txs.push(usdt.transferTx(dao, amount));
      return lastOutcome(await signAndSendTransactions(txs));
    },
    [requireAccount, signAndSendTransactions],
  );

  return {
    account,
    openPack,
    faucet,
    claim,
    sweepFees,
    transferMachineNft,
    launch,
    sell,
    refundExpired,
    createSquad,
    propose,
    vote,
    chipIn,
  };
}
