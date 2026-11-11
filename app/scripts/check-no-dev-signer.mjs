// Runs after `next build` (see package.json "build"), including on Vercel. Fails the build if ANY trace of the
// dev test signer made it into the output: its route, its banner, its env switch or the credentials path.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Strings that exist only in the real dev signer code (route.dev.ts, dev-signer-client.dev.tsx), never in the stub.
const MARKERS = ['/api/dev-signer', 'near-credentials', 'DEV SIGNER', 'local testing only', 'dev-signer-client', 'fake data, not a real pull'];
// CHECK_DIR lets you point the scan at `next dev` output to prove the markers are detected.
const OUT = process.env.CHECK_DIR ?? '.next';
const SKIP_DIRS = process.env.CHECK_DIR ? new Set() : new Set(['cache', 'dev']); // not deployed

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* files(p);
    } else if (/\.(js|mjs|cjs|json|html|rsc|txt|map|body|meta)$/.test(name)) {
      yield p;
    }
  }
}

let scanned = 0;
const hits = [];
for (const f of files(OUT)) {
  scanned++;
  const text = readFileSync(f, 'utf8');
  for (const m of MARKERS) if (text.includes(m)) hits.push(`${f}: "${m}"`);
}
if (scanned === 0) {
  console.error('check-no-dev-signer: no build output found in .next — run `next build` first');
  process.exit(1);
}
if (hits.length) {
  console.error(`check-no-dev-signer: FAILED — dev signer code found in the production build:\n- ${hits.join('\n- ')}`);
  process.exit(1);
}
console.log(`check-no-dev-signer: OK — scanned ${scanned} build files, no dev signer code`);
