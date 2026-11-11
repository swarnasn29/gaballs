// DEV PREVIEW ONLY (exists only under `next dev`; never in production builds): the launch pop-up with FAKE states.
//   /dev/launch?state=building|live|failed
import { Suspense } from 'react';
import { LaunchPreview } from './launch-preview';

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <LaunchPreview searchParams={searchParams} />
    </Suspense>
  );
}
