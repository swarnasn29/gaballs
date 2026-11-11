import Link from 'next/link';
import { Suspense } from 'react';

import { Card } from '@/components/ui';
import { accountUrl } from '@/config';
import { view } from '@/near/rpc';

type Params = Promise<Record<string, string | undefined>>;

async function RawResult({ searchParams }: { searchParams: Params }) {
  const { contract = '', method = '', args = '{}' } = await searchParams;
  let body: string;
  try {
    body = JSON.stringify(await view(contract, method, JSON.parse(args)), null, 2);
  } catch (e) {
    body = `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
  const cli = `near contract call-function as-read-only ${contract} ${method} json-args '${args}' network-config testnet now`;
  return (
    <>
      <p>
        Live result of <code className="rounded bg-blush px-1 font-bold">{method}({args})</code> on{' '}
        <a className="font-semibold text-grape underline" href={accountUrl(contract)} target="_blank" rel="noreferrer">
          {contract}
        </a>
        .
      </p>
      <p className="text-sm">Reproduce it yourself:</p>
      <pre className="whitespace-pre-wrap break-all rounded-2xl bg-ink p-3 text-xs text-blush">{cli}</pre>
      <pre className="max-h-[60vh] overflow-auto rounded-2xl bg-blush p-3 text-xs text-ink">{body}</pre>
    </>
  );
}

/** Shows the live JSON of one view call — the source every number in the UI links to. */
export default function Raw({ searchParams }: { searchParams: Params }) {
  return (
    <Card className="flex flex-col gap-3">
      <h1 className="text-3xl font-bold text-grape">Source</h1>
      <Suspense fallback={<p aria-busy>Calling the contract…</p>}>
        <RawResult searchParams={searchParams} />
      </Suspense>
      <Link href="/" className="font-semibold text-grape underline">
        Back to machines
      </Link>
    </Card>
  );
}
