import type { Metadata, Viewport } from 'next';
import { Fredoka, Nunito } from 'next/font/google';
import type { ReactNode } from 'react';

import '@/app/globals.css';
import { Header } from '@/components/header';
import { Sky } from '@/components/sky';
import { Providers } from '@/providers';

const fredoka = Fredoka({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-fredoka', display: 'swap' });
const nunito = Nunito({ subsets: ['latin'], weight: ['400', '600', '700', '800'], variable: '--font-nunito', display: 'swap' });

// Icons and link previews come from the Next.js file conventions in this folder (favicon.ico, icon.png,
// apple-icon.png, opengraph-image.png, twitter-image.png), rendered from brand/ (see brand/README.md).
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://gaballs.vercel.app'),
  title: 'Gaballs',
  description: 'Gumball machines for memecoins on NEAR. Every pack is a market buy; the odds table is fixed and public. Play free with Google, no wallet.',
  openGraph: { title: 'Gaballs', description: 'Gumball machines for memecoins on NEAR. Play free with Google, no wallet.', siteName: 'Gaballs', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Gaballs', description: 'Gumball machines for memecoins on NEAR. Play free with Google, no wallet.' },
};

export const viewport: Viewport = { themeColor: '#2E78C7' };

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
