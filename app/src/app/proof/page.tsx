import Link from 'next/link';
import { Suspense } from 'react';

import { Card } from '@/components/ui';
import { ProofCheck } from './proof-check';

type Params = Promise<Record<string, string | undefined>>;

async function Proof({ searchParams }: { searchParams: Params }) {
  const p = await searchParams;
  return (
    <ProofCheck
      machine={p.machine ?? ''}
      alpha={p.alpha ?? ''}
      signature={p.sig ?? ''}
      index={Number(p.i ?? 0)}
      roll={p.roll === undefined ? null : Number(p.roll)}
      tier={p.tier ?? ''}
      pullId={p.pull ?? ''}
    />
  );
}

/** Checks one pull's VRF proof in the browser: Ed25519 signature + the roll derived from it. */
export default function ProofPage({ searchParams }: { searchParams: Params }) {
  return (
    <Card className="flex flex-col gap-3">
      <h1 className="text-3xl font-bold text-accent">Randomness proof</h1>
      <Suspense fallback={<p>Loading the proof…</p>}>
        <Proof searchParams={searchParams} />
      </Suspense>
      <Link href="/" className="font-semibold text-accent underline">
        Back to machines
      </Link>
    </Card>
  );
}
