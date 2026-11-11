// Screenshots of the launch pop-up states (dev preview page with fake data). node scripts/launch-shots.mjs <outDir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'launch-shots';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
for (const [tag, vp, dpr] of [['1440', { width: 1440, height: 900 }, 1], ['390', { width: 390, height: 844 }, 2]]) {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: dpr });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  for (const state of ['building', 'live', 'failed']) {
    await p.goto(`http://localhost:3000/dev/launch?state=${state}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(state === 'building' ? 1800 : 1400);
    await p.screenshot({ path: `${out}/${state}-${tag}.png` });
  }
  console.log(tag, errs.length ? errs.slice(0, 3) : 'no page errors');
  await p.close();
}
await b.close();
