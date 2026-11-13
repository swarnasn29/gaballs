// THE single list of art assets. Every image in the app is loaded from a path in this file.
// To swap in final art: replace the file at the same path under app/public/art/ (keep the name and format,
// or change the extension here once). No component code changes needed.
// Sizes are the intended display sizes; see app/public/art/README.md.

import type { TierName } from '@/near/types';

export const art = {
  background: {
    /** Full-bleed sky gradient behind everything (cover). */
    sky: '/art/background/sky.svg',
    cloudA: '/art/background/cloud-a.svg',
    cloudB: '/art/background/cloud-b.svg',
    castle: '/art/background/castle.svg',
    bubble: '/art/background/bubble.svg',
  },
  brand: {
    /** The character's head in a baby-blue tile (rendered from brand/; 96 px, shown at 36). */
    logo: '/art/brand/icon.png',
    /** "Gaballs" wordmark, trimmed (368x96; shown at 24-30 px high). */
    wordmark: '/art/brand/wordmark.png',
  },
  characters: {
    mascot: '/art/characters/mascot.svg',
  },
  /** One gumball per tier (also used for vault fill and the reveal). */
  gumballs: {
    Common: '/art/gumballs/common.svg',
    Rare: '/art/gumballs/rare.svg',
    Epic: '/art/gumballs/epic.svg',
    Mythic: '/art/gumballs/mythic.svg',
  } satisfies Record<TierName, string>,
  capsule: {
    closed: '/art/capsule/closed.svg',
    open: '/art/capsule/open.svg',
  },
  machine: {
    /** 2D machine for low-power devices / prefers-reduced-motion. */
    flat: '/art/machine/machine-2d.svg',
  },
  cards: {
    certificate: '/art/certificate/frame.svg',
    deed: '/art/deed/frame.svg',
  },
  fx: {
    coin: '/art/fx/coin.svg',
    sparkle: '/art/fx/sparkle.svg',
  },
} as const;

/** Placeholder tier colours (also used by the 3D machine until real textures arrive). */
export const tierColor: Record<TierName, string> = {
  Common: '#a78bdb',
  Rare: '#5fb8ec',
  Epic: '#f17cc3',
  Mythic: '#ffc93c',
};
