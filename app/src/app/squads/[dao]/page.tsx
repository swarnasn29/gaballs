import { Suspense } from 'react';

import { NotOurs } from '@/components/not-ours';
import { Card } from '@/components/ui';
import { isSquadId } from '@/lib/trust';
import { SquadScreen } from './squad-screen';

async function Screen({ params }: { params: Promise<{ dao: string }> }) {
  const { dao } = await params;
  const daoId = decodeURIComponent(dao);
  // Only DAOs created by the Sputnik DAO factory are squads (a link can name any account).
  if (!isSquadId(daoId)) return <NotOurs id={daoId} kind="squad" />;
  return <SquadScreen dao={daoId} />;
}

export default function SquadPage({ params }: { params: Promise<{ dao: string }> }) {
  return (
    <Suspense fallback={<Card aria-busy>Loading squad…</Card>}>
      <Screen params={params} />
    </Suspense>
  );
}
