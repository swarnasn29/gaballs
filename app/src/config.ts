// Contract ids and endpoints come from env vars (see .env.example). NEXT_PUBLIC_* values are inlined at build
// time, so each one must be referenced literally.

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}. Copy app/.env.example to app/.env.local.`);
  return value;
}

export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK_ID ?? 'testnet') as 'testnet' | 'mainnet';
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://test.rpc.fastnear.com';
/** Tried in order when an endpoint is rate-limited or down (public testnet RPCs from docs.near.org/api/rpc/providers). */
export const RPC_FALLBACKS = ['https://testnet-rpc.intea.rs', 'https://near-testnet.drpc.org'];
export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://testnet.nearblocks.io';
export const FACTORY_ID = required('NEXT_PUBLIC_FACTORY_ID', process.env.NEXT_PUBLIC_FACTORY_ID);
export const NFT_ID = required('NEXT_PUBLIC_NFT_ID', process.env.NEXT_PUBLIC_NFT_ID);
export const USDT_ID = required('NEXT_PUBLIC_USDT_ID', process.env.NEXT_PUBLIC_USDT_ID);

export const txUrl = (hash: string) => `${EXPLORER_URL}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER_URL}/address/${id}`;

/** Listed first on the home page. */
export const FEATURED_MACHINE = process.env.NEXT_PUBLIC_FEATURED_MACHINE ?? 'gaballs.gaballs.testnet';

/** Sputnik DAO v2 factory that creates squads (https://docs.near.org/primitives/dao). */
export const SPUTNIK_FACTORY = process.env.NEXT_PUBLIC_SPUTNIK_FACTORY ?? 'sputnikv2.testnet';
/** NEAR attached to `create` on the Sputnik factory (docs.near.org: 6 NEAR); it funds the DAO account's storage. */
export const SQUAD_CREATE_NEAR = '6';
/** The demo squad (scripts/squad-demo.sh). */
export const FEATURED_SQUAD = process.env.NEXT_PUBLIC_FEATURED_SQUAD ?? `gaballs-squad.${SPUTNIK_FACTORY}`;
/**
 * Gas for the ft_transfer_call action of an "open packs" proposal: it must fund USDT → machine → the VRF request
 * (150 Tgas) and its callback (60 Tgas) inside the 300 Tgas vote transaction. Sandbox minimum: 230 Tgas.
 */
export const SQUAD_PACK_TGAS = 270n;

/** Privy app id (Google/email login, docs.near.org/web3-apps/tutorials/privy). Empty → the option is hidden. */
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? '';
