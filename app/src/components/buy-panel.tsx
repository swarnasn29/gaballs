'use client';

import { useState } from 'react';

import { txUrl } from '@/config';
import { fmtMultiplier, fmtTokens } from '@/lib/format';
import { UserFacingError, useGaballsActions } from '@/near/actions';
import type { PackResult } from '@/near/outcome';
import { TierDot } from './machine-bits';
import { Button, cx } from './ui';

type State =
  | { s: 'idle' }
  | { s: 'pending' }
  | { s: 'done'; result: PackResult }
  | { s: 'error'; message: string };

/**
 * Golden rule: nothing here decides a result. After the wallet returns, we show exactly the tiers the contract
 * reported in its pack_opened events (or the refund / failure it reported).
 */
export function BuyPanel({ machineId, onSettled }: { machineId: string; onSettled?: () => void }) {
  const { account, openPack } = useGaballsActions();
  const [count, setCount] = useState(1);
  const [state, setState] = useState<State>({ s: 'idle' });

  async function go() {
    setState({ s: 'pending' });
    try {
      const result = await openPack(machineId, count);
      setState({ s: 'done', result });
    } catch (e) {
      const message =
        e instanceof UserFacingError ? e.message : `The wallet did not complete the transaction. No USDT moved. (${e instanceof Error ? e.message : e})`;
      setState({ s: 'error', message });
    } finally {
      onSettled?.();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold">Open packs</h2>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Number of packs</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={count === n}
            onClick={() => setCount(n)}
            className={cx(
              'h-11 w-11 rounded-full font-display text-lg font-semibold ring-2',
              count === n ? 'bg-grape text-white ring-grape' : 'bg-blush text-grape ring-lilac',
            )}
          >
            {n}
          </button>
        ))}
        <span className="ml-1 whitespace-nowrap font-bold">= {count * 10} USDT</span>
      </fieldset>

      <Button onClick={go} disabled={!account || state.s === 'pending'}>
        {state.s === 'pending' ? 'Turning the crank…' : account ? `Open ${count} pack${count > 1 ? 's' : ''}` : 'Connect a wallet to play'}
      </Button>

      <div aria-live="polite" className="min-h-6 text-sm">
        {state.s === 'pending' && <p>Waiting for the transaction. The result comes from the contract.</p>}
        {state.s === 'error' && <p className="font-semibold text-bad">{state.message}</p>}
        {state.s === 'done' && state.result.kind === 'refunded' && (
          <p className="font-semibold text-warn">
            Refunded in full: {state.result.reason}.{' '}
            <a className="underline" href={txUrl(state.result.txHash)} target="_blank" rel="noreferrer">
              View transaction
            </a>
          </p>
        )}
        {state.s === 'done' && state.result.kind === 'failed' && (
          <p className="font-semibold text-bad">
            The transaction failed; any USDT was returned. {state.result.reason}
            {state.result.txHash && (
              <>
                {' '}
                <a className="underline" href={txUrl(state.result.txHash)} target="_blank" rel="noreferrer">
                  View transaction
                </a>
              </>
            )}
          </p>
        )}
        {state.s === 'done' && state.result.kind === 'opened' && (
          <div className="flex flex-col gap-1">
            {state.result.pulls.map((p) => (
              <p key={p.pull_id} className="flex items-center gap-2">
                <TierDot tier={p.tier} />
                <strong>{p.tier}</strong> {fmtMultiplier(p.multiplier_bps)} → {fmtTokens(p.payout)} tokens
                {p.capped && <span className="text-warn">(capped by vault)</span>}
              </p>
            ))}
            <a className="font-semibold text-grape underline" href={txUrl(state.result.txHash)} target="_blank" rel="noreferrer">
              View transaction on nearblocks
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
