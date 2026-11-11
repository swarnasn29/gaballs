// Contract ids and endpoints come from env vars (see .env.example). NEXT_PUBLIC_* values are inlined at build
// time, so each one must be referenced literally.

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing ${name}. Copy app/.env.example to app/.env.local.`);
  return value;
}

export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK_ID ?? 'testnet') as 'testnet' | 'mainnet';
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://test.rpc.fastnear.com';
export const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://testnet.nearblocks.io';
export const FACTORY_ID = required('NEXT_PUBLIC_FACTORY_ID', process.env.NEXT_PUBLIC_FACTORY_ID);
export const NFT_ID = required('NEXT_PUBLIC_NFT_ID', process.env.NEXT_PUBLIC_NFT_ID);
export const USDT_ID = required('NEXT_PUBLIC_USDT_ID', process.env.NEXT_PUBLIC_USDT_ID);

export const txUrl = (hash: string) => `${EXPLORER_URL}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER_URL}/address/${id}`;

/** Listed first on the home page. */
export const FEATURED_MACHINE = process.env.NEXT_PUBLIC_FEATURED_MACHINE ?? 'gumball.gaballs.testnet';
