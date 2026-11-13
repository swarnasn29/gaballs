'use client';

// Live pull feed: polls get_recent_pulls(); pulls that appear after the page loaded (any player's) slide in as a
// capsule that pops open into its tier's gumball. Rows present at first load are plain elements (no animation work).

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useState } from 'react';

import { art } from '@/art/manifest';
import { EXPLORER_URL } from '@/config';
import { fmtMultiplier, fmtTokens, shortAccount } from '@/lib/format';
import type { PullRecord } from '@/near/types';

const ROW = 'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-1 py-2 text-sm';

function RowBody({ p, mine, icon }: { p: PullRecord; mine: boolean; icon: React.ReactNode }) {
  return (
    <>
      <span className="relative inline-block h-8 w-8 shrink-0" aria-hidden>
        {icon}
      </span>
      <span className="font-bold">{p.tier}</span>
      <span className="tabular-nums">{fmtMultiplier(p.multiplier_bps)}</span>
      <span className="text-plum">{shortAccount(p.buyer)}</span>
      {mine && <span className="rounded-full bg-grape px-2 py-0.5 text-[11px] font-bold text-white">You</span>}
      {p.capped && <span className="text-[11px] font-semibold text-warn">capped</span>}
      <span className="ml-auto tabular-nums">{fmtTokens(p.payout)} tokens</span>
      <a className="text-xs font-semibold text-grape underline" href={`${EXPLORER_URL}/blocks/${p.block}`} target="_blank" rel="noreferrer">
        block {p.block}
      </a>
    </>
  );
}

function Feed({ pulls, account, limit = 12 }: { pulls: PullRecord[] | undefined; account: string; limit?: number }) {
  const reduced = useReducedMotion();
  const rows = (pulls ?? []).slice(0, limit);
  // Pull ids already there when the feed first had data: these never animate.
  const [initial, setInitial] = useState<Set<string> | null>(null);
  if (initial === null && pulls) setInitial(new Set(pulls.map((p) => String(p.pull_id))));

  return (
    <ul className="mt-3 flex flex-col divide-y divide-lilac" aria-live="polite" aria-relevant="additions">
      <AnimatePresence initial={false}>
        {rows.map((p) => {
          const mine = p.buyer === account;
          const gumball = art.gumballs[p.tier];
          if (reduced || !initial || initial.has(String(p.pull_id)))
            return (
              <li key={p.pull_id} className={ROW}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <RowBody p={p} mine={mine} icon={<img src={gumball} alt="" className="absolute inset-0 h-8 w-8" />} />
              </li>
            );
          return (
            <motion.li
              key={p.pull_id}
              layout
              initial={{ opacity: 0, x: -60, backgroundColor: 'rgba(221, 240, 255,1)' }}
              animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(221, 240, 255,0)' }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 24, backgroundColor: { duration: 2.5 } }}
              className={ROW}
            >
              <RowBody
                p={p}
                mine={mine}
                icon={
                  <>
                    {/* capsule pops away to reveal the tier's gumball */}
                    <motion.img
                      src={art.capsule.closed}
                      alt=""
                      className="absolute inset-0 h-8 w-8"
                      initial={{ scale: 1, opacity: 1 }}
                      animate={{ scale: [1, 1.25, 0], opacity: [1, 1, 0] }}
                      transition={{ duration: 0.6, delay: 0.35 }}
                    />
                    <motion.img
                      src={gumball}
                      alt=""
                      className="absolute inset-0 h-8 w-8"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 12, delay: 0.7 }}
                    />
                  </>
                }
              />
            </motion.li>
          );
        })}
      </AnimatePresence>
      {pulls?.length === 0 && <li className="py-2">No pulls yet — be the first!</li>}
    </ul>
  );
}

// The page polls every few seconds and gets a fresh array each time; only re-render when the pulls actually changed.
const signature = (pulls: PullRecord[] | undefined) => (pulls ? pulls.map((p) => p.pull_id).join(',') : '');
export const PullFeed = memo(
  Feed,
  (a, b) => a.account === b.account && a.limit === b.limit && signature(a.pulls) === signature(b.pulls),
);
