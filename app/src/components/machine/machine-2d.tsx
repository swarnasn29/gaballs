'use client';

// 2D machine (Motion): used for prefers-reduced-motion, no WebGL, low-power devices, or the manual "2D mode".
// Same contract as the 3D scene: it only animates the phase it is given; the capsule appears only in `dropping`.

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';

import { art } from '@/art/manifest';
import type { StagePhase } from './shared';

// Geometry of art.machine.flat (viewBox 300×420): dome centre (150,140) r≈118, crank knob (150,318), chute (224,382).
const VB = { w: 300, h: 420 };
const BALL = 22;
// Pastel gumball mix from the brand: blues plus mint, pink and lavender.
const BALL_COLORS = ['#2e78c7', '#7cc4f2', '#7fdcb0', '#f6a8cf', '#b9a0ea', '#7cc4f2', '#7fdcb0'];

function layoutBalls(n: number) {
  const out: { x: number; y: number; color: string }[] = [];
  const cx = 150;
  const cy = 140;
  const r = 108;
  let row = 0;
  while (out.length < n && row < 12) {
    const y = 240 - row * (BALL * 0.86);
    const half = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy))) - BALL / 2;
    const offset = row % 2 ? BALL / 2 : 0;
    for (let x = cx - half + offset; x <= cx + half && out.length < n; x += BALL) {
      const i = out.length;
      out.push({ x, y, color: i === Math.floor(n * 0.37) ? '#ffc93c' : BALL_COLORS[(i * 5 + row * 3) % BALL_COLORS.length] });
    }
    row++;
  }
  return out;
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

export function Machine2D({
  ballCount,
  phase,
  capsules,
  crankable,
  onCrank,
  onCapsulesOut,
}: {
  ballCount: number;
  phase: StagePhase;
  capsules: number;
  crankable: boolean;
  onCrank: () => void;
  onCapsulesOut: () => void;
}) {
  const reduced = useReducedMotion();
  const balls = useMemo(() => layoutBalls(ballCount), [ballCount]);
  const [turning, setTurning] = useState(false);
  const n = Math.max(1, Math.min(capsules, 5));
  const pending = phase === 'pending';

  useEffect(() => {
    if (phase !== 'dropping') return;
    const t = setTimeout(onCapsulesOut, reduced ? 300 : 700 + n * 250);
    return () => clearTimeout(t);
  }, [phase, n, reduced, onCapsulesOut]);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <motion.div
        className="relative h-[92%]"
        style={{ aspectRatio: `${VB.w} / ${VB.h}`, transformOrigin: '50% 95%' }}
        animate={pending && !reduced ? { rotate: [0, -1.6, 1.6, -1.2, 1.2, 0] } : { rotate: 0 }}
        transition={pending && !reduced ? { duration: 0.55, repeat: Infinity } : { duration: 0.3 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art.machine.flat} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
        {balls.map((b, i) => (
          <span
            key={i}
            aria-hidden
            className={`absolute rounded-full shadow-[inset_-3px_-4px_0_rgba(0,0,0,0.12),inset_3px_3px_0_rgba(255,255,255,0.45)] ${pending && !reduced ? 'gumball-hop' : ''}`}
            style={
              {
                left: pct(b.x - BALL / 2, VB.w),
                top: pct(b.y - BALL / 2, VB.h),
                width: pct(BALL, VB.w),
                aspectRatio: '1',
                background: b.color,
                '--hop': `${-10 - (i % 4) * 4}px`,
                '--dur': `${0.35 + (i % 5) * 0.05}s`,
                '--delay': `${(i % 7) * 0.04}s`,
              } as React.CSSProperties
            }
          />
        ))}
        {/* crank knob */}
        <motion.button
          type="button"
          aria-label="Turn the crank to open the pack"
          disabled={!crankable || turning}
          onClick={() => {
            if (reduced) return onCrank();
            setTurning(true);
          }}
          className="absolute rounded-full ring-4 ring-blush/70 disabled:cursor-not-allowed enabled:cursor-grab"
          style={{ left: pct(150 - 26, VB.w), top: pct(318 - 26, VB.h), width: pct(52, VB.w), aspectRatio: '1' }}
          animate={turning ? { rotate: 360 } : pending && !reduced ? { rotate: [0, 360] } : { rotate: 0 }}
          transition={
            turning
              ? { duration: 0.7, ease: 'easeInOut' }
              : pending && !reduced
                ? { duration: 1.2, repeat: Infinity, ease: 'linear' }
                : { duration: 0.2 }
          }
          onAnimationComplete={() => {
            if (!turning) return;
            setTurning(false);
            onCrank();
          }}
        >
          <span className="absolute left-1/2 top-[8%] h-[40%] w-[18%] -translate-x-1/2 rounded-full bg-white" />
        </motion.button>
        {/* capsules: only after the contract answered */}
        {(phase === 'dropping' || phase === 'resting') &&
          Array.from({ length: n }, (_, i) => (
            <motion.img
              key={i}
              src={art.capsule.closed}
              alt=""
              className="absolute"
              style={{ left: pct(224 - 26 + (i - (n - 1) / 2) * 20, VB.w), top: pct(394 - 20, VB.h), width: pct(52, VB.w) }}
              initial={phase === 'dropping' ? (reduced ? { opacity: 0 } : { opacity: 0, y: -40 }) : false}
              animate={{ opacity: 1, y: 0 }}
              transition={reduced ? { duration: 0.25 } : { type: 'spring', stiffness: 380, damping: 14, delay: i * 0.25 }}
            />
          ))}
      </motion.div>
      {pending && reduced && (
        <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-sm font-bold text-grape shadow-chunky">
          Waiting for the contract…
        </p>
      )}
    </div>
  );
}
