import { Suspense } from 'react';

import { MachineCard } from '@/components/machine-bits';
import { Card } from '@/components/ui';
import { FEATURED_MACHINE } from '@/config';
import { factory, machine } from '@/near/contracts';

/** Live machine list: read from the chain on every request (streams in after the static shell). */
async function Machines() {
  const machines = await factory.getMachines().catch(() => []);
  const views = await Promise.all(machines.map((m) => machine(m.account_id).get().catch(() => null)));
  if (machines.length === 0) return <Card>No machines yet — launch the first one.</Card>;
  // Verifiable-randomness machines, newest first. Machines launched before Phase 5 (block randomness, no sell-back) can
  // never be upgraded: they stay playable but are tucked into a collapsed "Legacy" section.
  // The featured machine (the demo machine, GUMBALL) leads; the rest follow newest first.
  const rows = machines
    .map((info, i) => ({ info, view: views[i], order: i }))
    .sort((a, b) => Number(b.info.account_id === FEATURED_MACHINE) - Number(a.info.account_id === FEATURED_MACHINE) || b.order - a.order);
  const current = rows.filter((r) => r.view?.config.vrf);
  const legacy = rows.filter((r) => !r.view?.config.vrf);
  return (
    <div className="flex flex-col gap-5">
      {current.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {current.map(({ info, view }) => (
            <MachineCard key={info.account_id} info={info} view={view} />
          ))}
        </div>
      ) : (
        <Card>No machines with verifiable randomness yet — launch the first one.</Card>
      )}
      {legacy.length > 0 && (
        <details className="group flex flex-col gap-4">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-full bg-white px-4 py-2 font-display text-lg font-semibold text-plum shadow-chunky [&::-webkit-details-marker]:hidden">
            <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
              ▸
            </span>
            Legacy (v1, block randomness) · {legacy.length} machine{legacy.length > 1 ? 's' : ''}
          </summary>
          <p className="mt-3 max-w-2xl rounded-2xl bg-white/80 px-4 py-2 text-sm text-plum">
            Launched before verifiable randomness and sell-back. Their contracts have no keys, so they can never be upgraded:
            pulls there use block randomness, and their coins cannot be sold back.
          </p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {legacy.map(({ info, view }) => (
              <MachineCard key={info.account_id} info={info} view={view} />
            ))}
          </div>
        </details>
      )}
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
