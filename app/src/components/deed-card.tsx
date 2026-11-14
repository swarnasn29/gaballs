'use client';

// The Machine NFT as a "deed": shows claimable fees (on the NFT) and fees still in the machine (not yet swept).
// Coins drip in when either grows; after a confirmed claim, coins fly to the wallet button in the header.

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { art } from '@/art/manifest';
import { NFT_ID } from '@/config';
import { fmtUsdt } from '@/lib/format';
import type { NftToken } from '@/near/types';
import { Button, Stat } from './ui';

let dropId = 0;

/** Coins flying from `from` to the header wallet button. Rendered in a portal so they can cross the whole page. */
export function FlyingCoins({ from, onDone }: { from: DOMRect; onDone: () => void }) {
  const [target] = useState(() => {
    const el = document.querySelector('header button');
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth - 60, y: 30 };
  });
  const coins = Array.from({ length: 9 }, (_, i) => i);
  useEffect(() => {
    const t = setTimeout(onDone, 1500);
    return () => clearTimeout(t);
  }, [onDone]);
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[80]">
      {coins.map((i) => {
        const sx = from.left + from.width / 2 + (i - 4) * 14;
        const sy = from.top + from.height / 2;
        return (
          <motion.img
            key={i}
            src={art.fx.coin}
            alt=""
            className="absolute h-8 w-8"
            style={{ left: 0, top: 0 }}
            initial={{ x: sx - 16, y: sy - 16, scale: 0.4, opacity: 0 }}
            animate={{
              x: [sx - 16, sx - 16 + (i - 4) * 18, target.x - 16],
              y: [sy - 16, sy - 90 - (i % 3) * 20, target.y - 16],
              scale: [0.4, 1.1, 0.5],
              opacity: [0, 1, 0.9],
              rotate: [0, 180, 360],
            }}
            transition={{ duration: 1.1, delay: i * 0.05, ease: 'easeInOut' }}
          />
        );
      })}
    </div>,
    document.body,
  );
}

export function DeedCard({
  token,
  feeBalance,
  accrued,
  busy,
  onClaim,
  onSweep,
}: {
  token: NftToken;
  /** USDT units on the NFT (claimable). */
  feeBalance: string;
  /** USDT units still accrued in the machine (not yet swept). */
  accrued: string | null;
  busy: boolean;
  /** Resolves true when the claim transaction succeeded. */
  onClaim: () => Promise<boolean>;
  onSweep: () => Promise<boolean>;
}) {
  const reduced = useReducedMotion();
  const machineId = token.token_id.replace(/^machine:/, '');
  const card = useRef<HTMLLIElement>(null);
  const [drops, setDrops] = useState<number[]>([]);
  const [flight, setFlight] = useState<DOMRect | null>(null);

  // Coins drip in whenever the total (claimable + still in the machine) grows.
  const total = BigInt(feeBalance) + BigInt(accrued ?? '0');
  const prev = useRef<bigint | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = total;
    if (before === null || total <= before || reduced) return;
    const n = Math.min(6, Math.max(1, Number((total - before) / 50_000n))); // one coin per 0.05 USDT, max 6
    const ids = Array.from({ length: n }, () => ++dropId);
    setDrops((d) => [...d, ...ids]);
    const t = setTimeout(() => setDrops((d) => d.filter((x) => !ids.includes(x))), 1600);
    return () => clearTimeout(t);
  }, [total, reduced]);

  async function claim() {
    const rect = card.current?.getBoundingClientRect() ?? null;
    if ((await onClaim()) && rect && !reduced) setFlight(rect);
  }

  return (
    // The frame is drawn with CSS (not the stretched frame art) so the border and seal keep their shape at any width.
    <li ref={card} className="relative overflow-hidden rounded-[2rem] border-8 border-grape bg-blush p-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element -- seal art from the manifest */}
      <img src={art.fx.coin} alt="" aria-hidden className="absolute right-5 top-5 h-11 w-11" />
      <div className="relative rounded-[1.25rem] border-[3px] border-lilac px-4 py-4 sm:px-6">
        <p className="pr-12 text-xs font-bold uppercase tracking-wider text-plum">Machine deed · NFT</p>
        <Link href={`/machine/${machineId}`} className="block break-words pr-12 font-display text-2xl font-bold text-accent underline-offset-4 hover:underline">
          {machineId}
        </Link>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <Stat
            label="Claimable now"
            value={fmtUsdt(feeBalance)}
            source={{ contract: NFT_ID, method: 'get_fee_balance', args: { token_id: token.token_id } }}
            className="glass"
          />
          <Stat
            label="Still in machine"
            value={accrued === null ? '…' : fmtUsdt(accrued)}
            source={{ contract: machineId, method: 'get_machine' }}
            className="glass"
          />
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={busy || feeBalance === '0'} onClick={claim}>
            Claim {fmtUsdt(feeBalance)}
          </Button>
          <Button variant="secondary" disabled={busy || !accrued || accrued === '0'} onClick={() => void onSweep()}>
            Collect into deed
          </Button>
        </div>
        <p className="mt-2 text-xs text-plum">
          Fees from every pack (0.5%) collect in the machine; &ldquo;Collect&rdquo; moves them onto this deed. Unclaimed fees stay
          with the deed if you sell it.
        </p>
      </div>

      {/* dripping coins */}
      <AnimatePresence>
        {drops.map((id, i) => (
          <motion.img
            key={id}
            aria-hidden
            src={art.fx.coin}
            alt=""
            className="pointer-events-none absolute h-7 w-7"
            style={{ right: `${18 + (i % 3) * 7}%`, top: 0 }}
            initial={{ y: -30, opacity: 0, rotate: 0 }}
            animate={{ y: 120, opacity: [0, 1, 1, 0], rotate: 270 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, delay: i * 0.12, ease: 'easeIn' }}
          />
        ))}
      </AnimatePresence>
      {flight && <FlyingCoins from={flight} onDone={() => setFlight(null)} />}
    </li>
  );
}
