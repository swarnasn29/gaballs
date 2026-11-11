'use client';

import { useState } from 'react';

import { BuyPanel } from '@/components/buy-panel';
import { ReadyCard } from '@/components/ready-card';
import { Card } from '@/components/ui';
import type { PullState } from '@/lib/use-pull';
import type { PullRecord } from '@/near/types';

export function PendingPreview() {
  // Fixed at first render so the timers count from a stable start.
  const [t0] = useState(() => Date.now());
  const states: { title: string; state: PullState }[] = [
    { title: 'Paying in the wallet', state: { phase: 'pending', count: 1, slow: false, vrf: true, paidAt: null } },
    { title: 'Paid, generating randomness (25 s in)', state: { phase: 'pending', count: 3, slow: false, vrf: true, paidAt: t0 - 25_000, requestId: 7 } },
    { title: 'Timed out', state: { phase: 'timedOut', requestId: 7, usdt: '30000000', refunding: false } },
  ];
  return (
    <div className="flex flex-col gap-6">
      <p className="mx-auto w-fit rounded-full bg-black px-4 py-1 text-sm font-bold text-yellow-300">
        PREVIEW — fake data, not a real pull
      </p>
      <div className="grid gap-6 lg:grid-cols-3">
        {states.map(({ title, state }) => (
          <Card key={title} className="flex flex-col gap-3">
            <p className="text-xs font-bold uppercase text-plum">{title}</p>
            <BuyPanel
              account="preview.testnet"
              count={state.phase === 'pending' ? state.count : 3}
              setCount={() => undefined}
              state={state}
              capsuleOut={false}
              onOpen={() => undefined}
              onReset={() => undefined}
              onRefund={() => undefined}
            />
          </Card>
        ))}
      </div>
      <Card className="max-w-md">
        <ReadyCard ready={{ requestId: 7, pulls: [{}, {}] as unknown as PullRecord[] }} more={0} onOpen={() => undefined} />
      </Card>
    </div>
  );
}
