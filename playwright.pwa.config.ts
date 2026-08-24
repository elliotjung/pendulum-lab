import { defineConfig, devices } from '@playwright/test';

const port = Number.parseInt(process.env.PLAYWRIGHT_PWA_PORT ?? '4174', 10);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'pwa-production-lifecycle.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'reports/playwright-pwa', open: 'never' }]],
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: `${baseURL}/app.html`,
    reuseExistingServer: false,
    timeout: 120_000
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [{ name: 'pendulum-lab/ui/audience-mode', value: 'student' }]
        }
      ]
    }
  },
  projects: [{ name: 'pwa-chromium', use: { ...devices['Desktop Chrome'] } }]
});
