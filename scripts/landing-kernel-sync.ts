import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, lstat, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const kernelDirectory = 'reports/landing-kernel';
const kernelName = 'pendulum-demo-kernel.js';
const manifestName = 'demo-kernel-manifest.json';
const version = 'pendulum-demo-kernel/v3';

export interface LandingKernelManifest {
  schemaVersion: 'pendulum-demo-kernel-manifest/v1';
  kernel: 'assets/pendulum-demo-kernel.js';
  kernelVersion: string;
  sourcePackageVersion: string;
  sourceCommit: string;
  sha256: string;
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function validateLandingKernelManifest(
  manifest: LandingKernelManifest,
  expected: { packageVersion: string; sourceCommit: string; kernelSha256: string }
): void {
  if (manifest.schemaVersion !== 'pendulum-demo-kernel-manifest/v1') throw new Error('invalid kernel manifest schema');
  if (manifest.kernel !== 'assets/pendulum-demo-kernel.js') throw new Error('invalid landing kernel destination');
  if (manifest.kernelVersion !== version) throw new Error(`kernel version must be ${version}`);
  if (manifest.sourcePackageVersion !== expected.packageVersion) throw new Error('kernel package version mismatch');
  if (manifest.sourceCommit !== expected.sourceCommit) throw new Error('kernel source commit mismatch');
  if (manifest.sha256 !== expected.kernelSha256) throw new Error('kernel SHA-256 mismatch');
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function atomicWrite(path: string, value: string): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, value, 'utf8');
  await rename(temporary, path);
}

async function main(): Promise<void> {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { version?: string };
  if (!packageJson.version) throw new Error('package.json version is missing');
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) throw new Error('source commit is not a full lowercase Git SHA');
  const kernelPath = join(kernelDirectory, kernelName);
  const kernelBytes = await readFile(kernelPath);
  const manifest: LandingKernelManifest = {
    schemaVersion: 'pendulum-demo-kernel-manifest/v1',
    kernel: 'assets/pendulum-demo-kernel.js',
    kernelVersion: version,
    sourcePackageVersion: packageJson.version,
    sourceCommit,
    sha256: sha256(kernelBytes)
  };
  const manifestPath = join(kernelDirectory, manifestName);

  if (process.argv.includes('--write-manifest')) {
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } else {
    const existing = JSON.parse(await readFile(manifestPath, 'utf8')) as LandingKernelManifest;
    validateLandingKernelManifest(existing, {
      packageVersion: packageJson.version,
      sourceCommit,
      kernelSha256: manifest.sha256
    });
  }

  const landingPath = argument('--landing-path');
  if (!landingPath) {
    console.log(
      `Landing kernel verified: ${version} ${manifest.sha256.slice(0, 12)}... @ ${sourceCommit.slice(0, 12)}`
    );
    return;
  }

  const landingRoot = resolve(landingPath);
  const landingStat = await lstat(landingRoot);
  if (!landingStat.isDirectory()) throw new Error(`--landing-path is not a directory: ${landingRoot}`);
  const landingPackage = JSON.parse(await readFile(join(landingRoot, 'package.json'), 'utf8')) as { name?: string };
  if (landingPackage.name !== 'pendulum-landing') {
    throw new Error(`refusing to sync into ${basename(landingRoot)}: package name is not pendulum-landing`);
  }
  const assets = join(landingRoot, 'assets');
  const assetsStat = await lstat(assets);
  if (!assetsStat.isDirectory()) throw new Error(`landing assets directory is missing: ${assets}`);
  await copyFile(kernelPath, join(assets, kernelName));
  await copyFile(manifestPath, join(assets, manifestName));

  const copiedKernel = await readFile(join(assets, kernelName));
  const copiedManifest = JSON.parse(await readFile(join(assets, manifestName), 'utf8')) as LandingKernelManifest;
  validateLandingKernelManifest(copiedManifest, {
    packageVersion: packageJson.version,
    sourceCommit,
    kernelSha256: sha256(copiedKernel)
  });
  console.log(`Synced Lab-built kernel into ${assets}; landing checks must still pass before commit.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await main();
