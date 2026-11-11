'use client';

// Sell-back for one coin: pick an amount, see the contract's own quote (quote_sell), then confirm. The confirmed sale
// passes min_usdt_out = quote - 1% (slippage guard): if the price moves further before it lands, the contract
// rejects it and nothing moves.

import { useEffect, useState } from 'react';

import { fmtPrice, fmtTokens, fmtUsdt } from '@/lib/format';
import { machine } from '@/near/contracts';
import type { SellQuote } from '@/near/types';
import { Button, Stat, cx } from './ui';

const ONE_TOKEN = 10n ** 18n;
const SLIPPAGE_BPS = 100n; // 1%

/** "1234.5" whole tokens → token units (18 decimals). null if not a positive number. */
function toUnits(text: string): bigint | null {
  const m = /^\s*(\d+)(?:\.(\d{0,18}))?\s*$/.exec(text);
  if (!m) return null;
  const units = BigInt(m[1]) * ONE_TOKEN + BigInt((m[2] ?? '').padEnd(18, '0') || '0');
  return units > 0n ? units : null;
}

function toText(units: bigint): string {
  const whole = units / ONE_TOKEN;
  const frac = (units % ONE_TOKEN).toString().padStart(18, '0').replace(/0+$/, '').slice(0, 6);
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function SellPanel({
  machineId,
  symbol,
  balance,
  busy,
  onSell,
}: {
  machineId: string;
  symbol: string;
  /** Token units held. */
  balance: string;
  busy: boolean;
  /** Sends the sale; resolves true if it succeeded. */
  onSell: (amount: string, minUsdtOut: string) => Promise<boolean>;
}) {
  const held = BigInt(balance);
  const [text, setText] = useState(toText(held / 2n));
  const [quote, setQuote] = useState<{ amount: bigint; q: SellQuote } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const amount = toUnits(text);
  const tooMuch = amount !== null && amount > held;

  // Live quote from the contract (debounced).
  useEffect(() => {
    if (amount === null || tooMuch) return;
    let live = true;
    const t = setTimeout(() => {
      machine(machineId)
        .quoteSell(amount.toString())
        .then((q) => {
          if (!live) return;
          setQuote({ amount, q });
          setError(null);
        })
        .catch((e) => {
          if (!live) return;
          setQuote(null);
          const m = String(e instanceof Error ? e.message : e);
          setError(
            /MethodNotFound|CodeDoesNotExist/.test(m)
              ? 'This machine (v1) has no sell-back.'
              : /curve holds only/.test(m)
                ? 'The curve does not hold enough USDT for this sale. Try a smaller amount.'
                : /too small/.test(m)
                  ? 'Too small to pay out any USDT.'
                  : 'Could not get a quote right now.',
          );
        });
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [amount, machineId, tooMuch]);

  const current = quote && amount !== null && quote.amount === amount ? quote.q : null;
  const minOut = current ? (BigInt(current.usdt_out) * (10_000n - SLIPPAGE_BPS)) / 10_000n : null;

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-3xl bg-blush/60 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-bold">
          Tokens to sell
          <input
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={amount === null || tooMuch}
            className="w-full rounded-2xl border-2 border-lilac bg-white px-3 py-2 font-normal tabular-nums"
          />
        </label>
        {[
          ['25%', held / 4n],
          ['50%', held / 2n],
          ['All', held],
        ].map(([label, units]) => (
          <button
            key={label as string}
            type="button"
            onClick={() => setText(toText(units as bigint))}
            className="h-11 rounded-full bg-white px-3 font-display font-semibold text-grape ring-2 ring-lilac"
          >
            {label as string}
          </button>
        ))}
      </div>
      {tooMuch && <p className="text-sm font-semibold text-bad">You hold {fmtTokens(balance)} ${symbol}.</p>}
      {error && !tooMuch && <p className="text-sm font-semibold text-bad">{error}</p>}

      <dl className={cx('grid grid-cols-2 gap-2', !current && 'opacity-60')}>
        <Stat
          label="You receive"
          value={current ? fmtUsdt(current.usdt_out) : '…'}
          source={{ contract: machineId, method: 'quote_sell', args: { amount: (amount ?? 0n).toString() } }}
          className="col-span-2 bg-white ring-4 ring-grape"
        />
        <Stat
          label="Out of the curve"
          value={current ? fmtUsdt(current.usdt_gross) : '…'}
          source={{ contract: machineId, method: 'quote_sell', args: { amount: (amount ?? 0n).toString() } }}
          className="bg-white"
        />
        <Stat
          label="Fees (0.5% + 0.2%)"
          value={current ? fmtUsdt((BigInt(current.nft_fee) + BigInt(current.platform_fee)).toString()) : '…'}
          source={{ contract: machineId, method: 'quote_sell', args: { amount: (amount ?? 0n).toString() } }}
          className="bg-white"
        />
        <Stat
          label="Price after"
          value={current ? fmtPrice(current.price_after) : '…'}
          source={{ contract: machineId, method: 'quote_sell', args: { amount: (amount ?? 0n).toString() } }}
          className="col-span-2 bg-white"
        />
      </dl>
      <Button
        disabled={busy || !current || tooMuch}
        onClick={() => current && minOut !== null && void onSell(current.amount, minOut.toString())}
      >
        {current ? `Sell ${fmtTokens(current.amount)} $${symbol} for ${fmtUsdt(current.usdt_out)}` : 'Getting a quote…'}
      </Button>
      <p className="text-xs text-plum">
        You get at least {minOut !== null ? fmtUsdt(minOut.toString()) : '…'} in mock USDT (1% slippage guard), or the contract
        cancels the sale and nothing moves. Selling lowers the coin&apos;s price.
      </p>
    </div>
  );
}
