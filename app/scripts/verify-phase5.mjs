// Phase 5 UI check on testnet with the dev signer (npm run dev:signer, buyer1): sell panel quote → confirmed sale, and
// the VRF proof page for the machine's latest pull. Screenshots at 390 and 1440 px.
//   node scripts/verify-phase5.mjs <outDir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'verify-phase5';
const B = 'http://127.0.0.1:3000';
const machineId = process.env.MACHINE_ID ?? 'gumball.gaballs.testnet';
const symbol = process.env.SYMBOL ?? 'GUMBALL';
mkdirSync(out, { recursive: true });
const log = (m) => console.log(m);
const errs = [];

const b = await chromium.launch();

// 1. Sell panel at phone width: quote, then the confirmed sale.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${B}/me`, { waitUntil: 'networkidle' });
  const row = p.locator('li', { hasText: `$${symbol}` }).first();
  await row.waitFor({ timeout: 60000 });
  const held = await row.locator('.tabular-nums').first().innerText();
  await row.getByRole('button', { name: 'Sell' }).click();
  await row.getByRole('button', { name: '25%' }).click();
  const confirm = row.getByRole('button', { name: /^Sell .* for \$\d/ });
  await confirm.waitFor({ timeout: 30000 });
  await row.scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${out}/sell-quote-390.png`, fullPage: false });
  const label = await confirm.innerText();
  log(`holding ${held} ${symbol}; quote button: "${label}"`);
  await confirm.click();
  await p.getByText(/Sell: done|Sell did not/).waitFor({ timeout: 120000 });
  const result = await p.getByText(/Sell: done|Sell did not/).first().innerText();
  const tx = await p.locator('a', { hasText: 'View transaction' }).first().getAttribute('href').catch(() => null);
  await p.waitForTimeout(9000); // balances refresh
  await p.screenshot({ path: `${out}/sell-done-390.png` });
  log(`sell result: ${result} ${tx ?? ''}`);
  await ctx.close();
}

// 2. Proof page for the latest pull, at both widths.
const pulls = await fetch('https://test.rpc.fastnear.com', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'query',
    params: { request_type: 'call_function', finality: 'final', account_id: machineId, method_name: 'get_recent_pulls', args_base64: btoa('{}') },
  }),
}).then((r) => r.json()).then((j) => JSON.parse(Buffer.from(j.result.result).toString()));
const latest = pulls[0];
const index = pulls.filter((x) => x.request_id === latest.request_id).length - 1; // newest is last within its request
const q = new URLSearchParams({ machine: machineId, alpha: latest.vrf_alpha, sig: latest.vrf_signature, i: String(index), roll: String(latest.roll), tier: latest.tier, pull: String(latest.pull_id) });
for (const [w, h] of [[390, 844], [1440, 900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${B}/proof?${q}`, { waitUntil: 'networkidle' });
  await p.getByText(/✓ Roll|✗ Roll|– Roll/).waitFor({ timeout: 30000 });
  await p.screenshot({ path: `${out}/proof-${w}.png`, fullPage: true });
  const checks = await p.locator('li').allInnerTexts();
  if (w === 1440) log(`proof page for pull #${latest.pull_id} (${latest.tier}, roll ${latest.roll}):\n  ${checks.join('\n  ').replace(/\n(?!  )/g, ' — ')}`);
  await p.close();
}

await b.close();
log(errs.length ? `page errors: ${errs.join(' | ')}` : 'no page errors');
