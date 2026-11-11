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
              'flex-1 rounded-full px-4 py-2 text-center font-display text-base font-semibold sm:flex-none',
              active ? 'bg-grape text-white' : 'text-grape hover:bg-blush',
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
      <Link href="/" className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5 shadow-chunky sm:gap-2 sm:px-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={art.brand.logo} alt="" width={36} height={36} />
        <span className="font-display text-xl font-bold text-grape sm:text-2xl">Gaballs</span>
        <span className="rounded-full bg-grape px-2 py-0.5 text-[11px] font-bold uppercase text-white">{NETWORK}</span>
      </Link>

      <nav aria-label="Main" className="order-3 flex w-full gap-1 rounded-full bg-white p-1 shadow-chunky sm:order-none sm:w-auto">
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
