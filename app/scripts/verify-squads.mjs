// Squads UI on testnet with the dev signer (npm run dev:signer, buyer1 = a member of the demo squad): the squad page at
// 390 and 1440 px, then a proposal made and approved through the UI ("Open 1 pack"), left at 1 of 2 approvals for the
// next member's vote.   node scripts/verify-squads.mjs <outDir> [dao]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'verify-squads';
const dao = process.argv[3] ?? 'gaballs-squad.sputnikv2.testnet';
const B = 'http://127.0.0.1:3000';
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
const errs = [];

const b = await chromium.launch();
async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

// 1. The squad page, both widths.
for (const [w, h, m] of [[390, 844, true], [1440, 900, false]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: m, hasTouch: m, deviceScaleFactor: m ? 2 : 1 });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${B}/squads/${dao}`, { waitUntil: 'networkidle' });
  await p.getByText(/approve$/).first().waitFor({ timeout: 60000 });
  await p.getByText('Mock USDT').first().waitFor({ timeout: 60000 });
  await p.waitForTimeout(4000);
  await shot(p, `squad-${w}`);
  await p.close();
}
log('squad page shots saved');

// 2. Propose "Open 1 pack" and approve it, through the UI (desktop).
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${B}/squads/${dao}`, { waitUntil: 'networkidle' });
await p.getByRole('tab', { name: 'Open packs' }).click();
await p.getByRole('button', { name: '1', exact: true }).last().click();
await p.getByRole('button', { name: /^Propose: open 1 pack$/ }).click();
const result = p.locator('p.text-good, p.text-bad').filter({ hasText: /proposed|Cancelled|not allowed|error|failed/i }).first();
await result.waitFor({ timeout: 120000 });
log(`propose: ${await result.innerText()}`);
await p.waitForTimeout(6000);
const approve = p.getByRole('button', { name: /^Approve( & execute)?$/ }).first();
await approve.waitFor({ timeout: 60000 });
log(`button: ${await approve.innerText()}`);
await approve.click();
await p.getByText('View your vote transaction').first().waitFor({ timeout: 120000 });
const tx = await p.getByText('View your vote transaction').first().getAttribute('href');
log(`approved by buyer1: ${tx}`);
await p.waitForTimeout(6000);
await shot(p, 'squad-after-vote-1440');
await p.close();

// 3. The Squads index with the Squads tab.
for (const [w, h, m] of [[390, 844, true], [1440, 900, false]]) {
  const q = await b.newPage({ viewport: { width: w, height: h }, isMobile: m, hasTouch: m, deviceScaleFactor: m ? 2 : 1 });
  await q.goto(`${B}/squads`, { waitUntil: 'networkidle' });
  await q.getByText('Create a squad').waitFor({ timeout: 60000 });
  await shot(q, `index-${w}`);
  await q.close();
}
await b.close();
log(errs.length ? `page errors: ${[...new Set(errs)].join(' | ')}` : 'no page errors');
