'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { BuyPanel, clampAmount, packRange } from '@/components/buy-panel';
import { MachineStage } from '@/components/machine/stage';
import { PullFeed } from '@/components/pull-feed';
import { RevealDialog } from '@/components/reveal/reveal-dialog';
import type { StagePhase } from '@/components/machine/shared';
import { OddsTable, RandomnessBadge, RiskNotice, vaultHealth } from '@/components/machine-bits';
import { ReadyCard } from '@/components/ready-card';
import { Card, Stat } from '@/components/ui';
import { fmtMultiplier, fmtPrice, fmtTokens, fmtUsdtCompact } from '@/lib/format';
import { loadInbox, markOpened } from '@/lib/pull-tracker';
import { usePull } from '@/lib/use-pull';
import { useView } from '@/lib/use-view';
import { machine } from '@/near/contracts';

export function MachineScreen({ id }: { id: string }) {
  const m = machine(id);
  const view = useView(() => m.get(), id, 6000);
  const odds = useView(() => m.odds(), id);
  const pulls = useView(() => m.recentPulls(), id, 4000);
  const meta = useView(() => m.metadata(), id);

  const refreshAll = useCallback(() => {
    void view.refresh();
    void pulls.refresh();
  }, [view, pulls]);
  const pull = usePull(id, refreshAll);
  const [count, setCount] = useState(1);
  // Variable-size machines: one pack of any amount from pack_price to max_pack_price (USDT units).
  const [amount, setAmount] = useState(10_000_000n);
  const [capsuleOut, setCapsuleOut] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);

  // This player's pulls on a VRF machine, read from the contract: waiting ones survive reloads, and ones that settled
  // while away are "ready to open".
  const isVrf = !!view.data?.config.vrf;
  const account = pull.account;
  const inbox = useView(
    () => (account && isVrf ? loadInbox(account, id) : Promise.resolve(null)),
    `${id}:${account}:${isVrf}`,
    6000,
  );
  const resumed = useRef(false);
  const { resume } = pull;
  const idle = pull.state.phase === 'idle';
  useEffect(() => {
    const first = inbox.data?.pending[0];
    if (!first || resumed.current || !idle) return;
    resumed.current = true;
    void resume(first);
  }, [inbox.data, idle, resume]);
  // Refunded while away: nothing to open; the USDT is back in the wallet.
  useEffect(() => {
    if (account && inbox.data?.refunded.length) markOpened(account, id, inbox.data.refunded);
  }, [account, id, inbox.data]);
  // Once the reveal plays, those requests are no longer "ready to open".
  const shownPulls = pull.state.phase === 'opened' ? pull.state.pulls : null;
  const refreshInbox = inbox.refresh;
  useEffect(() => {
    if (!revealOpen || !shownPulls || !account) return;
    const ids = [...new Set(shownPulls.map((p) => p.request_id).filter((r): r is number => r !== undefined))];
    if (ids.length) {
      markOpened(account, id, ids);
      void refreshInbox();
    }
  }, [account, id, revealOpen, shownPulls, refreshInbox]);

  const sizeRange = view.data ? packRange(view.data) : null;
  const open = useCallback(() => {
    setCapsuleOut(false);
    if (sizeRange) void pull.start(1, clampAmount(amount, sizeRange));
    else void pull.start(count);
  }, [pull, count, amount, sizeRange]);
  const reset = useCallback(() => {
    setCapsuleOut(false);
    setRevealOpen(false);
    pull.reset();
  }, [pull]);
  // The capsule has rolled out (only ever after the contract answered): open the reveal pop-up.
  const onCapsulesOut = useCallback(() => {
    setCapsuleOut(true);
    setRevealOpen(true);
  }, []);
  const closeReveal = useCallback(() => setRevealOpen(false), []);

  if (view.error) return <Card>Could not load {id}: {view.error}</Card>;
  const v = view.data;
  const health = v ? vaultHealth(v) : undefined;
  // Golden rule: the stage only shows a capsule once the contract's pack_opened result is in (phase "opened").
  const stagePhase: StagePhase =
    pull.state.phase === 'pending' ? 'pending' : pull.state.phase === 'opened' ? (capsuleOut ? 'resting' : 'dropping') : 'idle';

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-grape sm:text-4xl">{meta.data?.name ?? id}</h1>
          <p className="font-semibold text-plum">
            ${meta.data?.symbol ?? '…'} · {id}
          </p>
          {/* same height while loading, so nothing shifts when get_machine() answers */}
          <div className="mt-1 h-6">{v && <RandomnessBadge view={v} />}</div>
        </div>
        {/* rendered while loading too (values "…"), so the page doesn't jump when get_machine() answers */}
        <dl className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4">
          <Stat label="Price" value={v ? fmtPrice(v.price_usdt_wad) : '…'} source={{ contract: id, method: 'get_machine' }} />
          <Stat label="Market cap" value={v ? fmtUsdtCompact(v.market_cap_usdt) : '…'} source={{ contract: id, method: 'get_machine' }} />
          <Stat label="Packs" value={v ? v.packs_opened.toLocaleString('en-US') : '…'} source={{ contract: id, method: 'get_machine' }} />
          <Stat
            label="Best hit"
            value={!v ? '…' : v.best_multiplier_bps ? fmtMultiplier(v.best_multiplier_bps) : '—'}
            source={{ contract: id, method: 'get_machine' }}
          />
        </dl>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* Machine stage (3D machine arrives in step 2). */}
        <div className="flex flex-col items-center gap-4">
          <MachineStage
            vaultPct={health?.pct}
            phase={stagePhase}
            capsules={pull.state.phase === 'opened' ? pull.state.pulls.length : 0}
            crankable={!!pull.account && pull.state.phase === 'idle'}
            onCrank={open}
            onCapsulesOut={onCapsulesOut}
          />
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Prize vault</h2>
              <span className="rounded-full bg-blush px-3 py-1 text-sm font-bold text-grape">{health?.label ?? '…'}</span>
            </div>
            {v && health ? (
              <>
                <div
                  className="mt-2 h-4 overflow-hidden rounded-full bg-blush"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(health.pct, 100)}
                  aria-label="Vault compared to its launch size"
                >
                  <div className="h-full rounded-full bg-grape" style={{ width: `${Math.min(health.pct, 100)}%` }} />
                </div>
                <p className="mt-2 text-sm">
                  {fmtTokens(v.vault)} tokens ({health.pct}% of launch). One winning pull can take at most{' '}
                  {v.config.max_vault_draw_bps / 100}% of it.
                </p>
              </>
            ) : (
              // same height as the loaded content: bar + two lines of text
              <div aria-hidden className="mt-2 h-[4.25rem] rounded-2xl bg-blush/60" />
            )}
          </Card>
        </div>

        <Card className="flex flex-col gap-4 self-start">
          {idle && inbox.data?.ready[0] && (
            <ReadyCard
              ready={inbox.data.ready[0]}
              more={inbox.data.ready.length - 1}
              onOpen={() => {
                setCapsuleOut(false);
                pull.openSettled(inbox.data!.ready[0]);
              }}
            />
          )}
          <BuyPanel
            account={pull.account}
            count={count}
            setCount={setCount}
            size={v && sizeRange ? { ...sizeRange, amount: clampAmount(amount, sizeRange), setAmount, view: v } : undefined}
            state={pull.state}
            capsuleOut={capsuleOut}
            onOpen={open}
            onReset={reset}
            onRefund={() => void pull.refund()}
          />
          {odds.data && <OddsTable odds={odds.data} machineId={id} />}
          <RiskNotice />
        </Card>
      </div>

      {revealOpen && pull.state.phase === 'opened' && (
        <RevealDialog
          pulls={pull.state.pulls}
          txHash={pull.state.txHash}
          machineId={id}
          symbol={meta.data?.symbol ?? ''}
          onClose={closeReveal}
        />
      )}

      <Card>
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          Live pulls
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-good" aria-hidden />
        </h2>
        <PullFeed pulls={pulls.data} account={pull.account} />
      </Card>
    </div>
  );
}

