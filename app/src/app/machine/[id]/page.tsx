import { Suspense } from 'react';

import { NotOurs } from '@/components/not-ours';
import { Card } from '@/components/ui';
import { isLaunchedMachine } from '@/lib/trust';
import { MachineScreen } from './machine-screen';

async function Screen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const machineId = decodeURIComponent(id);
  // A link can name any contract: only machines the Gaballs factory launched get a buy button.
  if (!(await isLaunchedMachine(machineId))) return <NotOurs id={machineId} kind="machine" />;
  return <MachineScreen id={machineId} />;
}

export default function MachinePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Card aria-busy>Loading machine…</Card>}>
      <Screen params={params} />
    </Suspense>
  );
}
