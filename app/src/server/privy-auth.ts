// Verifies a Privy access token on the server, the way Privy's docs show without their server SDK
// (docs.privy.io/authentication/user-authentication/access-tokens): an ES256 JWT, issuer "privy.io", audience = our
// Privy app id, signed by one of the app's public keys.
//
// Where the public key comes from:
//  - PRIVY_VERIFICATION_KEY, if set: the PEM "verification key" from the Privy dashboard (or just its base64 body);
//  - otherwise the app's public key set that Privy's auth server publishes for every app,
//    https://auth.privy.io/api/v1/apps/<app id>/jwks.json (ES256, P-256; checked 2026-11-13). jose fetches it, caches
//    it and picks the key by the token's `kid`, so Privy can rotate keys without a redeploy.
// Both are public keys, not secrets.

import 'server-only';

import { createRemoteJWKSet, importSPKI, jwtVerify, type JWTVerifyGetKey, type KeyLike } from 'jose';

import { PRIVY_APP_ID } from '@/config';

/** The key as PEM. Accepts the dashboard's PEM (real or `\n`-escaped line breaks) or just its base64 body. */
function pemFromEnv(): string | null {
  const raw = process.env.PRIVY_VERIFICATION_KEY?.replace(/\\n/g, '\n').replace(/^["']|["']$/g, '').trim();
  if (!raw) return null;
  if (raw.includes('-----BEGIN')) return raw;
  const body = raw.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]{60,}$/.test(body)) return null; // too short to be a key (e.g. the app id pasted by mistake)
  return `-----BEGIN PUBLIC KEY-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
}

let pemKey: Promise<KeyLike> | null = null;
let jwks: JWTVerifyGetKey | null = null;

function keySource(): { pem: Promise<KeyLike> } | { jwks: JWTVerifyGetKey } | null {
  if (!PRIVY_APP_ID) return null;
  const pem = pemFromEnv();
  if (pem) return { pem: (pemKey ??= importSPKI(pem, 'ES256')) };
  jwks ??= createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${encodeURIComponent(PRIVY_APP_ID)}/jwks.json`));
  return { jwks };
}

/** The Privy user id (`did:privy:…`) of a valid, unexpired access token; null if missing or invalid. */
export async function privyUserId(authorization: string | null): Promise<string | null> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const src = keySource();
  if (!token || !src) return null;
  const options = { issuer: 'privy.io', audience: PRIVY_APP_ID, algorithms: ['ES256'] };
  try {
    const { payload } = 'pem' in src ? await jwtVerify(token, await src.pem, options) : await jwtVerify(token, src.jwks, options);
    return typeof payload.sub === 'string' && payload.sub.startsWith('did:privy:') ? payload.sub : null;
  } catch {
    return null;
  }
}
