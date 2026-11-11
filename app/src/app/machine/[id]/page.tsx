import { Suspense } from 'react';

import { Card } from '@/components/ui';
import { MachineScreen } from './machine-screen';

async function Screen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MachineScreen id={decodeURIComponent(id)} />;
}

export default function MachinePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Card aria-busy>Loading machine…</Card>}>
      <Screen params={params} />
    </Suspense>
  );
}
