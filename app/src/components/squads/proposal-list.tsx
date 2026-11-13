'use client';

import { useState } from 'react';

import { txUrl } from '@/config';
import { shortAccount } from '@/lib/format';
import { useView } from '@/lib/use-view';
import { useGaballsActions } from '@/near/actions';
import { approvals, describe, rejections, squad, type Proposal, type ProposalStatus } from '@/near/sputnik';
import { Button, Card, cx } from '../ui';

const STATUS: Record<ProposalStatus, { label: string; cls: string }> = {
  InProgress: { label: 'Voting', cls: 'bg-tier-rare/20 text-ink ring-tier-rare' },
  Approved: { label: 'Passed & executed', cls: 'bg-good/15 text-good ring-good' },
  Rejected: { label: 'Rejected', cls: 'bg-blush text-plum ring-lilac' },
  Removed: { label: 'Removed', cls: 'bg-blush text-plum ring-lilac' },
  Expired: { label: 'Expired', cls: 'bg-blush text-plum ring-lilac' },
  Moved: { label: 'Moved', cls: 'bg-blush text-plum ring-lilac' },
  Failed: { label: 'Passed, but the call failed', cls: 'bg-bad/10 text-bad ring-bad' },
};

export function ProposalList({
  dao,
  members,
  needed,
  account,
  onChange,
}: {
  dao: string;
  members: string[];
  needed: number;
  account: string;
  onChange: () => void;
}) {
  const { vote } = useGaballsActions();
  const s = squad(dao);
  const list = useView(
    async () => {
      const last = await s.lastProposalId();
      const from = Math.max(0, last - 15);
      const ps = last > 0 ? await s.proposals(from, 15) : [];
      return ps.sort((a, b) => b.id - a.id);
    },
    `${dao}:proposals`,
    8000,
  );
  const [voting, setVoting] = useState<Record<number, 'approve' | 'reject'>>({});
  const [txs, setTxs] = useState<Record<number, { hash?: string; error?: string }>>({});

  async function act(p: Proposal, approve: boolean) {
    setVoting((v) => ({ ...v, [p.id]: approve ? 'approve' : 'reject' }));
    try {
      const o = await vote(dao, p.id, approve);
      setTxs((t) => ({ ...t, [p.id]: { hash: o.transaction.hash } }));
    } catch (e) {
      setTxs((t) => ({ ...t, [p.id]: { error: e instanceof Error ? e.message : String(e) } }));
    } finally {
      setVoting((v) => {
        const { [p.id]: _, ...rest } = v;
        void _;
        return rest;
      });
      void list.refresh();
      onChange();
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-2xl font-bold">Proposals</h2>
      {list.data?.length === 0 && <p className="text-sm text-plum">No proposals yet. Members propose on the right.</p>}
      <ul className="flex flex-col gap-3" aria-live="polite">
        {(list.data ?? []).map((p) => {
          const d = describe(p, members);
          const yes = approvals(p);
          const no = rejections(p);
          const mine = p.votes[account];
          const canVote = members.includes(account) && p.status === 'InProgress' && !mine;
          const deciding = canVote && yes + 1 >= needed;
          const st = STATUS[p.status] ?? STATUS.InProgress;
          const busy = voting[p.id];
          return (
            <li key={p.id} className="flex flex-col gap-2 rounded-3xl bg-blush/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-display text-lg font-semibold">
                  #{p.id} · {d.text}
                </p>
                <span className={cx('rounded-full px-3 py-0.5 text-xs font-bold ring-1', st.cls)}>{st.label}</span>
              </div>
              <p className="text-sm text-plum">
                Proposed by {shortAccount(p.proposer)}
                {d.machine ? ` · on ${d.machine}` : ''}
              </p>
              {p.description && <p className="text-sm">&ldquo;{p.description}&rdquo;</p>}
              {d.warning && (
                <p className="rounded-2xl bg-tier-mythic/20 p-2 text-sm font-semibold text-ink ring-2 ring-warn" role="alert" data-testid="proposal-warning">
                  {d.warning}
                </p>
              )}
              <ul className="list-disc pl-5 text-xs text-plum" data-testid="proposal-actions">
                {d.details.map((line, i) => (
                  <li key={i} className="break-all">
                    {line}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white" aria-hidden>
                  <div className="h-full rounded-full bg-grape transition-[width]" style={{ width: `${Math.min(100, (yes / Math.max(1, needed)) * 100)}%` }} />
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {yes} of {needed} approvals{no ? ` · ${no} against` : ''}
                </span>
              </div>
              {Object.keys(p.votes).length > 0 && (
                <p className="text-xs text-plum">
                  {Object.entries(p.votes)
                    .map(([who, v]) => `${shortAccount(who)}: ${v}`)
                    .join(' · ')}
                </p>
              )}
              {canVote && (
                <div className="flex flex-wrap gap-2">
                  <Button className="min-h-10 py-2 text-base" disabled={!!busy} onClick={() => void act(p, true)}>
                    {busy === 'approve' ? (deciding && d.kind === 'open' ? 'Opening packs…' : 'Approving…') : deciding ? 'Approve & execute' : 'Approve'}
                  </Button>
                  <Button variant="secondary" className="min-h-10 py-2 text-base" disabled={!!busy} onClick={() => void act(p, false)}>
                    {busy === 'reject' ? 'Rejecting…' : 'Reject'}
                  </Button>
                </div>
              )}
              {busy === 'approve' && deciding && d.kind === 'open' && (
                <p className="text-sm text-grape">
                  Your vote executes it: the squad pays, then the machine waits for a verifiable randomness proof (about a
                  minute). The reveal appears above for the whole squad when it settles.
                </p>
              )}
              {mine && <p className="text-xs font-semibold text-grape">You voted: {mine}</p>}
              {txs[p.id]?.hash && (
                <a className="text-sm font-semibold text-grape underline" href={txUrl(txs[p.id].hash!)} target="_blank" rel="noreferrer">
                  View your vote transaction
                </a>
              )}
              {txs[p.id]?.error && <p className="text-sm font-semibold text-bad">{txs[p.id].error}</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
