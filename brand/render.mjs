// Renders the Gaballs brand assets to PNG with Playwright (HTML + Google Fonts, no paid tools).
//   cd app && node ../brand/render.mjs
// Output: brand/out/*.png. Palette and fonts: brand/README.md.

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
mkdirSync(out, { recursive: true });

export const C = {
  sky: '#DDF0FF',
  baby: '#AFDFF5',
  bubble: '#7CC4F2',
  ocean: '#2E78C7',
  navy: '#1B3A63',
  cloud: '#FFFFFF',
  mint: '#ADEDC8',
  lavender: '#C1A7E6',
  pink: '#F9C2DF',
  gold: '#FFE58A',
};

const character = `data:image/jpeg;base64,${readFileSync(path.join(here, 'source', 'character.jpg')).toString('base64')}`;
const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&family=Nunito:wght@600;800&display=block" rel="stylesheet">`;
const base = `*{margin:0;box-sizing:border-box}body{font-family:'Nunito',sans-serif;color:${C.navy}}`;

/** The wordmark: chunky rounded Fredoka in ocean blue, a white sticker edge and a navy outline. */
const wordmarkCss = (size) => `
.wm{font-family:'Fredoka',sans-serif;font-weight:700;font-size:${size}px;line-height:1;letter-spacing:.01em;color:${C.ocean};
  -webkit-text-stroke:${size * 0.06}px ${C.navy};paint-order:stroke fill;
  filter:drop-shadow(0 0 0 #fff) drop-shadow(${size * 0.035}px 0 0 #fff) drop-shadow(-${size * 0.035}px 0 0 #fff) drop-shadow(0 ${size * 0.035}px 0 #fff) drop-shadow(0 -${size * 0.035}px 0 #fff) drop-shadow(0 ${size * 0.06}px 0 ${C.navy});}
.wm .dot{display:inline-block;width:.24em;height:.24em;border-radius:50%;background:${C.pink};border:${size * 0.03}px solid ${C.navy};margin-left:.06em;vertical-align:.55em}`;

/** Gumball dots used as decoration. */
const balls = (list) =>
  list
    .map(([x, y, s, c]) => `<span style="position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;border-radius:50%;background:${c};border:3px solid ${C.navy};box-shadow:inset -${s / 6}px -${s / 6}px 0 rgba(27,58,99,.12)"><span style="position:absolute;left:22%;top:16%;width:26%;height:26%;border-radius:50%;background:#fff;opacity:.85"></span></span>`)
    .join('');

const sticker = (w) =>
  `<div style="width:${w}px;height:${w}px;border-radius:${w * 0.16}px;overflow:hidden;border:${w * 0.03}px solid #fff;outline:${w * 0.012}px solid ${C.navy};box-shadow:0 ${w * 0.03}px 0 ${C.navy}"><img src="${character}" style="width:100%;height:100%;object-fit:cover"></div>`;

const pages = {
  // Transparent wordmark, large (for decks and the site header).
  'wordmark.png': {
    w: 1400,
    h: 420,
    transparent: true,
    html: `<style>${base}${wordmarkCss(260)}body{display:flex;align-items:center;justify-content:center;height:420px}</style><div class="wm">Gaballs</div>`,
  },
  // Wordmark on the sky colour (for places that need a background).
  'wordmark-on-sky.png': {
    w: 1400,
    h: 420,
    html: `<style>${base}${wordmarkCss(260)}body{background:${C.sky};display:flex;align-items:center;justify-content:center;height:420px}</style><div class="wm">Gaballs</div>`,
  },
  // App icon: the character's head in a baby-blue rounded tile.
  'icon-512.png': {
    w: 512,
    h: 512,
    transparent: true,
    html: `<style>${base}body{width:512px;height:512px}</style><div style="width:512px;height:512px;border-radius:112px;background:${C.baby};border:14px solid ${C.navy};overflow:hidden;position:relative"><img src="${character}" style="position:absolute;width:880px;left:-188px;top:-40px"></div>`,
  },
  // Social preview (1200x630): what X, Telegram and Discord show for the link.
  'og-1200x630.png': {
    w: 1200,
    h: 630,
    html: `<style>${base}${wordmarkCss(132)}body{width:1200px;height:630px;background:${C.sky};position:relative;overflow:hidden}</style>
      ${balls([[30, 560, 60, C.mint], [420, 565, 40, C.lavender], [1110, 40, 58, C.gold], [600, 540, 44, C.pink], [610, 28, 34, C.baby]])}
      <div style="position:absolute;left:72px;top:110px;width:560px">
        <div class="wm">Gaballs</div>
        <p style="margin-top:34px;font-family:Fredoka;font-weight:600;font-size:46px;line-height:1.1">Gumball machines<br>for memecoins</p>
        <p style="margin-top:18px;font-size:25px;font-weight:600;color:#2E5A86">Every pack buys the coin. A fixed, public draw multiplies it. Play free with Google: no wallet.</p>
        <p style="margin-top:22px;display:inline-block;background:${C.ocean};color:#fff;font-weight:800;font-size:24px;padding:10px 22px;border-radius:999px;border:3px solid ${C.navy}">gaballs.vercel.app</p>
      </div>
      <div style="position:absolute;right:70px;top:85px">${sticker(440)}</div>`,
  },
  // X post / profile banner (1500x500).
  'x-banner-1500x500.png': {
    w: 1500,
    h: 500,
    html: `<style>${base}${wordmarkCss(150)}body{width:1500px;height:500px;background:${C.sky};position:relative;overflow:hidden}</style>
      ${balls([[40, 360, 80, C.mint], [190, 420, 50, C.lavender], [1390, 30, 64, C.gold], [880, 420, 44, C.pink], [960, 40, 36, C.baby]])}
      <div style="position:absolute;left:330px;top:80px">
        <div class="wm">Gaballs</div>
        <p style="margin-top:22px;font-family:Fredoka;font-weight:600;font-size:42px;line-height:1.1">Gumball machines for memecoins<br>on NEAR</p>
        <p style="margin-top:10px;font-size:26px;font-weight:600;color:#2E5A86">Verifiable odds · play free with Google · gaballs.vercel.app</p>
      </div>
      <div style="position:absolute;right:70px;top:70px">${sticker(360)}</div>`,
  },
};

const browser = await chromium.launch();
for (const [file, p] of Object.entries(pages)) {
  const page = await browser.newPage({ viewport: { width: p.w, height: p.h }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head>${fonts}</head><body>${p.html}</body></html>`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, file), omitBackground: !!p.transparent });
  await page.close();
  console.log('wrote', file);
}
await browser.close();
