'use client';

import type { PropsWithChildren } from 'react';
import { NearProvider } from '@/providers/near-provider';

export function Providers({ children }: PropsWithChildren) {
  return <NearProvider>{children}</NearProvider>;
}
