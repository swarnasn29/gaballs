import { Suspense } from 'react';

import { Card } from '@/components/ui';
import { SquadScreen } from './squad-screen';

async function Screen({ params }: { params: Promise<{ dao: string }> }) {
  const { dao } = await params;
  return <SquadScreen dao={decodeURIComponent(dao)} />;
}

export default function SquadPage({ params }: { params: Promise<{ dao: string }> }) {
  return (
    <Suspense fallback={<Card aria-busy>Loading squad…</Card>}>
      <Screen params={params} />
    </Suspense>
  );
}
