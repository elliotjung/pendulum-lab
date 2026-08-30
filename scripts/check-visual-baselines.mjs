import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const snapshotDirectory = join(process.cwd(), 'e2e', 'visual-regression.spec.ts-snapshots');
const platform = argument('--platform') ?? platformName();
const projects = (argument('--projects') ?? 'chromium,mobile-chrome')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const snapshots = ['rail-sidebar', 'lab-controls', 'research-experiment-card'];
const metadataDirectory = argument('--metadata-dir') ?? 'e2e/visual-baseline-metadata';
const requireMetadata = process.argv.includes('--require-metadata');

if (!/^[a-z0-9-]+$/u.test(platform)) fail(`invalid platform: ${platform}`);
if (projects.length === 0 || projects.some((project) => !/^[a-z0-9-]+$/u.test(project))) {
  fail('projects must be a comma-separated list of Playwright project names');
}

const expected = snapshots.flatMap((snapshot) => projects.map((project) => `${snapshot}-${project}-${platform}.png`));
const failures = [];

for (const file of expected) {
  const path = join(snapshotDirectory, file);
  try {
    const details = await stat(path);
    const header = await readFile(path).then((bytes) => bytes.subarray(0, 24));
    if (!details.isFile() || details.size < 100) failures.push(`${file}: empty or not a regular file`);
    if (!isPng(header)) failures.push(`${file}: invalid PNG signature/IHDR`);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') failures.push(`${file}: missing`);
    else failures.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const metadataPath = join(metadataDirectory, `${platform}.json`);
try {
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  const recorded = new Map(
    Array.isArray(metadata.snapshots) ? metadata.snapshots.map((entry) => [entry?.path, entry]) : []
  );
  if (
    metadata.schemaVersion !== 'pendulum-visual-baseline-fingerprint/v1' ||
    metadata.authority !== 'github-hosted-native' ||
    metadata.platform !== platform
  ) {
    failures.push(`${platform}.json: unsupported or mismatched fingerprint metadata`);
  }
  if (!/^[a-f0-9]{40}$/u.test(metadata.sourceCommit ?? '')) {
    failures.push(`${platform}.json: missing full source commit`);
  }
  if (
    !/^[a-f0-9]{64}$/u.test(metadata.browser?.executableSha256 ?? '') ||
    !/^[a-f0-9]{64}$/u.test(metadata.fonts?.sha256 ?? '') ||
    !(metadata.fonts?.fileCount > 0) ||
    !metadata.runner?.imageOS ||
    !metadata.runner?.imageVersion
  ) {
    failures.push(`${platform}.json: incomplete browser/font/hosted-runner fingerprint`);
  }
  const projectNames = new Set((metadata.rendering?.projects ?? []).map((entry) => entry?.name));
  if (projects.some((project) => !projectNames.has(project))) {
    failures.push(`${platform}.json: missing project DPI/deviceScaleFactor metadata`);
  }
  for (const file of expected) {
    const entry = recorded.get(file);
    if (!entry || !/^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')) {
      failures.push(`${platform}.json: missing snapshot digest for ${file}`);
      continue;
    }
    const bytes = await readFile(join(snapshotDirectory, file));
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (entry.bytes !== bytes.length || entry.sha256 !== actual) {
      failures.push(`${platform}.json: snapshot digest mismatch for ${file}`);
    }
  }
} catch (error) {
  if (requireMetadata) {
    failures.push(
      `${platform}.json: fingerprint metadata missing or unreadable (${error instanceof Error ? error.message : String(error)})`
    );
  } else {
    console.warn(
      `Visual-baseline fingerprint is not promoted for ${platform}; current images remain legacy hosted baselines until the next reviewed promotion.`
    );
  }
}

if (failures.length > 0) {
  console.error(`Visual-baseline contract failed for ${platform}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Visual-baseline contract passed: ${expected.length} ${platform} PNGs (${projects.join(', ')})${requireMetadata ? ' with hosted fingerprint' : ''}`
  );
}

function argument(name) {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return value?.slice(prefix.length);
}

function platformName() {
  if (process.platform === 'win32') return 'win32';
  if (process.platform === 'darwin') return 'darwin';
  return 'linux';
}

function isPng(bytes) {
  if (bytes.length < 24) return false;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return (
    signature.every((value, index) => bytes[index] === value) &&
    bytes.subarray(12, 16).toString('ascii') === 'IHDR' &&
    bytes.readUInt32BE(16) > 0 &&
    bytes.readUInt32BE(20) > 0
  );
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
