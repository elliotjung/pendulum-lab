import { cp, mkdir, copyFile, access } from 'node:fs/promises';

// The legacy `js/` runtime has been archived (git tag legacy-js-archive); the
// modern build is entirely TypeScript under src/. We still ship the hand-written
// CSS that styles the static shell DOM.
await mkdir('dist/css', { recursive: true });
await cp('css', 'dist/css', { recursive: true });

const reviewerReports = [
  'worldclass-scorecard.json',
  'flagship-certification.json',
  'flagship-external-check.json',
  'webgpu-hardware-validation.json',
  'gpu-benchmark-ladder.json',
  'gpu-adapter-matrix.json',
  'release-readiness.json',
  'publication-status.json',
  'zenodo-deposition.json',
  'attestation-verification.json',
  'npm-pack-dry-run.json',
  'reviewer-kit-manifest.json',
  'mutation-aggregate.json',
  'flagship-figure1.svg',
  'coverage-badge.json',
  'coverage-badge.svg'
];
await mkdir('dist/reports', { recursive: true });
for (const report of reviewerReports) {
  try {
    await copyFile(`reports/${report}`, `dist/reports/${report}`);
  } catch {
    // Generation commands may not have run in a minimal source build.
  }
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
