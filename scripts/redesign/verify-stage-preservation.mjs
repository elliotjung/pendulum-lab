import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// Compare exact Git blob bytes, rather than working-tree newline normalization.
// The local bytes are still hashed directly, so a formatting change is visible.
const [stage, baseline, output] = process.argv.slice(2);
if (!/^S\d{2}$/.test(stage ?? '') || !/^[a-f0-9]{40}$/.test(baseline ?? '') || !output) {
  throw new Error('usage: node scripts/redesign/verify-stage-preservation.mjs SNN <40-char baseline> <output>');
}
const git = (...args) => execFileSync('git', args, { maxBuffer: 32 * 1024 * 1024 });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const treeEntries = git('ls-tree', '-r', '-z', baseline)
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .map((entry) => {
    const separator = entry.indexOf('\t');
    return [entry.slice(separator + 1), entry.slice(0, separator).split(' ')[2]];
  });
const baselineBlobs = new Map(treeEntries);
const tree = treeEntries.map(([path]) => path);
const protectedRoots = [
  'src/physics/',
  'src/chaos/',
  'src/research/',
  'src/runtime/',
  'src/workers/',
  'src/validation/',
  'src/product/adapters/physics/',
  'src/lib/',
  'documents/redesign/baseline/'
];
const protectedFiles = new Set([
  'app.html',
  'src/lib.ts',
  'package.json',
  'package-lock.json',
  'AGENTS.md',
  'vitest.config.ts',
  'playwright.config.ts',
  'documents/redesign/README.md',
  'documents/redesign/master-roadmap-ko.md',
  'documents/redesign/execution-plan-ko.md',
  'documents/redesign/curriculum-map-ko.md',
  'documents/redesign/stage-run-protocol-ko.md'
]);
const groups = {
  protected: tree.filter((path) => protectedFiles.has(path) || protectedRoots.some((root) => path.startsWith(root))),
  historicalTests: tree.filter((path) => /^(tests|e2e)\//.test(path) && !path.endsWith('.png')),
  historicalPng: tree.filter((path) => path.endsWith('.png'))
};
const results = {};
const mismatches = [];
for (const [name, paths] of Object.entries(groups)) {
  const files = [];
  for (const path of paths) {
    const expected = baselineBlobs.get(path);
    let actual = null;
    let sha256 = null;
    try {
      const bytes = readFileSync(path);
      sha256 = hash(bytes);
      actual = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    } catch {
      /* Missing is a mismatch. */
    }
    const equal = expected === actual;
    files.push({ path, sha256, gitBlob: actual, baselineGitBlob: expected, equal });
    if (!equal) mismatches.push(path);
  }
  results[name] = { count: paths.length, equal: files.filter((file) => file.equal).length, files };
}
const desktopCopies = [
  ['documents/redesign/master-roadmap-ko.md', 'C:/Users/junge/Desktop/Pendulum_Lab_Complete_Redesign_Roadmap_KO.md'],
  ['documents/redesign/execution-plan-ko.md', 'C:/Users/junge/Desktop/Pendulum_Lab_Codex_Execution_Steps_KO.md']
].map(([source, destination]) => {
  const sourceSha256 = hash(readFileSync(source));
  let destinationSha256 = null;
  try {
    destinationSha256 = hash(readFileSync(destination));
  } catch {
    /* Report inaccessible transport copies. */
  }
  return { source, destination, sourceSha256, destinationSha256, equal: sourceSha256 === destinationSha256 };
});
const report = {
  schemaVersion: 'pendulum-stage-preservation/v1',
  stage,
  baseline,
  generatedAtUtc: new Date().toISOString(),
  implementationHead: git('rev-parse', 'HEAD').toString('utf8').trim(),
  basis:
    'Git SHA1 blob identity of exact working bytes versus baseline ls-tree, plus local SHA256; no newline normalization or formatting exception.',
  ...results,
  desktopCopies,
  mismatches,
  passed: mismatches.length === 0 && desktopCopies.every((copy) => copy.equal)
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    output,
    passed: report.passed,
    counts: Object.fromEntries(Object.entries(results).map(([key, value]) => [key, `${value.equal}/${value.count}`])),
    desktopCopies: desktopCopies.map((copy) => ({ destination: copy.destination, equal: copy.equal })),
    mismatches
  })
);
if (!report.passed) process.exitCode = 1;
