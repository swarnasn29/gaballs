'use client';

// Live pull feed: polls get_recent_pulls(); pulls that appear after the page loaded (any player's) slide in as a
// capsule that pops open into its tier's gumball. Rows present at first load don't animate.

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { art } from '@/art/manifest';
import { EXPLORER_URL } from '@/config';
import { fmtMultiplier, fmtTokens, shortAccount } from '@/lib/format';
import type { PullRecord } from '@/near/types';

export function PullFeed({ pulls, account, limit = 12 }: { pulls: PullRecord[] | undefined; account: string; limit?: number }) {
  const reduced = useReducedMotion();
  const rows = (pulls ?? []).slice(0, limit);

  return (
    <ul className="mt-3 flex flex-col divide-y divide-lilac" aria-live="polite" aria-relevant="additions">
      <AnimatePresence initial={false}>
        {rows.map((p) => {
          const mine = p.buyer === account;
          return (
            <motion.li
              key={p.pull_id}
              layout={!reduced}
              initial={reduced ? { opacity: 0 } : { opacity: 0, x: -60, backgroundColor: 'rgba(254,231,250,1)' }}
              animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(254,231,250,0)' }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24, backgroundColor: { duration: 2.5 } }}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-1 py-2 text-sm"
            >
              <span className="relative inline-block h-8 w-8 shrink-0" aria-hidden>
                {/* capsule pops away to reveal the tier's gumball (only for newly arrived rows) */}
                {!reduced && (
                  <motion.img
                    src={art.capsule.closed}
                    alt=""
                    className="absolute inset-0 h-8 w-8"
                    initial={{ scale: 1, opacity: 1 }}
                    animate={{ scale: [1, 1.25, 0], opacity: [1, 1, 0] }}
                    transition={{ duration: 0.6, delay: 0.35 }}
                  />
                )}
                <motion.img
                  src={art.gumballs[p.tier]}
                  alt=""
                  className="absolute inset-0 h-8 w-8"
                  initial={reduced ? false : { scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 12, delay: reduced ? 0 : 0.7 }}
                />
              </span>
              <span className="font-bold">{p.tier}</span>
              <span className="tabular-nums">{fmtMultiplier(p.multiplier_bps)}</span>
              <span className="text-plum">{shortAccount(p.buyer)}</span>
              {mine && <span className="rounded-full bg-grape px-2 py-0.5 text-[11px] font-bold text-white">You</span>}
              {p.capped && <span className="text-[11px] font-semibold text-warn">capped</span>}
              <span className="ml-auto tabular-nums">{fmtTokens(p.payout)} tokens</span>
              <a
                className="text-xs font-semibold text-grape underline"
                href={`${EXPLORER_URL}/blocks/${p.block}`}
                target="_blank"
                rel="noreferrer"
              >
                block {p.block}
              </a>
            </motion.li>
          );
        })}
      </AnimatePresence>
      {pulls?.length === 0 && <li className="py-2">No pulls yet — be the first!</li>}
    </ul>
  );
}
