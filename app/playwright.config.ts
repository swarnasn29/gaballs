// Playwright: the recorded "no wallet popups" proof run (e2e/no-popup-loop.spec.ts). Not part of `npm run build`.
// Run: npx playwright test --headed   (from app/, with the dev server on http://localhost:3000 or BASE_URL set)
import { defineConfig } from '@playwright/test';

// Test login (Privy test account) and other settings come from app/.env.local, which is git-ignored.
try {
  process.loadEnvFile('.env.local');
} catch {
  /* CI or another env source */
}

export default defineConfig({
  testDir: './e2e',
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  outputDir: 'test-results',
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1280, height: 800 },
    // A click that can't find its button fails after a minute instead of hanging until the 10-minute test timeout.
    actionTimeout: 60_000,
    video: { mode: 'on', size: { width: 1280, height: 800 } },
    launchOptions: { slowMo: 120 },
  },
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
});
