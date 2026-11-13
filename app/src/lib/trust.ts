// WHICH CONTRACTS THE APP WILL TALK TO. Contract ids can arrive from a web link (/machine/<id>, /squads/<id>,
// /proof?machine=…), so a lookalike contract must never be treated as a Gaballs machine or a squad, and nothing is
// signed for a contract outside this list. This matters most for Google/email players: their transactions are signed
// silently (no wallet popup shows the receiver or the amount).
//
// The rule rests on how NEAR accounts work: only `<parent>` can create `<name>.<parent>`. So
//   - `<symbol>.<factory>` can only exist if the Gaballs factory created it (the factory launches every machine);
//   - `<name>.<sputnik factory>` can only be a DAO created by the Sputnik DAO factory (a real Sputnik DAO).
// `isLaunchedMachine` additionally asks the factory itself (`get_machine`), so an account the factory owner might
// create by hand is not a machine either.

import { FACTORY_ID, NFT_ID, SPUTNIK_FACTORY, USDT_ID } from '@/config';
import { factory } from '@/near/contracts';
import type { Tx } from '@/near/contracts';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `<symbol>.<factory>`: the factory makes symbols of 2–12 letters/digits, lower-cased. */
const MACHINE_ID = new RegExp(`^[a-z0-9]{2,12}\\.${escape(FACTORY_ID)}$`);
/** `<name>.<sputnik factory>`: Sputnik DAO names are lowercase letters, digits and dashes. */
const SQUAD_ID = new RegExp(`^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?\\.${escape(SPUTNIK_FACTORY)}$`);

/** Every machine's smallest pack is 10 USDT (fixed in the factory). */
export const PACK_PRICE_UNITS = 10_000_000n;
/** The largest single pack the factory allows (1,000 USDT); a machine claiming more is refused. */
export const MAX_PACK_UNITS = 1_000_000_000n;
/** Storage registration on a token costs ~0.00125 NEAR; anything above 0.01 NEAR is refused as suspicious. */
export const MAX_STORAGE_DEPOSIT = 10n ** 22n;

export const isMachineId = (id: string) => MACHINE_ID.test(id);
export const isSquadId = (id: string) => SQUAD_ID.test(id);

/** The id has the machine shape AND the factory lists it as launched. */
export async function isLaunchedMachine(id: string): Promise<boolean> {
  if (!isMachineId(id)) return false;
  return (await factory.getMachine(id).catch(() => null)) !== null;
}

/** Contracts the app may send transactions to. */
export function isAllowedReceiver(id: string): boolean {
  return id === USDT_ID || id === NFT_ID || id === FACTORY_ID || id === SPUTNIK_FACTORY || isMachineId(id) || isSquadId(id);
}

/** Throws before anything is signed if a transaction goes to a contract outside the list. */
export function assertAllowedReceivers(txs: Tx[]): void {
  const bad = txs.find((t) => !isAllowedReceiver(t.receiverId));
  if (bad) throw new Error(`Blocked: ${bad.receiverId} is not a Gaballs contract, so nothing was signed.`);
}
