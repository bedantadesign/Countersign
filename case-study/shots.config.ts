import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/** Regenerates the case-study screenshots: `npx playwright test -c case-study/shots.config.ts`. */
export default defineConfig({
  testDir: '.',
  testMatch: 'shots.ts',
  globalSetup: '../e2e/mcp-host/build.ts',
  timeout: 90_000,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 960, height: 1000 },
    deviceScaleFactor: 2,
    // The company is in India, so its clocks read IST.
    timezoneId: 'Asia/Kolkata',
    locale: 'en-IN',
  },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    cwd: '..',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
