import { cp, mkdir, copyFile, access, readFile, lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

// The default deployment pipeline is unchanged. Evidence builds can package an
// explicitly named generated output without copying into a different build.
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--out-dir'))
  throw new Error('Usage: copy-legacy-assets.mjs [--out-dir dist|tmp/NAME]');
const outputRelative = args[1] ?? 'dist';
if (
  path.isAbsolute(outputRelative) ||
  outputRelative.includes('\\') ||
  outputRelative.split('/').some((part) => !part || part === '.' || part === '..') ||
  !/^(?:dist(?:-[^/]+)?(?:\/.*)?|tmp\/.+)$/.test(outputRelative)
)
  throw new Error('Output must be a generated dist or tmp directory within this repository.');
const repositoryRoot = await realpath(process.cwd());
const outputRoot = path.resolve(repositoryRoot, outputRelative);
let inspected = repositoryRoot;
for (const part of outputRelative.split('/')) {
  inspected = path.join(inspected, part);
  try {
    if ((await lstat(inspected)).isSymbolicLink()) throw new Error('Generated output must not follow symbolic links.');
  } catch (cause) {
    if (cause?.code !== 'ENOENT') throw cause;
    break;
  }
}
const output = (...parts) => path.join(outputRoot, ...parts);

// The legacy `js/` runtime has been archived (git tag legacy-js-archive); the
// modern build is entirely TypeScript under src/. We still ship the hand-written
// CSS that styles the static shell DOM.
await mkdir(output('css'), { recursive: true });
await cp('css', output('css'), { recursive: true });

// This inventory is also consumed by the fail-closed public-artifact privacy
// audit. Keeping one machine-readable list prevents a newly copied report from
// silently bypassing the scanner.
const inventory = JSON.parse(await readFile('config/public-report-inventory.json', 'utf8'));
if (
  inventory?.schemaVersion !== 'pendulum-public-report-inventory/v1' ||
  !Array.isArray(inventory.reports) ||
  inventory.reports.some((report) => typeof report !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(report))
) {
  throw new Error('config/public-report-inventory.json is invalid');
}
const reviewerReports = inventory.reports;
await mkdir(output('reports'), { recursive: true });
for (const report of reviewerReports) {
  try {
    await copyFile(`reports/${report}`, output('reports', report));
  } catch {
    // Generation commands may not have run in a minimal source build.
  }
}
try {
  await copyFile('config/claim-registry.json', output('reports', 'claim-registry.json'));
} catch {
  // The registry is optional only for deliberately minimal source builds.
}
try {
  await mkdir(output('paper'), { recursive: true });
  await copyFile('paper/index.html', output('paper', 'index.html'));
  await copyFile('paper/paper.pdf', output('paper', 'paper.pdf'));
} catch {
  // Paper artifacts are optional in a minimal source build.
}

// The dev/build source shell is `app.html`; deployments (and Vite preview)
// expect the page at `index.html`. Mirror the built shell to that canonical
// name so a static host serves it at the web root.
try {
  await access(output('app.html'));
  await copyFile(output('app.html'), output('index.html'));
  console.log(`Copied ${outputRelative}/app.html -> ${outputRelative}/index.html`);
} catch {
  // app.html may be absent if the build emitted a different layout; ignore.
}
