'use client';

import { art } from '@/art/manifest';
import { BuyPanel } from '@/components/buy-panel';
import { OddsTable, RiskNotice, TierDot, vaultHealth } from '@/components/machine-bits';
import { Card, Stat } from '@/components/ui';
import { EXPLORER_URL } from '@/config';
import { fmtMultiplier, fmtPrice, fmtTokens, fmtUsdtCompact, shortAccount } from '@/lib/format';
import { useView } from '@/lib/use-view';
import { machine } from '@/near/contracts';

export function MachineScreen({ id }: { id: string }) {
  const m = machine(id);
  const view = useView(() => m.get(), id, 6000);
  const odds = useView(() => m.odds(), id);
  const pulls = useView(() => m.recentPulls(), id, 6000);
  const meta = useView(() => m.metadata(), id);

  if (view.error) return <Card>Could not load {id}: {view.error}</Card>;
  const v = view.data;
  const health = v ? vaultHealth(v) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-grape sm:text-4xl">{meta.data?.name ?? id}</h1>
          <p className="font-semibold text-plum">
            ${meta.data?.symbol ?? '…'} · {id}
          </p>
        </div>
        {v && (
          <dl className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4">
            <Stat label="Price" value={fmtPrice(v.price_usdt_wad)} source={{ contract: id, method: 'get_machine' }} />
            <Stat label="Market cap" value={fmtUsdtCompact(v.market_cap_usdt)} source={{ contract: id, method: 'get_machine' }} />
            <Stat label="Packs" value={v.packs_opened.toLocaleString('en-US')} source={{ contract: id, method: 'get_machine' }} />
            <Stat
              label="Best hit"
              value={v.best_multiplier_bps ? fmtMultiplier(v.best_multiplier_bps) : '—'}
              source={{ contract: id, method: 'get_machine' }}
            />
          </dl>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        {/* Machine stage (3D machine arrives in step 2). */}
        <div className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art.machine.flat} alt="Gumball machine" className="w-64 drop-shadow-xl sm:w-80" />
          {v && health && (
            <Card className="w-full max-w-md">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">Prize vault</h2>
                <span className="rounded-full bg-blush px-3 py-1 text-sm font-bold text-grape">{health.label}</span>
              </div>
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
            </Card>
          )}
        </div>

        <Card className="flex flex-col gap-4">
          <BuyPanel machineId={id} onSettled={() => (view.refresh(), pulls.refresh())} />
          {odds.data && <OddsTable odds={odds.data} machineId={id} />}
          <RiskNotice />
        </Card>
      </div>

      <Card>
        <h2 className="text-2xl font-bold">Recent pulls</h2>
        <ul className="mt-3 flex flex-col divide-y divide-lilac">
          {(pulls.data ?? []).slice(0, 12).map((p) => (
            <li key={p.pull_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <TierDot tier={p.tier} />
              <span className="font-bold">{p.tier}</span>
              <span className="tabular-nums">{fmtMultiplier(p.multiplier_bps)}</span>
              <span className="text-plum">{shortAccount(p.buyer)}</span>
              <span className="ml-auto tabular-nums">{fmtTokens(p.payout)} tokens</span>
              <a className="text-xs font-semibold text-grape underline" href={`${EXPLORER_URL}/blocks/${p.block}`} target="_blank" rel="noreferrer">
                block {p.block}
              </a>
            </li>
          ))}
          {pulls.data?.length === 0 && <li className="py-2">No pulls yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
