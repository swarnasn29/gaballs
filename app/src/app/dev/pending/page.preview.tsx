// DEV PREVIEW ONLY (exists only under `next dev`; never in production builds): the buy panel's pending-pull states
// with FAKE data, so every state can be screenshotted (a real timed-out pull cannot be produced on the deployed
// machine).   /dev/pending
import { Suspense } from 'react';
import { PendingPreview } from './pending-preview';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PendingPreview />
    </Suspense>
  );
}
