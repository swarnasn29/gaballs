// Verifies a Privy access token on the server, the way Privy's docs show without their server SDK
// (docs.privy.io/authentication/user-authentication/access-tokens): an ES256 JWT, issuer "privy.io", audience = our
// Privy app id, checked against the app's public verification key (Privy dashboard > Configuration > App settings).
// The key is public (not a secret); it lives in PRIVY_VERIFICATION_KEY as the PEM text the dashboard shows.

import 'server-only';

import { importSPKI, jwtVerify, type KeyLike } from 'jose';

import { PRIVY_APP_ID } from '@/config';

let key: Promise<KeyLike> | null = null;

function verificationKey(): Promise<KeyLike> | null {
  const pem = process.env.PRIVY_VERIFICATION_KEY?.replace(/\\n/g, '\n').trim();
  if (!pem || !PRIVY_APP_ID) return null;
  key ??= importSPKI(pem, 'ES256');
  return key;
}

export const privyAuthConfigured = () => verificationKey() !== null;

/** The Privy user id (`did:privy:…`) of a valid, unexpired access token; null if missing or invalid. */
export async function privyUserId(authorization: string | null): Promise<string | null> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const k = verificationKey();
  if (!token || !k) return null;
  try {
    const { payload } = await jwtVerify(token, await k, { issuer: 'privy.io', audience: PRIVY_APP_ID });
    return typeof payload.sub === 'string' && payload.sub.startsWith('did:privy:') ? payload.sub : null;
  } catch {
    return null;
  }
}
