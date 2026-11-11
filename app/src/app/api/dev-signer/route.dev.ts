// DEV TEST SIGNER — exists only under `next dev` with DEV_SIGNER=1 (see next.config.ts pageExtensions).
// Signs Gaballs transactions as a test account using its key from ~/.near-credentials. The key is read here, on the
// server, and is never logged, returned or sent anywhere. Only FunctionCall actions to the Gaballs contracts, and
// only from localhost.

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Account, FailoverRpcProvider, JsonRpcProvider, KeyPairSigner, actions, type KeyPairString } from 'near-api-js';

const NETWORK = process.env.NEXT_PUBLIC_NETWORK_ID ?? 'testnet';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://test.rpc.fastnear.com';
const FACTORY = process.env.NEXT_PUBLIC_FACTORY_ID ?? '';
const ALLOWED_RECEIVERS = [FACTORY, process.env.NEXT_PUBLIC_NFT_ID, process.env.NEXT_PUBLIC_USDT_ID].filter(Boolean);
const ACCOUNT = process.env.DEV_SIGNER_ACCOUNT ?? `buyer1.${FACTORY}`;
// Squad DAOs (Sputnik) the test account is a member of, so Squads proposals and votes can be scripted locally.
const SPUTNIK = process.env.NEXT_PUBLIC_SPUTNIK_FACTORY ?? 'sputnikv2.testnet';

type IncomingTx = {
  receiverId: string;
  actions: { type: string; params: { methodName: string; args: object; gas: string; deposit: string } }[];
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const hostname = (hostHeader: string) => hostHeader.replace(/:\d+$/, '').toLowerCase();

/**
 * Local-only: the real Host header must be localhost (also defeats DNS rebinding), a browser Origin, if sent, must be
 * localhost too (no cross-site requests), and POSTs must be application/json (forces a CORS preflight, which this
 * route never answers). Run the dev server with `npm run dev:signer` so it only listens on 127.0.0.1.
 */
function guard(req: Request): Response | null {
  if (process.env.NODE_ENV !== 'development' || process.env.DEV_SIGNER !== '1') return new Response(null, { status: 404 });
  if (!LOCAL_HOSTS.has(hostname(req.headers.get('host') ?? ''))) return new Response(null, { status: 403 });
  const origin = req.headers.get('origin');
  if (origin && !LOCAL_HOSTS.has(hostname(new URL(origin).host))) return new Response(null, { status: 403 });
  if (req.method === 'POST' && !(req.headers.get('content-type') ?? '').startsWith('application/json'))
    return new Response(null, { status: 415 });
  if (NETWORK !== 'testnet') return Response.json({ error: 'dev signer is testnet-only' }, { status: 403 });
  return null;
}

function receiverAllowed(id: string) {
  return ALLOWED_RECEIVERS.includes(id) || (FACTORY !== '' && id.endsWith(`.${FACTORY}`)) || id.endsWith(`.${SPUTNIK}`);
}

async function loadAccount(): Promise<Account> {
  let privateKey: string;
  try {
    const file = await readFile(join(homedir(), '.near-credentials', NETWORK, `${ACCOUNT}.json`), 'utf8');
    privateKey = JSON.parse(file).private_key;
  } catch {
    throw new Error(`no readable key file for ${ACCOUNT} in ~/.near-credentials/${NETWORK}`);
  }
  // Public testnet endpoints from docs.near.org/api/rpc/providers. FastNEAR answers a rate limit with an error inside a
  // normal JSON reply, which the failover provider does not treat as a failure, so it goes last here.
  const provider = new FailoverRpcProvider(
    ['https://testnet-rpc.intea.rs', 'https://near-testnet.drpc.org', RPC_URL].map((url) => new JsonRpcProvider({ url })),
  );
  return new Account(ACCOUNT, provider, KeyPairSigner.fromSecretKey(privateKey as KeyPairString));
}

export async function GET(req: Request) {
  return guard(req) ?? Response.json({ accountId: ACCOUNT });
}

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  const { transactions } = (await req.json()) as { transactions: IncomingTx[] };
  for (const tx of transactions) {
    if (!receiverAllowed(tx.receiverId)) return Response.json({ error: `receiver ${tx.receiverId} not allowed` }, { status: 400 });
    if (tx.actions.some((a) => a.type !== 'FunctionCall')) return Response.json({ error: 'only FunctionCall actions' }, { status: 400 });
  }
  try {
    const account = await loadAccount();
    const outcomes = [];
    for (const tx of transactions) {
      outcomes.push(
        await account.signAndSendTransaction({
          receiverId: tx.receiverId,
          actions: tx.actions.map((a) =>
            actions.functionCall(a.params.methodName, a.params.args, BigInt(a.params.gas), BigInt(a.params.deposit)),
          ),
        }),
      );
    }
    return Response.json({ outcomes });
  } catch (e) {
    // Error text from the RPC/contract only; never the key.
    return Response.json({ error: e instanceof Error ? e.message : 'dev signer failed' }, { status: 500 });
  }
}
