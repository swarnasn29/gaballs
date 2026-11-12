// Welcome kit API. GET: is the kit on, and its limits. POST {accountId}: send the kit once (see src/server/welcome.ts).

import { KitError, clientIp, kitStatus, sendKit } from '@/server/welcome';

export async function GET() {
  return Response.json(await kitStatus(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  if (!(req.headers.get('content-type') ?? '').startsWith('application/json'))
    return Response.json({ error: 'JSON only' }, { status: 415 });
  try {
    const { accountId } = (await req.json()) as { accountId?: unknown };
    if (typeof accountId !== 'string') return Response.json({ error: 'accountId missing' }, { status: 400 });
    return Response.json(await sendKit(accountId.toLowerCase(), clientIp(req)));
  } catch (e) {
    if (e instanceof KitError) return Response.json({ error: e.message }, { status: e.status });
    console.error('welcome kit failed', e instanceof Error ? e.message : e);
    return Response.json({ error: 'The welcome kit failed. Try again in a minute.' }, { status: 500 });
  }
}
