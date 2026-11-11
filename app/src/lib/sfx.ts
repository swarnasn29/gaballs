'use client';

// Synthesised sound effects (Web Audio, no files to download). Silent until the player's first tap anywhere
// (browsers block audio before a user gesture anyway), and a persisted mute toggle.

import { useSyncExternalStore } from 'react';

import type { TierName } from '@/near/types';

const KEY = 'gaballs:muted';
let ctx: AudioContext | null = null;
let unlocked = false;
const listeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Call from a user gesture (first tap): creates/resumes the audio context. */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  void ctx.resume();
  if (!unlocked) {
    unlocked = true;
    listeners.forEach((l) => l());
  }
}

export function setMuted(muted: boolean) {
  try {
    localStorage.setItem(KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** "muted" | "on" | "locked" (no tap yet). */
export function useSound() {
  return useSyncExternalStore(
    subscribe,
    () => (readMuted() ? 'muted' : unlocked ? 'on' : 'locked'),
    () => 'locked',
  );
}

function canPlay() {
  return !!ctx && unlocked && !readMuted();
}

/** One enveloped oscillator note. */
function note(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18, slideTo?: number) {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Soft noise burst (the capsule cracking). */
function crackle(start = 0, dur = 0.12, gain = 0.25) {
  if (!ctx) return;
  const t0 = ctx.currentTime + start;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.buffer = buffer;
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t0);
}

export const sfx = {
  /** A machine was launched (confirmed on-chain). */
  launched() {
    if (!canPlay()) return;
    [392, 523, 659, 784].forEach((f, i) => note(f, i * 0.09, 0.3, 'triangle', 0.12));
    [784, 988, 1175].forEach((f) => note(f, 0.42, 0.9, 'sine', 0.08));
    crackle(0.4, 0.2, 0.12);
  },
  crack() {
    if (!canPlay()) return;
    crackle(0, 0.14, 0.3);
    note(520, 0, 0.12, 'triangle', 0.12, 260);
  },
  reveal(tier: TierName) {
    if (!canPlay()) return;
    switch (tier) {
      case 'Common': // a cheerful little pop
        note(660, 0, 0.16, 'sine', 0.2, 990);
        note(990, 0.09, 0.18, 'sine', 0.12);
        break;
      case 'Rare': // sparkly chime arpeggio
        [784, 988, 1175, 1568].forEach((f, i) => note(f, i * 0.07, 0.35, 'triangle', 0.13));
        break;
      case 'Epic': // whoosh up into a bright chord
        note(220, 0, 0.45, 'sawtooth', 0.06, 880);
        [523, 659, 784, 1046].forEach((f) => note(f, 0.38, 0.7, 'triangle', 0.1));
        break;
      case 'Mythic': // fanfare
        [
          [523, 0, 0.16],
          [523, 0.17, 0.16],
          [523, 0.34, 0.16],
          [698, 0.52, 0.5],
          [880, 1.0, 0.18],
          [784, 1.18, 0.18],
          [1046, 1.36, 0.9],
        ].forEach(([f, s, d]) => {
          note(f, s, d, 'square', 0.07);
          note(f * 2, s, d, 'triangle', 0.05);
        });
        [1046, 1318, 1568].forEach((f) => note(f, 1.36, 1.1, 'sine', 0.06));
        break;
    }
  },
};
