'use client';

import dynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';

import { art } from '@/art/manifest';
import { setMachineMode, useMachineMode } from '@/lib/use-machine-mode';
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

export function MachineStage(props: StageProps) {
  const m = useMachineMode();
  const quality = m?.quality ?? 'high';
  const show3d = m?.mode === '3d';
  const vaultPct = props.vaultPct;
  const flat = (
    <Machine2D
      ballCount={ballCount(vaultPct ?? 100, 'low')}
      phase={props.phase}
      capsules={props.capsules}
      crankable={props.crankable}
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
        {vaultPct === undefined ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art.machine.flat} alt="" className="absolute inset-0 m-auto h-[92%] opacity-60" />
        ) : show3d ? (
          <FallbackTo2D fallback={flat}>
            <Scene3D {...props} vaultPct={vaultPct} quality={quality} />
          </FallbackTo2D>
        ) : (
          flat
        )}
      </div>
      {m && (
        <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-grape shadow-chunky">
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
