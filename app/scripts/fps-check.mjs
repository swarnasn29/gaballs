// FPS of the 3D machine (dev server with DEV_SIGNER=1 serves /dev/machine). Desktop: high quality. Phone: 390px,
// touch, low quality, CPU throttled 4x via DevTools to approximate a mid-range phone. Idle and pending (tumbling).
//   node scripts/fps-check.mjs [baseUrl]
import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const cases = [
  { name: 'desktop 1440 high', ctx: { viewport: { width: 1440, height: 900 } }, q: 'high', throttle: 1 },
  { name: 'phone 390 low, CPU 4x slower', ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, q: 'low', throttle: 4 },
];
for (const c of cases) {
  for (const phase of ['idle', 'pending']) {
    const ctx = await browser.newContext(c.ctx);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: c.throttle });
    await page.goto(`${base}/dev/machine?view=default&quality=${c.q}&pct=97&phase=${phase}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    const samples = [];
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(1000);
      samples.push(Number(await page.evaluate(() => document.querySelector('[data-fps]')?.dataset.fps ?? 0)));
    }
    const avg = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
    console.log(`${c.name.padEnd(30)} ${phase.padEnd(8)} avg ${avg} fps, min ${Math.min(...samples)} (${samples.join(' ')})`);
    await ctx.close();
  }
}
await browser.close();
