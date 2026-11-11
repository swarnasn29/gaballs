// Smart 2D/3D default on phones (Phase 5): which machine does each emulated phone get, and does the frame-rate guard
// switch to 2D when 3D gets too slow? Fresh browser storage per profile.
//   node scripts/mode-check.mjs [baseUrl] [outDir]
// Profiles: memory/cores are what the phone reports (navigator.deviceMemory / hardwareConcurrency); `cpu` is Chrome's
// CPU slowdown factor standing in for a slower phone CPU.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? 'mode-check';
const machineId = process.env.MACHINE_ID ?? 'gumball.gaballs.testnet';
mkdirSync(out, { recursive: true });

const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true };
const profiles = [
  { name: 'mid-range', memory: 4, cores: 8, cpu: 2, expect: '3D' },
  { name: 'low-end', memory: 2, cores: 4, cpu: 6, expect: '2D' },
  { name: 'mid-range hints, very slow in practice', memory: 4, cores: 8, cpu: 40, expect: '2D' },
];

// GPU on (as on a real phone); without these flags headless Chrome renders WebGL in software.
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const results = [];
const pillText = (page) => page.locator('text=/^(3D|2D) machine/').first().innerText().catch(() => '?');

for (const p of profiles) {
  const ctx = await browser.newContext(PHONE);
  await ctx.addInitScript(([memory, cores]) => {
    Object.defineProperty(navigator, 'deviceMemory', { get: () => memory });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cores });
  }, [p.memory, p.cores]);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
  await page.goto(`${base}/machine/${machineId}`, { waitUntil: 'load', timeout: 120_000 });
  await page.getByText(/^(3D|2D) machine/).first().waitFor({ timeout: 90_000 });
  // Long enough for the 3D chunk to load, the warm-up second and the 1-second probe.
  await page.waitForTimeout(9_000);
  // Slow profiles take longer to load the 3D engine and finish the probe: give the expected switch up to 45 s more.
  let pill = await pillText(page);
  for (let i = 0; i < 45 && p.expect === '2D' && pill.startsWith('3D'); i++) {
    await page.waitForTimeout(1_000);
    pill = await pillText(page);
  }
  const notice = await page.getByRole('status').first().innerText().catch(() => '');
  const fps = await page.evaluate(() => document.querySelector('[data-fps]')?.getAttribute('data-fps') ?? null);
  await page.getByText(/^(3D|2D) machine/).first().scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${out}/${p.name.replace(/\W+/g, '-')}.png` });
  const mode = pill.startsWith('3D') ? '3D' : pill.startsWith('2D') ? '2D' : '?';
  results.push({ profile: p.name, memory: p.memory, cores: p.cores, cpu: `${p.cpu}x`, mode, pill, fps, notice, ok: mode === p.expect });
  await ctx.close();
}

// Runtime guard: a mid-range phone passes the probe in 3D, then slows down hard mid-session.
{
  const ctx = await browser.newContext(PHONE);
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 4 });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 });
  await page.goto(`${base}/machine/${machineId}`, { waitUntil: 'load', timeout: 120_000 });
  await page.getByText(/^(3D|2D) machine/).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(9_000);
  const before = await pillText(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 40 });
  let after = before;
  for (let i = 0; i < 30 && after.startsWith('3D'); i++) {
    await page.waitForTimeout(1_000);
    after = await pillText(page);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.waitForTimeout(500);
  const notice = await page.getByRole('status').first().innerText().catch(() => '');
  await page.getByRole('status').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${out}/runtime-drop.png` });
  results.push({ profile: 'mid-range, then 40x slowdown mid-session', mode: `${before.slice(0, 2)} → ${after.slice(0, 2)}`, notice, ok: before.startsWith('3D') && after.startsWith('2D') && !!notice });
  await ctx.close();
}

await browser.close();
console.table(results.map((r) => ({ ...r, pill: undefined })));
process.exit(results.every((r) => r.ok) ? 0 : 1);
