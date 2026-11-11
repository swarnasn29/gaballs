// Screenshots of every screen at phone (390px) and desktop (1440px) widths, with checks that the page is really
// styled. Exits non-zero (and still writes the screenshot) if any check fails.
//   node scripts/screens.mjs [baseUrl] [outDir]
// Default: http://localhost:3000 → ./screens
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const out = process.argv[3] ?? 'screens';
const machineId = process.env.MACHINE_ID ?? 'gball.gaballs.testnet';
mkdirSync(out, { recursive: true });

const pages = [
  { name: 'home', path: '/' },
  { name: 'machine', path: `/machine/${machineId}` },
  { name: 'launch', path: '/launch' },
  { name: 'me', path: '/me' },
  { name: 'source', path: `/raw?contract=${machineId}&method=get_odds&args=%7B%7D` },
];
const widths = [
  { tag: '390', viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 },
  { tag: '1440', viewport: { width: 1440, height: 900 }, isMobile: false, deviceScaleFactor: 1 },
];

const problems = [];
const browser = await chromium.launch();
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: w.viewport, isMobile: w.isMobile, deviceScaleFactor: w.deviceScaleFactor });
  const page = await ctx.newPage();
  let current = '';
  page.on('pageerror', (e) => problems.push(`${current}: page error: ${e.message}`));
  page.on('response', (r) => {
    const t = r.request().resourceType();
    if ((t === 'stylesheet' || t === 'script' || t === 'font') && r.status() >= 400) {
      problems.push(`${current}: ${t} ${r.status()} ${r.url()}`);
    }
  });

  for (const p of pages) {
    current = `${p.name}-${w.tag}`;
    await page.goto(base + p.path, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    // Is the page actually styled? (catches a missing/stale stylesheet)
    const check = await page.evaluate(() => {
      const h = document.querySelector('h1');
      const sheets = [...document.styleSheets].reduce((n, s) => {
        try {
          return n + s.cssRules.length;
        } catch {
          return n;
        }
      }, 0);
      const sky = document.querySelector('[aria-hidden] > div');
      return {
        headingFont: h ? getComputedStyle(h).fontFamily : '(no h1)',
        bodyBg: getComputedStyle(document.body).backgroundColor,
        cssRules: sheets,
        skyPosition: sky ? getComputedStyle(sky.parentElement).position : '(none)',
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        // Cards that touch or cross the viewport edge (should keep the 16px side gutter).
        edgeCards: [...document.querySelectorAll('main section')]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.width > 0 && (r.left < 8 || r.right > window.innerWidth - 8)).length,
      };
    });
    if (check.cssRules < 50) problems.push(`${current}: only ${check.cssRules} CSS rules loaded (stylesheet missing?)`);
    if (!/fredoka/i.test(check.headingFont)) problems.push(`${current}: heading font is "${check.headingFont}", expected Fredoka`);
    if (/rgba?\(255, 255, 255/.test(check.bodyBg) || check.bodyBg === 'rgba(0, 0, 0, 0)')
      problems.push(`${current}: body background is ${check.bodyBg}`);
    if (check.skyPosition !== 'fixed') problems.push(`${current}: decorations layer is ${check.skyPosition}, expected fixed`);
    if (check.overflow) problems.push(`${current}: horizontal overflow`);
    if (check.edgeCards) problems.push(`${current}: ${check.edgeCards} card(s) touch the screen edge`);
    await page.screenshot({ path: `${out}/${current}.png`, fullPage: true });
    console.log(`${current}.png  font=${check.headingFont.split(',')[0]} rules=${check.cssRules}`);
  }

  current = `wallet-${w.tag}`;
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /^connect/i }).click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${current}.png` });
  console.log(`${current}.png`);
  await ctx.close();
}
await browser.close();

if (problems.length) {
  console.error(`\n${problems.length} PROBLEM(S):\n- ${[...new Set(problems)].join('\n- ')}`);
  process.exit(1);
}
console.log('\nall checks passed');
