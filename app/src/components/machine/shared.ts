// Shared by the 2D and 3D machines. Kept free of three.js so importing it never pulls the 3D chunk.
import type { Quality } from '@/lib/use-machine-mode';

export type StagePhase = 'idle' | 'pending' | 'dropping' | 'resting';
export type CameraView = 'default' | 'front' | 'three-quarter' | 'closeup';

/**
 * Gumballs in the dome follow vault health: 10 when low, up to 60 when full (35 on phones). Moves in steps of 5 so a
 * small vault change after a pull doesn't rebuild the whole pile.
 */
export function ballCount(vaultPct: number, quality: Quality) {
  const max = quality === 'low' ? 35 : 60;
  const min = 10;
  const t = Math.max(0, Math.min(1, vaultPct / 100));
  return Math.round((min + (max - min) * t) / 5) * 5;
}
