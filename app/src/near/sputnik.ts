// Squads are plain Sputnik DAO v2 contracts (the testnet factory's default code, v3.31, commit 7764926; interfaces
// checked against near-daos/sputnik-dao-contract at that commit). Nothing here is a Gaballs contract: a squad creates
// its DAO on the Sputnik factory, and everything it does (open packs, split, sell, claim fees) is a FunctionCall
// proposal its members vote on.

import { NFT_ID, SPUTNIK_FACTORY, SQUAD_CREATE_NEAR, SQUAD_PACK_TGAS, USDT_ID } from '@/config';
import { TGAS, type Tx } from './contracts';
import { MAX_STORAGE_DEPOSIT, PACK_PRICE_UNITS, isMachineId } from '@/lib/trust';
import { fmtNear, fmtTokens, fmtUsdt } from '@/lib/format';
import { view } from './rpc';
import type { AccountId, U128 } from './types';

export const PROPOSAL_BOND = 100_000_000_000_000_000_000_000n; // 0.1 NEAR, set in the squad's policy below
const NEAR = 10n ** 24n;

export type ProposalStatus = 'InProgress' | 'Approved' | 'Rejected' | 'Removed' | 'Expired' | 'Moved' | 'Failed';

export interface ActionCall {
  method_name: string;
  /** base64 JSON */
  args: string;
  deposit: U128;
  gas: string;
}

export interface Proposal {
  id: number;
  proposer: AccountId;
  description: string;
  kind: { FunctionCall?: { receiver_id: AccountId; actions: ActionCall[] } } & Record<string, unknown>;
  status: ProposalStatus;
  /** role → [approve, reject, remove] */
  vote_counts: Record<string, [string, string, string]>;
  votes: Record<AccountId, 'Approve' | 'Reject' | 'Remove'>;
  submission_time: string;
}

export interface Policy {
  roles: { name: string; kind: { Group?: AccountId[] } | string; permissions: string[] }[];
  default_vote_policy: { weight_kind: string; quorum: string; threshold: string | [number, number] };
  proposal_bond: U128;
  proposal_period: string;
}

export const squadIdFor = (name: string) => `${name}.${SPUTNIK_FACTORY}`;
export const isValidSquadName = (name: string) => /^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(name);

/** Council members (the squad's "council" group). */
export const membersOf = (p: Policy): AccountId[] =>
  p.roles.flatMap((r) => (typeof r.kind === 'object' && r.kind.Group ? r.kind.Group : []));

/** Approvals needed, for a fixed-weight threshold ("2") or Sputnik's ratio form ([1, 2] = more than half). */
export function approvalsNeeded(p: Policy): number {
  const t = p.default_vote_policy.threshold;
  const total = membersOf(p).length;
  if (Array.isArray(t)) return Math.min(Math.floor((t[0] * total) / t[1]) + 1, total);
  return Math.min(Number(t), total);
}

export const squad = (dao: AccountId) => ({
  id: dao,
  policy: () => view<Policy>(dao, 'get_policy'),
  lastProposalId: () => view<number>(dao, 'get_last_proposal_id'),
  proposals: (from: number, limit: number) => view<Proposal[]>(dao, 'get_proposals', { from_index: from, limit }),
  config: () => view<{ name: string; purpose: string }>(dao, 'get_config'),
});

const b64 = (o: object) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))));
export function decodeArgs(a: ActionCall): Record<string, unknown> {
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(a.args), (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
}

function action(method: string, args: object, deposit: bigint, tgas: bigint): ActionCall {
  return { method_name: method, args: b64(args), deposit: deposit.toString(), gas: (tgas * TGAS).toString() };
}

// ------------------------------------------------------------------------------------------------ transactions

/** The Sputnik factory creates `<name>.<factory>` with this policy: the members are the council, `threshold` approvals
 * pass a proposal, only members can propose (bond 0.1 NEAR, returned when it passes). */
export function createSquadTx(name: string, members: AccountId[], threshold: number, title: string): Tx {
  const policy = {
    roles: [
      {
        name: 'council',
        kind: { Group: members },
        permissions: ['*:AddProposal', '*:VoteApprove', '*:VoteReject', '*:VoteRemove', '*:Finalize'],
        vote_policy: {},
      },
    ],
    default_vote_policy: { weight_kind: 'RoleWeight', quorum: '0', threshold: String(threshold) },
    proposal_bond: PROPOSAL_BOND.toString(),
    proposal_period: '604800000000000',
    bounty_bond: PROPOSAL_BOND.toString(),
    bounty_forgiveness_period: '86400000000000',
  };
  const init = { config: { name: title, purpose: 'Group gacha on Gaballs', metadata: '' }, policy };
  return {
    receiverId: SPUTNIK_FACTORY,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'create',
          args: { name, args: b64(init) },
          gas: (150n * TGAS).toString(),
          deposit: (BigInt(SQUAD_CREATE_NEAR) * NEAR).toString(),
        },
      },
    ],
  };
}

function proposeTx(dao: AccountId, description: string, receiver: AccountId, actions: ActionCall[]): Tx {
  return {
    receiverId: dao,
    actions: [
      {
        type: 'FunctionCall',
        params: {
          methodName: 'add_proposal',
          args: { proposal: { description, kind: { FunctionCall: { receiver_id: receiver, actions } } } },
          gas: (100n * TGAS).toString(),
          deposit: PROPOSAL_BOND.toString(),
        },
      },
    ],
  };
}

/** The deciding vote executes the proposal inside its own transaction, so it always gets the full 300 Tgas. */
export function voteTx(dao: AccountId, id: number, approve: boolean): Tx {
  return {
    receiverId: dao,
    actions: [
      {
        type: 'FunctionCall',
        params: { methodName: 'act_proposal', args: { id, action: approve ? 'VoteApprove' : 'VoteReject' }, gas: (300n * TGAS).toString(), deposit: '0' },
      },
    ],
  };
}

export const proposals = {
  openPacks: (dao: AccountId, machineId: AccountId, count: number, packPrice: U128) =>
    proposeTx(dao, `Open ${count} pack${count > 1 ? 's' : ''} on ${machineId}`, USDT_ID, [
      action(
        'ft_transfer_call',
        {
          receiver_id: machineId,
          amount: (BigInt(packPrice) * BigInt(count)).toString(),
          msg: JSON.stringify({ action: 'open_pack', count }),
        },
        1n,
        SQUAD_PACK_TGAS,
      ),
    ]),

  /** Registers each member on the token first (paid by the DAO, refunded if already registered), then pays shares.
   * One proposal = one batch: one failed action would fail them all. */
  split: (dao: AccountId, machineId: AccountId, members: AccountId[], share: bigint, storageMin: U128) =>
    proposeTx(dao, `Split ${members.length} equal shares of the prize`, machineId, [
      ...members.map((m) => action('storage_deposit', { account_id: m, registration_only: true }, BigInt(storageMin), 10n)),
      ...members.map((m) => action('ft_transfer', { receiver_id: m, amount: share.toString(), memo: 'squad split' }, 1n, 15n)),
    ]),

  sellBack: (dao: AccountId, machineId: AccountId, amount: bigint, minUsdtOut: bigint) =>
    proposeTx(dao, `Sell ${amount} token units back to ${machineId}`, machineId, [
      action('sell', { amount: amount.toString(), min_usdt_out: minUsdtOut.toString() }, 1n, 100n),
    ]),

  claimFees: (dao: AccountId, tokenId: string) =>
    proposeTx(dao, `Claim the fees of ${tokenId}`, NFT_ID, [action('claim', { token_id: tokenId }, 1n, 60n)]),
};

export type ProposalKind = 'open' | 'split' | 'sell' | 'claim' | 'other';

export interface ProposalSummary {
  kind: ProposalKind;
  /** One line for the card. Friendly only when every action matches a Gaballs shape exactly. */
  text: string;
  machine?: string;
  /** Set for anything not recognised: voters must read the actions before approving. */
  warning?: string;
  /** Every action, in plain words: what it calls, on which contract, to whom and how much. Always shown. */
  details: string[];
}

const ONE = '1';
const str = (v: unknown) => (typeof v === 'string' ? v : v === undefined ? '' : JSON.stringify(v));

/** One line per action, nothing hidden: method, contract, receiver/account, amount and attached NEAR. */
function actionLines(receiver: AccountId, actions: ActionCall[]): string[] {
  return actions.map((a) => {
    const args = decodeArgs(a);
    const who = str(args.receiver_id ?? args.account_id);
    const amount = str(args.amount);
    const shown = amount
      ? receiver === USDT_ID
        ? ` ${fmtUsdt(amount)}`
        : isMachineId(receiver)
          ? ` ${fmtTokens(amount)} tokens`
          : ` ${amount} units`
      : '';
    const near = BigInt(a.deposit || '0') > 1n ? ` (attaches ${fmtNear(a.deposit)})` : '';
    return `${a.method_name} on ${receiver}${shown}${who ? ` to ${who}` : ''}${near}`;
  });
}

/**
 * Plain-words summary of a squad proposal. A friendly label is given ONLY when every action matches one of the
 * shapes this app builds (src/near/sputnik.ts proposals) with Gaballs contracts, the fixed pack price and, for a split,
 * payments to council members only. Anything else is "Unrecognised" with a warning, so a proposal cannot hide a
 * payout behind a harmless first action.
 */
export function describe(p: Proposal, members: AccountId[] = []): ProposalSummary {
  const fc = p.kind.FunctionCall;
  if (!fc) {
    const kind = Object.keys(p.kind)[0] ?? 'Proposal';
    return { kind: 'other', text: `${kind} (not a Gaballs action)`, warning: 'Not a Gaballs proposal: check it on the DAO before voting.', details: [JSON.stringify(p.kind).slice(0, 300)] };
  }
  const { receiver_id: receiver, actions } = fc;
  const details = actionLines(receiver, actions);
  const other = (why: string): ProposalSummary => ({
    kind: 'other',
    text: 'Unrecognised proposal',
    warning: `${why} Read every action below before you vote.`,
    details,
  });
  if (actions.length === 0) return other('It has no actions.');
  const args = actions.map(decodeArgs);
  const only = actions.length === 1 ? actions[0] : null;

  // Open packs: one ft_transfer_call of exactly count x 10 USDT on mock USDT to a Gaballs machine.
  if (receiver === USDT_ID && only?.method_name === 'ft_transfer_call') {
    const machineId = str(args[0].receiver_id);
    let count = 0;
    try {
      const msg = JSON.parse(str(args[0].msg)) as { action?: string; count?: number };
      if (msg.action === 'open_pack' && Number.isInteger(msg.count)) count = msg.count ?? 0;
    } catch {
      /* not a pack message */
    }
    const amountOk = count >= 1 && count <= 5 && str(args[0].amount) === (PACK_PRICE_UNITS * BigInt(count)).toString();
    if (isMachineId(machineId) && amountOk && only.deposit === ONE)
      return { kind: 'open', text: `Open ${count} pack${count === 1 ? '' : 's'} (${fmtUsdt(PACK_PRICE_UNITS * BigInt(count))})`, machine: machineId, details };
    return other('It sends USDT, but not as a Gaballs pack payment.');
  }

  // Split: on a Gaballs machine's token, only storage registrations and transfers, all to council members.
  if (isMachineId(receiver) && actions.every((a) => a.method_name === 'storage_deposit' || a.method_name === 'ft_transfer')) {
    const targets = args.map((a) => str(a.receiver_id ?? a.account_id));
    const toMembers = targets.every((t) => members.includes(t));
    const smallDeposits = actions.every((a) => BigInt(a.deposit || '0') <= MAX_STORAGE_DEPOSIT);
    const n = actions.filter((a) => a.method_name === 'ft_transfer').length;
    if (n > 0 && toMembers && smallDeposits)
      return { kind: 'split', text: `Split the prize ${n} way${n === 1 ? '' : 's'} between members`, machine: receiver, details };
    return other(toMembers ? 'It moves tokens in an unusual way.' : 'It sends tokens to someone who is not a member.');
  }

  if (isMachineId(receiver) && only?.method_name === 'sell' && only.deposit === ONE)
    return { kind: 'sell', text: 'Sell tokens back to the curve', machine: receiver, details };

  if (receiver === NFT_ID && only?.method_name === 'claim' && only.deposit === ONE && str(args[0].token_id).startsWith('machine:'))
    return { kind: 'claim', text: `Claim fees of ${str(args[0].token_id)}`, details };

  return other('It does not match anything this app proposes.');
}

export const approvals = (p: Proposal) => Object.values(p.votes).filter((v) => v === 'Approve').length;
export const rejections = (p: Proposal) => Object.values(p.votes).filter((v) => v === 'Reject').length;
