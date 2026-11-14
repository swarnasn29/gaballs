'use client';

import { useCallback, useState } from 'react';

import { LaunchDialog, type LaunchState } from '@/components/launch/launch-dialog';
import { Button, Card, Stat } from '@/components/ui';
import { FACTORY_ID } from '@/config';
import { fmtNear, fmtPrice } from '@/lib/format';
import { useView } from '@/lib/use-view';
import { UserFacingError, useGaballsActions } from '@/near/actions';
import { factory, machine } from '@/near/contracts';
import { readLaunchOutcome } from '@/near/outcome';

const ONE_TOKEN = 10n ** 18n;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof UserFacingError) return msg;
  if (/reject|cancel|denied|closed|user/i.test(msg)) return 'You cancelled in the wallet, so no NEAR was spent.';
  return `The launch did not go through, so no NEAR was spent. (${msg})`;
}

export default function Launch() {
  const { account, launch } = useGaballsActions();
  const cost = useView(() => factory.getLaunchCost(), 'cost');
  const config = useView(() => factory.getConfig(), 'config');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [allocM, setAllocM] = useState(100);
  const [state, setState] = useState<LaunchState>({ s: 'idle' });

  const symbolOk = /^[A-Za-z0-9]{2,12}$/.test(symbol);
  const startPrice = config.data
    ? (BigInt(config.data.virtual_usdt_reserve) * 10n ** 30n) /
      (1_000_000_000n * ONE_TOKEN - BigInt(config.data.vault_seed) - BigInt(allocM) * 1_000_000n * ONE_TOKEN)
    : undefined;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sym = symbol.toUpperCase();
    const machineId = `${symbol.toLowerCase()}.${FACTORY_ID}`;
    const allocation = (BigInt(allocM) * 1_000_000n * ONE_TOKEN).toString();
    const base = { machineId, name: name.trim(), symbol: sym };

    // A taken symbol would fail on-chain (and be refunded): say so before opening the wallet.
    if (await factory.getMachine(machineId).catch(() => null)) {
      setState({ s: 'failed', message: `A machine with the symbol $${sym} already exists. Pick another symbol.` });
      return;
    }

    setState({ s: 'signing', ...base });
    let outcome;
    try {
      outcome = await launch({ name: base.name, symbol: sym, icon: null, creatorAllocation: allocation });
    } catch (err) {
      setState({ s: 'failed', message: friendly(err) });
      return;
    }
    const first = readLaunchOutcome(outcome);
    if (first.kind === 'failed') {
      setState({
        s: 'failed',
        txHash: first.txHash,
        message: 'Something went wrong while creating the machine, so the factory refunded your NEAR.',
      });
      return;
    }

    // Golden rule: celebrate only once the factory lists the machine.
    setState({ s: 'confirming', ...base, txHash: first.txHash, slow: false });
    for (let attempt = 0; attempt < 40; attempt++) {
      const info = await factory.getMachine(machineId).catch(() => null);
      if (info) {
        const view = await machine(machineId).get().catch(() => null);
        setState({
          s: 'live',
          ...base,
          txHash: first.txHash,
          nftMinted: info.nft_minted,
          priceWad: view?.price_usdt_wad ?? null,
          allocation,
        });
        // The NFT mint is a follow-up step; keep checking briefly so the card can update.
        for (let k = 0; k < 10 && !info.nft_minted; k++) {
          await sleep(1500);
          const again = await factory.getMachine(machineId).catch(() => null);
          if (again?.nft_minted) {
            setState((s) => (s.s === 'live' ? { ...s, nftMinted: true } : s));
            break;
          }
        }
        return;
      }
      if (attempt === 8) setState((s) => (s.s === 'confirming' ? { ...s, slow: true } : s));
      await sleep(1500);
    }
    setState({
      s: 'failed',
      txHash: first.txHash,
      message: 'No confirmation yet. Check the transaction: if it succeeded, your machine will appear on the home page.',
    });
  }

  const close = useCallback(() => setState({ s: 'idle' }), []);
  const busy = state.s === 'signing' || state.s === 'confirming';

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <LaunchDialog state={state} onClose={close} />
      <Card>
        <h1 className="text-3xl font-bold text-accent">Launch a machine</h1>
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
              className="rounded-2xl border-2 border-lilac glass px-4 py-3 font-normal"
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
              className="rounded-2xl border-2 border-lilac glass px-4 py-3 font-normal uppercase"
              placeholder="GUMDROP"
            />
            <span className="text-sm font-normal text-plum">
              Account: {symbol ? `${symbol.toLowerCase()}.${FACTORY_ID}` : '—'}
            </span>
          </label>
          <label className="flex flex-col gap-1 font-bold">
            Your allocation: {allocM}M tokens (the rest goes to the curve)
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={allocM}
              onChange={(e) => setAllocM(Number(e.target.value))}
              className="h-8 accent-grape"
            />
          </label>
          <p className="text-sm">Start price at this allocation: {startPrice !== undefined ? fmtPrice(startPrice) : '…'} per token.</p>
          <Button type="submit" disabled={!account || busy || !symbolOk || !cost.data}>
            {account ? `Launch for ${cost.data ? fmtNear(cost.data) : '…'}` : 'Connect a wallet to launch'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
