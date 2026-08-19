/**
 * Drift guard for the committed WASM kernel: `src/runtime/wasm/*.wasm` is the
 * `build:wasm` output of `wasm/assembly/*.ts` and is tracked in git so tests,
 * scripts and builds work from a bare checkout without the AssemblyScript
 * toolchain running. Run AFTER `npm run build:wasm` (which recompiles in
 * place); fails if git sees the binary as modified — i.e. if the committed
 * kernel no longer matches the current AssemblyScript source.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

let porcelain = '';
try {
  porcelain = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'src/runtime/wasm'], {
    encoding: 'utf8'
  });
} catch (error) {
  console.error(`wasm-sync check FAILED: git status did not run: ${String(error)}`);
  process.exit(1);
}

const drifted = porcelain
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

if (drifted.length > 0) {
  console.error(
    'wasm-sync check FAILED: the committed WASM kernel does not match a fresh build of wasm/assembly.\n' +
      drifted.map((line) => `  ${line}`).join('\n') +
      '\nRun `npm run build:wasm` and commit the regenerated kernel together with the AssemblyScript change.'
  );
  process.exit(1);
}

const artifactPath = 'src/runtime/wasm/pendulum-kernel.wasm';
const sourcePath = 'wasm/assembly/ensemble.ts';
const [artifact, artifactStat, source, lockfile, packageJson] = await Promise.all([
  readFile(artifactPath),
  stat(artifactPath),
  readFile(sourcePath),
  readFile('package-lock.json'),
  readFile('package.json', 'utf8').then((value) => JSON.parse(value) as { version?: string })
]);
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) {
  console.error('wasm-sync check FAILED: source commit is not a full lowercase Git SHA');
  process.exit(1);
}
const report = {
  schemaVersion: 'pendulum-wasm-sync/v1',
  generatedAt: new Date().toISOString(),
  status: 'pass',
  packageVersion: packageJson.version ?? 'unknown',
  sourceCommit,
  buildCommand: 'npm run build:wasm',
  checkCommand: 'npm run check:wasm-sync',
  artifact: {
    path: artifactPath,
    bytes: artifactStat.size,
    sha256: sha256(artifact)
  },
  inputs: {
    assemblyScript: { path: sourcePath, sha256: sha256(source) },
    lockfileSha256: sha256(lockfile)
  },
  ci: {
    trusted: process.env.GITHUB_ACTIONS === 'true',
    workflow: process.env.GITHUB_WORKFLOW ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    runnerOs: process.env.RUNNER_OS ?? process.platform,
    repository: process.env.GITHUB_REPOSITORY ?? null,
    ref: process.env.GITHUB_REF ?? null,
    sha: process.env.GITHUB_SHA ?? null
  }
};
await writeFile('reports/wasm-sync.json', `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(
  `wasm-sync check ok: ${report.artifact.sha256.slice(0, 12)}... matches AssemblyScript source; trustedCi=${report.ci.trusted}`
);
