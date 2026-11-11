// DEV ONLY (exists only under `next dev` with DEV_SIGNER=1): renders the 3D machine alone for still renders.
//   /dev/machine?view=front|three-quarter|closeup&pct=100&phase=idle|pending|resting&capsules=1&quality=high|low
import { Suspense } from 'react';
import { Preview } from './preview.dev';

export default function MachinePreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <Preview searchParams={searchParams} />
    </Suspense>
  );
}
