// WELCOME KIT (server only). A dedicated testnet account (WELCOME_ACCOUNT_ID, key in WELCOME_PRIVATE_KEY, both
// server-side env vars, never NEXT_PUBLIC) gives a brand-new Google/email or MetaMask player what they need to play:
// a little testnet NEAR for gas and storage registration on mock USDT and the flagship token..
//
// Limits (all checked before anything is sent):
//   - once per account: an account already registered on mock USDT is refused (checked on-chain), and a cache mark
//     stops two requests for the same account racing each other;
//   - per IP per day (KITS_PER_IP_PER_DAY) and per day overall (KITS_PER_DAY), counted in Vercel's Runtime Cache
//     (per region, best effort; in-memory under `next dev`);
//   - the whole kit switches itself off while the account holds less than OFF_BELOW_NEAR.
// Only implicit accounts (64 hex, what Privy's NEAR wallet gives) and Ethereum-style accounts (0x + 40 hex, what MetaMask
// gives) are served: named accounts were created by someone who already had NEAR.

import 'server-only';

import { getCache } from '@vercel/functions';
import {
  Account,
  FailoverRpcProvider,
  JsonRpcProvider,
  KeyPairSigner,
  actions,
  type KeyPairString,
} from 'near-api-js';

import { FEATURED_MACHINE, RPC_FALLBACKS, RPC_URL, USDT_ID } from '@/config';
import { view } from '@/near/rpc';
import type { StorageBalance, StorageBalanceBounds } from '@/near/types';

const YOCTO = 10n ** 24n;
/**
 * NEAR sent for gas. A pack attaches 300 Tgas, and NEAR makes the sender hold that gas at a pessimistic price (about
 * 0.30 NEAR) before it runs; the unused part is refunded, so a pack really costs ~0.002–0.01 NEAR. 0.5 NEAR covers the
 * hold plus storage for the account and many packs.
 */
export const KIT_NEAR = YOCTO / 2n; // 0.5 NEAR
export const KITS_PER_DAY = 15;
export const KITS_PER_IP_PER_DAY = 3;
export const OFF_BELOW_NEAR = 1;


const IMPLICIT = /^[0-9a-f]{64}$/;
const ETH_IMPLICIT = /^0x[0-9a-f]{40}$/;
export const isWelcomeAccount = (id: string) => IMPLICIT.test(id) || ETH_IMPLICIT.test(id);

export class KitError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function welcomeAccount(): Account {
  const id = process.env.WELCOME_ACCOUNT_ID;
  const key = process.env.WELCOME_PRIVATE_KEY;
  if (!id || !key) throw new KitError('The welcome kit is not set up on this server.', 503);
  // Public testnet endpoints (docs.near.org/api/rpc/providers); FastNEAR last because it reports rate limits inside a
  // normal JSON reply, which the failover provider would not treat as a failure.
  const provider = new FailoverRpcProvider(
    [...RPC_FALLBACKS, RPC_URL].map((url) => new JsonRpcProvider({ url })),
  );
  return new Account(id, provider, KeyPairSigner.fromSecretKey(key as KeyPairString));
}

const today = () => new Date().toISOString().slice(0, 10);
const cache = () => getCache({ namespace: 'welcome' });

async function count(key: string): Promise<number> {
  return Number((await cache().get(key)) ?? 0);
}
async function bump(key: string) {
  await cache().set(key, (await count(key)) + 1, { ttl: 2 * 86_400 });
}

export function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for')?.split(',')[0] ?? req.headers.get('x-real-ip') ?? 'unknown').trim();
}

export interface KitStatus {
  on: boolean;
  /** Friendly reason when off. */
  message?: string;
  balanceNear: number;
  kitsToday: number;
  limits: { kitNear: number; perDay: number; perIpPerDay: number; offBelowNear: number };
}

export async function kitStatus(): Promise<KitStatus> {
  const limits = {
    kitNear: Number(KIT_NEAR / 10n ** 21n) / 1000,
    perDay: KITS_PER_DAY,
    perIpPerDay: KITS_PER_IP_PER_DAY,
    offBelowNear: OFF_BELOW_NEAR,
  };
  const kitsToday = await count(`day:${today()}`);
  let balanceNear = 0;
  try {
    const { balance } = await welcomeAccount().getState();
    const amount = balance.available;
    balanceNear = Number(amount / (YOCTO / 1000n)) / 1000;
  } catch (e) {
    return { on: false, message: e instanceof KitError ? e.message : 'Welcome kit unavailable right now.', balanceNear, kitsToday, limits };
  }
  if (balanceNear < OFF_BELOW_NEAR)
    return {
      on: false,
      message: 'The welcome kit is empty for now. Use any NEAR testnet wallet, or try again later.',
      balanceNear,
      kitsToday,
      limits,
    };
  if (kitsToday >= KITS_PER_DAY)
    return { on: false, message: "Today's welcome kits are all given out. Come back tomorrow (UTC).", balanceNear, kitsToday, limits };
  return { on: true, balanceNear, kitsToday, limits };
}

export interface KitResult {
  accountId: string;
  txs: { what: string; hash: string }[];
}

/** Sends the kit, or throws a KitError with a friendly message. */
export async function sendKit(accountId: string, ip: string): Promise<KitResult> {
  if (!isWelcomeAccount(accountId))
    throw new KitError('The welcome kit is for new Google/email and MetaMask accounts only.', 400);

  const status = await kitStatus();
  if (!status.on) throw new KitError(status.message ?? 'Welcome kit unavailable.', 503);

  const registered = await view<StorageBalance | null>(USDT_ID, 'storage_balance_of', { account_id: accountId });
  if (registered) throw new KitError('This account already got its welcome kit.', 409);
  if (await cache().get(`acct:${accountId}`)) throw new KitError('This account already got its welcome kit.', 409);

  const ipKey = `ip:${ip}:${today()}`;
  if ((await count(ipKey)) >= KITS_PER_IP_PER_DAY)
    throw new KitError('Too many welcome kits from this network today. Try again tomorrow.', 429);

  // Mark first (before sending) so a second request for the same account in parallel is refused.
  await cache().set(`acct:${accountId}`, 1, { ttl: 30 * 86_400 });
  await bump(ipKey);
  await bump(`day:${today()}`);

  const [usdtBounds, tokenBounds] = await Promise.all([
    view<StorageBalanceBounds>(USDT_ID, 'storage_balance_bounds'),
    view<StorageBalanceBounds>(FEATURED_MACHINE, 'storage_balance_bounds'),
  ]);

  const account = welcomeAccount();
  const txs: KitResult['txs'] = [];
  // 1. The transfer creates the account (implicit and 0x accounts come into existence when they first receive NEAR).
  const transfer = await account.transfer({ receiverId: accountId, amount: KIT_NEAR });
  txs.push({ what: `${Number(KIT_NEAR / 10n ** 21n) / 1000} NEAR for gas`, hash: transfer.transaction.hash });
  // 2–3. Storage registration, paid by the kit, on mock USDT and the flagship token.
  for (const [contract, bounds] of [
    [USDT_ID, usdtBounds],
    [FEATURED_MACHINE, tokenBounds],
  ] as const) {
    const out = await account.signAndSendTransaction({
      receiverId: contract,
      actions: [
        actions.functionCall('storage_deposit', { account_id: accountId, registration_only: true }, 30_000_000_000_000n, BigInt(bounds.min)),
      ],
    });
    txs.push({ what: `storage registration on ${contract}`, hash: out.transaction.hash });
  }
  return { accountId, txs };
}
