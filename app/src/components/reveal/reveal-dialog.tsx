'use client';

// The reveal pop-up. GOLDEN RULE: it only ever shows the pulls the contract reported (pack_opened events).
// Flow per capsule: tap to crack → the tier's gumball pops out with a tier-scaled mood → next / done.

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { art, tierColor } from '@/art/manifest';
import { txUrl } from '@/config';
import { fmtMultiplier, fmtTokens, tokenNumber, tokensToUsdt } from '@/lib/format';
import { setMuted, sfx, unlockAudio, useSound } from '@/lib/sfx';
import type { PullRecord, TierName } from '@/near/types';
import { Confetti, Puff, Rays, Sparkles } from './effects';

const MOOD: Record<TierName, { title: string; line: string; backdrop: string; gumball: number }> = {
  Common: {
    title: 'Common',
    line: 'A sweet little treat.',
    backdrop: 'rgba(43, 24, 64, 0.62)',
    gumball: 150,
  },
  Rare: {
    title: 'Rare!',
    line: 'Ooh, shiny! One in five.',
    backdrop: 'radial-gradient(circle at 50% 35%, rgba(95,184,236,0.55), rgba(43,24,64,0.75) 70%)',
    gumball: 170,
  },
  Epic: {
    title: 'EPIC!',
    line: 'The whole machine is glowing. One in twenty-five.',
    backdrop: 'radial-gradient(circle at 50% 35%, rgba(241,124,195,0.7), rgba(43,24,64,0.85) 72%)',
    gumball: 190,
  },
  Mythic: {
    title: 'MYTHIC!!',
    line: 'Legendary: one in a hundred. You earned a soulbound certificate.',
    backdrop: 'radial-gradient(circle at 50% 35%, rgba(255,201,60,0.95), rgba(241,124,195,0.75) 45%, rgba(43,24,64,0.92) 80%)',
    gumball: 210,
  },
};

function usd(n: number) {
  if (n >= 0.01) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  return `$${n.toPrecision(2)}`;
}

type Stage = 'closed' | 'cracking' | 'revealed' | 'summary';

export function RevealDialog({
  pulls,
  txHash,
  machineId,
  symbol,
  onClose,
}: {
  pulls: PullRecord[];
  txHash: string;
  machineId: string;
  symbol: string;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const sound = useSound();
  const [i, setI] = useState(0);
  const [stage, setStage] = useState<Stage>('closed');
  const primary = useRef<HTMLButtonElement>(null);
  const pull = pulls[i];
  const mood = MOOD[pull.tier];
  const multi = pulls.length > 1;

  // Scroll lock + Escape to close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    primary.current?.focus();
  }, [stage, i]);

  const crack = useCallback(() => {
    unlockAudio();
    sfx.crack();
    setStage('cracking');
    window.setTimeout(
      () => {
        setStage('revealed');
        sfx.reveal(pull.tier);
      },
      reduced ? 150 : 650,
    );
  }, [pull.tier, reduced]);

  const next = () => {
    if (i + 1 < pulls.length) {
      setI(i + 1);
      setStage('closed');
    } else if (multi) setStage('summary');
    else onClose();
  };

  const revealed = stage === 'revealed';
  const showFx = revealed && !reduced;
  const backdrop = stage === 'closed' || stage === 'cracking' || stage === 'summary' ? 'rgba(43, 24, 64, 0.62)' : mood.backdrop;
  const value = tokensToUsdt(pull.payout, pull.price_after);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-10 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reveal-title"
    >
      <motion.div className="fixed inset-0" style={{ background: backdrop }} animate={{ background: backdrop }} transition={{ duration: 0.4 }} onClick={onClose} />
      {/* confetti is painted before (under) the card, so it never covers the numbers */}
      {showFx && pull.tier === 'Mythic' && <Confetti />}

      {/* sound toggle, top-right of the screen */}
      <button
        type="button"
        onClick={() => {
          unlockAudio();
          setMuted(sound !== 'muted');
        }}
        aria-pressed={sound !== 'muted'}
        className="fixed right-3 top-3 z-[70] rounded-full bg-white px-3 py-1.5 text-xs font-bold text-grape shadow-chunky"
      >
        {sound === 'muted' ? 'Sound off' : 'Sound on'}
      </button>

      <motion.div
        key={`${i}-${stage === 'summary'}`}
        className="relative flex w-full max-w-md flex-col items-center"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.95 }}
        animate={
          showFx && pull.tier === 'Epic'
            ? { opacity: 1, y: 0, scale: 1, x: [0, -8, 8, -6, 6, 0] }
            : { opacity: 1, y: 0, scale: 1 }
        }
        transition={{ duration: 0.35, x: { duration: 0.45, delay: 0.1 } }}
      >
        {stage !== 'summary' && (
          <div className="relative flex h-56 w-full items-center justify-center sm:h-72">
            {showFx && (pull.tier === 'Epic' || pull.tier === 'Mythic') && (
              <Rays color={tierColor[pull.tier]} size={pull.tier === 'Mythic' ? 560 : 420} speed={pull.tier === 'Mythic' ? 10 : 16} />
            )}
            {showFx && pull.tier === 'Common' && <Puff color={tierColor.Common} />}
            {showFx && pull.tier !== 'Common' && <Sparkles color={tierColor[pull.tier]} count={pull.tier === 'Rare' ? 8 : 12} />}

            <AnimatePresence mode="wait">
              {stage !== 'revealed' ? (
                <motion.button
                  key="capsule"
                  ref={stage === 'closed' ? primary : undefined}
                  type="button"
                  onClick={stage === 'closed' ? crack : undefined}
                  aria-label={`Tap to open capsule${multi ? ` ${i + 1} of ${pulls.length}` : ''}`}
                  className="relative cursor-pointer rounded-full focus-visible:outline-4"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={
                    stage === 'cracking'
                      ? reduced
                        ? { opacity: 0 }
                        : { rotate: [0, -12, 12, -16, 16, 0], scale: [1, 1.08, 1.12, 1.2], opacity: 1 }
                      : reduced
                        ? { scale: 1, opacity: 1 }
                        : { scale: 1, opacity: 1, y: [0, -10, 0] }
                  }
                  exit={reduced ? { opacity: 0 } : { scale: 1.6, opacity: 0, transition: { duration: 0.18 } }}
                  transition={stage === 'cracking' ? { duration: 0.5 } : { y: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }, default: { duration: 0.35 } }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={art.capsule.closed} alt="" width={190} height={190} className="w-[min(190px,44vw)]" draggable={false} />
                </motion.button>
              ) : (
                <motion.div
                  key="gumball"
                  className="relative"
                  initial={reduced ? { opacity: 0 } : { scale: 0, rotate: -40, y: 30 }}
                  animate={reduced ? { opacity: 1 } : { scale: 1, rotate: 0, y: 0 }}
                  transition={reduced ? { duration: 0.2 } : { type: 'spring', stiffness: 320, damping: pull.tier === 'Common' ? 14 : 9 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={art.gumballs[pull.tier]}
                    alt={`${pull.tier} gumball`}
                    width={mood.gumball}
                    height={mood.gumball}
                    className="max-w-[46vw]"
                    style={{ filter: pull.tier === 'Common' ? undefined : `drop-shadow(0 0 24px ${tierColor[pull.tier]})` }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* solid card: all numbers live here (AA contrast) */}
        <div className="relative w-full rounded-[2rem] bg-white p-5 text-ink shadow-chunky ring-4 ring-white" aria-live="polite">
          {stage === 'closed' && (
            <div className="text-center">
              <h2 id="reveal-title" className="text-3xl font-bold text-grape">
                {multi ? `Capsule ${i + 1} of ${pulls.length}` : 'Your capsule is here!'}
              </h2>
              <p className="mt-1">Tap the capsule to crack it open.</p>
              <p className="mt-2 text-xs text-plum">The result is already decided on-chain; opening just shows it.</p>
            </div>
          )}
          {stage === 'cracking' && (
            <p id="reveal-title" className="text-center font-display text-2xl font-bold text-grape">
              Cracking…
            </p>
          )}
          {revealed && (
            <div className="flex flex-col items-center gap-2 text-center">
              <span
                className="rounded-full px-4 py-1 font-display text-sm font-bold uppercase tracking-wider text-ink"
                style={{ background: tierColor[pull.tier] }}
              >
                {pull.tier}
              </span>
              <motion.h2
                id="reveal-title"
                className="font-display font-bold text-grape"
                style={{ fontSize: pull.tier === 'Mythic' ? 52 : pull.tier === 'Epic' ? 46 : pull.tier === 'Rare' ? 40 : 34 }}
                initial={reduced ? false : { scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 12 }}
              >
                {mood.title}
              </motion.h2>
              <p className="-mt-1">{mood.line}</p>
              <dl className="mt-2 grid w-full grid-cols-3 gap-2">
                <div className="rounded-2xl bg-blush p-2">
                  <dt className="text-[11px] font-bold uppercase text-plum">Multiplier</dt>
                  <dd className="font-display text-2xl font-bold">{fmtMultiplier(pull.multiplier_bps)}</dd>
                </div>
                <div className="rounded-2xl bg-blush p-2">
                  <dt className="text-[11px] font-bold uppercase text-plum">You got</dt>
                  <dd className="font-display text-2xl font-bold" title={`${tokenNumber(pull.payout).toLocaleString('en-US')} ${symbol}`}>
                    {fmtTokens(pull.payout)}
                  </dd>
                  <dd className="text-[11px] font-semibold text-plum">${symbol}</dd>
                </div>
                <div className="rounded-2xl bg-blush p-2">
                  <dt className="text-[11px] font-bold uppercase text-plum">Worth now</dt>
                  <dd className="font-display text-2xl font-bold">{usd(value)}</dd>
                  <dd className="text-[11px] font-semibold text-plum">at current price</dd>
                </div>
              </dl>
              {pull.capped && (
                <p className="text-sm font-semibold text-warn">The vault limit capped this prize (max 25% of the vault per pull).</p>
              )}
              {pull.tier === 'Mythic' && (
                <div className="relative mt-2 w-full overflow-hidden rounded-3xl px-8 py-7 text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element -- frame art from the manifest, stretched to the card */}
                  <img src={art.cards.certificate} alt="" className="absolute inset-0 h-full w-full object-fill" />
                  <div className="relative">
                  <p className="text-xs font-bold uppercase tracking-wider text-plum">Soulbound certificate</p>
                  <p className="font-display text-xl font-bold text-ink">Mythic pull #{pull.pull_id}</p>
                  <p className="text-sm text-ink">
                    {machineId} · roll {pull.roll} of 10,000. Minted to your wallet; it can never be transferred.
                  </p>
                  </div>
                </div>
              )}
              <a className="mt-1 text-sm font-semibold text-grape underline" href={txUrl(txHash)} target="_blank" rel="noreferrer">
                View transaction on nearblocks
              </a>
            </div>
          )}
          {stage === 'summary' && (
            <div>
              <h2 id="reveal-title" className="text-center text-3xl font-bold text-grape">
                All {pulls.length} capsules
              </h2>
              <ul className="mt-3 flex flex-col divide-y divide-lilac">
                {pulls.map((p) => (
                  <li key={p.pull_id} className="grid grid-cols-[1fr_4rem_5rem] items-center gap-2 py-2">
                    <span className="flex items-center gap-2 font-bold">
                      <span className="inline-block h-4 w-4 rounded-full ring-2 ring-white" style={{ background: tierColor[p.tier] }} />
                      {p.tier}
                    </span>
                    <span className="text-right tabular-nums">{fmtMultiplier(p.multiplier_bps)}</span>
                    <span className="text-right tabular-nums">{fmtTokens(p.payout)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-right font-bold">
                Total: {fmtTokens(pulls.reduce((a, p) => a + BigInt(p.payout), 0n))} ${symbol} (
                {usd(pulls.reduce((a, p) => a + tokensToUsdt(p.payout, p.price_after), 0))})
              </p>
              <a className="mt-1 block text-center text-sm font-semibold text-grape underline" href={txUrl(txHash)} target="_blank" rel="noreferrer">
                View transaction on nearblocks
              </a>
            </div>
          )}

          {(revealed || stage === 'summary') && (
            <div className="mt-4 flex justify-center gap-2">
              <button
                ref={primary}
                type="button"
                onClick={stage === 'summary' ? onClose : next}
                className="min-h-12 rounded-full bg-grape px-6 py-3 font-display text-lg font-semibold text-white shadow-chunky-ink"
              >
                {stage === 'summary' ? 'Done' : i + 1 < pulls.length ? `Next capsule (${i + 2} of ${pulls.length})` : multi ? 'See all' : 'Done'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
