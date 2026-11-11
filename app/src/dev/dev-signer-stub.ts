// What `gaballs-dev-signer` resolves to in every normal build (production, Vercel, and `next dev` without the flag).
// Deliberately contains nothing: no route, no account, no banner.

import type { Tx } from '@/near/contracts';
import type { ExecutionOutcome } from '@/near/outcome';

export async function devSignerAccount(): Promise<string | null> {
  return null;
}

export async function devSignAndSend(transactions: Tx[]): Promise<ExecutionOutcome[]> {
  void transactions;
  throw new Error('unavailable');
}

export function DevSignerBadge(_: { accountId: string }) {
  void _;
  return null;
}
