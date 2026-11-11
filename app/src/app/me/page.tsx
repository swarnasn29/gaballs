'use client';

import Link from 'next/link';
import { useState } from 'react';

import { art } from '@/art/manifest';
import { DeedCard } from '@/components/deed-card';
import { Button, Card, Stat } from '@/components/ui';
import { USDT_ID, accountUrl, txUrl } from '@/config';
import { fmtNear, fmtTokens, fmtUsdt } from '@/lib/format';
import { useView } from '@/lib/use-view';
import { useGaballsActions } from '@/near/actions';
import { factory, isCertificate, isMachineToken, machine, nft, usdt } from '@/near/contracts';
import type { ExecutionOutcome } from '@/near/outcome';
import { nearBalance } from '@/near/rpc';

const HOUR_NS = 3600n * 1_000_000_000n;

/** Final status is SuccessValue and the returned value isn't `false` (e.g. claim's callback reports a restore). */
function succeeded(o: ExecutionOutcome): boolean {
  const st = o.status as { SuccessValue?: string } | undefined;
  if (!st || typeof st !== 'object' || !('SuccessValue' in st)) return false;
  try {
    return atob(st.SuccessValue ?? '') !== 'false';
  } catch {
    return true;
  }
}

export default function MyStuff() {
  const { account, faucet, claim, sweepFees } = useGaballsActions();
  const [msg, setMsg] = useState<{ text: string; tx?: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const balances = useView(
    async () => {
      if (!account) return null;
      const [near, usdtBal, faucetLast, machines, tokens] = await Promise.all([
        nearBalance(account),
        usdt.balanceOf(account),
        usdt.faucetLastUsed(account).catch(() => null),
        factory.getMachines(),
        nft.tokensForOwner(account),
      ]);
      const coins = await Promise.all(
        machines.map(async (m) => ({ info: m, balance: await machine(m.account_id).balanceOf(account) })),
      );
      const deeds = await Promise.all(
        tokens.filter(isMachineToken).map(async (t) => {
          const machineId = t.token_id.replace(/^machine:/, '');
          const [fees, view] = await Promise.all([nft.feeBalance(t.token_id), machine(machineId).get().catch(() => null)]);
          return { token: t, fees, accrued: view ? view.fees.nft_accrued : null };
        }),
      );
      const nowNs = BigInt(Date.now()) * 1_000_000n;
      return { near, usdtBal, faucetLast, nowNs, coins, deeds, certs: tokens.filter(isCertificate) };
    },
    account,
    8000,
  );

  /** Runs a wallet action; true only if the transaction's final result is a success (and not a `false` return). */
  async function run(label: string, fn: () => Promise<ExecutionOutcome>): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    try {
      const out = await fn();
      const ok = succeeded(out);
      setMsg(
        ok
          ? { text: `${label}: done`, tx: out.transaction.hash }
          : { text: `${label} did not go through; nothing moved.`, tx: out.transaction.hash, bad: true },
      );
      return ok;
    } catch (e) {
      setMsg({ text: `${label} did not complete: ${e instanceof Error ? e.message : e}`, bad: true });
      return false;
    } finally {
      setBusy(false);
      void balances.refresh();
    }
  }

  if (!account) {
    return (
      <Card className="max-w-xl">
        <h1 className="text-3xl font-bold text-grape">My stuff</h1>
        <p className="mt-2">Connect a NEAR testnet wallet to see your balances, Machine NFTs and certificates.</p>
      </Card>
    );
  }

  const d = balances.data;
  const faucetReadyAt = d?.faucetLast ? BigInt(d.faucetLast) + HOUR_NS : 0n;
  const faucetReady = !d?.faucetLast || d.nowNs >= faucetReadyAt;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h1 className="text-3xl font-bold text-grape">My stuff</h1>
        <p className="font-semibold text-plum">{account}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="NEAR" value={d ? fmtNear(d.near) : '…'} source={{ href: accountUrl(account), label: 'nearblocks' }} />
          <Stat
            label="Mock USDT"
            value={d ? fmtUsdt(d.usdtBal) : '…'}
            source={{ contract: USDT_ID, method: 'ft_balance_of', args: { account_id: account } }}
          />
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button disabled={busy || !faucetReady} onClick={() => run('Faucet', faucet)}>
            Get 100 mock USDT
          </Button>
          {!faucetReady && (
            <span className="text-sm">
              Next faucet at {new Date(Number(faucetReadyAt / 1_000_000n)).toLocaleTimeString()}
            </span>
          )}
        </div>
        <p aria-live="polite" className={`mt-2 text-sm font-semibold ${msg?.bad ? 'text-bad' : 'text-good'}`}>
          {msg?.text}{' '}
          {msg?.tx && (
            <a className="underline" href={txUrl(msg.tx)} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
        </p>
      </Card>

      <Card>
        <h2 className="text-2xl font-bold">Machine NFTs</h2>
        {d?.deeds.length ? (
          <ul className="mt-3 grid gap-4 lg:grid-cols-2">
            {d.deeds.map(({ token, fees, accrued }) => (
              <DeedCard
                key={token.token_id}
                token={token}
                feeBalance={fees}
                accrued={accrued}
                busy={busy}
                onClaim={() => run('Claim', () => claim(token.token_id))}
                onSweep={() => run('Collect fees', () => sweepFees(token.token_id.replace(/^machine:/, '')))}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-2">You don&apos;t own a Machine NFT yet. Launch a machine to get one.</p>
        )}
      </Card>

      <Card>
        <h2 className="text-2xl font-bold">Coins</h2>
        <ul className="mt-3 flex flex-col divide-y divide-lilac">
          {d?.coins
            .filter((c) => c.balance !== '0')
            .map((c) => (
              <li key={c.info.account_id} className="flex items-center justify-between py-2">
                <Link className="font-bold text-grape underline" href={`/machine/${c.info.account_id}`}>
                  ${c.info.symbol}
                </Link>
                <span className="tabular-nums">{fmtTokens(c.balance)}</span>
              </li>
            ))}
          {d && d.coins.every((c) => c.balance === '0') && <li className="py-2">No coins yet — open a pack.</li>}
        </ul>
      </Card>

      <Card>
        <h2 className="text-2xl font-bold">Mythic certificates</h2>
        {d?.certs.length ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {d.certs.map((c) => (
              <li key={c.token_id} className="relative flex items-center gap-3 overflow-hidden rounded-3xl px-7 py-6">
                {/* eslint-disable-next-line @next/next/no-img-element -- certificate frame art from the manifest */}
                <img src={art.cards.certificate} alt="" className="absolute inset-0 h-full w-full object-fill" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={art.gumballs.Mythic} alt="" width={48} height={48} className="relative" />
                <div className="relative">
                  <p className="font-display text-lg font-bold">{c.metadata?.title}</p>
                  <p className="text-sm">{c.metadata?.description}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2">None yet. A Mythic pull (1%) mints one — it can&apos;t be transferred.</p>
        )}
      </Card>
    </div>
  );
}
