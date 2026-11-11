'use client';

import { use } from 'react';

import { LaunchDialog, type LaunchState } from '@/components/launch/launch-dialog';

export function LaunchPreview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = use(searchParams);
  const base = { machineId: 'gumdrop.gaballs.testnet', name: 'Gumdrop Gang', symbol: 'GUMDROP' };
  const state: LaunchState =
    q.state === 'live'
      ? { s: 'live', ...base, txHash: 'preview', nftMinted: true, priceWad: '3750000000000', allocation: (100_000_000n * 10n ** 18n).toString() }
      : q.state === 'failed'
        ? { s: 'failed', message: 'Something went wrong while creating the machine, so the factory refunded your NEAR.', txHash: 'preview' }
        : { s: 'confirming', ...base, txHash: 'preview', slow: false };
  return (
    <>
      <p className="fixed left-1/2 top-2 z-[70] -translate-x-1/2 rounded-full bg-black px-4 py-1 text-sm font-bold text-yellow-300">
        PREVIEW — fake data, not a real pull
      </p>
      <LaunchDialog state={state} onClose={() => undefined} />
    </>
  );
}
