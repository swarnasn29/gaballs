'use client';

import { txUrl } from '@/config';
import { fmtMultiplier, fmtTokens } from '@/lib/format';
import type { PullState } from '@/lib/use-pull';
import { TierDot } from './machine-bits';
import { Button, cx } from './ui';

/**
 * Count picker + the accessible "Open pack" button (same action as dragging the crank) + the outcome text.
 * Golden rule: the tiers listed come from the contract's pack_opened events, shown only once the capsule is out.
 */
export function BuyPanel({
  account,
  count,
  setCount,
  state,
  capsuleOut,
  onOpen,
  onReset,
}: {
  account: string;
  count: number;
  setCount: (n: number) => void;
  state: PullState;
  capsuleOut: boolean;
  onOpen: () => void;
  onReset: () => void;
}) {
  const pending = state.phase === 'pending';
  const finished = state.phase !== 'idle' && !pending;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold">Open packs</h2>
      <fieldset className="flex flex-wrap items-center gap-2" disabled={pending}>
        <legend className="sr-only">Number of packs</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={count === n}
            onClick={() => setCount(n)}
            className={cx(
              'h-11 w-11 rounded-full font-display text-lg font-semibold ring-2 disabled:opacity-60',
              count === n ? 'bg-grape text-white ring-grape' : 'bg-blush text-grape ring-lilac',
            )}
          >
            {n}
          </button>
        ))}
        <span className="ml-1 whitespace-nowrap font-bold">= {count * 10} USDT</span>
      </fieldset>

      {finished ? (
        <Button variant="secondary" onClick={onReset}>
          Play again
        </Button>
      ) : (
        <Button onClick={onOpen} disabled={!account || pending}>
          {pending ? 'Turning the crank…' : account ? `Open ${count} pack${count > 1 ? 's' : ''}` : 'Connect a wallet to play'}
        </Button>
      )}
      {!finished && account && !pending && <p className="text-xs text-plum">Or drag the machine&apos;s crank a full turn.</p>}

      <div aria-live="polite" className="min-h-6 text-sm">
        {pending && (
          <p>
            {state.slow
              ? 'Still waiting for the wallet or the network… The machine keeps going until the contract answers.'
              : 'Waiting for the transaction. The result comes from the contract, not from the animation.'}
          </p>
        )}
        {state.phase === 'failed' && (
          <p className="font-semibold text-bad">
            {state.message}{' '}
            {state.txHash && (
              <a className="underline" href={txUrl(state.txHash)} target="_blank" rel="noreferrer">
                View transaction
              </a>
            )}
          </p>
        )}
        {state.phase === 'refunded' && (
          <p className="font-semibold text-warn">
            {state.message}{' '}
            <a className="underline" href={txUrl(state.txHash)} target="_blank" rel="noreferrer">
              View transaction
            </a>
          </p>
        )}
        {state.phase === 'opened' && !capsuleOut && <p>The contract answered. Here comes your capsule…</p>}
        {state.phase === 'opened' && capsuleOut && (
          <div className="flex flex-col gap-1">
            {state.pulls.map((p) => (
              <p key={p.pull_id} className="flex items-center gap-2">
                <TierDot tier={p.tier} />
                <strong>{p.tier}</strong> {fmtMultiplier(p.multiplier_bps)} → {fmtTokens(p.payout)} tokens
                {p.capped && <span className="text-warn">(capped by vault)</span>}
              </p>
            ))}
            <a className="font-semibold text-grape underline" href={txUrl(state.txHash)} target="_blank" rel="noreferrer">
              View transaction on nearblocks
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
