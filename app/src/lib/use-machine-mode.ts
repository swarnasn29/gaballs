'use client';

import { useSyncExternalStore } from 'react';

// Which machine to show: the 3D scene or the light 2D one.
//  1. The user's choice ("Switch to 3D / 2D") always wins and is remembered.
//  2. Otherwise 2D straight away for reduced motion, no WebGL, or a device that reports itself as weak.
//  3. Otherwise 3D, and the stage measures it: a 1-second fps probe when the scene starts (under 30 fps → 2D,
//     remembered on this device), then a guard that switches to 2D with a notice if it stays under ~24 fps.

export type MachineMode = '2d' | '3d';
export type Quality = 'high' | 'low';
const KEY = 'gaballs:machine-mode';
/** Measured result on this device: 'ok' (probe passed) or 'slow' (probe failed or frame rate dropped). */
const PROBE_KEY = 'gaballs:3d-perf';
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* private mode: nothing persists, the session still works */
  }
}

function readOverride(): MachineMode | null {
  const v = read(KEY);
  return v === '2d' || v === '3d' ? v : null;
}

// Probed ONCE per page and the probe context released immediately. (Browsers allow only ~16 live WebGL contexts and
// drop the oldest when exceeded — probing on every render used to kill the real 3D machine's context.)
let webglCache: boolean | null = null;
function hasWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    webglCache = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

/** This page load's downgrade notice, if the frame rate guard switched to 2D. */
let notice: string | null = null;

/** Why the automatic choice is 2D (or null if 3D should be tried). */
function autoReason(): string | null {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced motion';
  if (!hasWebGL()) return 'no WebGL';
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (cores < 4 || memory < 4) return 'low-power device';
  if (read(PROBE_KEY) === 'slow') return 'slow 3D on this device';
  return null;
}

let cached: string | null = null;
function snapshot(): string {
  // Encoded as "mode|quality|reason|override|probed|notice" so the snapshot is a stable string.
  const override = readOverride();
  const reason = autoReason();
  const mode: MachineMode = override ?? (reason ? '2d' : '3d');
  const quality: Quality = window.matchMedia('(max-width: 640px), (pointer: coarse)').matches ? 'low' : 'high';
  const probed = read(PROBE_KEY) === 'ok' ? '1' : '';
  const next = `${mode}|${quality}|${reason ?? ''}|${override ?? ''}|${probed}|${notice ?? ''}`;
  if (next !== cached) cached = next;
  return cached;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = [window.matchMedia('(prefers-reduced-motion: reduce)'), window.matchMedia('(max-width: 640px), (pointer: coarse)')];
  mq.forEach((m) => m.addEventListener('change', cb));
  return () => {
    listeners.delete(cb);
    mq.forEach((m) => m.removeEventListener('change', cb));
  };
}

const notify = () => listeners.forEach((l) => l());

/** The user's explicit choice (null = back to automatic). Clears any downgrade notice. */
export function setMachineMode(mode: MachineMode | null) {
  write(KEY, mode);
  notice = null;
  // Going back to automatic re-measures this device.
  if (mode === null) write(PROBE_KEY, null);
  notify();
}

/** The 1-second probe passed: 3D stays and the probe is not repeated on this device. */
export function reportProbePassed() {
  write(PROBE_KEY, 'ok');
  notify();
}

/** 3D was too slow (probe or sustained drop): switch to 2D, remember it, and say why. */
export function reportTooSlow(fps: number, during: 'probe' | 'play') {
  write(PROBE_KEY, 'slow');
  const shown = Math.max(1, Math.round(fps)); // "0 fps" reads like a bug; it means "under 1"
  notice =
    during === 'probe'
      ? `3D ran at ${shown < 2 ? 'under 2' : shown} fps here, so you get the lighter 2D machine.`
      : `3D dropped to ${shown < 2 ? 'under 2' : shown} fps, so we switched to the 2D machine to keep it smooth.`;
  notify();
}

export function dismissNotice() {
  notice = null;
  notify();
}

/** null on the server and during hydration; then the client's choice. */
export function useMachineMode() {
  const s = useSyncExternalStore(subscribe, snapshot, () => null);
  if (!s) return null;
  const [mode, quality, reason, override, probed, note] = s.split('|');
  return {
    mode: mode as MachineMode,
    quality: quality as Quality,
    autoReason: reason || null,
    overridden: override !== '',
    /** The probe already passed on this device (skip it). */
    probed: probed === '1',
    notice: note || null,
  };
}
