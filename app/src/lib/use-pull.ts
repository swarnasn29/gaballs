'use client';

// One place that runs a pack pull and turns it into machine/UI state. GOLDEN RULE: nothing here invents a result;
// "opened" carries exactly the pulls from the contract's pack_opened events.

import { useCallback, useRef, useState } from 'react';

import { UserFacingError, useGaballsActions } from '@/near/actions';
import type { PullRecord } from '@/near/types';

export type PullState =
  | { phase: 'idle' }
  | { phase: 'pending'; count: number; slow: boolean }
  | { phase: 'opened'; txHash: string; pulls: PullRecord[] }
  | { phase: 'refunded'; txHash: string; message: string }
  | { phase: 'failed'; message: string; txHash?: string };

const SLOW_MS = 45_000;
const GIVE_UP_MS = 180_000;

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof UserFacingError) return msg;
  if (/reject|cancel|denied|closed|user/i.test(msg)) return 'You cancelled in the wallet, so no USDT was taken.';
  return `The transaction did not go through, so no USDT was taken. (${msg})`;
}

export function usePull(machineId: string, onSettled?: () => void) {
  const { account, openPack } = useGaballsActions();
  const [state, setState] = useState<PullState>({ phase: 'idle' });
  const runId = useRef(0);

  const start = useCallback(
    async (count: number) => {
      if (state.phase === 'pending') return;
      const id = ++runId.current;
      const live = () => runId.current === id;
      setState({ phase: 'pending', count, slow: false });
      const slowTimer = setTimeout(() => live() && setState({ phase: 'pending', count, slow: true }), SLOW_MS);
      const giveUp = setTimeout(() => {
        if (!live()) return;
        runId.current++;
        setState({
          phase: 'failed',
          message:
            'No answer yet. If you did not approve in the wallet, no USDT moved. If you did, any USDT not used for a pack is refunded automatically; check My stuff.',
        });
      }, GIVE_UP_MS);
      try {
        const result = await openPack(machineId, count);
        if (!live()) return;
        if (result.kind === 'opened') setState({ phase: 'opened', txHash: result.txHash, pulls: result.pulls });
        else if (result.kind === 'refunded')
          setState({ phase: 'refunded', txHash: result.txHash, message: `The machine sent your USDT back: ${result.reason}.` });
        else setState({ phase: 'failed', txHash: result.txHash, message: `The transaction failed, so your USDT was returned. ${result.reason}` });
      } catch (e) {
        if (live()) setState({ phase: 'failed', message: friendly(e) });
      } finally {
        clearTimeout(slowTimer);
        clearTimeout(giveUp);
        onSettled?.();
      }
    },
    [machineId, onSettled, openPack, state.phase],
  );

  const reset = useCallback(() => {
    runId.current++;
    setState({ phase: 'idle' });
  }, []);

  return { account, state, start, reset };
}
