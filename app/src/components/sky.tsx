'use client';

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform, type MotionValue } from 'motion/react';
import { useEffect, type CSSProperties, type ReactNode } from 'react';

// The pastel scene behind every page, drawn in code (reference: the "grid paper" mock-up, in baby blue): a soft sky-blue
// sky with a faint grid, rolling hills, two castles, flat clouds, gold coins, little stars and pale bubbles.
// It is a fixed layer the size of the screen, so it fills any screen and never "ends" while scrolling.
// Positioning is inline (not Tailwind) on purpose: even if the stylesheet fails to load, the decorations stay
// fixed behind the content, can't be clicked and are hidden from screen readers.
const layer: CSSProperties = { position: 'fixed', inset: 0, zIndex: -1, overflow: 'hidden', pointerEvents: 'none' };
const deco = (s: CSSProperties): CSSProperties => ({ position: 'absolute', pointerEvents: 'none', ...s });

const NAVY = '#1b3a63';

/** Baby-blue castle: three towers with pointed roofs, round windows and an arched door (flat, like the mock-up). */
function Castle({ style }: { style: CSSProperties }) {
  return (
    <svg viewBox="0 0 220 230" style={deco(style)}>
      <defs>
        <linearGradient id="castle-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eaf6ff" />
          <stop offset="1" stopColor="#c2e1f7" />
        </linearGradient>
      </defs>
      {/* side towers */}
      <rect x="18" y="86" width="44" height="144" fill="url(#castle-wall)" />
      <polygon points="12,90 40,30 68,90" fill="#5fb3ee" />
      <rect x="158" y="86" width="44" height="144" fill="url(#castle-wall)" />
      <polygon points="152,90 180,30 208,90" fill="#5fb3ee" />
      {/* keep */}
      <rect x="62" y="120" width="96" height="110" fill="#cfe7f8" />
      <rect x="86" y="60" width="48" height="170" fill="url(#castle-wall)" />
      <polygon points="80,64 110,0 140,64" fill="#2e78c7" />
      {/* battlements */}
      {[62, 80, 98, 116, 134, 152].map((x) => (
        <rect key={x} x={x} y="110" width="10" height="12" fill="#cfe7f8" />
      ))}
      {/* windows and door */}
      <circle cx="40" cy="120" r="6" fill="#8ecbf3" />
      <circle cx="180" cy="120" r="6" fill="#8ecbf3" />
      <circle cx="110" cy="96" r="7" fill="#8ecbf3" />
      <path d="M96 230 V196 a14 14 0 0 1 28 0 V230 Z" fill="#4a9be0" />
    </svg>
  );
}

/** A flat baby-blue cloud with a lighter top lobe. */
function Cloud({ style }: { style: CSSProperties }) {
  return (
    <svg viewBox="0 0 260 120" style={deco(style)}>
      <path
        d="M30 110 H232 a28 28 0 0 0 0 -56 a40 40 0 0 0 -62 -26 a54 54 0 0 0 -100 18 a36 36 0 0 0 -40 64 Z"
        fill="#bfe0f7"
      />
      <path d="M70 60 a54 54 0 0 1 100 -18 a40 40 0 0 1 30 10" fill="none" stroke="#e4f3fd" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}

/** Gold coin, tilted, with a dark gold outline and an inner rim (as in the mock-up). */
function Coin({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} style={{ display: 'block', transform: 'rotate(-20deg)' }}>
      <ellipse cx="32" cy="32" rx="22" ry="25" fill="#c88a12" stroke={NAVY} strokeWidth="2" />
      <ellipse cx="28" cy="30" rx="22" ry="25" fill="#f6c344" stroke={NAVY} strokeWidth="2" />
      <ellipse cx="28" cy="30" rx="15" ry="18" fill="none" stroke="#d99c1c" strokeWidth="3" />
      <path d="M18 20 a14 16 0 0 1 10 -6" fill="none" stroke="#fff3c4" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Five-point star with a navy outline. */
function Star({ size, fill }: { size: number; fill: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }}>
      <path
        d="M12 2 L14.6 8.6 L21.6 9 L16.2 13.5 L18 20.4 L12 16.6 L6 20.4 L7.8 13.5 L2.4 9 L9.4 8.6 Z"
        fill={fill}
        stroke={NAVY}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Four-point sparkle, outline only. */
function Sparkle({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} style={{ display: 'block' }}>
      <path d="M10 1 C11 7 13 9 19 10 C13 11 11 13 10 19 C9 13 7 11 1 10 C7 9 9 7 10 1 Z" fill="#fff" stroke={NAVY} strokeWidth="1.3" />
    </svg>
  );
}

/** Pale glass bubble. */
function Bubble({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle at 30% 26%, rgba(255,255,255,0.95) 0 10%, rgba(255,255,255,0) 12%),
          radial-gradient(circle at 50% 50%, rgba(221, 240, 255, 0.35) 0 60%, rgba(255, 255, 255, 0.75) 78%, rgba(175, 223, 245, 0.45) 100%)`,
        boxShadow: 'inset 0 0 0 1.5px rgba(255, 255, 255, 0.9), 0 4px 14px rgba(46, 120, 199, 0.12)',
      }}
    />
  );
}

type Item = { node: ReactNode; style: CSSProperties; depth: number; drift?: number };

// depth: how strongly it follows the pointer/tilt (bigger = closer). drift: seconds per gentle float loop.
const ITEMS: Item[] = [
  { node: <Coin size={46} />, style: { left: '10%', top: '15%' }, depth: 20, drift: 9 },
  { node: <Coin size={54} />, style: { right: '9%', top: '9%' }, depth: 26, drift: 11 },
  { node: <Coin size={40} />, style: { left: '42%', top: '72%' }, depth: 30, drift: 10 },
  { node: <Star size={30} fill="#7cc4f2" />, style: { left: '52%', top: '12%' }, depth: 16, drift: 12 },
  { node: <Star size={22} fill="#f6c344" />, style: { left: '9%', top: '28%' }, depth: 18, drift: 10 },
  { node: <Star size={26} fill="#afdff5" />, style: { right: '24%', top: '58%' }, depth: 22, drift: 13 },
  { node: <Sparkle size={22} />, style: { left: '57%', top: '19%' }, depth: 14, drift: 8 },
  { node: <Sparkle size={18} />, style: { left: '30%', top: '44%' }, depth: 12, drift: 9 },
  { node: <Bubble size={70} />, style: { left: '13%', top: '40%' }, depth: 24, drift: 14 },
  { node: <Bubble size={40} />, style: { left: '49%', top: '16%' }, depth: 18, drift: 11 },
  { node: <Bubble size={96} />, style: { right: '2%', top: '56%' }, depth: 32, drift: 15 },
  { node: <Bubble size={32} />, style: { right: '6%', top: '5%' }, depth: 14, drift: 9 },
];

function Layer({ item, px, py, still }: { item: Item; px: MotionValue<number>; py: MotionValue<number>; still: boolean }) {
  const x = useTransform(px, (v) => v * item.depth);
  const y = useTransform(py, (v) => v * item.depth * 0.6);
  return (
    <motion.div style={{ ...deco(item.style), x, y }}>
      {/* the slow float is a CSS animation (runs on the compositor, no per-frame JavaScript); see .sky-float */}
      <div className={still || !item.drift ? undefined : 'sky-float'} style={{ animationDuration: item.drift ? `${item.drift}s` : undefined }}>
        {item.node}
      </div>
    </motion.div>
  );
}

/** Decorative pastel sky. Coins, stars and bubbles follow the mouse (desktop) or tilt (phones). */
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
    <div aria-hidden style={{ ...layer, background: 'linear-gradient(160deg, #eef8ff 0%, #ddf0ff 45%, #cfe8fb 100%)' }}>
      {/* the faint grid-paper lines */}
      <div
        style={deco({
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(46, 120, 199, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(46, 120, 199, 0.1) 1px, transparent 1px)',
          backgroundSize: '88px 88px',
        })}
      />
      {/* soft light washes in the corners, like the mock-up */}
      <div style={deco({ inset: 0, background: 'radial-gradient(ellipse 50% 40% at 0% 0%, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0) 70%)' })} />
      <div style={deco({ inset: 0, background: 'radial-gradient(ellipse 50% 45% at 100% 100%, rgba(175, 223, 245, 0.6), rgba(175, 223, 245, 0) 70%)' })} />

      <Cloud style={{ left: '-3vw', top: '6vh', width: 'clamp(200px, 22vw, 330px)' }} />
      <Castle style={{ right: '1vw', top: '14vh', width: 'clamp(120px, 14vw, 210px)', opacity: 0.95 }} />
      {/* the cloud island the right castle sits on */}
      <div style={deco({ right: '-1vw', top: 'calc(14vh + clamp(120px, 14vw, 210px) * 1.02)', width: 'clamp(170px, 19vw, 280px)', height: 'clamp(26px, 3vw, 44px)', borderRadius: '50%', background: '#c6e3f7' })} />

      {/* rolling hills along the bottom, with a castle on the left */}
      <svg viewBox="0 0 1440 300" preserveAspectRatio="xMidYMax slice" style={deco({ left: 0, right: 0, bottom: 0, width: '100%', height: '30vh', minHeight: 160 })}>
        <ellipse cx="200" cy="330" rx="520" ry="170" fill="#cbe6f8" />
        <ellipse cx="1260" cy="340" rx="560" ry="190" fill="#c2e0f6" />
        <ellipse cx="720" cy="380" rx="620" ry="170" fill="#d3eafa" />
      </svg>
      <Castle style={{ left: '1vw', bottom: '6vh', width: 'clamp(110px, 13vw, 200px)', opacity: 0.95 }} />

      {ITEMS.map((item, i) => (
        <Layer key={i} item={item} px={px} py={py} still={!!reduced} />
      ))}
    </div>
  );
}
