'use client';

import { use } from 'react';

import { RevealDialog } from '@/components/reveal/reveal-dialog';
import type { PullRecord, TierName } from '@/near/types';

const MULT: Record<TierName, number> = { Common: 7000, Rare: 12500, Epic: 25000, Mythic: 80000 };

function fake(tier: TierName, i: number): PullRecord {
  const bought = 2_265_642n * 10n ** 18n;
  return {
    pull_id: 100 + i,
    buyer: 'preview.testnet',
    usdt_in: '10000000',
    usdt_to_curve: '9930000',
    roll: 4242,
    tier,
    multiplier_bps: MULT[tier],
    bought: bought.toString(),
    payout: ((bought * BigInt(MULT[tier])) / 10000n).toString(),
    vault_after: '0',
    price_before: '4500000000000',
    price_after: '4530000000000',
    capped: false,
    certificate: tier === 'Mythic',
    seed: '00',
    block: 0,
  };
}

export function RevealPreview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = use(searchParams);
  const tiers = (q.tier ?? 'Common').split(',') as TierName[];
  const pulls = tiers.map((t, i) => fake(t, i));
  return (
    <>
      <p className="fixed left-1/2 top-2 z-[70] -translate-x-1/2 rounded-full bg-black px-4 py-1 text-sm font-bold text-yellow-300">
        PREVIEW — fake data, not a real pull
      </p>
      <RevealDialog pulls={pulls} txHash="preview" machineId="gball.gaballs.testnet" symbol="GBALL" onClose={() => undefined} />
    </>
  );
}
