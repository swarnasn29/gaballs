import type { CSSProperties } from 'react';

import { art } from '@/art/manifest';

// Positioning is inline (not Tailwind) on purpose: even if the stylesheet fails to load, the decorations stay
// fixed behind the content, can't be clicked and are hidden from screen readers.
const layer: CSSProperties = { position: 'fixed', inset: 0, zIndex: -1, overflow: 'hidden', pointerEvents: 'none' };
const deco = (s: CSSProperties): CSSProperties => ({ position: 'absolute', pointerEvents: 'none', ...s });

/** Decorative background: sky, clouds, floating castle, bubbles. Never carries text. (Drift/parallax: step 4.) */
export function Sky() {
  return (
    <div aria-hidden style={layer}>
      <div
        style={deco({ inset: 0, backgroundImage: `url(${art.background.sky})`, backgroundSize: 'cover', backgroundPosition: 'center' })}
      />
      {/* eslint-disable @next/next/no-img-element -- decorative SVGs from the art manifest */}
      <img src={art.background.castle} alt="" style={deco({ right: '4%', top: '14%', width: 'clamp(160px, 18vw, 256px)', opacity: 0.8 })} />
      <img src={art.background.cloudA} alt="" style={deco({ left: '-4%', top: '8%', width: 'clamp(224px, 22vw, 320px)', opacity: 0.9 })} />
      <img src={art.background.cloudB} alt="" style={deco({ left: '38%', top: '30%', width: 'clamp(160px, 16vw, 224px)', opacity: 0.8 })} />
      <img src={art.background.cloudA} alt="" style={deco({ right: '-6%', top: '52%', width: 'clamp(208px, 20vw, 288px)', opacity: 0.7 })} />
      <img src={art.background.bubble} alt="" style={deco({ left: '12%', top: '46%', width: 40, opacity: 0.8 })} />
      <img src={art.background.bubble} alt="" style={deco({ left: '70%', top: '12%', width: 56, opacity: 0.7 })} />
      <img src={art.background.bubble} alt="" style={deco({ left: '56%', top: '70%', width: 32, opacity: 0.8 })} />
      {/* eslint-enable @next/next/no-img-element */}
    </div>
  );
}
