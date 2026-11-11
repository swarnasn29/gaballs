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
        <Button onClick={onRefund} disabled={state.refunding}>
          {state.refunding ? 'Refunding…' : 'Get my USDT back'}
        </Button>
      ) : finished ? (
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
            {state.vrf
              ? state.slow
                ? 'Still waiting for the randomness proof. If none arrives within about 5 minutes, you can take your USDT back.'
                : 'Waiting for your payment and a verifiable randomness proof from OutLayer (usually about a minute). The contract checks the proof before opening your capsule.'
              : state.slow
                ? 'Still waiting for the wallet or the network… The machine keeps going until the contract answers.'
                : 'Waiting for the transaction. The result comes from the contract, not from the animation.'}
          </p>
        )}
        {timedOut && (
          <p className="font-semibold text-warn">
            The randomness proof did not arrive in time, so nothing was bought. Your USDT is safe in the machine: take it
            back with the button above.{' '}
            {state.txHash && (
              <a className="underline" href={txUrl(state.txHash)} target="_blank" rel="noreferrer">
                View transaction
              </a>
            )}
            {state.error && <span className="block text-bad">{state.error}</span>}
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
