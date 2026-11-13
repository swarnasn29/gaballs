'use client';

import { txUrl } from '@/config';
import { fmtMultiplier, fmtTokens } from '@/lib/format';
import type { PullState } from '@/lib/use-pull';
import { TierDot } from './machine-bits';
import { PullProgress } from './pull-progress';
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
  onRefund,
}: {
  account: string;
  count: number;
  setCount: (n: number) => void;
  state: PullState;
  capsuleOut: boolean;
  onOpen: () => void;
  onReset: () => void;
  /** Timed-out VRF request: send refund_expired. */
  onRefund: () => void;
}) {
  const pending = state.phase === 'pending';
  const timedOut = state.phase === 'timedOut';
  const finished = state.phase !== 'idle' && !pending && !timedOut;

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

      {timedOut ? (
        <div className="flex flex-col gap-3 rounded-3xl bg-tier-mythic/20 p-4 ring-2 ring-warn" role="alert">
          <p className="font-display text-lg font-semibold text-ink">No randomness proof arrived in time</p>
          <p className="text-sm">
            Nothing was bought and your USDT is still held by the machine. The 5-minute timeout has passed, so you can take
            it back now: the contract refunds it in full.
          </p>
          <Button onClick={onRefund} disabled={state.refunding}>
            {state.refunding ? 'Refunding…' : `Get my ${state.usdt ? `${Number(state.usdt) / 1e6} ` : ''}USDT back`}
          </Button>
          {state.error && <p className="text-sm font-semibold text-bad">{state.error}</p>}
        </div>
      ) : finished ? (
        <Button variant="secondary" onClick={onReset}>
          {state.phase === 'refunded' ? 'Try again' : 'Play again'}
        </Button>
      ) : (
        <Button onClick={onOpen} disabled={!account || pending}>
          {pending ? 'Turning the crank…' : account ? `Open ${count} pack${count > 1 ? 's' : ''}` : 'Connect a wallet to play'}
        </Button>
      )}
      {!finished && !timedOut && account && !pending && <p className="text-xs text-plum">Or drag the machine&apos;s crank a full turn.</p>}

      <div aria-live="polite" className="min-h-6 text-sm">
        {pending && state.vrf && <PullProgress paidAt={state.paidAt} count={state.count} />}
        {pending && !state.vrf && (
          <p>
            {state.vrf
              ? state.slow
                ? 'Still waiting for the randomness proof. If OutLayer has not answered about 2 minutes after you paid, the machine refunds your USDT automatically.'
                : 'Waiting for your payment and a verifiable randomness proof from OutLayer (usually about 10 seconds). The contract checks the proof before opening your capsule.'
              : state.slow
                ? 'Still waiting for the wallet or the network… The machine keeps going until the contract answers.'
                : 'Waiting for the transaction. The result comes from the contract, not from the animation.'}
          </p>
        )}
        {timedOut && state.txHash && (
          <a className="font-semibold text-grape underline" href={txUrl(state.txHash)} target="_blank" rel="noreferrer">
            View the payment transaction
          </a>
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
            {state.txHash && (
              <a className="underline" href={txUrl(state.txHash)} target="_blank" rel="noreferrer">
                View transaction
              </a>
            )}
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
            {state.txHash && (
              <a className="font-semibold text-grape underline" href={txUrl(state.txHash)} target="_blank" rel="noreferrer">
                View transaction on nearblocks
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
