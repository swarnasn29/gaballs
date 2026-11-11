'use client';

// One place that runs a pack pull and turns it into machine/UI state. GOLDEN RULE: nothing here invents a result;
// "opened" carries exactly the pulls the contract recorded (pack_opened events, or the same records read back from
// get_recent_pulls by request id).
//
// Phase 5 machines settle on verifiable randomness: the payment transaction records a pending pull and asks OutLayer
// for a VRF proof; the proof arrives in a later receipt (about a minute on testnet). Until the contract has settled
// or refunded the request, the state stays "pending" and the machine keeps wobbling.

import { useCallback, useRef, useState } from 'react';

import { UserFacingError, useGaballsActions } from '@/near/actions';
import { machine } from '@/near/contracts';
import { blockHeight } from '@/near/rpc';
import type { PullRecord } from '@/near/types';

export type PullState =
  | { phase: 'idle' }
  /** `vrf`: a Phase 5 machine — the capsule opens once the VRF proof is verified (about a minute after paying). */
  | { phase: 'pending'; count: number; slow: boolean; vrf: boolean }
  | { phase: 'opened'; txHash: string; pulls: PullRecord[] }
  | { phase: 'refunded'; txHash?: string; message: string }
  /** No VRF result before the timeout block: anyone can refund the USDT now. */
  | { phase: 'timedOut'; txHash?: string; requestId: number; refunding: boolean; error?: string }
  | { phase: 'failed'; message: string; txHash?: string };

const SLOW_MS = 45_000;
/** Only while waiting for the wallet. Once a request id is known, the contract's own timeout applies. */
const WALLET_GIVE_UP_MS = 180_000;
const POLL_MS = 3_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof UserFacingError) return msg;
  if (/reject|cancel|denied|closed|user/i.test(msg)) return 'You cancelled in the wallet, so no USDT was taken.';
  return `The transaction did not go through, so no USDT was taken. (${msg})`;
}

const VRF_REFUND_MESSAGE =
  'The randomness proof did not arrive or did not verify, so the machine refunded your USDT. Nothing was bought.';

export function usePull(machineId: string, onSettled?: () => void) {
  const { account, openPack, refundExpired } = useGaballsActions();
  const [state, setState] = useState<PullState>({ phase: 'idle' });
  const runId = useRef(0);

  /** Polls the machine until request `requestId` is settled (→ opened), refunded, or past its timeout. */
  const waitForSettlement = useCallback(
    async (requestId: number, txHash: string | undefined, live: () => boolean) => {
      const m = machine(machineId);
      while (live()) {
        const pending = await m.pendingPull(requestId).catch(() => undefined);
        if (pending === undefined) {
          await sleep(POLL_MS); // RPC hiccup: try again
          continue;
        }
        if (pending) {
          const height = await blockHeight().catch(() => 0);
          if (pending.refund_failed || height >= pending.refundable_from_block) {
            if (live()) setState({ phase: 'timedOut', txHash, requestId, refunding: false });
            return;
          }
          await sleep(POLL_MS);
          continue;
        }
        // No longer pending: the contract either settled it (pulls carry the request id) or refunded it.
        const pulls = (await m.recentPulls().catch(() => [] as PullRecord[]))
          .filter((p) => p.request_id === requestId && p.buyer === account)
          .sort((a, b) => a.pull_id - b.pull_id);
        if (!live()) return;
        if (pulls.length > 0) setState({ phase: 'opened', txHash: txHash ?? '', pulls });
        else setState({ phase: 'refunded', txHash, message: VRF_REFUND_MESSAGE });
        return;
      }
    },
    [account, machineId],
  );

  /** After a wallet error on a VRF machine: did the payment land anyway? Finds this buyer's request id >= `from`. */
  const findRequest = useCallback(
    async (from: number): Promise<number | null> => {
      const m = machine(machineId);
      for (let i = 0; i < 20; i++) {
        const [pending, pulls] = await Promise.all([
          m.pending(account).catch(() => []),
          m.recentPulls().catch(() => [] as PullRecord[]),
        ]);
        const ids = [
          ...pending.map((p) => p.request_id),
          ...pulls.filter((p) => p.buyer === account && p.request_id !== undefined).map((p) => p.request_id as number),
        ].filter((id) => id >= from);
        if (ids.length > 0) return Math.min(...ids);
        await sleep(POLL_MS);
      }
      return null;
    },
    [account, machineId],
  );

  const start = useCallback(
    async (count: number) => {
      if (state.phase === 'pending') return;
      const id = ++runId.current;
      const live = () => runId.current === id;
      setState({ phase: 'pending', count, slow: false, vrf: false });
      const slowTimer = setTimeout(
        () => live() && setState((s) => (s.phase === 'pending' ? { ...s, slow: true } : s)),
        SLOW_MS,
      );
      const giveUp = setTimeout(() => {
        if (!live()) return;
        runId.current++;
        setState({
          phase: 'failed',
          message:
            'No answer yet. If you did not approve in the wallet, no USDT moved. If you did, any USDT not used for a pack is refunded automatically; check My stuff.',
        });
      }, WALLET_GIVE_UP_MS);
      // Phase 5 machines expose request_nonce: the next request id is at least this. It also tells the panel to
      // explain the randomness wait (wallets that wait for every receipt return only after the proof is in).
      const nonceBefore = await machine(machineId)
        .get()
        .then((v) => v.request_nonce)
        .catch(() => undefined);
      if (nonceBefore !== undefined && live()) setState((s) => (s.phase === 'pending' ? { ...s, vrf: true } : s));
      try {
        const result = await openPack(machineId, count);
        clearTimeout(giveUp);
        if (!live()) return;
        if (result.kind === 'opened') setState({ phase: 'opened', txHash: result.txHash, pulls: result.pulls });
        else if (result.kind === 'refunded')
          setState({ phase: 'refunded', txHash: result.txHash, message: `The machine sent your USDT back: ${result.reason}.` });
        else if (result.kind === 'requested') {
          setState((s) => (s.phase === 'pending' ? { ...s, vrf: true } : s));
          await waitForSettlement(result.requestId, result.txHash, live);
        } else
          setState({ phase: 'failed', txHash: result.txHash, message: `The transaction failed, so your USDT was returned. ${result.reason}` });
      } catch (e) {
        clearTimeout(giveUp);
        if (!live()) return;
        const cancelled = e instanceof UserFacingError || /reject|cancel|denied|closed|user/i.test(String(e));
        // The wallet can give up while the chain is still waiting for the proof; look for the request on-chain.
        const requestId = !cancelled && nonceBefore !== undefined ? await findRequest(nonceBefore) : null;
        if (!live()) return;
        if (requestId !== null) {
          setState((s) => (s.phase === 'pending' ? { ...s, vrf: true } : s));
          await waitForSettlement(requestId, undefined, live);
        } else setState({ phase: 'failed', message: friendly(e) });
      } finally {
        clearTimeout(slowTimer);
        clearTimeout(giveUp);
        if (live()) onSettled?.();
      }
    },
    [findRequest, machineId, onSettled, openPack, state.phase, waitForSettlement],
  );

  /** Timed out: send the refund_expired transaction (anyone may; here, the buyer). */
  const refund = useCallback(async () => {
    if (state.phase !== 'timedOut') return;
    const { requestId, txHash } = state;
    setState({ ...state, refunding: true, error: undefined });
    try {
      await refundExpired(machineId, requestId);
      setState({ phase: 'refunded', txHash, message: 'The randomness proof never arrived, so your USDT was refunded.' });
    } catch (e) {
      setState({ ...state, refunding: false, error: friendly(e) });
    } finally {
      onSettled?.();
    }
  }, [machineId, onSettled, refundExpired, state]);

  const reset = useCallback(() => {
    runId.current++;
    setState({ phase: 'idle' });
  }, []);

  return { account, state, start, reset, refund };
}
