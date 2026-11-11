// Screenshots of the reveal pop-up for every tier (dev preview page with fake data). node scripts/reveal-shots.mjs <outDir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'reveal-shots';
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
for (const [tag, vp, dpr] of [['1440', { width: 1440, height: 900 }, 1], ['390', { width: 390, height: 844 }, 2]]) {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: dpr });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  for (const tier of ['Common', 'Rare', 'Epic', 'Mythic']) {
    await p.goto(`http://localhost:3000/dev/reveal?tier=${tier}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(700);
    if (tier === 'Common') await p.screenshot({ path: `${out}/closed-${tag}.png` });
    await p.getByRole('button', { name: /Tap to open capsule/ }).click({ force: true });
    await p.waitForTimeout(tier === 'Mythic' ? 1300 : 1500);
    await p.screenshot({ path: `${out}/${tier.toLowerCase()}-${tag}.png` });
  }
  await p.goto('http://localhost:3000/dev/reveal?tier=Rare,Common,Epic', { waitUntil: 'networkidle' });
  for (let k = 0; k < 3; k++) {
    await p.getByRole('button', { name: /Tap to open capsule/ }).click({ force: true });
    await p.waitForTimeout(900);
    await p.getByRole('button', { name: /Next capsule|See all/ }).click();
    await p.waitForTimeout(400);
  }
  await p.screenshot({ path: `${out}/summary-${tag}.png` });
  console.log(tag, 'done', errs.length ? errs.slice(0, 3) : 'no page errors');
  await p.close();
}
await b.close();
