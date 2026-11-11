'use client';

// Pulls the player has paid for on VRF machines, across reloads.
//
// The contract is the source of truth for everything that matters: whether a pull is still waiting for its proof
// (get_pending) and what it settled to (get_recent_pulls, which carry the request id). The only thing kept in the
// browser is which settled requests the player has already OPENED (watched the reveal), because opening is just the
// animation. A settled request that was paid on this device and not opened yet is "ready to open".

import { machine } from '@/near/contracts';
import { blockHeight } from '@/near/rpc';
import type { PendingPull, PullRecord } from '@/near/types';

const KEY = 'gaballs:pulls';

/** Per account and machine: request ids paid on this device, and the ones already opened. */
type Store = Record<string, Record<string, { tracked: number[]; opened: number[] }>>;

function load(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Store;
  } catch {
    return {};
  }
}
function save(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: ready badges just won't survive a reload */
  }
}
function entry(s: Store, account: string, machineId: string) {
  s[account] ??= {};
  s[account][machineId] ??= { tracked: [], opened: [] };
  return s[account][machineId];
}

/** Remember a request this player paid for (so it can show as "ready to open" once settled). */
export function trackRequest(account: string, machineId: string, requestId: number) {
  const s = load();
  const e = entry(s, account, machineId);
  if (!e.tracked.includes(requestId)) e.tracked.push(requestId);
  save(s);
}

/** The reveal for these requests has been shown: they are no longer "ready to open". */
export function markOpened(account: string, machineId: string, requestIds: number[]) {
  const s = load();
  const e = entry(s, account, machineId);
  for (const id of requestIds) if (!e.opened.includes(id)) e.opened.push(id);
  // Keep the store small: a request that is opened needs no tracking any more.
  e.tracked = e.tracked.filter((id) => !e.opened.includes(id));
  e.opened = e.opened.slice(-50);
  save(s);
}

function trackedUnopened(account: string, machineId: string): number[] {
  const e = load()[account]?.[machineId];
  return e ? e.tracked.filter((id) => !e.opened.includes(id)) : [];
}

export interface ReadyRequest {
  requestId: number;
  pulls: PullRecord[];
}

export interface PullInbox {
  machineId: string;
  /** Still waiting for the proof (from the contract). `timedOut`: refund_expired is now possible. */
  pending: (PendingPull & { timedOut: boolean; waitedSeconds: number })[];
  /** Settled while the player was away and not opened yet. */
  ready: ReadyRequest[];
  /** Tracked requests that ended with a refund (not pending, no pulls). Cleared once reported. */
  refunded: number[];
}

/**
 * Reads one VRF machine's state for `account`. Every pending pull is tracked (so it shows as ready once settled, even
 * if it was paid on another device or tab). Block height ≈ seconds on NEAR, used only for the elapsed-time display.
 */
export async function loadInbox(account: string, machineId: string): Promise<PullInbox> {
  const m = machine(machineId);
  const [pending, pulls, height] = await Promise.all([
    m.pending(account),
    m.recentPulls(),
    blockHeight().catch(() => 0),
  ]);
  for (const p of pending) trackRequest(account, machineId, p.request_id);
  const pendingIds = new Set(pending.map((p) => p.request_id));
  const mine = pulls.filter((p) => p.buyer === account && p.request_id !== undefined);
  const ready: ReadyRequest[] = [];
  const refunded: number[] = [];
  for (const id of trackedUnopened(account, machineId)) {
    if (pendingIds.has(id)) continue;
    const settled = mine.filter((p) => p.request_id === id).sort((a, b) => a.pull_id - b.pull_id);
    // Neither pending nor settled: refunded (or so old its pulls left the 50-pull history). Nothing to open.
    if (settled.length > 0) ready.push({ requestId: id, pulls: settled });
    else refunded.push(id);
  }
  return {
    machineId,
    pending: pending.map((p) => ({
      ...p,
      timedOut: p.refund_failed || (height > 0 && height >= p.refundable_from_block),
      waitedSeconds: height > 0 ? Math.max(0, height - p.requested_at_block) : 0,
    })),
    ready,
    refunded,
  };
}

/** Whether this browser already played the reveal for `requestId` (a squad's pulls are checked this way). */
export function isOpened(account: string, machineId: string, requestId: number): boolean {
  return load()[account]?.[machineId]?.opened.includes(requestId) ?? false;
}

/** Squads remembered in this browser (created or opened here), newest first. */
const SQUADS_KEY = 'gaballs:squads';
export function rememberedSquads(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SQUADS_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
export function rememberSquad(dao: string) {
  const list = [dao, ...rememberedSquads().filter((d) => d !== dao)].slice(0, 12);
  try {
    localStorage.setItem(SQUADS_KEY, JSON.stringify(list));
  } catch {
    /* private mode */
  }
}
