import { defineConfig, devices } from '@playwright/test';

/**
 * Browser checks on the BUILT site (plan §11): speed under a cheap-phone
 * profile, and screenshots of every template in Hebrew.
 *
 * They read web/dist/client, so run `npm run build` first. CI does both
 * (verify.yml, job `browser`). On the Windows machine nothing runs; on macOS
 * `npm run test:browser` after a build (CLAUDE.md §2).
 *
 * SCREENSHOT BASELINES ARE LINUX-ONLY. Fonts and antialiasing differ by OS,
 * so a baseline made on a Mac would fail on the runner for reasons that are
 * not changes. They are made by the "Update screenshots" workflow on the same
 * image CI compares on, and committed from there.
 */

// A Chromium already on the machine (the cloud dev container ships one) can
// stand in for Playwright's download. CI installs its own and sets nothing.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'e2e',
  globalTeardown: './e2e/speed-report.ts',
  outputDir: 'test-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 90_000,
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' },
  },
  use: {
    baseURL: 'http://127.0.0.1:8099',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    ...devices['Desktop Chrome'],
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'node ../scripts/serve-static.mjs dist/client 8099',
    url: 'http://127.0.0.1:8099/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
