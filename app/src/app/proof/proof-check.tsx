'use client';

// Verifies a pull's VRF proof with the browser's own crypto, against the OutLayer public key the machine was
// launched with (read live from get_machine). The same three checks the contract makes in on_vrf_result:
//   1. Ed25519 signature over `alpha`, 2. alpha names this machine's seed, 3. roll = SHA-256(SHA-256(sig) ++ [i]).

import { useEffect, useState } from 'react';

import { Stat } from '@/components/ui';
import { machine } from '@/near/contracts';

type Check = { label: string; ok: boolean | null; detail: string };

function fromHex(h: string): Uint8Array | null {
  if (!/^([0-9a-f]{2})*$/i.test(h)) return null;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as BufferSource));
}

async function verifyEd25519(pub: Uint8Array, sig: Uint8Array, msg: Uint8Array): Promise<boolean | null> {
  try {
    const key = await crypto.subtle.importKey('raw', pub as BufferSource, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, sig as BufferSource, msg as BufferSource);
  } catch {
    return null; // this browser has no Ed25519 in WebCrypto
  }
}

export function ProofCheck(p: {
  machine: string;
  alpha: string;
  signature: string;
  index: number;
  roll: number | null;
  tier: string;
  pullId: string;
}) {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const view = await machine(p.machine).get();
      const key = view.config.vrf?.pubkey_hex;
      if (!key) throw new Error(`${p.machine} has no VRF config (v1 machine: block randomness).`);
      const pub = fromHex(key);
      const sig = fromHex(p.signature);
      if (!pub || pub.length !== 32 || !sig || sig.length !== 64) throw new Error('Malformed key or signature.');
      const valid = await verifyEd25519(pub, sig, new TextEncoder().encode(p.alpha));
      const seedOk = /^vrf:\d+:[a-z0-9._-]+:/.test(p.alpha) && p.alpha.includes(`:${p.machine}-`);
      const output = await sha256(sig);
      const h = await sha256(new Uint8Array([...output, p.index]));
      const roll = Number(new DataView(h.buffer).getBigUint64(0) % 10_000n);
      if (!live) return;
      setPubkey(key);
      setChecks([
        {
          label: 'Signature',
          ok: valid,
          detail:
            valid === null
              ? 'This browser cannot check Ed25519 signatures; the contract already did (ed25519_verify).'
              : valid
                ? 'Valid Ed25519 signature over the alpha by OutLayer’s VRF key.'
                : 'Does NOT verify.',
        },
        {
          label: 'For this machine',
          ok: seedOk,
          detail: seedOk ? `The alpha ends in this machine’s request seed (${p.machine}-…).` : 'The alpha does not name this machine.',
        },
        {
          label: 'Roll',
          ok: p.roll === null ? null : roll === p.roll,
          detail: `SHA-256(SHA-256(signature) ++ [${p.index}]) → first 8 bytes mod 10,000 = ${roll}${
            p.roll === null ? '' : roll === p.roll ? ` = the contract’s roll (${p.tier})` : ` ≠ the contract’s roll ${p.roll}`
          }.`,
        },
      ]);
    })().catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [p.alpha, p.index, p.machine, p.roll, p.signature, p.tier]);

  if (!p.machine || !p.alpha || !p.signature) return <p>Missing proof parameters.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p>
        Pull #{p.pullId} on <strong>{p.machine}</strong>
        {p.tier && <> ({p.tier})</>}. The contract accepted this proof before opening the capsule; you can check it
        again here.
      </p>
      <dl className="grid grid-cols-1 gap-2">
        <Stat label="Alpha (what OutLayer signed)" value={<code className="break-all text-sm">{p.alpha}</code>} source={{ contract: p.machine, method: 'get_recent_pulls' }} />
        <Stat label="Signature" value={<code className="break-all text-xs">{p.signature}</code>} source={{ contract: p.machine, method: 'get_recent_pulls' }} />
        <Stat
          label="OutLayer VRF public key (fixed at launch)"
          value={<code className="break-all text-xs">{pubkey ?? '…'}</code>}
          source={{ href: 'https://testnet-api.outlayer.ai/vrf/pubkey', label: 'compare: OutLayer /vrf/pubkey' }}
        />
      </dl>
      {error && <p className="font-semibold text-bad">{error}</p>}
      <ul className="flex flex-col gap-2" aria-live="polite">
        {(checks ?? []).map((c) => (
          <li key={c.label} className="rounded-2xl bg-blush p-3">
            <span className={c.ok === false ? 'font-bold text-bad' : c.ok ? 'font-bold text-good' : 'font-bold text-plum'}>
              {c.ok === false ? '✗' : c.ok ? '✓' : '–'} {c.label}
            </span>
            <span className="block text-sm">{c.detail}</span>
          </li>
        ))}
        {!checks && !error && <li>Checking…</li>}
      </ul>
    </div>
  );
}
