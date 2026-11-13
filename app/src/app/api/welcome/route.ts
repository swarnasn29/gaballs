// Welcome kit API. GET: is the kit on, and its limits. POST {accountId}: send the kit once (see src/server/welcome.ts).
// Google/email players send their Privy access token as `Authorization: Bearer <token>`; it is verified here
// (src/server/privy-auth.ts) and the kit is limited to one per Privy user.

import { privyUserId } from '@/server/privy-auth';
import { KitError, clientIp, kitStatus, sendKit } from '@/server/welcome';

export async function GET() {
  return Response.json(await kitStatus(), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  if (!(req.headers.get('content-type') ?? '').startsWith('application/json'))
    return Response.json({ error: 'JSON only' }, { status: 415 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Request body is not valid JSON' }, { status: 400 });
  }
  const accountId = (body as { accountId?: unknown } | null)?.accountId;
  if (typeof accountId !== 'string') return Response.json({ error: 'accountId missing' }, { status: 400 });
  try {
    const user = await privyUserId(req.headers.get('authorization'));
    return Response.json(await sendKit(accountId.toLowerCase(), clientIp(req), user));
  } catch (e) {
    if (e instanceof KitError) return Response.json({ error: e.message }, { status: e.status });
    console.error('welcome kit failed', e instanceof Error ? e.message : e);
    return Response.json({ error: 'The welcome kit failed. Try again in a minute.' }, { status: 500 });
  }
}
