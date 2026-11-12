'use client';

// "Collection" on My stuff: the 4 tier characters, filled in from the player's own pulls on-chain (src/lib/collection.ts),
// with progress, a small celebration when the set completes, and the trophies of squads the player belongs to.

import { useEffect, useState } from 'react';

import { art, tierColor } from '@/art/manifest';
import { FEATURED_SQUAD, txUrl } from '@/config';
import { TIERS, loadCollection, type Collection } from '@/lib/collection';
import { rememberedSquads } from '@/lib/pull-tracker';
import { useView } from '@/lib/use-view';
import { membersOf, squad } from '@/near/sputnik';
import { Confetti } from './reveal/effects';
import { Card, cx } from './ui';

const CELEBRATED = 'gaballs:collection-celebrated';

/** Squads the account is a council member of (checked on-chain); candidates are the featured squad and squads opened here. */
async function mySquads(account: string): Promise<{ dao: string; name: string; collection: Collection }[]> {
  const candidates = [...new Set([FEATURED_SQUAD, ...rememberedSquads()])];
  const rows = await Promise.all(
    candidates.map(async (dao) => {
      try {
        const policy = await squad(dao).policy();
        if (!membersOf(policy).includes(account)) return null;
        const config = await squad(dao).config().catch(() => ({ name: dao.split('.')[0] }));
        return { dao, name: config.name, collection: await loadCollection(dao) };
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((r): r is NonNullable<typeof r> => r !== null);
}

export function CollectionCard({ account }: { account: string }) {
  const mine = useView(() => loadCollection(account), `${account}:collection`, 20000);
  const squads = useView(() => mySquads(account), `${account}:squad-trophies`, 60000);
  const [party, setParty] = useState(false);
  const c = mine.data;

  // A small celebration the first time this browser sees the set complete (the flag is only a "seen it" convenience).
  useEffect(() => {
    if (!c?.complete) return;
    try {
      const done = JSON.parse(localStorage.getItem(CELEBRATED) ?? '[]') as string[];
      if (done.includes(account)) return;
      localStorage.setItem(CELEBRATED, JSON.stringify([...done, account]));
    } catch {
      /* storage blocked: celebrate anyway */
    }
    const on = setTimeout(() => setParty(true), 0);
    const off = setTimeout(() => setParty(false), 4500);
    return () => {
      clearTimeout(on);
      clearTimeout(off);
    };
  }, [c?.complete, account]);

  return (
    <Card data-testid="collection">
      {party && <Confetti pieces={120} duration={4000} />}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold">Collection</h2>
        <p className="font-display text-lg font-semibold text-grape" data-testid="collection-progress">
          {c ? `${c.collected} / 4 collected` : 'Loading…'}
        </p>
      </div>
      {c?.complete && (
        <p className="mt-1 font-display text-lg font-semibold text-plum" role="status">
          Set complete! You pulled every tier.
        </p>
      )}
      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TIERS.map((t) => {
          const pulls = c?.byTier[t] ?? [];
          const have = pulls.length > 0;
          const first = pulls[0];
          return (
            <li
              key={t}
              className={cx('flex flex-col items-center rounded-2xl p-3 text-center', have ? 'bg-blush' : 'border-2 border-dashed border-lilac bg-white')}
              data-tier={t}
              data-collected={have ? 'yes' : 'no'}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={art.gumballs[t]}
                alt=""
                width={64}
                height={64}
                className={cx('h-16 w-16', !have && 'opacity-25 grayscale')}
              />
              <p className="mt-1 font-display text-lg font-semibold" style={{ color: have ? tierColor[t] : undefined }}>
                {t}
              </p>
              <p className="text-xs text-plum">{have ? `×${pulls.length}` : 'not yet'}</p>
              {first && (
                <p className="text-[11px]">
                  {first.txHash ? (
                    <a className="font-semibold text-grape underline" href={txUrl(first.txHash)} target="_blank" rel="noreferrer">
                      first: pull #{first.pullId}
                    </a>
                  ) : (
                    <span>first: pull #{first.pullId}</span>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-plum">
        Source: your <code>pack_opened</code> events on-chain{c && !c.sources.indexer ? ' (indexer unavailable: last 50 pulls per machine only)' : ''}{' '}
        and <code>get_recent_pulls()</code>.
      </p>

      {(squads.data?.length ?? 0) > 0 && (
        <div className="mt-4 border-t-2 border-blush pt-3">
          <h3 className="font-display text-lg font-semibold">Squad trophies</h3>
          <ul className="mt-2 space-y-2">
            {squads.data!.map((s) => (
              <li key={s.dao} className="flex flex-wrap items-center gap-2" data-testid="squad-trophy">
                <a className="font-semibold text-grape underline" href={`/squads/${s.dao}`}>
                  {s.name}
                </a>
                <span className="text-sm text-plum">{s.collection.collected} / 4</span>
                <span className="flex gap-1">
                  {TIERS.map((t) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={t}
                      src={art.gumballs[t]}
                      alt={s.collection.byTier[t].length ? `${t} collected` : `${t} not yet`}
                      title={`${t}: ×${s.collection.byTier[t].length}`}
                      width={24}
                      height={24}
                      className={cx('h-6 w-6', !s.collection.byTier[t].length && 'opacity-25 grayscale')}
                    />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
