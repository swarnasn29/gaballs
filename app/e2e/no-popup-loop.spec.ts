// PROOF RUN, recorded on video: a Google/email (Privy) player goes through the whole game loop
//   login → open a pack → reveal → Collection → sell
// and the test fails if ANY extra browser window, tab or dialog opens (the wallet popups other wallets would show).
// The only window besides the game is Privy's own login form, which is drawn inside the page.
//
// Needs in app/.env.local: PRIVY_TEST_EMAIL and PRIVY_TEST_OTP (a Privy dashboard test account). The account must
// already hold ≥10 mock USDT and its welcome kit (the first-login path is proven separately in docs/DEPLOYMENTS.md).
// Output: video + screenshots in docs/proof/game-loop/.

import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const OUT = path.resolve(__dirname, '../../docs/proof/game-loop');
const MACHINE = process.env.NEXT_PUBLIC_FEATURED_MACHINE ?? 'gaballs.gaballs.testnet';

test('Google/email player: login → pack → reveal → collection → sell, with no wallet popups', async ({ page, context }) => {
  const email = process.env.PRIVY_TEST_EMAIL;
  const otp = process.env.PRIVY_TEST_OTP;
  test.skip(!email || !otp, 'PRIVY_TEST_EMAIL / PRIVY_TEST_OTP missing in app/.env.local');
  mkdirSync(OUT, { recursive: true });

  // Every extra window/tab and every browser dialog is counted: the claim is that there are none.
  const popups: string[] = [];
  context.on('page', (p) => popups.push(p.url() || 'about:blank'));
  page.on('dialog', (d) => {
    popups.push(`dialog: ${d.message()}`);
    void d.dismiss();
  });
  let step = 0;
  const shot = async (name: string) => page.screenshot({ path: path.join(OUT, `${++step}-${name}.png`) });
  const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

  // 1. Login with Privy (email + one-time code), from the connect dialog's first option.
  await page.goto('/');
  await page.getByRole('button', { name: /connect/i }).first().click();
  await page.getByTestId('connect-google').click();
  // The test login must not appear in the video or screenshots (the proof folder is published with the repo):
  // blur Privy's email field before typing. Privy draws its modal in this page, so a style tag reaches it.
  await page.addStyleTag({ content: 'input[type="email"]{filter:blur(7px)!important}' });
  const emailBox = page.getByPlaceholder('your@email.com');
  await emailBox.fill(email!);
  await shot('privy-login');
  await emailBox.press('Enter'); // Privy's button says "Continue with Email" or "Submit" depending on its state
  await page.waitForTimeout(2000);
  await page.keyboard.type(otp!, { delay: 80 }); // the code boxes take focus automatically
  await expect(page.getByRole('button', { name: /connect/i })).toHaveCount(0, { timeout: 60_000 });
  const kitDone = page.getByTestId('welcome-kit-done');
  if (await kitDone.isVisible().catch(() => false)) await page.getByRole('button', { name: 'Start playing' }).click();
  log('logged in');
  await shot('logged-in');

  // 2. Open one pack on the flagship machine. Privy signs silently: no approval window.
  await page.goto(`/machine/${MACHINE}`);
  const open = page.getByRole('button', { name: 'Open 1 pack' });
  await expect(open).toBeEnabled({ timeout: 60_000 });
  await open.click();
  log('pack paid; waiting for the verifiable randomness proof');
  await shot('pack-pending');

  // 3. Reveal: the dialog appears only after the contract's pack_opened result is in.
  const reveal = page.getByRole('dialog').filter({ has: page.locator('#reveal-title, [aria-label^="Tap to open capsule"]') });
  await expect(reveal).toBeVisible({ timeout: 6 * 60_000 });
  // The capsule bobs on purpose, so it never "stops moving": click without waiting for it to be still.
  await page.getByRole('button', { name: /^Tap to open capsule/ }).first().click({ force: true });
  await expect(page.locator('#reveal-title')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2500); // let the tier animation play for the video
  const tier = (await page.locator('#reveal-title').innerText()).trim();
  log(`revealed: ${tier}`);
  await shot('reveal');
  await page.getByRole('button', { name: /^(Done|See all)$/ }).click();
  if (await page.getByRole('button', { name: 'Done' }).isVisible().catch(() => false)) await page.getByRole('button', { name: 'Done' }).click();

  // 4. Collection on My stuff, filled in from the player's own pulls on-chain.
  await page.goto('/me');
  const progress = page.getByTestId('collection-progress');
  await expect(progress).toHaveText(/\d \/ 4 collected/, { timeout: 90_000 });
  await page.getByTestId('collection').scrollIntoViewIfNeeded();
  log(`collection: ${await progress.innerText()}`);
  await page.waitForTimeout(1500);
  await shot('collection');

  // 5. Sell all GABALLS back to the curve.
  const row = page.locator('li', { has: page.getByRole('link', { name: '$GABALLS' }) });
  await row.getByRole('button', { name: 'Sell' }).click();
  await row.getByRole('button', { name: 'All' }).click();
  const sell = row.getByRole('button', { name: /^Sell .* for / });
  await expect(sell).toBeEnabled({ timeout: 30_000 });
  log(await sell.innerText());
  await shot('sell-quote');
  await sell.click();
  await expect(row.getByRole('button', { name: /^Sell .* for / })).toHaveCount(0, { timeout: 2 * 60_000 });
  // Selling "All" leaves 0 GABALLS, so the row leaves the Coins list once the balance refreshes from the chain.
  await expect(page.getByRole('link', { name: '$GABALLS' })).toHaveCount(0, { timeout: 90_000 });
  await page.getByRole('heading', { name: 'Coins' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  log('sold');
  await shot('sold');

  // The claim: no wallet popup anywhere in the loop.
  log(`extra windows/dialogs: ${popups.length}`);
  expect(popups, 'no extra windows, tabs or dialogs').toEqual([]);

  await page.close();
  await page.video()?.saveAs(path.join(OUT, 'no-popup-loop.webm'));
});
