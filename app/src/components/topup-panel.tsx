'use client';

// "Top up from any chain" (NEAR Intents 1Click, src/lib/intents.ts). Live dry quotes for N packs' worth of real USDT on
// NEAR mainnet, paid from another chain. Mainnet only (no Intents testnet exists); this panel never sends anything:
// step 2 only asks 1Click for a deposit address and tracks it, the player would send from their own wallet.

import { useState } from 'react';

import {
  PACK_USDT_UNITS,
  STATUS_TEXT,
  isMainnetAccount,
  payOptions,
  quote,
  sameOnMainnet,
  status,
  type Quote,
} from '@/lib/intents';
import { useView } from '@/lib/use-view';
import { Button, Card, Stat, cx } from './ui';

const QUOTE_DOCS = 'https://docs.near-intents.org/api-reference/oneclick/request-a-swap-quote';
const STATUS_DOCS = 'https://docs.near-intents.org/api-reference/oneclick/check-swap-execution-status';
const usd = (s: string) => `$${Number(s).toFixed(2)}`;

export function TopUpPanel({ account }: { account: string }) {
  const options = useView(payOptions, 'intents:tokens');
  const [assetId, setAssetId] = useState('');
  const [count, setCount] = useState(1);
  const [typed, setTyped] = useState('');
  const recipient = sameOnMainnet(account) ? account : typed.trim().toLowerCase();
  const recipientOk = isMainnetAccount(recipient);
  const pay = options.data?.find((o) => o.assetId === assetId) ?? options.data?.[0];
  const units = PACK_USDT_UNITS * BigInt(count);

  const dry = useView(
    async () => (pay && recipientOk ? quote({ originAsset: pay.assetId, usdtUnits: units, recipient, dry: true }) : null),
    `intents:dry:${pay?.assetId}:${count}:${recipientOk ? recipient : ''}`,
    30_000,
  );

  const [understood, setUnderstood] = useState(false);
  const [real, setReal] = useState<{ q: Quote; label: string } | { error: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const deposit = real && 'q' in real ? real.q : null;
  const track = useView(
    async () => (deposit?.depositAddress ? status(deposit.depositAddress, deposit.depositMemo) : null),
    `intents:status:${deposit?.depositAddress ?? ''}`,
    10_000,
  );

  const getAddress = async () => {
    if (!pay) return;
    setAsking(true);
    try {
      const q = await quote({ originAsset: pay.assetId, usdtUnits: units, recipient, dry: false });
      setReal({ q, label: pay.label });
    } catch (e) {
      setReal({ error: e instanceof Error ? e.message : 'Could not get a deposit address.' });
    } finally {
      setAsking(false);
    }
  };

  const q = dry.data;
  return (
    <Card data-testid="topup">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold">Top up from any chain</h2>
        <span className="rounded-full bg-blush px-2.5 py-0.5 text-xs font-bold text-plum ring-1 ring-lilac">NEAR Intents · mainnet</span>
      </div>
      <p className="mt-1 text-sm">
        Pay from another chain and receive <b>real USDT on NEAR mainnet</b>, quoted live by NEAR Intents. Intents has no
        testnet, so this is the mainnet path; packs in this game still use the free mock USDT above.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-bold">
          Pay with
          <select
            className="rounded-2xl border-2 border-lilac glass px-3 py-2 font-normal"
            value={pay?.assetId ?? ''}
            onChange={(e) => {
              setAssetId(e.target.value);
              setReal(null);
            }}
            disabled={!options.data}
          >
            {options.data?.map((o) => (
              <option key={o.assetId} value={o.assetId}>
                {o.label}
              </option>
            )) ?? <option>Loading tokens…</option>}
          </select>
        </label>

        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="mb-1 text-sm font-bold">Packs&apos; worth</legend>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={count === n}
              onClick={() => {
                setCount(n);
                setReal(null);
              }}
              className={cx(
                'h-11 w-11 rounded-full font-display text-lg font-semibold ring-2',
                count === n ? 'bg-grape text-white ring-grape' : 'bg-blush text-accent ring-lilac',
              )}
            >
              {n}
            </button>
          ))}
          <span className="ml-1 whitespace-nowrap font-bold">= {count * 10} USDT</span>
        </fieldset>

        {sameOnMainnet(account) ? (
          <p className="break-all text-xs text-plum">
            Delivered to <b>{account}</b> on NEAR mainnet: the same account id, controlled by the same login, exists there.
          </p>
        ) : (
          <label className="flex flex-col gap-1 text-sm font-bold">
            Your NEAR mainnet account
            <input
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value);
                setReal(null);
              }}
              placeholder="name.near"
              aria-invalid={typed !== '' && !recipientOk}
              className="rounded-2xl border-2 border-lilac glass px-3 py-2 font-normal"
            />
            <span className="text-xs font-normal text-plum">{account} is a testnet name, so it does not exist on mainnet.</span>
          </label>
        )}
      </div>

      {recipientOk && (
        <dl className={cx('mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4', !q && 'opacity-60')} data-testid="topup-quote">
          <Stat
            label="You pay"
            value={q ? `${Number(q.amountInFormatted).toPrecision(6).replace(/\.?0+$/, '')} ${pay?.symbol}` : '…'}
            source={{ href: QUOTE_DOCS, label: '1Click quote (dry)' }}
            className="col-span-2 glass ring-4 ring-grape"
          />
          <Stat label="Worth" value={q ? usd(q.amountInUsd) : '…'} source={{ href: QUOTE_DOCS, label: 'amountInUsd' }} />
          <Stat label="Arrives in" value={q ? `~${q.timeEstimate < 120 ? `${q.timeEstimate} s` : `${Math.round(q.timeEstimate / 60)} min`}` : '…'} source={{ href: QUOTE_DOCS, label: 'timeEstimate' }} />
        </dl>
      )}
      {dry.error && <p className="mt-2 text-sm font-semibold text-bad">{dry.error}</p>}
      {q && (
        <p className="mt-1 text-xs text-plum">
          You receive exactly {q.amountOutFormatted} USDT. The price includes swap and network fees and up to 1% slippage
          (unused input is refunded). Refreshes every 30 s.
        </p>
      )}

      {q && (
        <details className="mt-4 rounded-2xl bg-blush/60 p-3">
          <summary className="cursor-pointer font-display text-lg font-semibold">Step 2: get a real deposit address</summary>
          <p className="mt-2 text-sm">
            This asks NEAR Intents for a deposit address on the paying chain. Nothing is sent by Gaballs: you would send the
            amount from your own wallet, and the USDT arrives on <b>NEAR mainnet</b>. Real money; use a tiny amount.
          </p>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            I understand this is mainnet and real money.
          </label>
          <Button className="mt-2" disabled={!understood || asking} onClick={() => void getAddress()} data-testid="topup-real">
            {asking ? 'Asking NEAR Intents…' : 'Get a deposit address'}
          </Button>
          {real && 'error' in real && <p className="mt-2 text-sm font-semibold text-bad">{real.error}</p>}
          {deposit?.depositAddress && real && 'label' in real && (
            <div className="mt-3 flex flex-col gap-1 rounded-2xl glass p-3 text-sm" data-testid="topup-deposit">
              <p>
                Send <b>{deposit.amountInFormatted} {real.label}</b> to:
              </p>
              <code className="break-all rounded-xl bg-blush px-2 py-1">{deposit.depositAddress}</code>
              {deposit.depositMemo && (
                <p>
                  Memo (required): <code>{deposit.depositMemo}</code>
                </p>
              )}
              {deposit.deadline && <p className="text-xs text-plum">Before {new Date(deposit.deadline).toLocaleTimeString()}, or it is refunded.</p>}
              <Button variant="secondary" className="mt-1 self-start" onClick={() => void navigator.clipboard?.writeText(deposit.depositAddress!)}>
                Copy address
              </Button>
              <p className="mt-1">
                Status:{' '}
                <b>{track.data ? STATUS_TEXT[track.data] : track.error ? `unavailable (${track.error})` : 'checking…'}</b>{' '}
                <a className="text-[11px] font-semibold text-accent underline" href={STATUS_DOCS} target="_blank" rel="noreferrer">
                  source: 1Click status
                </a>
              </p>
            </div>
          )}
        </details>
      )}
    </Card>
  );
}
