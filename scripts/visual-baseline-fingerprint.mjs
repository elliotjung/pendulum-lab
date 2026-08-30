#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';

const args = process.argv.slice(2);
const argument = (name, fallback = '') => {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
};
const platform = argument('platform', platformName());
const snapshotDirectory = argument('snapshot-dir', 'e2e/visual-regression.spec.ts-snapshots');
const output = argument('out', `e2e/visual-baseline-metadata/${platform}.json`);
const sourceCommit = argument('source-commit', process.env.GITHUB_SHA ?? '');

if (!['linux', 'win32', 'darwin'].includes(platform)) throw new Error(`unsupported baseline platform: ${platform}`);
if (sourceCommit && !/^[a-f0-9]{40}$/u.test(sourceCommit))
  throw new Error('source commit must be a full lowercase Git SHA');

function platformName() {
  if (process.platform === 'win32') return 'win32';
  if (process.platform === 'darwin') return 'darwin';
  return 'linux';
}

async function regularFiles(root) {
  const files = [];
  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) files.push(child);
    }
  }
  await walk(root);
  return files.sort((left, right) => left.localeCompare(right));
}

async function digest(pathname) {
  return createHash('sha256')
    .update(await readFile(pathname))
    .digest('hex');
}

async function fontInventory() {
  const candidates =
    platform === 'win32'
      ? ['C:\\Windows\\Fonts']
      : platform === 'darwin'
        ? ['/System/Library/Fonts', '/Library/Fonts']
        : ['/usr/share/fonts', '/usr/local/share/fonts'];
  const hash = createHash('sha256');
  const relevant = [];
  let count = 0;
  let bytes = 0;
  for (const root of candidates) {
    for (const file of await regularFiles(root)) {
      const content = await readFile(file);
      const name = path.relative(root, file).replaceAll('\\', '/');
      const fileHash = createHash('sha256').update(content).digest('hex');
      hash.update(path.basename(root));
      hash.update('\0');
      hash.update(name);
      hash.update('\0');
      hash.update(fileHash);
      hash.update('\0');
      count += 1;
      bytes += content.length;
      if (/(?:inter|segoe|consol|liberation|sfmono|menlo|arial|noto)/iu.test(name)) {
        relevant.push({ name, bytes: content.length, sha256: fileHash });
      }
    }
  }
  if (count === 0) throw new Error('no native font files were found for visual-baseline fingerprinting');
  return {
    roots: candidates.map((root) => path.basename(root)),
    fileCount: count,
    bytes,
    sha256: hash.digest('hex'),
    relevantFiles: relevant.slice(0, 200)
  };
}

const snapshotPaths = (await regularFiles(snapshotDirectory)).filter((file) =>
  file.replaceAll('\\', '/').endsWith(`-${platform}.png`)
);
if (snapshotPaths.length !== 6) throw new Error(`expected 6 ${platform} snapshots, found ${snapshotPaths.length}`);

const browserPath = chromium.executablePath();
const browserStat = await stat(browserPath);
if (!browserStat.isFile()) throw new Error('Playwright Chromium executable is unavailable');
const playwrightPackage = JSON.parse(await readFile('node_modules/@playwright/test/package.json', 'utf8'));
const desktop = devices['Desktop Chrome'];
const mobile = devices['Pixel 5'];
const metadata = {
  schemaVersion: 'pendulum-visual-baseline-fingerprint/v1',
  authority: 'github-hosted-native',
  platform,
  sourceCommit: sourceCommit || null,
  workflow: {
    name: process.env.GITHUB_WORKFLOW ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null
  },
  runner: {
    os: process.env.RUNNER_OS ?? os.platform(),
    arch: process.env.RUNNER_ARCH ?? os.arch(),
    release: os.release(),
    imageOS: process.env.ImageOS ?? null,
    imageVersion: process.env.ImageVersion ?? null
  },
  browser: {
    engine: 'chromium',
    playwrightVersion: String(playwrightPackage.version ?? ''),
    executableName: path.basename(browserPath),
    executableBytes: browserStat.size,
    executableSha256: await digest(browserPath)
  },
  rendering: {
    locale: process.env.LANG ?? process.env.LC_ALL ?? 'unknown',
    timezone: process.env.TZ ?? 'runner-default',
    colorScheme: 'dark',
    projects: [
      {
        name: 'chromium',
        viewport: desktop.viewport,
        deviceScaleFactor: desktop.deviceScaleFactor ?? 1,
        effectiveDpi: 96 * (desktop.deviceScaleFactor ?? 1),
        isMobile: desktop.isMobile ?? false
      },
      {
        name: 'mobile-chrome',
        viewport: mobile.viewport,
        deviceScaleFactor: mobile.deviceScaleFactor ?? 1,
        effectiveDpi: 96 * (mobile.deviceScaleFactor ?? 1),
        isMobile: mobile.isMobile ?? true
      }
    ]
  },
  fonts: await fontInventory(),
  snapshots: await Promise.all(
    snapshotPaths.map(async (file) => ({
      path: path.basename(file),
      bytes: (await stat(file)).size,
      sha256: await digest(file)
    }))
  )
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(`Visual baseline fingerprint written: ${output} (${metadata.snapshots.length} snapshots)`);
