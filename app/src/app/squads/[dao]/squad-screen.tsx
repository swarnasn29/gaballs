'use client';

// One squad (a Sputnik DAO): members, treasury, squad pulls, proposals. Every number comes from a view call on the
// DAO, the machine, the USDT or the NFT contract; every action is a Sputnik proposal or vote.

import { useCallback, useEffect, useState } from 'react';

import { PullProgress } from '@/components/pull-progress';
import { ReadyCard } from '@/components/ready-card';
import { RevealDialog } from '@/components/reveal/reveal-dialog';
import { ProposalList } from '@/components/squads/proposal-list';
import { ProposeForms } from '@/components/squads/propose-forms';
import { Button, Card, Stat } from '@/components/ui';
import { FEATURED_MACHINE, NFT_ID, USDT_ID, accountUrl, txUrl } from '@/config';
import { fmtTokens, fmtUsdt, shortAccount } from '@/lib/format';
import { isOpened, markOpened, rememberSquad, trackRequest } from '@/lib/pull-tracker';
import { useView } from '@/lib/use-view';
import { useGaballsActions } from '@/near/actions';
import { factory, isCertificate, isMachineToken, machine, nft, usdt } from '@/near/contracts';
import type { ExecutionOutcome } from '@/near/outcome';
import { blockHeight } from '@/near/rpc';
import { approvalsNeeded, membersOf, squad } from '@/near/sputnik';
import type { PullRecord } from '@/near/types';

function ok(o: ExecutionOutcome) {
  const st = o.status as { SuccessValue?: string } | undefined;
  return !!st && typeof st === 'object' && 'SuccessValue' in st;
}

export function SquadScreen({ dao }: { dao: string }) {
  const { account, chipIn } = useGaballsActions();
  const s = squad(dao);
  useEffect(() => rememberSquad(dao), [dao]);

  const info = useView(
    async () => {
      const [policy, config] = await Promise.all([s.policy(), s.config().catch(() => ({ name: dao, purpose: '' }))]);
      return { policy, config };
    },
    dao,
  );
  const treasury = useView(
    async () => {
      const [usdtBal, machines, tokens] = await Promise.all([usdt.balanceOf(dao), factory.getMachines(), nft.tokensForOwner(dao)]);
      const coins = (
        await Promise.all(machines.map(async (m) => ({ info: m, balance: await machine(m.account_id).balanceOf(dao).catch(() => '0') })))
      ).filter((c) => c.balance !== '0');
      const deeds = await Promise.all(
        tokens.filter(isMachineToken).map(async (t) => ({ token: t, fees: await nft.feeBalance(t.token_id) })),
      );
      return { usdtBal, coins, deeds, certs: tokens.filter(isCertificate) };
    },
    `${dao}:treasury`,
    15000,
  );
  // Squad pulls on the flagship machine: waiting (from the contract), or settled and not opened in this browser.
  const pulls = useView(
    async () => {
      const m = machine(FEATURED_MACHINE);
      const [pending, recent, height, view] = await Promise.all([
        m.pending(dao).catch(() => []),
        m.recentPulls(),
        blockHeight().catch(() => 0),
        m.get(),
      ]);
      for (const p of pending) trackRequest(dao, FEATURED_MACHINE, p.request_id);
      const mine = recent.filter((p) => p.buyer === dao && p.request_id !== undefined);
      const latest = mine.length ? Math.max(...mine.map((p) => p.request_id as number)) : null;
      const ready =
        latest !== null && !isOpened(dao, FEATURED_MACHINE, latest)
          ? { requestId: latest, pulls: mine.filter((p) => p.request_id === latest).sort((a, b) => a.pull_id - b.pull_id) }
          : null;
      const waitingSince = pending.map((p) => Date.now() - Math.max(0, height - p.requested_at_block) * 1000);
      return { pending, waitingSince, ready, packPrice: view.config.pack_price };
    },
    `${dao}:pulls`,
    8000,
  );

  const [reveal, setReveal] = useState<PullRecord[] | null>(null);
  const openReady = useCallback(() => {
    const r = pulls.data?.ready;
    if (!r) return;
    markOpened(dao, FEATURED_MACHINE, [r.requestId]);
    setReveal(r.pulls);
  }, [dao, pulls.data]);

  const [chip, setChip] = useState('10');
  const [chipMsg, setChipMsg] = useState<{ text: string; tx?: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshAll = useCallback(() => {
    void treasury.refresh();
    void pulls.refresh();
  }, [treasury, pulls]);

  if (info.error) {
    return (
      <Card>
        <h1 className="text-2xl font-bold text-accent">Squad not found</h1>
        <p className="mt-2">
          {dao} is not a Sputnik DAO we can read ({info.error.slice(0, 120)}). Check the name, or create it on the Squads
          page.
        </p>
      </Card>
    );
  }
  const policy = info.data?.policy;
  const members = policy ? membersOf(policy) : [];
  const needed = policy ? approvalsNeeded(policy) : 0;
  const isMember = !!account && members.includes(account);
  const t = treasury.data;

  async function doChip(e: React.FormEvent) {
    e.preventDefault();
    const units = BigInt(Math.round(Number(chip) * 1e6));
    if (units <= 0n) return;
    setBusy(true);
    setChipMsg(null);
    try {
      const o = await chipIn(dao, units.toString());
      setChipMsg(ok(o) ? { text: `Sent ${chip} USDT to the squad`, tx: o.transaction.hash } : { text: 'The transfer did not go through', tx: o.transaction.hash, bad: true });
    } catch (err) {
      setChipMsg({ text: err instanceof Error ? err.message : String(err), bad: true });
    } finally {
      setBusy(false);
      refreshAll();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {reveal && <RevealDialog pulls={reveal} txHash="" machineId={FEATURED_MACHINE} symbol="GABALLS" onClose={() => setReveal(null)} />}

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-plum">Squad · Sputnik DAO</p>
            <h1 className="text-3xl font-bold text-accent sm:text-4xl">{info.data?.config.name ?? '…'}</h1>
            <a className="break-all text-sm font-semibold text-plum underline" href={accountUrl(dao)} target="_blank" rel="noreferrer">
              {dao} on nearblocks
            </a>
          </div>
          {policy && (
            <span className="rounded-full bg-grape px-4 py-1.5 font-display text-base font-semibold text-white">
              {needed} of {members.length} approve
            </span>
          )}
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Members">
          {members.map((m) => (
            <li key={m} className="rounded-full bg-blush px-3 py-1 text-sm font-semibold text-accent ring-1 ring-lilac">
              {shortAccount(m)}
              {m === account && <span className="ml-1 rounded-full bg-grape px-1.5 text-[10px] text-white">you</span>}
            </li>
          ))}
        </ul>
        {account && (
          <form onSubmit={doChip} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm font-bold">
              Chip in mock USDT
              <input
                inputMode="decimal"
                value={chip}
                onChange={(e) => setChip(e.target.value)}
                className="w-28 rounded-2xl border-2 border-lilac glass px-3 py-2 font-normal tabular-nums"
              />
            </label>
            <Button type="submit" variant="secondary" disabled={busy} className="min-h-11 py-2 text-base">
              Send to the squad
            </Button>
            {chipMsg && (
              <span className={`text-sm font-semibold ${chipMsg.bad ? 'text-bad' : 'text-good'}`}>
                {chipMsg.text}{' '}
                {chipMsg.tx && (
                  <a className="underline" href={txUrl(chipMsg.tx)} target="_blank" rel="noreferrer">
                    View transaction
                  </a>
                )}
              </span>
            )}
          </form>
        )}
      </Card>

      {(pulls.data?.pending.length || pulls.data?.ready) && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">Squad pull</h2>
          {pulls.data.pending.map((p, i) => (
            <div key={p.request_id} className="flex flex-col gap-1">
              <p className="text-sm font-semibold">
                {p.count} pack{p.count > 1 ? 's' : ''} paid by the squad · request #{p.request_id}
              </p>
              <PullProgress paidAt={pulls.data!.waitingSince[i]} count={p.count} />
            </div>
          ))}
          {pulls.data.ready && pulls.data.pending.length === 0 && (
            <ReadyCard ready={pulls.data.ready} more={0} onOpen={openReady} />
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3">
            <h2 className="text-2xl font-bold">Treasury</h2>
            <dl className="grid grid-cols-2 gap-2">
              <Stat
                label="Mock USDT"
                value={t ? fmtUsdt(t.usdtBal) : '…'}
                source={{ contract: USDT_ID, method: 'ft_balance_of', args: { account_id: dao } }}
              />
              {(t?.coins ?? []).map((c) => (
                <Stat
                  key={c.info.account_id}
                  label={`$${c.info.symbol}`}
                  value={fmtTokens(c.balance)}
                  source={{ contract: c.info.account_id, method: 'ft_balance_of', args: { account_id: dao } }}
                />
              ))}
            </dl>
            <h3 className="mt-2 font-display text-lg font-semibold">Machine NFTs</h3>
            {t?.deeds.length ? (
              <ul className="flex flex-col gap-2">
                {t.deeds.map((d) => (
                  <li key={d.token.token_id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-blush px-4 py-3">
                    <span className="min-w-0 break-all font-semibold">{d.token.token_id}</span>
                    <span className="text-sm">
                      fee balance <strong>{fmtUsdt(d.fees)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-plum">None yet. A creator can give a Machine NFT to the squad to share its fees.</p>
            )}
            <h3 className="mt-2 font-display text-lg font-semibold">Trophies</h3>
            {t?.certs.length ? (
              <ul className="flex flex-wrap gap-2">
                {t.certs.map((c) => (
                  <li key={c.token_id} className="rounded-2xl bg-tier-mythic/30 px-3 py-2 text-sm font-semibold ring-2 ring-tier-mythic">
                    {c.metadata?.title ?? c.token_id}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-plum">No Mythic certificates yet (1% per pack). They would be owned by the squad.</p>
            )}
            <p className="text-xs text-plum">
              Sources: <code>ft_balance_of</code> on each token, <code>nft_tokens_for_owner</code> on {NFT_ID}.
            </p>
          </Card>

          <ProposalList dao={dao} members={members} needed={needed} account={account} onChange={refreshAll} />
        </div>

        <ProposeForms
          dao={dao}
          isMember={isMember}
          members={members}
          packPrice={pulls.data?.packPrice ?? null}
          treasuryUsdt={t?.usdtBal ?? null}
          flagshipBalance={t?.coins.find((c) => c.info.account_id === FEATURED_MACHINE)?.balance ?? '0'}
          deeds={t?.deeds ?? []}
          onProposed={refreshAll}
        />
      </div>
    </div>
  );
}
