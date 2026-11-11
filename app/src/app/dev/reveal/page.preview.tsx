// DEV PREVIEW ONLY (exists only under `next dev`; never in production builds): the reveal pop-up with FAKE pulls,
// so every tier's mood can be checked without spending testnet USDT.  /dev/reveal?tier=Common|Rare|Epic|Mythic&n=1
import { Suspense } from 'react';
import { RevealPreview } from './reveal-preview';

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <Suspense fallback={null}>
      <RevealPreview searchParams={searchParams} />
    </Suspense>
  );
}
