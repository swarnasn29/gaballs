'use client';

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from 'motion/react';
import { useEffect, type CSSProperties } from 'react';

import { art } from '@/art/manifest';

// Positioning is inline (not Tailwind) on purpose: even if the stylesheet fails to load, the decorations stay
// fixed behind the content, can't be clicked and are hidden from screen readers.
const layer: CSSProperties = { position: 'fixed', inset: 0, zIndex: -1, overflow: 'hidden', pointerEvents: 'none' };
const deco = (s: CSSProperties): CSSProperties => ({ position: 'absolute', pointerEvents: 'none', ...s });

type Item = { src: string; style: CSSProperties; depth: number; drift?: number };

// depth: how strongly it follows the pointer/tilt (bigger = closer). drift: seconds per gentle side-to-side loop.
const ITEMS: Item[] = [
  { src: art.background.castle, style: { right: '4%', top: '14%', width: 'clamp(160px, 18vw, 256px)', opacity: 0.8 }, depth: 6 },
  { src: art.background.cloudA, style: { left: '-4%', top: '8%', width: 'clamp(224px, 22vw, 320px)', opacity: 0.9 }, depth: 18, drift: 26 },
  { src: art.background.cloudB, style: { left: '38%', top: '30%', width: 'clamp(160px, 16vw, 224px)', opacity: 0.8 }, depth: 12, drift: 34 },
  { src: art.background.cloudA, style: { right: '-6%', top: '52%', width: 'clamp(208px, 20vw, 288px)', opacity: 0.7 }, depth: 24, drift: 30 },
  { src: art.background.bubble, style: { left: '12%', top: '46%', width: 40, opacity: 0.8 }, depth: 34, drift: 9 },
  { src: art.background.bubble, style: { left: '70%', top: '12%', width: 56, opacity: 0.7 }, depth: 28, drift: 12 },
  { src: art.background.bubble, style: { left: '56%', top: '70%', width: 32, opacity: 0.8 }, depth: 40, drift: 8 },
];

function Layer({ item, px, py, still }: { item: Item; px: MotionValue<number>; py: MotionValue<number>; still: boolean }) {
  const x = useTransform(px, (v) => v * item.depth);
  const y = useTransform(py, (v) => v * item.depth * 0.6);
  return (
    <motion.div style={{ ...deco(item.style), x, y }}>
      <motion.img
        src={item.src}
        alt=""
        draggable={false}
        style={{ width: '100%', display: 'block' }}
        animate={still || !item.drift ? undefined : { x: [0, 24, 0], y: [0, -6, 0] }}
        transition={item.drift ? { duration: item.drift, repeat: Infinity, ease: 'easeInOut' } : undefined}
      />
    </motion.div>
  );
}

/** Decorative background: sky, clouds, floating castle, bubbles. Follows the mouse (desktop) or tilt (phones). */
export function Sky() {
  const reduced = useReducedMotion();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const px = useSpring(rawX, { stiffness: 40, damping: 18 });
  const py = useSpring(rawY, { stiffness: 40, damping: 18 });

  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      rawX.set(e.clientX / window.innerWidth - 0.5);
      rawY.set(e.clientY / window.innerHeight - 0.5);
    };
    // Phones: device tilt where the browser exposes it without a permission prompt (Android). iOS stays static.
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      rawX.set(Math.max(-0.5, Math.min(0.5, e.gamma / 60)));
      rawY.set(Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 90)));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('deviceorientation', onTilt, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onTilt);
    };
  }, [reduced, rawX, rawY]);

  return (
    <div aria-hidden style={layer}>
      <div
        style={deco({ inset: 0, backgroundImage: `url(${art.background.sky})`, backgroundSize: 'cover', backgroundPosition: 'center' })}
      />
      {ITEMS.map((item, i) => (
        <Layer key={i} item={item} px={px} py={py} still={!!reduced} />
      ))}
    </div>
  );
}
