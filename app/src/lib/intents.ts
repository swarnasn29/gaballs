// NEAR INTENTS (1Click Swap API), for the "Top up from any chain" panel.
//
// Docs: https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request
//   GET  /v0/tokens  supported tokens (assetId, blockchain, symbol, decimals, price)
//   POST /v0/quote   `dry: true` = price only (no deposit address, nothing can happen); `dry: false` = a real quote with
//                    a deposit address on the origin chain
//   GET  /v0/status  progress of a real quote, by deposit address
// The API allows browser calls (Access-Control-Allow-Origin: *). No API key: 1Click then adds 0.25% to every quote
// (docs: resources/fees), which the quote's amountIn already includes.
//
// MAINNET ONLY: NEAR Intents has no testnet (hackathon rules Q-007). The game runs on testnet with mock USDT, so this
// panel quotes REAL USDT (usdt.tether-token.near) delivered to the player's account on NEAR MAINNET. Google/email
// players (64-hex implicit accounts) and MetaMask players (0x accounts) control the same account id on mainnet.

export const INTENTS_API = 'https://1click.chaindefuser.com';
/** Real USDT on NEAR mainnet (the token the game's mock USDT stands in for). */
export const USDT_NEAR_MAINNET = 'nep141:usdt.tether-token.near';
export const PACK_USDT_UNITS = 10_000_000n; // 10 USDT, 6 decimals

export interface IntentsToken {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price: number;
}

/** Ways to pay, in display order, matched against the live token list (missing ones are skipped). BNB Chain and Tron
 *  are left out: 1Click has $1,000 / $100 minimums there (docs: resources/swap-limits), far above one pack. */
const PAY_WITH: [blockchain: string, symbol: string, chainName: string][] = [
  ['base', 'USDC', 'Base'],
  ['eth', 'USDC', 'Ethereum'],
  ['eth', 'USDT', 'Ethereum'],
  ['arb', 'USDC', 'Arbitrum'],
  ['sol', 'USDC', 'Solana'],
  ['sol', 'SOL', 'Solana'],
  ['eth', 'ETH', 'Ethereum'],
  ['base', 'ETH', 'Base'],
  ['btc', 'BTC', 'Bitcoin'],
];

export interface PayOption extends IntentsToken {
  label: string;
}

export async function payOptions(): Promise<PayOption[]> {
  const res = await fetch(`${INTENTS_API}/v0/tokens`);
  if (!res.ok) throw new Error(`1Click tokens: HTTP ${res.status}`);
  const tokens = (await res.json()) as IntentsToken[];
  return PAY_WITH.flatMap(([chain, symbol, chainName]) => {
    const t = tokens.find((x) => x.blockchain === chain && x.symbol === symbol);
    return t ? [{ ...t, label: `${symbol} on ${chainName}` }] : [];
  });
}

export interface Quote {
  amountIn: string;
  amountInFormatted: string;
  amountInUsd: string;
  minAmountIn: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd: string;
  timeEstimate: number;
  depositAddress?: string;
  depositMemo?: string;
  deadline?: string;
}

/** NEAR account ids that exist on mainnet under the same keys as on testnet: implicit (64 hex) and 0x accounts. */
export const sameOnMainnet = (account: string) => /^[0-9a-f]{64}$/.test(account) || /^0x[0-9a-f]{40}$/.test(account);
export const isMainnetAccount = (id: string) =>
  sameOnMainnet(id) || /^(?=.{2,64}$)([a-z0-9]+[-_])*[a-z0-9]+(\.([a-z0-9]+[-_])*[a-z0-9]+)*\.near$/.test(id);

/**
 * Quote for exactly `usdtUnits` of real USDT delivered to `recipient` on NEAR mainnet, paid with `originAsset`.
 * Refunds (a deposit too small, or a missed deadline) go to the recipient's own NEAR Intents balance, so the player
 * needs no refund address on the paying chain (refundType INTENTS; checked with live dry quotes, refund fee 0).
 */
export async function quote(a: { originAsset: string; usdtUnits: bigint; recipient: string; dry: boolean }): Promise<Quote> {
  const res = await fetch(`${INTENTS_API}/v0/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dry: a.dry,
      swapType: 'EXACT_OUTPUT',
      slippageTolerance: 100, // 1%: the extra input is refunded after the swap (docs: EXACT_OUTPUT)
      originAsset: a.originAsset,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: USDT_NEAR_MAINNET,
      amount: a.usdtUnits.toString(),
      recipient: a.recipient,
      recipientType: 'DESTINATION_CHAIN',
      refundTo: a.recipient,
      refundType: 'INTENTS',
      deadline: new Date(Date.now() + 30 * 60_000).toISOString(),
    }),
  });
  const body = (await res.json()) as { quote?: Quote; message?: string };
  if (!res.ok || !body.quote) throw new Error(body.message ?? `1Click quote: HTTP ${res.status}`);
  return body.quote;
}

export type SwapStatus = 'KNOWN_DEPOSIT_TX' | 'PENDING_DEPOSIT' | 'INCOMPLETE_DEPOSIT' | 'PROCESSING' | 'SUCCESS' | 'REFUNDED' | 'FAILED';

export async function status(depositAddress: string, depositMemo?: string): Promise<SwapStatus> {
  const q = new URLSearchParams({ depositAddress, ...(depositMemo ? { depositMemo } : {}) });
  const res = await fetch(`${INTENTS_API}/v0/status?${q}`);
  const body = (await res.json()) as { status?: SwapStatus; message?: string };
  if (!res.ok || !body.status) throw new Error(body.message ?? `1Click status: HTTP ${res.status}`);
  return body.status;
}

export const STATUS_TEXT: Record<SwapStatus, string> = {
  PENDING_DEPOSIT: 'Waiting for your deposit',
  KNOWN_DEPOSIT_TX: 'Deposit seen, waiting for confirmations',
  INCOMPLETE_DEPOSIT: 'Deposit is less than needed: send the rest or wait for the refund',
  PROCESSING: 'Swapping',
  SUCCESS: 'Done: USDT delivered on NEAR mainnet',
  REFUNDED: 'Refunded to your NEAR Intents balance',
  FAILED: 'Failed',
};
