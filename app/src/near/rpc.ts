// Read-only contract calls straight over JSON-RPC: no wallet needed, works on the server and in the browser.

import { RPC_URL, RPC_FALLBACKS } from '@/config';

export class ViewError extends Error {}

const ENDPOINTS = [RPC_URL, ...RPC_FALLBACKS.filter((u) => u !== RPC_URL)];
/** The endpoint that last answered; requests start there until it fails (no clock: safe during prerendering). */
let preferred = 0;

/**
 * One JSON-RPC call, with failover across the public testnet endpoints listed at docs.near.org/api/rpc/providers:
 * a 429, HTTP error or network failure moves on to the next one. Errors the chain reports (e.g. a view that panics)
 * are returned as-is, not retried.
 */
async function rpc(method: string, params: object): Promise<{ result?: Record<string, unknown> & { error?: string }; error?: { cause?: unknown } }> {
  const start = preferred;
  let lastErr: unknown;
  for (let k = 0; k < ENDPOINTS.length; k++) {
    const i = (start + k) % ENDPOINTS.length;
    try {
      const res = await fetch(ENDPOINTS[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'gaballs', method, params }),
        cache: 'no-store',
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.error?.code === -429 || /rate limit/i.test(String(body.error?.message ?? ''))) throw new Error('rate limited');
      preferred = i;
      return body;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new ViewError(`all RPC endpoints failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export async function view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
  const body = await rpc('query', {
    request_type: 'call_function',
    finality: 'optimistic',
    account_id: contractId,
    method_name: method,
    args_base64: toBase64(JSON.stringify(args)),
  });
  if (body.error) throw new ViewError(`${contractId}.${method}: ${JSON.stringify(body.error.cause ?? body.error)}`);
  if (body.result?.error) throw new ViewError(`${contractId}.${method}: ${body.result.error}`);
  const raw = new Uint8Array(body.result!.result as number[]);
  return JSON.parse(new TextDecoder().decode(raw)) as T;
}

/** NEAR account balance in yoctoNEAR (total, including storage-locked). */
export async function nearBalance(accountId: string): Promise<bigint> {
  const body = await rpc('query', { request_type: 'view_account', finality: 'optimistic', account_id: accountId });
  if (body.error) throw new ViewError(`view_account ${accountId}: ${JSON.stringify(body.error.cause ?? body.error)}`);
  return BigInt(body.result!.amount as string);
}

/** Latest final block height. */
export async function blockHeight(): Promise<number> {
  const body = await rpc('block', { finality: 'final' });
  if (body.error) throw new ViewError(`block: ${JSON.stringify(body.error.cause ?? body.error)}`);
  return (body.result!.header as { height: number }).height;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Base58 (NEAR code hashes) → lowercase hex. */
export function base58ToHex(s: string): string {
  let n = 0n;
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error('not base58');
    n = n * 58n + BigInt(i);
  }
  return n.toString(16).padStart(64, '0');
}

/** SHA-256 (hex) of the contract code deployed on `accountId`, or null if none. */
export async function codeSha256(accountId: string): Promise<string | null> {
  const body = await rpc('query', { request_type: 'view_account', finality: 'optimistic', account_id: accountId });
  const hash = body.result?.code_hash as string | undefined;
  return hash && hash !== '11111111111111111111111111111111' ? base58ToHex(hash) : null;
}
