'use client';

// Tier effects for the reveal. Purely decorative (aria-hidden); skipped entirely under prefers-reduced-motion.

import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';

import { art, tierColor } from '@/art/manifest';

/** Rare: little stars twinkling around the gumball. */
export function Sparkles({ color = '#ffffff', count = 10 }: { color?: string; count?: number }) {
  const spots = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const r = 38 + (i % 3) * 9;
    return { left: 50 + Math.cos(a) * r, top: 50 + Math.sin(a) * r, size: 14 + (i % 4) * 6, delay: (i % 5) * 0.18 };
  });
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {spots.map((s, i) => (
        <motion.img
          key={i}
          src={art.fx.sparkle}
          alt=""
          className="absolute"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, marginLeft: -s.size / 2, marginTop: -s.size / 2, filter: `drop-shadow(0 0 6px ${color})` }}
          initial={{ scale: 0, opacity: 0, rotate: 0 }}
          animate={{ scale: [0, 1.2, 0.6, 1], opacity: [0, 1, 0.5, 1], rotate: [0, 45, 90] }}
          transition={{ duration: 1.4, delay: 0.2 + s.delay, repeat: Infinity, repeatType: 'mirror' }}
        />
      ))}
    </div>
  );
}

/** Epic / Mythic: rotating light rays behind the gumball. */
export function Rays({ color, size = 420, speed = 14 }: { color: string; size?: number; speed?: number }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
      style={{
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        background: `repeating-conic-gradient(from 0deg, ${color}cc 0deg 9deg, transparent 9deg 24deg)`,
        maskImage: 'radial-gradient(circle, black 18%, transparent 68%)',
        WebkitMaskImage: 'radial-gradient(circle, black 18%, transparent 68%)',
      }}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1, rotate: 360 }}
      transition={{ opacity: { duration: 0.4 }, scale: { duration: 0.5, ease: 'backOut' }, rotate: { duration: speed, repeat: Infinity, ease: 'linear' } }}
    />
  );
}

/** Common: a soft puff ring. */
export function Puff({ color }: { color: string }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-8"
      style={{ borderColor: color }}
      initial={{ scale: 0.3, opacity: 0.9 }}
      animate={{ scale: 1.8, opacity: 0 }}
      transition={{ duration: 0.7, ease: 'easeOut' }}
    />
  );
}

/** Mythic: full-screen confetti on a canvas (no library). */
export function Confetti({ pieces = 160, duration = 4500 }: { pieces?: number; duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    resize();
    window.addEventListener('resize', resize);
    const colors = [tierColor.Mythic, '#563791', '#b593c7', '#fee7fa', '#f17cc3', '#5fb8ec', '#ffffff'];
    const w = () => canvas.width;
    const h = () => canvas.height;
    const parts = Array.from({ length: pieces }, () => ({
      x: w() / 2 + (Math.random() - 0.5) * w() * 0.3,
      y: h() * 0.45,
      vx: (Math.random() - 0.5) * 18 * dpr,
      vy: (-Math.random() * 20 - 8) * dpr,
      size: (6 + Math.random() * 8) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      round: Math.random() < 0.35,
    }));
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, w(), h());
      ctx.globalAlpha = t > duration - 800 ? Math.max(0, (duration - t) / 800) : 1;
      for (const p of parts) {
        p.vy += 0.45 * dpr;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (t < duration) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w(), h());
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [pieces, duration]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 h-full w-full" />;
}
