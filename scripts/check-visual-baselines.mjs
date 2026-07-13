import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const snapshotDirectory = join(process.cwd(), 'e2e', 'visual-regression.spec.ts-snapshots');
const platform = argument('--platform') ?? platformName();
const projects = (argument('--projects') ?? 'chromium,mobile-chrome')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const snapshots = ['rail-sidebar', 'lab-controls', 'research-experiment-card'];

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

if (failures.length > 0) {
  console.error(`Visual-baseline contract failed for ${platform}:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Visual-baseline contract passed: ${expected.length} ${platform} PNGs (${projects.join(', ')})`);
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
