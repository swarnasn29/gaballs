'use client';

// Progress while a VRF pull is in flight: Paid ✓ → Generating verifiable randomness (~1 min) → Reveal.
// Purely informational: the steps follow what the contract reports (payment seen on-chain, then settled); the timer
// and the gentle animation never decide anything.

import { useEffect, useState } from 'react';

import { useNearWallet } from '@/providers/near-provider';
import { cx } from './ui';

const TYPICAL_SECONDS = 65;

function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [since]);
  return since === null ? 0 : Math.max(0, Math.round((now - since) / 1000));
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * `paidAt`: when the payment was seen on-chain (ms epoch), or null while the wallet is still working.
 * `compact`: one-line version for lists (My stuff).
 */
export function PullProgress({ paidAt, count, compact }: { paidAt: number | null; count?: number; compact?: boolean }) {
  const elapsed = useElapsed(paidAt);
  const paid = paidAt !== null;
  // Google/email players sign silently (no wallet to look at).
  const { via } = useNearWallet();
  const steps = [
    { label: paid ? 'Paid' : via === 'google' ? 'Paying' : 'Paying in your wallet', state: paid ? 'done' : 'active' },
    { label: 'Generating verifiable randomness (~1 min)', state: paid ? 'active' : 'todo' },
    { label: 'Reveal', state: 'todo' },
  ] as const;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-2 text-sm">
        <Orbs small />
        <span>
          Generating verifiable randomness… <span className="tabular-nums text-plum">{mmss(elapsed)}</span>
        </span>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-blush/70 p-4" role="status" aria-live="polite">
      <ol className="flex flex-col gap-1.5">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className={cx(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                s.state === 'done' && 'bg-good text-white',
                s.state === 'active' && 'bg-grape text-white',
                s.state === 'todo' && 'bg-white text-plum ring-2 ring-lilac',
              )}
              aria-hidden
            >
              {s.state === 'done' ? '✓' : i + 1}
            </span>
            <span className={cx('font-semibold', s.state === 'todo' ? 'text-plum' : 'text-ink')}>
              {s.label}
              {s.state === 'done' && <span className="sr-only"> (done)</span>}
              {s.state === 'active' && <span className="sr-only"> (in progress)</span>}
            </span>
          </li>
        ))}
      </ol>
      {paid && (
        <>
          <div className="flex items-center gap-3">
            <Orbs />
            <div className="min-w-0 flex-1">
              {/* An estimate that slows near the end instead of claiming to know the finish time. */}
              <div className="h-2 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-lilac transition-[width] duration-1000 ease-linear"
                  style={{ width: `${Math.round(95 * (1 - Math.exp(-elapsed / (TYPICAL_SECONDS / 2))))}%` }}
                />
              </div>
              <p className="mt-1 text-xs tabular-nums text-plum">
                {mmss(elapsed)} · usually about a minute{count && count > 1 ? ` for all ${count} packs` : ''}
              </p>
            </div>
          </div>
          <p className="text-sm font-semibold text-grape">This minute is what makes the result provably fair.</p>
          {elapsed > 120 && (
            <p className="text-sm text-plum">
              Taking longer than usual. If no proof arrives within 5 minutes of paying, you can take your USDT back here.
            </p>
          )}
          <p className="text-xs text-plum">
            OutLayer is signing a random value only its key can produce; the contract checks that signature before your
            capsule exists. You can leave this page: the pull continues on-chain and waits for you here and on My stuff.
          </p>
        </>
      )}
    </div>
  );
}

/** Three gumballs breathing in turn. Static with reduced motion (handled globally in CSS). */
function Orbs({ small }: { small?: boolean }) {
  const size = small ? 'h-2.5 w-2.5' : 'h-4 w-4';
  return (
    <span className="flex shrink-0 items-center gap-1" aria-hidden>
      {['bg-grape', 'bg-lilac', 'bg-tier-rare'].map((c, i) => (
        <span key={c} className={cx('pull-orb rounded-full', size, c)} style={{ animationDelay: `${i * 0.35}s` }} />
      ))}
    </span>
  );
}
