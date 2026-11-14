import Link from 'next/link';

import { accountUrl } from '@/config';
import { Card } from './ui';

/** Shown instead of a machine or squad page when the id in the link is not a Gaballs machine / Sputnik DAO squad. */
export function NotOurs({ id, kind }: { id: string; kind: 'machine' | 'squad' }) {
  return (
    <Card className="flex flex-col gap-2" role="alert" data-testid="not-ours">
      <h1 className="text-2xl font-bold text-accent">{kind === 'machine' ? 'Not a Gaballs machine' : 'Not a Gaballs squad'}</h1>
      <p className="break-all">
        <a className="font-semibold underline" href={accountUrl(id)} target="_blank" rel="noreferrer">
          {id}
        </a>{' '}
        {kind === 'machine'
          ? 'was not launched by the Gaballs factory, so this app will not show it or send it anything.'
          : 'is not a Sputnik DAO, so this app will not show it or send it anything.'}
      </p>
      <p className="text-sm text-plum">If someone sent you this link, it may be a lookalike. Real machines are listed on the home page.</p>
      <Link href={kind === 'machine' ? '/' : '/squads'} className="font-semibold text-accent underline">
        {kind === 'machine' ? 'See the real machines' : 'See squads'}
      </Link>
    </Card>
  );
}
