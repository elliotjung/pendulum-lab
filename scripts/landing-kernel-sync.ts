import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertEvidenceSourceCommit, evidenceWorktreeIsDirty } from './evidence-provenance';

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
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, value, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function regularFileExists(path: string): Promise<boolean> {
  try {
    const info = await lstat(path);
    if (!info.isFile()) throw new Error(`refusing to replace non-regular Landing asset: ${path}`);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function validateLandingKernelPair(
  kernelPath: string,
  manifestPath: string,
  expected: { packageVersion: string; sourceCommit: string }
): Promise<void> {
  const [kernelBytes, manifestBytes] = await Promise.all([readFile(kernelPath), readFile(manifestPath, 'utf8')]);
  const manifest = JSON.parse(manifestBytes) as LandingKernelManifest;
  validateLandingKernelManifest(manifest, {
    ...expected,
    kernelSha256: sha256(kernelBytes)
  });
}

/**
 * Replace the Landing kernel and its manifest as a verified pair.
 *
 * Two separate directory entries cannot be renamed atomically. The kernel is
 * therefore installed first and the manifest (the pair's commit marker) last.
 * A reader in the narrow middle window sees a hash mismatch and fails closed;
 * it can never see an old kernel bearing new provenance. Backups restore the
 * previous pair if either rename or the final validation fails.
 */
export async function replaceLandingKernelPair(options: {
  sourceKernelPath: string;
  sourceManifestPath: string;
  destinationAssets: string;
  packageVersion: string;
  sourceCommit: string;
}): Promise<void> {
  const token = `${process.pid}.${Date.now()}`;
  const destinationKernel = join(options.destinationAssets, kernelName);
  const destinationManifest = join(options.destinationAssets, manifestName);
  const stagedKernel = join(options.destinationAssets, `.${kernelName}.${token}.tmp`);
  const stagedManifest = join(options.destinationAssets, `.${manifestName}.${token}.tmp`);
  const backupKernel = join(options.destinationAssets, `.${kernelName}.${token}.bak`);
  const backupManifest = join(options.destinationAssets, `.${manifestName}.${token}.bak`);
  const lockPath = join(options.destinationAssets, '.demo-kernel-pair.lock');
  let lock: Awaited<ReturnType<typeof open>> | undefined;
  let hadKernel = false;
  let hadManifest = false;
  let kernelReplaced = false;
  let manifestReplaced = false;

  try {
    try {
      lock = await open(lockPath, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(`another Landing kernel pair sync holds ${lockPath}`);
      }
      throw error;
    }

    await copyFile(options.sourceKernelPath, stagedKernel, constants.COPYFILE_EXCL);
    await copyFile(options.sourceManifestPath, stagedManifest, constants.COPYFILE_EXCL);
    await validateLandingKernelPair(stagedKernel, stagedManifest, {
      packageVersion: options.packageVersion,
      sourceCommit: options.sourceCommit
    });

    hadKernel = await regularFileExists(destinationKernel);
    hadManifest = await regularFileExists(destinationManifest);
    if (hadKernel) await copyFile(destinationKernel, backupKernel, constants.COPYFILE_EXCL);
    if (hadManifest) await copyFile(destinationManifest, backupManifest, constants.COPYFILE_EXCL);

    try {
      await rename(stagedKernel, destinationKernel);
      kernelReplaced = true;
      await rename(stagedManifest, destinationManifest);
      manifestReplaced = true;
      await validateLandingKernelPair(destinationKernel, destinationManifest, {
        packageVersion: options.packageVersion,
        sourceCommit: options.sourceCommit
      });
    } catch (replacementError) {
      const rollbackErrors: unknown[] = [];
      if (kernelReplaced) {
        try {
          if (hadKernel) await rename(backupKernel, destinationKernel);
          else await rm(destinationKernel, { force: true });
        } catch (error) {
          rollbackErrors.push(error);
        }
      }
      if (manifestReplaced) {
        try {
          if (hadManifest) await rename(backupManifest, destinationManifest);
          else await rm(destinationManifest, { force: true });
        } catch (error) {
          rollbackErrors.push(error);
        }
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [replacementError, ...rollbackErrors],
          'Landing kernel pair replacement and rollback failed'
        );
      }
      throw replacementError;
    }
  } finally {
    for (const path of [stagedKernel, stagedManifest, backupKernel, backupManifest]) {
      await rm(path, { force: true }).catch(() => undefined);
    }
    await lock?.close().catch(() => undefined);
    if (lock) await rm(lockPath, { force: true }).catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { version?: string };
  if (!packageJson.version) throw new Error('package.json version is missing');
  const sourceCommitOverride = process.env.PENDULUM_LANDING_KERNEL_SOURCE_COMMIT;
  const sourceCommit = sourceCommitOverride ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) throw new Error('source commit is not a full lowercase Git SHA');
  if (sourceCommitOverride) assertEvidenceSourceCommit(sourceCommit);
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
    if (evidenceWorktreeIsDirty()) {
      throw new Error('Refusing to stamp a Landing kernel manifest from a dirty worktree. Commit the source first.');
    }
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
  await replaceLandingKernelPair({
    sourceKernelPath: kernelPath,
    sourceManifestPath: manifestPath,
    destinationAssets: assets,
    packageVersion: packageJson.version,
    sourceCommit
  });
  console.log(`Synced Lab-built kernel into ${assets}; landing checks must still pass before commit.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await main();
