'use client';

import { txUrl } from '@/config';
import { fmtMultiplier, fmtTokens, fmtUsdt } from '@/lib/format';
import type { MachineView } from '@/near/types';
import type { PullState } from '@/lib/use-pull';
import { TierDot } from './machine-bits';
import { PullProgress } from './pull-progress';
import { Button, cx } from './ui';

// ------------------------------------------------------------------ variable pack size

const USDT = 1_000_000n;
const BPS = 10_000n;
/** Mythic, the best multiplier in the fixed odds table (8x). */
const BEST_MULTIPLIER_BPS = 80_000n;

export interface PackRange {
  min: bigint;
  max: bigint;
}

/** The machine's pack range, or null for fixed 10 USDT machines (launched before variable sizes). */
export function packRange(v: MachineView): PackRange | null {
  const min = BigInt(v.config.pack_price);
  const max = v.config.max_pack_price ? BigInt(v.config.max_pack_price) : min;
  return max > min ? { min, max } : null;
}

export const clampAmount = (a: bigint, r: PackRange) => (a < r.min ? r.min : a > r.max ? r.max : a);

/** Slider position (0–1000) ↔ amount, on a log scale so 10–50 USDT gets as much room as 200–1,000. */
const STEPS = 1000;
function amountAt(pos: number, r: PackRange): bigint {
  if (pos <= 0) return r.min;
  if (pos >= STEPS) return r.max;
  const lo = Number(r.min) / 1e6;
  const hi = Number(r.max) / 1e6;
  const x = lo * Math.pow(hi / lo, pos / STEPS);
  const step = x < 100 ? 1 : x < 500 ? 5 : 10;
  return clampAmount(BigInt(Math.round(x / step) * step) * USDT, r);
}
function posOf(a: bigint, r: PackRange): number {
  const lo = Number(r.min);
  return Math.round((Math.log(Number(a) / lo) / Math.log(Number(r.max) / lo)) * STEPS);
}

/**
 * What one pack of `amount` buys right now: the contract's own maths (curve.rs `tokens_out`, rounding for the contract;
 * `quote_pack_amount` returns the same numbers) on the curve and vault from get_machine().
 */
export function quoteAmount(v: MachineView, amount: bigint) {
  const fee = (x: bigint, bps: number) => (x * BigInt(bps)) / BPS;
  const toCurve = amount - fee(amount, v.config.nft_fee_bps) - fee(amount, v.config.platform_fee_bps);
  const k = BigInt(v.config.virtual_usdt_reserve) + BigInt(v.curve_usdt_reserve);
  const t = BigInt(v.curve_tokens);
  const denom = k + toCurve;
  const bought = t - (k * t + denom - 1n) / denom;
  // Prices scaled by 10^36 (USDT has 6 decimals, the token 18): 10^18 alone rounds them to a few digits.
  const priceBefore = (k * 10n ** 36n) / t;
  const priceAfter = ((k + toCurve) * 10n ** 36n) / (t - bought);
  const impactPct = priceBefore > 0n ? Number(((priceAfter - priceBefore) * 100_000n) / priceBefore) / 1000 : 0;
  const rawMax = (bought * BEST_MULTIPLIER_BPS) / BPS;
  const room = (BigInt(v.vault) * BigInt(v.config.max_vault_draw_bps)) / BPS;
  const maxPayout = bought + (rawMax - bought < room ? rawMax - bought : room);
  return { bought, impactPct, maxPayout, capped: rawMax > maxPayout };
}

const PRESETS = [10n, 50n, 200n, 500n, 1000n];

function PackSizePicker({ min, max, amount, setAmount, view }: PackRange & { amount: bigint; setAmount: (a: bigint) => void; view: MachineView }) {
  const r = { min, max };
  const q = quoteAmount(view, amount);
  const presets = PRESETS.map((p) => p * USDT).filter((p) => p >= min && p <= max);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor="pack-size" className="font-semibold">
          Pack size
        </label>
        <span className="font-display text-3xl font-bold text-grape" data-testid="pack-size">
          {fmtUsdt(amount)}
        </span>
      </div>
      <input
        id="pack-size"
        type="range"
        min={0}
        max={STEPS}
        step={1}
        value={posOf(amount, r)}
        onChange={(e) => setAmount(amountAt(Number(e.target.value), r))}
        aria-valuetext={`${Number(amount) / 1e6} USDT`}
        className="h-11 w-full cursor-pointer accent-grape"
      />
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.toString()}
            type="button"
            aria-pressed={amount === p}
            onClick={() => setAmount(p)}
            className={cx(
              'min-h-11 flex-1 rounded-full px-2 font-display text-sm font-semibold ring-2',
              amount === p ? 'bg-grape text-white ring-grape' : 'bg-blush text-grape ring-lilac',
            )}
          >
            {fmtUsdt(p)}
          </button>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-2xl bg-blush p-3 text-sm">
        <dt>You buy</dt>
        <dd className="text-right font-bold">≈ {fmtTokens(q.bought)} tokens</dd>
        <dt>Price impact</dt>
        <dd className={cx('text-right font-bold', q.impactPct >= 10 && 'text-warn')}>+{q.impactPct.toFixed(q.impactPct < 1 ? 2 : 1)}%</dd>
        <dt>Best case (Mythic)</dt>
        <dd className="text-right font-bold" data-testid="pack-max">
          {fmtTokens(q.maxPayout)} tokens
        </dd>
      </dl>
      <p className="text-xs text-plum">
        One pack, one draw on the same odds; every tier multiplies what this pack buys.
        {q.capped && (
          <>
            {' '}
            <span className="font-semibold text-warn">
              At this size a Mythic is held to the vault cap ({view.config.max_vault_draw_bps / 100}% of the vault), so it pays
              less than 8×.
            </span>
          </>
        )}{' '}
        Same maths as the contract&apos;s <code>quote_pack_amount</code> view on {view.machine}.
      </p>
    </div>
  );
}

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
  size,
}: {
  account: string;
  count: number;
  setCount: (n: number) => void;
  /** Variable-size machines: the pack-size slider replaces the 1–5 count picker. */
  size?: PackRange & { amount: bigint; setAmount: (a: bigint) => void; view: MachineView };
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
      <h2 className="text-2xl font-bold">{size ? 'Open a pack' : 'Open packs'}</h2>
      {size ? (
        <fieldset disabled={pending} className="disabled:opacity-60">
          <legend className="sr-only">Pack size</legend>
          <PackSizePicker {...size} />
        </fieldset>
      ) : (
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
      )}

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
          {pending
            ? 'Turning the crank…'
            : !account
              ? 'Connect a wallet to play'
              : size
                ? `Open a ${fmtUsdt(size.amount)} pack`
                : `Open ${count} pack${count > 1 ? 's' : ''}`}
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
