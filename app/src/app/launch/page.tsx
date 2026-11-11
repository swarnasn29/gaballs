'use client';

import { useState } from 'react';

import { Button, Card, Stat } from '@/components/ui';
import { FACTORY_ID, txUrl } from '@/config';
import { fmtNear, fmtPrice } from '@/lib/format';
import { useView } from '@/lib/use-view';
import { useGaballsActions } from '@/near/actions';
import { factory } from '@/near/contracts';

const ONE_TOKEN = 10n ** 18n;

export default function Launch() {
  const { account, launch } = useGaballsActions();
  const cost = useView(() => factory.getLaunchCost(), 'cost');
  const config = useView(() => factory.getConfig(), 'config');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [allocM, setAllocM] = useState(100);
  const [msg, setMsg] = useState<{ text: string; tx?: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const symbolOk = /^[A-Za-z0-9]{2,12}$/.test(symbol);
  const startPrice = config.data
    ? (BigInt(config.data.virtual_usdt_reserve) * 10n ** 30n) /
      (1_000_000_000n * ONE_TOKEN - BigInt(config.data.vault_seed) - BigInt(allocM) * 1_000_000n * ONE_TOKEN)
    : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const out = await launch({
        name: name.trim(),
        symbol: symbol.toUpperCase(),
        icon: null,
        creatorAllocation: (BigInt(allocM) * 1_000_000n * ONE_TOKEN).toString(),
      });
      setMsg({ text: `Launched ${symbol.toLowerCase()}.${FACTORY_ID}`, tx: out.transaction.hash });
    } catch (err) {
      setMsg({ text: `Launch did not complete: ${err instanceof Error ? err.message : err}`, bad: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <Card>
        <h1 className="text-3xl font-bold text-grape">Launch a machine</h1>
        <p className="mt-1">
          The NEAR you attach creates the machine&apos;s own account and pays for its code and storage; it stays with the
          machine. You receive the Machine NFT (it earns 0.5% of every pack) and your coin allocation.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-2">
          <Stat
            label="Launch cost"
            value={cost.data ? fmtNear(cost.data) : '…'}
            source={{ contract: FACTORY_ID, method: 'get_launch_cost' }}
            className="col-span-2 ring-4 ring-grape"
          />
          <Stat
            label="Pack price"
            value={config.data ? `${Number(config.data.pack_price) / 1e6} USDT` : '…'}
            source={{ contract: FACTORY_ID, method: 'get_config' }}
          />
          <Stat
            label="Max vault draw"
            value={config.data ? `${config.data.max_vault_draw_bps / 100}%` : '…'}
            source={{ contract: FACTORY_ID, method: 'get_config' }}
          />
        </dl>
      </Card>

      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 font-bold">
            Name
            <input
              required
              maxLength={64}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-2xl border-2 border-lilac bg-white px-4 py-3 font-normal"
              placeholder="Gumdrop Gang"
            />
          </label>
          <label className="flex flex-col gap-1 font-bold">
            Symbol (2–12 letters or digits; becomes the machine account)
            <input
              required
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              aria-invalid={symbol !== '' && !symbolOk}
              className="rounded-2xl border-2 border-lilac bg-white px-4 py-3 font-normal uppercase"
              placeholder="GUMDROP"
            />
            <span className="text-sm font-normal text-plum">
              Account: {symbol ? `${symbol.toLowerCase()}.${FACTORY_ID}` : '—'}
            </span>
          </label>
          <label className="flex flex-col gap-1 font-bold">
            Your allocation: {allocM}M tokens (the rest goes to the curve)
            <input type="range" min={0} max={100} step={5} value={allocM} onChange={(e) => setAllocM(Number(e.target.value))} className="h-8 accent-grape" />
          </label>
          <p className="text-sm">Start price at this allocation: {startPrice !== undefined ? fmtPrice(startPrice) : '…'} per token.</p>
          <Button type="submit" disabled={!account || busy || !symbolOk || !cost.data}>
            {account ? `Launch for ${cost.data ? fmtNear(cost.data) : '…'}` : 'Connect a wallet to launch'}
          </Button>
          <p aria-live="polite" className={`text-sm font-semibold ${msg?.bad ? 'text-bad' : 'text-good'}`}>
            {msg?.text}{' '}
            {msg?.tx && (
              <a className="underline" href={txUrl(msg.tx)} target="_blank" rel="noreferrer">
                View transaction
              </a>
            )}
          </p>
        </form>
      </Card>
    </div>
  );
}
