'use client';

import dynamic from 'next/dynamic';
import { Component, useCallback, useEffect, useRef, type ReactNode } from 'react';

import { art } from '@/art/manifest';
import {
  dismissNotice,
  reportProbePassed,
  reportTooSlow,
  setMachineMode,
  useMachineMode,
} from '@/lib/use-machine-mode';
import { Machine2D } from './machine-2d';
import { ballCount, type StagePhase } from './shared';

// The 3D scene (three + fiber + drei + rapier) is a separate chunk, fetched only when 3D mode is chosen.
const Scene3D = dynamic(() => import('./scene3d'), {
  ssr: false,
  loading: () => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={art.machine.flat} alt="" className="absolute inset-0 m-auto h-[92%] opacity-60" />
  ),
});

/** If the 3D scene ever throws (driver, WebGL or physics trouble), show the 2D machine instead of a blank stage. */
class FallbackTo2D extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('3D machine failed; using 2D', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface StageProps {
  /** Vault health in % of launch size; undefined until get_machine() has loaded (the machine waits for it). */
  vaultPct: number | undefined;
  phase: StagePhase;
  capsules: number;
  crankable: boolean;
  onCrank: () => void;
  onCapsulesOut: () => void;
}

const LABEL: Record<StagePhase, string> = {
  idle: 'Gumball machine, ready.',
  pending: 'Gumball machine shaking while the transaction is pending.',
  dropping: 'A capsule is rolling out of the chute.',
  resting: 'Your capsule is in the tray.',
};

/** Below this on the 1-second probe, the device gets the 2D machine. */
const PROBE_MIN_FPS = 30;
/** Three consecutive seconds below this while playing switch to 2D. */
const GUARD_MIN_FPS = 24;
const GUARD_SECONDS = 3;

/**
 * Smart 2D/3D: while the 3D scene runs on automatic, the first measured second is a warm-up (shaders, physics), the
 * next is the probe, and after that a guard watches for a sustained drop. Off when the user picked a mode.
 */
function useFpsGuard(active: boolean, probed: boolean) {
  const samples = useRef<number[]>([]);
  const state = useRef({ active, probed });
  useEffect(() => {
    state.current = { active, probed };
  }, [active, probed]);
  return useCallback((fps: number) => {
    const { active, probed } = state.current;
    if (!active) {
      samples.current = [];
      return;
    }
    samples.current.push(fps);
    if (!probed) {
      if (samples.current.length < 2) return; // warm-up second
      samples.current = [];
      if (fps < PROBE_MIN_FPS) reportTooSlow(fps, 'probe');
      else reportProbePassed();
      return;
    }
    const recent = samples.current.slice(-GUARD_SECONDS);
    samples.current = recent;
    if (recent.length === GUARD_SECONDS && recent.every((f) => f < GUARD_MIN_FPS)) {
      samples.current = [];
      reportTooSlow(recent.reduce((a, f) => a + f, 0) / recent.length, 'play');
    }
  }, []);
}

export function MachineStage(props: StageProps) {
  const m = useMachineMode();
  const quality = m?.quality ?? 'high';
  const show3d = m?.mode === '3d';
  const vaultPct = props.vaultPct;
  const onFps = useFpsGuard(show3d && !m?.overridden, !!m?.probed);
  // While get_machine() loads, the 2D machine shows an empty dome: same element as after loading, so the machine
  // image paints once (good LCP) instead of being swapped for a new one when the data arrives.
  const flat = (
    <Machine2D
      ballCount={vaultPct === undefined ? 0 : ballCount(vaultPct, 'low')}
      phase={props.phase}
      capsules={props.capsules}
      crankable={vaultPct !== undefined && props.crankable}
      onCrank={props.onCrank}
      onCapsulesOut={props.onCapsulesOut}
    />
  );
  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div
        className="relative mx-auto aspect-[4/5] w-full max-w-[520px] select-none"
        role="img"
        aria-label={`${LABEL[props.phase]}${vaultPct !== undefined ? ` ${ballCount(vaultPct, quality)} gumballs show the prize vault.` : ''}`}
      >
        {show3d && vaultPct !== undefined ? (
          <FallbackTo2D fallback={flat}>
            <Scene3D {...props} vaultPct={vaultPct} quality={quality} onFps={onFps} />
          </FallbackTo2D>
        ) : (
          flat
        )}
      </div>
      {m?.notice && (
        <p role="status" className="flex max-w-md items-center gap-2 rounded-2xl glass px-3 py-1.5 text-xs font-semibold text-plum shadow-chunky">
          {m.notice}
          <button type="button" className="shrink-0 underline" onClick={dismissNotice}>
            OK
          </button>
        </p>
      )}
      {/* the mode is only known in the browser: keep the pill's height reserved so nothing shifts when it appears */}
      {!m && <div className="h-7" aria-hidden />}
      {m && (
        <div className="flex h-7 items-center gap-2 rounded-full glass px-3 py-1 text-xs font-semibold text-accent shadow-chunky">
          <span>{show3d ? '3D machine' : `2D machine${m.autoReason && !m.overridden ? ` (${m.autoReason})` : ''}`}</span>
          <button
            type="button"
            className="rounded-full bg-blush px-2 py-0.5 underline-offset-2 hover:underline"
            onClick={() => setMachineMode(show3d ? '2d' : '3d')}
          >
            Switch to {show3d ? '2D' : '3D'}
          </button>
          {m.overridden && (
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => setMachineMode(null)}>
              Auto
            </button>
          )}
        </div>
      )}
    </div>
  );
}
