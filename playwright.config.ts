import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      threshold: 0.2,
      animations: 'disabled',
      maxDiffPixels: 100
    }
  },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright', open: 'never' }]],
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    // Treat the suite as a returning visitor whose workspace mode is already
    // chosen, so the first-run mode-selection screen does not cover the UI in
    // every spec. The dedicated `audience-mode.spec.ts` clears this key in an
    // init script to exercise the screen itself.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://127.0.0.1:5173',
          localStorage: [{ name: 'pendulum-lab/ui/audience-mode', value: 'research' }]
        }
      ]
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } }
  ]
});
