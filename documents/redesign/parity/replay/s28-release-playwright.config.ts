import { defineConfig } from '@playwright/test';
import base from '../playwright.config';
import path from 'node:path';

const scope = process.env.S28_BROWSER_SCOPE ?? 'production';
const run = process.env.S28_RELEASE_RUN;
if (!run || !/^[A-Za-z0-9-]+$/.test(run)) throw new Error('Set a unique S28_RELEASE_RUN.');
const port = Number(process.env.S28_RELEASE_PORT ?? '57531');
const baseURL = `http://127.0.0.1:${port}`;
const production = scope !== 'development';
const dist = process.env.S28_RELEASE_DIST ?? 'dist';
if (path.isAbsolute(dist) || dist.split(/[\\/]/).includes('..')) throw new Error('Output must stay in the repository.');
const twoProjects = base.projects!
  .filter((project) => ['chromium', 'mobile-chrome'].includes(project.name!))
  .map((project) => scope === 'production' && project.name === 'mobile-chrome'
    ? { ...project, grepInvert: [/S05 development component lifecycle/, /desktop rail uses five top-level menus with click-open detail panels/] }
    : project);
const crossProjects = base.projects!.filter((project) => ['firefox', 'webkit', 'mobile-webkit'].includes(project.name!));
const scopeMatch = {
  production: undefined,
  visual: /visual-regression\.spec\.ts/,
  development: /redesign[\\/]a11y-interactions\.spec\.ts/,
  cross: /(?:^|[\\/])(smoke|audience-mode|cross-engine-resource-pressure|trust-inspector)\.spec\.ts$/,
  pwa: /pwa-production-lifecycle\.spec\.ts$/
}[scope];
if (!['production', 'visual', 'development', 'cross', 'pwa'].includes(scope)) throw new Error('Unknown scope.');

export default defineConfig({
  ...base,
  testDir: '../e2e',
  testMatch: scopeMatch,
  testIgnore: scope === 'production'
    ? ['**/pwa-production-lifecycle.spec.ts', '**/visual-regression.spec.ts', '**/webgpu-hardware-reductions.spec.ts']
    : [],
  grep: scope === 'development' ? /S05 development component lifecycle/ : undefined,
  grepInvert: scope === 'production' ? /S05 development component lifecycle/ : undefined,
  workers: 1,
  retries: 0,
  outputDir: `../documents/redesign/parity/evidence/${run}-browser-output`,
  reporter: [['list'], ['json', { outputFile: `tmp/${run}-browser.report.json` }]],
  timeout: scope === 'pwa' ? 60_000 : base.timeout,
  expect: scope === 'pwa' ? { timeout: 10_000 } : base.expect,
  webServer: {
    cwd: path.resolve(import.meta.dirname, '..'),
    command: production
      ? `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${port} --strictPort --outDir "${dist}"`
      : `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/app.html`,
    reuseExistingServer: false,
    timeout: 120_000
  },
  use: {
    ...base.use,
    baseURL,
    serviceWorkers: scope === 'pwa' ? 'allow' : undefined,
    storageState: {
      cookies: [],
      origins: [{ origin: baseURL, localStorage: [{ name: 'pendulum-lab/ui/audience-mode', value: scope === 'pwa' ? 'student' : 'research' }] }]
    }
  },
  projects: scope === 'cross' ? crossProjects : scope === 'pwa' ? [twoProjects[0]!] : twoProjects
});
