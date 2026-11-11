// Records a real testnet pull on the machine page: idle → drag crank a full turn → wobble while pending →
// capsule drops after the contract's pack_opened result. Needs `npm run dev:signer` (dev signer as buyer1).
//   node scripts/record-pull.mjs <desktop|phone> [baseUrl] [outDir]
import { chromium } from '@playwright/test';
import { mkdirSync, renameSync } from 'node:fs';

const kind = process.argv[2] ?? 'desktop';
const base = process.argv[3] ?? 'http://127.0.0.1:3000';
const out = process.argv[4] ?? 'recordings';
const machine = process.env.MACHINE_ID ?? 'gaballs.gaballs.testnet';
mkdirSync(out, { recursive: true });

const phone = kind === 'phone';
const viewport = phone ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({
  viewport,
  deviceScaleFactor: phone ? 2 : 1,
  isMobile: phone,
  hasTouch: phone,
  recordVideo: { dir: out, size: viewport },
});
const page = await ctx.newPage();
const t0 = Date.now();
const consoleNotes = [];
page.on('console', (m) => (m.type() === 'warning' || m.type() === 'error') && consoleNotes.push(m.text().slice(0, 160)));
page.on('pageerror', (e) => consoleNotes.push(`pageerror: ${e.message.slice(0, 160)}`));
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);

await page.goto(`${base}/machine/${machine}`, { waitUntil: 'networkidle' });
const stage = page.locator('[data-crank-x]');
await stage.waitFor({ timeout: 60000 });
await stage.scrollIntoViewIfNeeded();
await page.waitForTimeout(3500); // idle: balls settle, machine breathes
log('idle');

const fps = [];
const sample = setInterval(async () => {
  const v = await page.evaluate(() => document.querySelector('[data-fps]')?.dataset.fps).catch(() => null);
  if (v) fps.push(Number(v));
}, 1000);

// Drag the crank one full turn (plus a little), clockwise, around its on-screen centre.
const { cx, cy } = await stage.evaluate((el) => ({ cx: Number(el.dataset.crankX), cy: Number(el.dataset.crankY) }));
const r = phone ? 22 : 34;
await page.mouse.move(cx + r, cy);
await page.mouse.down();
for (let i = 1; i <= 44; i++) {
  const a = (i / 40) * Math.PI * 2;
  await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  await page.waitForTimeout(22);
}
await page.mouse.up();
log('crank turned');
await page.waitForTimeout(1800);
await page.screenshot({ path: `${out}/${kind}-pending.png` });
log('pending still saved');

// Phase 5: after the wallet returns, the machine keeps wobbling while the VRF proof is on its way (~1 minute).
await page.locator('text=/verifiable randomness proof from OutLayer|Still waiting for the randomness/').first().waitFor({ timeout: 120000 }).catch(() => {});
await page.screenshot({ path: `${out}/${kind}-waiting-for-vrf.png` });
log('waiting-for-VRF still saved');

// The result comes from the contract; wait for it (or a failure/refund message). Up to the 5-minute VRF timeout.
// (Not matching on 'randomness proof': the waiting message contains those words too.)
const done = page.locator('text=/View transaction on nearblocks|did not go through|refunded|cancelled|Get my USDT back/i').first();
await done.waitFor({ timeout: 360000 });
log('result shown');
await page.waitForTimeout(3000);
const link = await page.locator('a', { hasText: 'View transaction on nearblocks' }).first().getAttribute('href').catch(() => null);
const proof = await page.locator('a', { hasText: 'Verifiable randomness proof' }).first().getAttribute('href').catch(() => null);
const tiers = await page.locator('[aria-live] strong').allInnerTexts().catch(() => []);
const contextLost = await page.evaluate(() => document.querySelector('[data-context-lost]')?.dataset.contextLost ?? '0');
clearInterval(sample);
await page.screenshot({ path: `${out}/${kind}-after.png` });

const video = page.video();
await ctx.close();
const file = `${out}/pull-${kind}.webm`;
renameSync(await video.path(), file);
await browser.close();

const avg = fps.length ? Math.round(fps.reduce((a, b) => a + b, 0) / fps.length) : 0;
console.log(JSON.stringify({ kind, video: file, tx: link, proof, tiers, contextLost, fps: { avg, min: Math.min(...fps), samples: fps.length } }));
if (consoleNotes.length) console.log('console:', [...new Set(consoleNotes)].slice(0, 8));
