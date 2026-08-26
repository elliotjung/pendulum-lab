import { cp, mkdir, copyFile, access, readFile } from 'node:fs/promises';

// The legacy `js/` runtime has been archived (git tag legacy-js-archive); the
// modern build is entirely TypeScript under src/. We still ship the hand-written
// CSS that styles the static shell DOM.
await mkdir('dist/css', { recursive: true });
await cp('css', 'dist/css', { recursive: true });

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
await mkdir('dist/reports', { recursive: true });
for (const report of reviewerReports) {
  try {
    await copyFile(`reports/${report}`, `dist/reports/${report}`);
  } catch {
    // Generation commands may not have run in a minimal source build.
  }
}
try {
  await copyFile('config/claim-registry.json', 'dist/reports/claim-registry.json');
} catch {
  // The registry is optional only for deliberately minimal source builds.
}
try {
  await mkdir('dist/paper', { recursive: true });
  await copyFile('paper/index.html', 'dist/paper/index.html');
  await copyFile('paper/paper.pdf', 'dist/paper/paper.pdf');
} catch {
  // Paper artifacts are optional in a minimal source build.
}

// The dev/build source shell is `app.html`; deployments (and Vite preview)
// expect the page at `index.html`. Mirror the built shell to that canonical
// name so a static host serves it at the web root.
try {
  await access('dist/app.html');
  await copyFile('dist/app.html', 'dist/index.html');
  console.log('Copied dist/app.html -> dist/index.html');
} catch {
  // app.html may be absent if the build emitted a different layout; ignore.
}
