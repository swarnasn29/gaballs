// Reads what the CONTRACT reported from a finished transaction. The UI reveals only this — never a guess.

import type { PullRecord } from './types';

/** Minimal shape of a near-api-js FinalExecutionOutcome that we rely on. */
export interface ExecutionOutcome {
  transaction: { hash: string };
  status: unknown;
  receipts_outcome: { outcome: { logs: string[]; status: unknown; executor_id?: string } }[];
}

export interface NepEvent<T = unknown> {
  standard: string;
  version: string;
  event: string;
  data: T[];
}

export function events(outcome: ExecutionOutcome): NepEvent[] {
  const out: NepEvent[] = [];
  for (const r of outcome.receipts_outcome) {
    for (const log of r.outcome.logs) {
      if (!log.startsWith('EVENT_JSON:')) continue;
      try {
        out.push(JSON.parse(log.slice('EVENT_JSON:'.length)));
      } catch {
        /* not ours */
      }
    }
  }
  return out;
}

export type PackResult =
  | { kind: 'opened'; txHash: string; pulls: PullRecord[] }
  /** Phase 5 machines: payment accepted, the VRF proof arrives in a later receipt (usually ~10 s). */
  | { kind: 'requested'; txHash: string; requestId: number }
  | { kind: 'refunded'; txHash: string; reason: string }
  | { kind: 'failed'; txHash?: string; reason: string };

function failureMessage(status: unknown): string | null {
  if (status && typeof status === 'object' && 'Failure' in status) {
    return JSON.stringify((status as { Failure: unknown }).Failure);
  }
  return null;
}

function ours(outcome: ExecutionOutcome, name: string) {
  return events(outcome).filter((e) => e.standard === 'gaballs' && e.event === name);
}

/**
 * Interprets the ft_transfer_call outcome of an "open pack" transaction. Wallets that wait for every receipt return
 * the settled pulls directly; otherwise a Phase 5 machine shows only `pack_requested` and the caller waits for
 * settlement on-chain (src/lib/use-pull.ts).
 */
export function readPackOutcome(outcome: ExecutionOutcome, buyer: string): PackResult {
  const txHash = outcome.transaction.hash;
  const pulls = ours(outcome, 'pack_opened')
    .flatMap((e) => e.data as PullRecord[])
    .filter((p) => p.buyer === buyer);
  if (pulls.length > 0) return { kind: 'opened', txHash, pulls };

  const vrfRefund = ours(outcome, 'pack_refunded')
    .flatMap((e) => e.data as { buyer: string; reason: string }[])
    .find((r) => r.buyer === buyer);
  if (vrfRefund) return { kind: 'refunded', txHash, reason: vrfRefund.reason };

  const refundLog = outcome.receipts_outcome
    .flatMap((r) => r.outcome.logs)
    .find((l) => /^refund \d+: /.test(l));
  if (refundLog) return { kind: 'refunded', txHash, reason: refundLog.replace(/^refund \d+: /, '') };

  const requested = ours(outcome, 'pack_requested')
    .flatMap((e) => e.data as { request_id: number; buyer: string }[])
    .find((r) => r.buyer === buyer);
  if (requested) return { kind: 'requested', txHash, requestId: requested.request_id };

  const failed = failureMessage(outcome.status) ?? outcome.receipts_outcome.map((r) => failureMessage(r.outcome.status)).find(Boolean);
  return { kind: 'failed', txHash, reason: failed ?? 'No pack_opened event in the transaction' };
}

export type LaunchResult = { kind: 'submitted'; txHash: string } | { kind: 'failed'; txHash?: string; reason: string };

/**
 * First look at a launch transaction. The factory logs "launch of X failed; refunding Y" if creating the machine
 * failed (and refunds the deposit). "submitted" is NOT success yet: the UI then waits until get_machine() lists it.
 */
export function readLaunchOutcome(outcome: ExecutionOutcome): LaunchResult {
  const txHash = outcome.transaction.hash;
  const logs = outcome.receipts_outcome.flatMap((r) => r.outcome.logs);
  const failedLog = logs.find((l) => /^launch of .* failed/.test(l));
  if (failedLog) return { kind: 'failed', txHash, reason: failedLog };
  const failed = failureMessage(outcome.status);
  if (failed) return { kind: 'failed', txHash, reason: failed };
  return { kind: 'submitted', txHash };
}
