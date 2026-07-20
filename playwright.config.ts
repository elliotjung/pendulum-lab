import { defineConfig, devices } from '@playwright/test';

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? '5173', 10);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const useProductionPreview = process.env.PLAYWRIGHT_USE_PREVIEW === '1';

export default defineConfig({
  testDir: './e2e',
  testIgnore:
    process.env.PLAYWRIGHT_PRODUCTION_GATE === '1'
      ? ['**/visual-regression.spec.ts', '**/webgpu-hardware-reductions.spec.ts']
      : [],
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
  // A green retry can conceal a race. CI keeps retries disabled and preserves
  // complete failure diagnostics instead.
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright', open: 'never' }]],
  webServer: {
    command: useProductionPreview
      ? `npm run preview -- --port ${port} --strictPort`
      : `npm run dev -- --port ${port} --strictPort`,
    url: `${baseURL}/app.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Treat the suite as a returning visitor whose workspace mode is already
    // chosen, so the first-run mode-selection screen does not cover the UI in
    // every spec. The dedicated `audience-mode.spec.ts` clears this key in an
    // init script to exercise the screen itself.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
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
