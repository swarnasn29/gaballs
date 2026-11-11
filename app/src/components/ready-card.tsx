'use client';

// A pull that settled while the player was away (its VRF proof was verified on-chain). The result is already decided;
// opening only plays the reveal. The capsule art gives no hint of the tier.

import { motion, useReducedMotion } from 'motion/react';

import { art } from '@/art/manifest';
import type { ReadyRequest } from '@/lib/pull-tracker';
import { Button } from './ui';

export function ReadyBadge() {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-tier-mythic px-3 py-1 font-display text-sm font-bold text-ink shadow-chunky">
      <span className="h-2 w-2 animate-pulse rounded-full bg-grape" aria-hidden />
      Ready to open!
    </span>
  );
}

export function ReadyCard({ ready, more, onOpen }: { ready: ReadyRequest; more: number; onOpen: () => void }) {
  const reduced = useReducedMotion();
  const n = ready.pulls.length;
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-blush p-4 ring-4 ring-tier-mythic">
      <motion.img
        src={art.capsule.closed}
        alt=""
        width={64}
        height={64}
        className="shrink-0"
        animate={reduced ? undefined : { rotate: [0, -8, 8, -4, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1.6 }}
      />
      <div className="flex min-w-0 flex-col gap-2">
        <ReadyBadge />
        <p className="text-sm">
          {n === 1 ? 'Your capsule' : `Your ${n} capsules`} settled with a verified randomness proof
          {more > 0 ? ` (+${more} more waiting)` : ''}.
        </p>
        <Button className="min-h-10 py-2 text-base" onClick={onOpen}>
          Open {n === 1 ? 'it' : 'them'}
        </Button>
      </div>
    </div>
  );
}
