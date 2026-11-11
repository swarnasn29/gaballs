'use client';

import { useSyncExternalStore } from 'react';

export type MachineMode = '2d' | '3d';
export type Quality = 'high' | 'low';
const KEY = 'gaballs:machine-mode';
const listeners = new Set<() => void>();

function readOverride(): MachineMode | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === '2d' || v === '3d' ? v : null;
  } catch {
    return null;
  }
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

/** Why the automatic choice is 2D (or null if 3D is fine). */
function autoReason(): string | null {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced motion';
  if (!hasWebGL()) return 'no WebGL';
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (cores <= 4 || memory <= 4) return 'low-power device';
  // Phones: the 3D engine (~1 MB) blocks the main thread for seconds on mid-range Android right after load, so
  // phones start in 2D; one tap on "Switch to 3D" turns it on and is remembered.
  if (window.matchMedia('(max-width: 640px) and (pointer: coarse)').matches) return 'phone';
  return null;
}

let cached: string | null = null;
function snapshot(): string {
  // Encoded as "mode|quality|reason|override" so the snapshot is a stable string.
  const override = readOverride();
  const reason = autoReason();
  const mode: MachineMode = override ?? (reason ? '2d' : '3d');
  const quality: Quality = window.matchMedia('(max-width: 640px), (pointer: coarse)').matches ? 'low' : 'high';
  const next = `${mode}|${quality}|${reason ?? ''}|${override ?? ''}`;
  if (next !== cached) cached = next;
  return cached;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = [
    window.matchMedia('(prefers-reduced-motion: reduce)'),
    window.matchMedia('(max-width: 640px), (pointer: coarse)'),
    window.matchMedia('(max-width: 640px) and (pointer: coarse)'),
  ];
  mq.forEach((m) => m.addEventListener('change', cb));
  return () => {
    listeners.delete(cb);
    mq.forEach((m) => m.removeEventListener('change', cb));
  };
}

export function setMachineMode(mode: MachineMode | null) {
  try {
    if (mode) localStorage.setItem(KEY, mode);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the toggle just won't persist */
  }
  listeners.forEach((l) => l());
}

/** null on the server and during hydration; then the client's choice. */
export function useMachineMode() {
  const s = useSyncExternalStore(subscribe, snapshot, () => null);
  if (!s) return null;
  const [mode, quality, reason, override] = s.split('|');
  return {
    mode: mode as MachineMode,
    quality: quality as Quality,
    autoReason: reason || null,
    overridden: override !== '',
  };
}
