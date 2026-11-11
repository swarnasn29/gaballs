import type { Metadata, Viewport } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import type { ReactNode } from 'react';

import '@/app/globals.css';
import { Header } from '@/components/header';
import { Sky } from '@/components/sky';
import { Providers } from '@/providers';

const fredoka = Fredoka({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-fredoka', display: 'swap' });
const nunito = Nunito({ subsets: ['latin'], weight: ['400', '600', '700', '800'], variable: '--font-nunito', display: 'swap' });

export const metadata: Metadata = {
  title: 'Gaballs',
  description: 'Gacha machines for memecoins on NEAR. Every pack is a market buy; the odds table is fixed and public.',
};

export const viewport: Viewport = { themeColor: '#563791' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fredoka.variable} ${nunito.variable}`}>
      <body className="min-h-dvh">
        <Sky />
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-4 sm:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
