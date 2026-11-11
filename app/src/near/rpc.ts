// Read-only contract calls straight over JSON-RPC: no wallet needed, works on the server and in the browser.

import { RPC_URL } from '@/config';

export class ViewError extends Error {}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export async function view<T>(contractId: string, method: string, args: object = {}): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'gaballs',
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'optimistic',
        account_id: contractId,
        method_name: method,
        args_base64: toBase64(JSON.stringify(args)),
      },
    }),
    cache: 'no-store',
  });
  const body = await res.json();
  if (body.error) throw new ViewError(`${contractId}.${method}: ${JSON.stringify(body.error.cause ?? body.error)}`);
  if (body.result?.error) throw new ViewError(`${contractId}.${method}: ${body.result.error}`);
  const raw = new Uint8Array(body.result.result as number[]);
  return JSON.parse(new TextDecoder().decode(raw)) as T;
}

/** NEAR account balance in yoctoNEAR (total, including storage-locked). */
export async function nearBalance(accountId: string): Promise<bigint> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'gaballs',
      method: 'query',
      params: { request_type: 'view_account', finality: 'optimistic', account_id: accountId },
    }),
    cache: 'no-store',
  });
  const body = await res.json();
  if (body.error) throw new ViewError(`view_account ${accountId}: ${JSON.stringify(body.error.cause ?? body.error)}`);
  return BigInt(body.result.amount);
}
