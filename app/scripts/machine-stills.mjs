// Still renders of the 3D machine from three angles (dev server with DEV_SIGNER=1 serves /dev/machine).
//   node scripts/machine-stills.mjs [baseUrl] [outDir] [extraQuery]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const out = process.argv[3] ?? 'stills';
const extra = process.argv[4] ?? '';
mkdirSync(out, { recursive: true });

// Real GPU via ANGLE/D3D11 on Windows (falls back to software if unavailable — the renderer is printed).
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 1200 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

for (const view of ['front', 'three-quarter', 'closeup']) {
  await page.goto(`${base}/dev/machine?view=${view}${extra}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 60000 });
  await page.waitForTimeout(4500); // let the gumballs settle and the camera ease in
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const gl = c?.getContext('webgl2');
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    return { fps: c?.parentElement?.dataset.fps, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown' };
  });
  await page.screenshot({ path: `${out}/${view}.png` });
  console.log(`${view}.png fps=${info.fps} renderer=${info.renderer}`);
}
if (errors.length) console.log('errors:', [...new Set(errors)].slice(0, 5));
await browser.close();
