'use client';

import type { PropsWithChildren } from 'react';
import { NearProvider } from '@/providers/near-provider';
import { PrivyRoot } from '@/providers/privy-bridge';

export function Providers({ children }: PropsWithChildren) {
  return (
    <PrivyRoot>
      <NearProvider>{children}</NearProvider>
    </PrivyRoot>
  );
}
