'use client';

// The four squad proposals. Each builds one Sputnik FunctionCall proposal (src/near/sputnik.ts); members vote on it in
// the list. The proposer attaches the 0.1 NEAR bond, returned when the proposal passes.

import { useEffect, useState } from 'react';

import { FEATURED_MACHINE, txUrl } from '@/config';
import { fmtTokens, fmtUsdt } from '@/lib/format';
import { useGaballsActions } from '@/near/actions';
import { machine, type Tx } from '@/near/contracts';
import { proposals } from '@/near/sputnik';
import type { NftToken, SellQuote } from '@/near/types';
import { Button, Card, cx } from '../ui';

type Tab = 'open' | 'split' | 'sell' | 'claim';
const TABS: { id: Tab; label: string }[] = [
  { id: 'open', label: 'Open packs' },
  { id: 'split', label: 'Split prize' },
  { id: 'sell', label: 'Sell back' },
  { id: 'claim', label: 'Claim fees' },
];

export function ProposeForms({
  dao,
  isMember,
  members,
  packPrice,
  treasuryUsdt,
  flagshipBalance,
  deeds,
  onProposed,
}: {
  dao: string;
  isMember: boolean;
  members: string[];
  packPrice: string | null;
  treasuryUsdt: string | null;
  flagshipBalance: string;
  deeds: { token: NftToken; fees: string }[];
  onProposed: () => void;
}) {
  const { account, propose } = useGaballsActions();
  const [tab, setTab] = useState<Tab>('open');
  const [count, setCount] = useState(5);
  const [pct, setPct] = useState(20);
  const [sellPct, setSellPct] = useState(100);
  const [deed, setDeed] = useState<string>('');
  const [quote, setQuote] = useState<SellQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; tx?: string; bad?: boolean } | null>(null);

  const held = BigInt(flagshipBalance || '0');
  const sellAmount = (held * BigInt(sellPct)) / 100n;
  const share = (held * BigInt(pct)) / 100n;
  const cost = packPrice ? BigInt(packPrice) * BigInt(count) : null;
  const short = cost !== null && treasuryUsdt !== null && BigInt(treasuryUsdt) < cost;
  const claimable = deeds.filter((d) => d.fees !== '0');
  const deedId = deed || claimable[0]?.token.token_id || '';

  useEffect(() => {
    if (tab !== 'sell' || sellAmount <= 0n) return;
    let live = true;
    machine(FEATURED_MACHINE)
      .quoteSell(sellAmount.toString())
      .then((q) => live && setQuote(q))
      .catch(() => live && setQuote(null));
    return () => {
      live = false;
    };
  }, [tab, sellAmount]);

  async function send(build: () => Promise<Tx>, label: string) {
    setBusy(true);
    setResult(null);
    try {
      const o = await propose(await build());
      setResult({ text: `${label}: proposed. Members can vote now.`, tx: o.transaction.hash });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setResult({ text: /reject|cancel|denied|closed/i.test(m) ? 'Cancelled in the wallet.' : m, bad: true });
    } finally {
      setBusy(false);
      onProposed();
    }
  }

  const disabled = !account || !isMember || busy;

  return (
    <Card className="flex flex-col gap-4 self-start">
      <h2 className="text-2xl font-bold">Propose</h2>
      <div role="tablist" aria-label="Proposal type" className="grid grid-cols-2 gap-1 rounded-3xl bg-blush p-1 sm:grid-cols-4 lg:grid-cols-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx('rounded-full px-3 py-2 font-display text-sm font-semibold', tab === t.id ? 'bg-grape text-white' : 'text-grape hover:bg-white')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'open' && (
        <div className="flex flex-col gap-3" role="tabpanel">
          <p className="text-sm">The squad pays from its treasury; prizes (and any Mythic certificate) go to the squad.</p>
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={count === n}
                onClick={() => setCount(n)}
                className={cx('h-11 w-11 rounded-full font-display text-lg font-semibold ring-2', count === n ? 'bg-grape text-white ring-grape' : 'bg-blush text-grape ring-lilac')}
              >
                {n}
              </button>
            ))}
            <span className="font-bold">= {cost !== null ? fmtUsdt(cost.toString()) : '…'}</span>
          </div>
          {short && <p className="text-sm font-semibold text-warn">The treasury holds {fmtUsdt(treasuryUsdt!)}; members need to chip in first.</p>}
          <Button disabled={disabled || !packPrice || short} onClick={() => void send(async () => proposals.openPacks(dao, FEATURED_MACHINE, count, packPrice!), `Open ${count} pack${count > 1 ? 's' : ''}`)}>
            Propose: open {count} pack{count > 1 ? 's' : ''}
          </Button>
        </div>
      )}

      {tab === 'split' && (
        <div className="flex flex-col gap-3" role="tabpanel">
          <p className="text-sm">
            Each of the {members.length} members gets the same share of the squad&apos;s {fmtTokens(flagshipBalance)} GABALLS. The
            proposal registers members on the token first, paid by the squad.
          </p>
          <div className="flex flex-wrap gap-2">
            {[10, 20, Math.floor(100 / Math.max(1, members.length))].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={pct === v}
                onClick={() => setPct(v)}
                className={cx('rounded-full px-4 py-2 font-display font-semibold ring-2', pct === v ? 'bg-grape text-white ring-grape' : 'bg-blush text-grape ring-lilac')}
              >
                {v}% each
              </button>
            ))}
          </div>
          <p className="text-sm">
            Each member gets <strong>{fmtTokens(share.toString())}</strong> GABALLS ({pct * members.length}% of the treasury).
          </p>
          <Button
            disabled={disabled || share <= 0n}
            onClick={() =>
              void send(async () => {
                const b = await machine(FEATURED_MACHINE).storageBounds();
                return proposals.split(dao, FEATURED_MACHINE, members, share, b.min);
              }, 'Split')
            }
          >
            Propose: split {pct}% each
          </Button>
        </div>
      )}

      {tab === 'sell' && (
        <div className="flex flex-col gap-3" role="tabpanel">
          <p className="text-sm">Sell the squad&apos;s GABALLS back to the curve; USDT returns to the treasury (1% slippage guard).</p>
          <div className="flex flex-wrap gap-2">
            {[25, 50, 100].map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={sellPct === v}
                onClick={() => setSellPct(v)}
                className={cx('rounded-full px-4 py-2 font-display font-semibold ring-2', sellPct === v ? 'bg-grape text-white ring-grape' : 'bg-blush text-grape ring-lilac')}
              >
                {v === 100 ? 'All' : `${v}%`}
              </button>
            ))}
          </div>
          <p className="text-sm">
            {fmtTokens(sellAmount.toString())} GABALLS → about <strong>{quote ? fmtUsdt(quote.usdt_out) : '…'}</strong> (quote_sell)
          </p>
          <Button
            disabled={disabled || sellAmount <= 0n || !quote}
            onClick={() =>
              void send(async () => proposals.sellBack(dao, FEATURED_MACHINE, sellAmount, (BigInt(quote!.usdt_out) * 99n) / 100n), 'Sell back')
            }
          >
            Propose: sell {sellPct === 100 ? 'all' : `${sellPct}%`}
          </Button>
        </div>
      )}

      {tab === 'claim' && (
        <div className="flex flex-col gap-3" role="tabpanel">
          <p className="text-sm">Machine NFTs owned by the squad collect 0.5% of every pack; claiming moves the fees into the treasury.</p>
          {claimable.length ? (
            <select
              value={deedId}
              onChange={(e) => setDeed(e.target.value)}
              className="rounded-2xl border-2 border-lilac bg-white px-3 py-2"
            >
              {claimable.map((d) => (
                <option key={d.token.token_id} value={d.token.token_id}>
                  {d.token.token_id} — {fmtUsdt(d.fees)}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-plum">No fee balance to claim yet (fees arrive when anyone calls sweep_fees on the machine).</p>
          )}
          <Button disabled={disabled || !deedId} onClick={() => void send(async () => proposals.claimFees(dao, deedId), 'Claim fees')}>
            Propose: claim fees
          </Button>
        </div>
      )}

      {!account ? (
        <p className="text-sm text-plum">Connect a wallet to propose.</p>
      ) : !isMember ? (
        <p className="text-sm text-plum">Only squad members can propose and vote.</p>
      ) : (
        <p className="text-xs text-plum">Proposing attaches a 0.1 NEAR bond, returned when the proposal passes.</p>
      )}
      {result && (
        <p className={`text-sm font-semibold ${result.bad ? 'text-bad' : 'text-good'}`}>
          {result.text}{' '}
          {result.tx && (
            <a className="underline" href={txUrl(result.tx)} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
        </p>
      )}
    </Card>
  );
}
