// Phase 4 step 4 on testnet with the dev signer (buyer2, owner of machine:gball's deed): coin drip, collect, claim
// flight, live pull feed. Records a video. node scripts/verify-step4.mjs <outDir>
import { chromium } from '@playwright/test';
import { mkdirSync, renameSync } from 'node:fs';
const out = process.argv[2] ?? 'verify-step4';
const B = 'http://127.0.0.1:3000';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: out, size: { width: 1440, height: 900 } } });
const p = await ctx.newPage();
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));

const openPackTx = { receiverId: 'usdt.gaballs.testnet', actions: [{ type: 'FunctionCall', params: { methodName: 'ft_transfer_call', args: { receiver_id: 'gball.gaballs.testnet', amount: '10000000', msg: JSON.stringify({ action: 'open_pack', count: 1 }) }, gas: '300000000000000', deposit: '1' } }] };

// 1. Deed card
await p.goto(`${B}/me`, { waitUntil: 'networkidle' });
await p.getByText('Machine deed · NFT').first().waitFor({ timeout: 60000 });
await p.waitForTimeout(2500);
const deed = p.locator('li', { hasText: 'Machine deed' }).first();
await deed.scrollIntoViewIfNeeded();
await p.screenshot({ path: `${out}/1-deed.png` });
log('deed shown: ' + (await deed.innerText()).replace(/\s+/g, ' ').slice(0, 160));

// 2. A pack happens in the background -> fees grow -> coins drip (page polls every 8 s)
const stillBefore = await deed.locator('dd').nth(1).innerText();
const r = await p.evaluate(async (tx) => (await fetch('/api/dev-signer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions: [tx] }) })).json(), openPackTx);
log('background pack tx: ' + (r.outcomes?.[0]?.transaction?.hash ?? r.error));
for (let i = 0; i < 40; i++) {
  if ((await deed.locator('dd').nth(1).innerText()) !== stillBefore) break;
  await p.waitForTimeout(300);
}
await p.waitForTimeout(350);
await p.screenshot({ path: `${out}/2-drip.png` });
log(`fees in machine: ${stillBefore} -> ${await deed.locator('dd').nth(1).innerText()}`);
await p.waitForTimeout(1500);

// 3. Collect into deed (sweep_fees), then Claim -> coins fly to the wallet button
await deed.getByRole('button', { name: 'Collect into deed' }).click();
await p.getByText(/Collect fees: done|did not/).waitFor({ timeout: 90000 });
await p.waitForTimeout(9000); // let the page poll the new balances
await p.screenshot({ path: `${out}/3-collected.png` });
log('after collect: ' + (await deed.innerText()).replace(/\s+/g, ' ').slice(0, 160));
const claimBtn = deed.getByRole('button', { name: /^Claim/ });
log('claim button: ' + (await claimBtn.innerText()));
await claimBtn.click();
await p.getByText(/Claim: done|did not/).waitFor({ timeout: 90000 });
await p.waitForTimeout(450);
await p.screenshot({ path: `${out}/4-claim-flight.png` });
log('claim result: ' + (await p.getByText(/Claim: done|did not/).first().innerText()));
const claimTx = await p.locator('a', { hasText: 'View transaction' }).first().getAttribute('href').catch(() => null);
log('claim tx: ' + claimTx);
await p.waitForTimeout(2000);

// 4. Machine page: open a pack with the button; the pull slides into the live feed with a "You" badge
await p.goto(`${B}/machine/gball.gaballs.testnet`, { waitUntil: 'networkidle' });
await p.getByRole('button', { name: /^Open 1 pack$/ }).waitFor({ timeout: 60000 });
await p.waitForTimeout(3000);
await p.getByRole('button', { name: /^Open 1 pack$/ }).click();
await p.getByRole('button', { name: /Tap to open capsule/ }).waitFor({ timeout: 120000 });
await p.getByRole('button', { name: /Tap to open capsule/ }).click({ force: true });
await p.waitForTimeout(1500);
await p.getByRole('button', { name: /^Done$/ }).click();
const feed = p.getByRole('heading', { name: /Live pulls/ });
await feed.scrollIntoViewIfNeeded();
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/5-feed.png` });
log('feed top row: ' + (await p.locator('ul[aria-live] li').first().innerText()).replace(/\s+/g, ' '));

const video = p.video();
await ctx.close();
renameSync(await video.path(), `${out}/step4.webm`);
await b.close();
console.log(errs.length ? 'page errors: ' + errs.slice(0, 3).join(' | ') : 'no page errors');
