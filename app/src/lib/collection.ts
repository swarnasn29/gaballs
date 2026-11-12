// COLLECTION: which of the 4 tiers a player (or a squad) has pulled, read from the chain, never from the browser.
//
// Two sources, merged by (machine, pull id):
//  1. pack_opened events. NearBlocks' token history for the account lists every transaction where it paid USDT to a
//     machine or received a machine's token; the VRF settlement runs inside that same transaction (yield/resume), so
//     its logs carry the `pack_opened` event (NEP-297, standard "gaballs"). We read the logs over NEAR RPC and keep
//     events whose `buyer` is the account. Covers the whole history.
//  2. get_recent_pulls on every machine (last 50 pulls each): works even if NearBlocks is down or behind.

import { EXPLORER_URL, RPC_FALLBACKS, RPC_URL, USDT_ID } from '@/config';
import { factory, machine } from '@/near/contracts';
import type { TierName } from '@/near/types';

export const TIERS: TierName[] = ['Common', 'Rare', 'Epic', 'Mythic'];

export interface CollectedPull {
  machine: string;
  pullId: number;
  tier: TierName;
  /** Transaction that settled the pull (events source); absent when only seen in get_recent_pulls. */
  txHash?: string;
  block: number;
}

export interface Collection {
  owner: string;
  byTier: Record<TierName, CollectedPull[]>;
  collected: number;
  complete: boolean;
  /** How many transactions were read for events, and whether NearBlocks answered. */
  sources: { txsRead: number; indexer: boolean };
}

const NEARBLOCKS_API = EXPLORER_URL.includes('testnet') ? 'https://api-testnet.nearblocks.io' : 'https://api.nearblocks.io';
/** Newest transactions read per account (each costs one RPC call; results are cached in memory). */
const MAX_TXS = 60;

interface FtRow {
  transaction_hash: string;
  contract_account_id: string;
  involved_account_id: string | null;
}

/** NearBlocks' free API is rate limited: ask it at most once per account every INDEXER_TTL_MS (failures retry sooner). */
const INDEXER_TTL_MS = 120_000;
const indexerCache = new Map<string, { at: number; txs: string[] | null }>();

/** Transactions where `account` paid USDT to a machine or received a machine's token. */
async function machineTxs(account: string, machines: Set<string>): Promise<string[] | null> {
  const hit = indexerCache.get(account);
  if (hit && Date.now() - hit.at < (hit.txs ? INDEXER_TTL_MS : INDEXER_TTL_MS / 4)) return hit.txs;
  const txs = await fetchMachineTxs(account, machines);
  // Keep the last good answer if this attempt failed (rate limit): it is still correct, only possibly a bit old.
  indexerCache.set(account, { at: Date.now(), txs: txs ?? hit?.txs ?? null });
  return txs ?? hit?.txs ?? null;
}

async function fetchMachineTxs(account: string, machines: Set<string>): Promise<string[] | null> {
  try {
    const res = await fetch(`${NEARBLOCKS_API}/v3/accounts/${account}/ft-txns?per_page=100`, { cache: 'no-store' });
    if (!res.ok) return null;
    const rows = ((await res.json()) as { data?: FtRow[] }).data ?? [];
    const out: string[] = [];
    for (const r of rows) {
      const paidMachine = r.contract_account_id === USDT_ID && r.involved_account_id && machines.has(r.involved_account_id);
      const fromMachine = machines.has(r.contract_account_id);
      if ((paidMachine || fromMachine) && !out.includes(r.transaction_hash)) out.push(r.transaction_hash);
    }
    return out.slice(0, MAX_TXS);
  } catch {
    return null;
  }
}

interface PackOpened {
  pull_id: number;
  buyer: string;
  tier: TierName;
  block: number;
}

/** Settled transactions never change, so their events are cached for the page's lifetime. */
const txCache = new Map<string, { receiver: string; events: PackOpened[] }[]>();

async function packEvents(txHash: string, anySender: string): Promise<{ receiver: string; events: PackOpened[] }[]> {
  const hit = txCache.get(txHash);
  if (hit) return hit;
  for (const url of [...RPC_FALLBACKS, RPC_URL]) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The RPC routes by tx hash; sender_account_id only needs to be a valid account id.
        body: JSON.stringify({ jsonrpc: '2.0', id: 'c', method: 'tx', params: { tx_hash: txHash, sender_account_id: anySender, wait_until: 'NONE' } }),
      });
      if (!res.ok) continue;
      const body = await res.json();
      if (body.error) continue;
      const out: { receiver: string; events: PackOpened[] }[] = [];
      for (const ro of body.result.receipts_outcome as { outcome: { logs: string[]; executor_id: string } }[]) {
        const events: PackOpened[] = [];
        for (const log of ro.outcome.logs) {
          if (!log.startsWith('EVENT_JSON:')) continue;
          try {
            const e = JSON.parse(log.slice('EVENT_JSON:'.length));
            if (e.standard === 'gaballs' && e.event === 'pack_opened') events.push(...(e.data as PackOpened[]));
          } catch {
            /* not ours */
          }
        }
        if (events.length) out.push({ receiver: ro.outcome.executor_id, events });
      }
      txCache.set(txHash, out);
      return out;
    } catch {
      /* next endpoint */
    }
  }
  return [];
}

export async function loadCollection(owner: string): Promise<Collection> {
  const machines = (await factory.getMachines()).map((m) => m.account_id);
  const machineSet = new Set(machines);
  const seen = new Map<string, CollectedPull>();
  const add = (p: CollectedPull) => {
    const key = `${p.machine}#${p.pullId}`;
    if (!seen.has(key) || (!seen.get(key)!.txHash && p.txHash)) seen.set(key, p);
  };

  // 1. Events from the account's own transactions.
  const txs = await machineTxs(owner, machineSet);
  if (txs) {
    const results = await Promise.all(txs.map((h) => packEvents(h, owner).then((r) => ({ h, r }))));
    for (const { h, r } of results)
      for (const { receiver, events } of r)
        for (const e of events)
          if (e.buyer === owner && machineSet.has(receiver))
            add({ machine: receiver, pullId: e.pull_id, tier: e.tier, txHash: h, block: e.block });
  }

  // 2. Recent pulls on every machine.
  await Promise.all(
    machines.map(async (id) => {
      const pulls = await machine(id).recentPulls().catch(() => []);
      for (const p of pulls) if (p.buyer === owner) add({ machine: id, pullId: p.pull_id, tier: p.tier, block: p.block });
    }),
  );

  const byTier = Object.fromEntries(TIERS.map((t) => [t, [] as CollectedPull[]])) as Record<TierName, CollectedPull[]>;
  for (const p of seen.values()) byTier[p.tier].push(p);
  for (const t of TIERS) byTier[t].sort((a, b) => a.block - b.block);
  const collected = TIERS.filter((t) => byTier[t].length > 0).length;
  return { owner, byTier, collected, complete: collected === TIERS.length, sources: { txsRead: txs?.length ?? 0, indexer: txs !== null } };
}
