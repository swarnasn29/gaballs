// Pending-pull UX on testnet with the dev signer (npm run dev:signer, buyer1): waiting state, survives a reload,
// "Ready to open!" in My stuff and on the machine page once settled, reveal on open; plus the legacy machine section
// and the dev preview of every pending state.   node scripts/verify-pending.mjs <outDir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'verify-pending';
const B = 'http://127.0.0.1:3000';
const machineId = process.env.MACHINE_ID ?? 'gaballs.gaballs.testnet';
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
const errs = [];
const FAIR = 'This minute is what makes the result provably fair.';

const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const desk = await b.newContext({ viewport: { width: 1440, height: 900 } });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const phone = await b.newContext(PHONE);
const p = await desk.newPage();
p.on('pageerror', (e) => errs.push(e.message));

const resumeReady = process.env.RESUME_READY === '1';
if (resumeReady) {
  // A pull already settled for buyer1: mark it as tracked in this fresh browser (same as having paid here).
  await p.goto(`${B}/`, { waitUntil: 'networkidle' });
  await p.evaluate(([acct, m, id]) => {
    localStorage.setItem('gaballs:pulls', JSON.stringify({ [acct]: { [m]: { tracked: [Number(id)], opened: [] } } }));
  }, ['buyer1.gaballs.testnet', machineId, process.env.REQUEST_ID]);
}

// 1. Legacy section on the home page.
if (!resumeReady) {
await p.goto(`${B}/`, { waitUntil: 'networkidle' });
const legacy = p.locator('summary', { hasText: 'Legacy (v1, block randomness)' });
await legacy.waitFor({ timeout: 60000 });
await p.screenshot({ path: `${out}/home-legacy-collapsed-1440.png`, fullPage: true });
await legacy.click();
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/home-legacy-open-1440.png`, fullPage: true });
{
  const ph = await phone.newPage();
  await ph.goto(`${B}/`, { waitUntil: 'networkidle' });
  await ph.locator('summary', { hasText: 'Legacy' }).waitFor({ timeout: 60000 });
  await ph.screenshot({ path: `${out}/home-legacy-collapsed-390.png`, fullPage: true });
  await ph.close();
}
log('legacy section shots saved');

// 2. Dev preview of every pending state (fake data, dev only).
await p.goto(`${B}/dev/pending`, { waitUntil: 'networkidle' });
await p.getByText('No randomness proof arrived in time').waitFor({ timeout: 30000 });
await p.screenshot({ path: `${out}/preview-states-1440.png`, fullPage: true });
{
  const ph = await phone.newPage();
  await ph.goto(`${B}/dev/pending`, { waitUntil: 'networkidle' });
  await ph.getByText('No randomness proof arrived in time').waitFor({ timeout: 30000 });
  await ph.screenshot({ path: `${out}/preview-states-390.png`, fullPage: true });
  await ph.close();
}
log('preview shots saved');

// 3. A real pull: waiting state, then a reload while waiting.
await p.goto(`${B}/machine/${machineId}`, { waitUntil: 'networkidle' });
await p.getByRole('button', { name: /^Open 1 pack$/ }).click();
log('pull started');
await p.getByText(FAIR).waitFor({ timeout: 120000 });
log('paid; generating randomness');
await p.waitForTimeout(12000);
await p.getByText(FAIR).scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/waiting-1440.png` });
await p.reload({ waitUntil: 'networkidle' });
await p.getByText(FAIR).waitFor({ timeout: 60000 });
await p.waitForTimeout(3000);
await p.getByText(FAIR).scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/waiting-after-reload-1440.png` });
log('still waiting after a reload (read from the contract)');

// 4. Leave for My stuff while it settles.
await p.goto(`${B}/me`, { waitUntil: 'networkidle' });
await p.getByText('Your pulls').waitFor({ timeout: 60000 });
await p.getByText('Your pulls').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/me-waiting-1440.png` });
log('My stuff shows the waiting pull');
} else {
  await p.goto(`${B}/me`, { waitUntil: 'networkidle' });
}
await p.getByText('Ready to open!').first().waitFor({ timeout: 360000 });
await p.getByText('Your pulls').scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/me-ready-1440.png` });
log('settled: Ready to open! on My stuff');
{
  // "Ready to open" is remembered per browser (which requests this player paid for here), so the phone view shares
  // the desktop session's storage.
  const shared = await b.newContext({ ...PHONE, storageState: await desk.storageState() });
  const ph = await shared.newPage();
  await ph.goto(`${B}/me`, { waitUntil: 'networkidle' });
  await ph.getByText('Ready to open!').first().waitFor({ timeout: 60000 });
  await ph.getByText('Your pulls').scrollIntoViewIfNeeded();
  await ph.screenshot({ path: `${out}/me-ready-390.png` });
  await shared.close();
}

// 5. Machine page: ready card → open → capsule → reveal.
await p.goto(`${B}/machine/${machineId}`, { waitUntil: 'networkidle' });
await p.getByText('Ready to open!').first().waitFor({ timeout: 60000 });
await p.getByText('Ready to open!').first().scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/machine-ready-1440.png` });
await p.getByRole('button', { name: /^Open (it|them)$/ }).click();
await p.getByText(/Your capsule is here!|Capsule 1 of/).waitFor({ timeout: 30000 });
await p.screenshot({ path: `${out}/machine-capsule-1440.png` });
await p.getByRole('button', { name: /Tap to open capsule/ }).click({ force: true }); // it bobs, by design
await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/machine-reveal-1440.png` });
const tier = await p.locator('#reveal-title').innerText().catch(() => '?');
log(`revealed: ${tier}`);

// 6. Opened: the badge is gone after a reload.
await p.keyboard.press('Escape');
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(9000);
const stillReady = await p.getByText('Ready to open!').count();
log(`after opening and reloading, "Ready to open!" shown: ${stillReady > 0}`);

await b.close();
log(errs.length ? `page errors: ${[...new Set(errs)].join(' | ')}` : 'no page errors');
process.exit(stillReady > 0 ? 1 : 0);
