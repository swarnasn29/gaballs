'use client';

import { use } from 'react';
import Scene3D from '@/components/machine/scene3d';
import type { CameraView, StagePhase } from '@/components/machine/shared';

export function Preview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = use(searchParams);
  return (
    <div style={{ position: 'fixed', inset: '96px 0 0 0' }}>
      <Scene3D
        view={(q.view as CameraView) ?? 'front'}
        vaultPct={Number(q.pct ?? 100)}
        phase={(q.phase as StagePhase) ?? 'idle'}
        capsules={Number(q.capsules ?? 1)}
        quality={q.quality === 'low' ? 'low' : 'high'}
        crankable={q.crankable === '1'}
        onCrank={() => undefined}
        onCapsulesOut={() => undefined}
      />
    </div>
  );
}
