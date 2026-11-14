'use client';

// Launch pop-up: "building" while the wallet + chain work, a celebration ONLY once get_machine() on the factory lists
// the new machine (same golden rule as packs: never show success on a guess), or a friendly failure.

import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect } from 'react';

import { art, tierColor } from '@/art/manifest';
import { Confetti, Rays, Sparkles } from '@/components/reveal/effects';
import { txUrl } from '@/config';
import { fmtPrice, fmtTokens } from '@/lib/format';
import { sfx, unlockAudio } from '@/lib/sfx';

export type LaunchState =
  | { s: 'idle' }
  | { s: 'signing'; machineId: string; name: string; symbol: string }
  | { s: 'confirming'; machineId: string; name: string; symbol: string; txHash: string; slow: boolean }
  | {
      s: 'live';
      machineId: string;
      name: string;
      symbol: string;
      txHash: string;
      nftMinted: boolean;
      priceWad: string | null;
      allocation: string;
    }
  | { s: 'failed'; message: string; txHash?: string };

const GUMBALLS = ['#2e78c7', '#7cc4f2', '#afdff5', '#ddf0ff', tierColor.Mythic, '#2e78c7', '#7cc4f2', '#ddf0ff'];

/** The machine "being built": flat machine with gumballs dropping into the dome. */
function Building({ reduced }: { reduced: boolean | null }) {
  return (
    <div className="relative mx-auto h-56 w-44">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art.machine.flat} alt="" className="absolute inset-0 h-full w-full" />
      {!reduced &&
        GUMBALLS.map((c, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute h-5 w-5 rounded-full shadow-[inset_-2px_-3px_0_rgba(0,0,0,0.15)]"
            style={{ background: c, left: `${32 + (i % 4) * 9}%` }}
            initial={{ top: '-12%', opacity: 0 }}
            animate={{ top: ['-12%', `${34 - Math.floor(i / 4) * 6}%`], opacity: [0, 1] }}
            transition={{ duration: 0.9, delay: i * 0.35, repeat: Infinity, repeatDelay: GUMBALLS.length * 0.35 - 0.9, ease: 'easeIn' }}
          />
        ))}
    </div>
  );
}

export function LaunchDialog({ state, onClose }: { state: LaunchState; onClose: () => void }) {
  const reduced = useReducedMotion();
  const live = state.s === 'live';

  useEffect(() => {
    if (live) {
      unlockAudio();
      sfx.launched();
    }
  }, [live]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && state.s !== 'signing' && state.s !== 'confirming' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, state.s]);

  if (state.s === 'idle') return null;
  const busy = state.s === 'signing' || state.s === 'confirming';
  const backdrop = live
    ? 'radial-gradient(circle at 50% 30%, rgba(255,201,60,0.85), rgba(124, 196, 242,0.8) 45%, rgba(27, 58, 99,0.9) 80%)'
    : 'rgba(27, 58, 99, 0.65)';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-10 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-title"
    >
      <motion.div className="fixed inset-0" animate={{ background: backdrop }} transition={{ duration: 0.5 }} onClick={busy ? undefined : onClose} />
      {live && !reduced && <Confetti pieces={140} duration={4000} />}

      <motion.div
        key={state.s}
        className="relative flex w-full max-w-md flex-col items-center"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35 }}
      >
        {live && (
          <div className="relative flex h-56 w-full items-center justify-center sm:h-64">
            {!reduced && <Rays color={tierColor.Mythic} size={460} speed={14} />}
            {!reduced && <Sparkles color="#ffffff" count={10} />}
            <motion.div
              initial={reduced ? { opacity: 0 } : { scale: 0, rotate: -20 }}
              animate={reduced ? { opacity: 1 } : { scale: 1, rotate: 0 }}
              transition={reduced ? { duration: 0.2 } : { type: 'spring', stiffness: 260, damping: 12 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={art.machine.flat} alt="" width={150} className="max-w-[40vw] drop-shadow-[0_10px_20px_rgba(27, 58, 99,0.35)]" />
            </motion.div>
          </div>
        )}

        <div className="relative w-full glass-strong rounded-[2rem] p-6 text-center text-ink shadow-chunky" aria-live="polite">
          {busy && (
            <>
              <Building reduced={reduced} />
              <h2 id="launch-title" className="mt-3 text-3xl font-bold text-accent">
                Building your machine…
              </h2>
              <p className="mt-1">
                {state.s === 'signing'
                  ? 'Approve the launch in your wallet.'
                  : state.slow
                    ? 'Still confirming on the network — this can take a little while.'
                    : 'Creating the machine account, filling the vault and minting your Machine NFT.'}
              </p>
              <p className="mt-2 font-display text-lg font-semibold text-plum">
                {state.name} · ${state.symbol}
              </p>
              {state.s === 'confirming' && (
                <a className="mt-2 inline-block text-sm font-semibold text-accent underline" href={txUrl(state.txHash)} target="_blank" rel="noreferrer">
                  Watch the transaction
                </a>
              )}
            </>
          )}

          {live && (
            <>
              <p className="mx-auto w-fit rounded-full bg-tier-mythic px-4 py-1 font-display text-sm font-bold uppercase tracking-wider text-ink-dark">
                Launched
              </p>
              <h2 id="launch-title" className="mt-2 text-4xl font-bold text-accent">
                Your machine is live!
              </h2>
              <p className="mt-1 font-display text-xl font-semibold">
                {state.name} · ${state.symbol}
              </p>
              <p className="text-sm text-plum">{state.machineId}</p>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-left">
                <div className="rounded-2xl bg-blush p-3">
                  <dt className="text-[11px] font-bold uppercase text-plum">Starting price</dt>
                  <dd className="font-display text-xl font-bold">{state.priceWad ? fmtPrice(state.priceWad) : '…'}</dd>
                </div>
                <div className="rounded-2xl bg-blush p-3">
                  <dt className="text-[11px] font-bold uppercase text-plum">Your allocation</dt>
                  <dd className="font-display text-xl font-bold">{fmtTokens(state.allocation)}</dd>
                </div>
                <div className="col-span-2 rounded-2xl bg-blush p-3">
                  <dt className="text-[11px] font-bold uppercase text-plum">Machine NFT</dt>
                  <dd className="font-semibold">
                    {state.nftMinted
                      ? 'Minted to you. It earns 0.5% of every pack, and you can claim it on My stuff.'
                      : 'Still minting… it will appear on My stuff in a moment.'}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center [&>a]:whitespace-nowrap [&>a]:text-base">
                <Link
                  href={`/machine/${state.machineId}`}
                  className="min-h-12 rounded-full bg-grape px-6 py-3 font-display text-lg font-semibold text-white shadow-chunky-ink"
                >
                  Open your machine
                </Link>
                <Link href="/me" className="min-h-12 rounded-full bg-blush px-6 py-3 font-display text-lg font-semibold text-accent shadow-chunky ring-2 ring-lilac">
                  See my Machine NFT
                </Link>
              </div>
              <a className="mt-3 inline-block text-sm font-semibold text-accent underline" href={txUrl(state.txHash)} target="_blank" rel="noreferrer">
                View the launch transaction
              </a>
            </>
          )}

          {state.s === 'failed' && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={art.characters.mascot} alt="" width={90} className="mx-auto opacity-90" />
              <h2 id="launch-title" className="mt-2 text-3xl font-bold text-accent">
                The machine wasn&apos;t created
              </h2>
              <p className="mt-2">{state.message}</p>
              {state.txHash && (
                <a className="mt-2 inline-block text-sm font-semibold text-accent underline" href={txUrl(state.txHash)} target="_blank" rel="noreferrer">
                  View the transaction
                </a>
              )}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-12 rounded-full bg-grape px-6 py-3 font-display text-lg font-semibold text-white shadow-chunky-ink"
                >
                  Back to the form
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
