'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';

import { art } from '@/art/manifest';
import { NETWORK } from '@/config';
import { shortAccount } from '@/lib/format';
import { useNearWallet } from '@/providers/near-provider';
import { cx } from './ui';

const links = [
  { href: '/', label: 'Machines' },
  { href: '/launch', label: 'Launch' },
  { href: '/squads', label: 'Squads' },
  { href: '/me', label: 'My stuff' },
];

/** Reads the URL for the active tab, so it streams in under <Suspense> (Cache Components). */
function NavLinks() {
  const pathname = usePathname();
  return <NavList pathname={pathname} />;
}

function NavList({ pathname }: { pathname: string | null }) {
  return (
    <>
      {links.map((l) => {
        const active =
          pathname !== null &&
          (l.href === '/' ? pathname === '/' || pathname.startsWith('/machine') : pathname.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex-1 whitespace-nowrap border-b-[3px] px-2 pb-2 pt-1 text-center font-display text-sm font-semibold sm:flex-none sm:px-4 sm:text-lg',
              active ? 'border-accent text-ink' : 'border-transparent text-plum hover:text-ink',
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}

export function Header() {
  const { loading, signedAccountId, signIn, signOut } = useNearWallet();

  return (
    <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-6">
      <Link href="/" className="flex items-center gap-2 py-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art.brand.logo} alt="" width={44} height={44} className="h-10 w-10 sm:h-11 sm:w-11" />
        <span className="font-display text-2xl font-bold text-ink sm:text-3xl">Gaballs</span>
        <span className="rounded-full bg-mint px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-mint-ink">{NETWORK}</span>
      </Link>

      <nav aria-label="Main" className="order-3 flex w-full gap-1 border-b-2 border-lilac sm:order-none sm:w-auto">
        <Suspense fallback={<NavList pathname={null} />}>
          <NavLinks />
        </Suspense>
      </nav>

      <button
        onClick={() => void (signedAccountId ? signOut() : signIn())}
        disabled={loading}
        className="min-h-11 rounded-full bg-grape px-4 py-2 font-display text-base font-semibold text-white shadow-chunky-ink disabled:opacity-60"
        title={signedAccountId ? 'Sign out' : 'Connect a NEAR wallet'}
      >
        {loading ? 'Wallet…' : signedAccountId ? shortAccount(signedAccountId) : (
          <>
            Connect<span className="hidden sm:inline"> wallet</span>
          </>
        )}
      </button>
    </header>
  );
}
