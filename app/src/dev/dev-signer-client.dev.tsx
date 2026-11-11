// DEV TEST SIGNER (browser half). Reached through the import alias `gaballs-dev-signer`, which points here ONLY under
// `next dev` with DEV_SIGNER=1 (next.config.ts); every other build gets src/dev/dev-signer-stub.ts instead.
// This file never sees a key: it only calls the local dev route.

import type { Tx } from '@/near/contracts';
import type { ExecutionOutcome } from '@/near/outcome';

export async function devSignerAccount(): Promise<string | null> {
  const res = await fetch('/api/dev-signer', { cache: 'no-store' });
  if (!res.ok) return null;
  return ((await res.json()) as { accountId: string }).accountId;
}

export async function devSignAndSend(transactions: Tx[]): Promise<ExecutionOutcome[]> {
  const res = await fetch('/api/dev-signer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `dev signer HTTP ${res.status}`);
  return body.outcomes as ExecutionOutcome[];
}

/** Big, unmissable banner whenever the dev signer is the active signer — so it can't end up in a demo video. */
export function DevSignerBadge({ accountId }: { accountId: string }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: 'repeating-linear-gradient(45deg, #ffd400 0 18px, #1a1a1a 18px 36px)',
        padding: '6px 0',
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          background: '#1a1a1a',
          color: '#ffd400',
          font: '800 18px/1.2 system-ui, sans-serif',
          padding: '4px 14px',
          borderRadius: 999,
          letterSpacing: '0.04em',
        }}
      >
        DEV SIGNER: {accountId.split('.')[0]} — local testing only
      </span>
    </div>
  );
}
