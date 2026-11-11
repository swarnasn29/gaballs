import { Suspense } from 'react';

import { MachineCard } from '@/components/machine-bits';
import { Card } from '@/components/ui';
import { factory, machine } from '@/near/contracts';

/** Live machine list: read from the chain on every request (streams in after the static shell). */
async function Machines() {
  const machines = await factory.getMachines().catch(() => []);
  const views = await Promise.all(machines.map((m) => machine(m.account_id).get().catch(() => null)));
  if (machines.length === 0) return <Card>No machines yet — launch the first one.</Card>;
  // Verifiable-randomness machines first, newest first; v1 machines (block randomness) after them.
  const rows = machines
    .map((info, i) => ({ info, view: views[i], order: i }))
    .sort((a, b) => Number(!!b.view?.config.vrf) - Number(!!a.view?.config.vrf) || b.order - a.order);
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(({ info, view }) => (
        <MachineCard key={info.account_id} info={info} view={view} />
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-2xl">
        <h1 className="text-4xl font-bold text-grape sm:text-5xl">Gumball machines for memecoins</h1>
        <p className="mt-2 text-lg">
          Every 10 USDT pack is a market buy of the machine&apos;s coin. A fixed, public odds table then multiplies what
          you get: 0.7× up to 8×. The creator&apos;s Machine NFT earns 0.5% of every pack.
        </p>
      </Card>

      <section aria-labelledby="machines-h" className="flex flex-col gap-4">
        <h2 id="machines-h" className="w-fit rounded-full bg-white px-4 py-1 text-2xl font-bold text-grape shadow-chunky">
          Machines
        </h2>
        <Suspense fallback={<Card aria-busy>Loading machines from {factory.id}…</Card>}>
          <Machines />
        </Suspense>
      </section>
    </div>
  );
}
