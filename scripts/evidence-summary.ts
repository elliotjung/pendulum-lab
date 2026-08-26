import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { buildEvidenceSummary } from '../src/research/evidenceSummary';
import { assertEvidenceSourceCommit, evidenceWorktreeIsDirty } from './evidence-provenance';
import { validateEvidenceBindings } from './validate-evidence-bindings';

const sourceReports = {
  vitestResults: 'reports/vitest-public-results.json',
  reviewerKitManifest: 'reports/reviewer-kit-manifest.json',
  publicationStatus: 'reports/publication-status.json',
  literatureAnchors: 'reports/literature-anchors.json',
  crossValidation: 'reports/cross-validation.json',
  gpuAdapterMatrix: 'reports/gpu-adapter-matrix.json',
  mutationAggregate: 'reports/mutation-aggregate.json',
  energyBenchmark: 'reports/energy-benchmark.json'
};

const checkOnly = process.argv.includes('--check');
const ciArtifactMode = process.env.PENDULUM_EVIDENCE_CI_ARTIFACT === '1';
const reportRoot = process.env.PENDULUM_EVIDENCE_REPORT_ROOT ?? '.';
const evidencePath = process.env.PENDULUM_EVIDENCE_OUTPUT ?? 'reports/evidence-summary.json';
const packageJsonPath = process.env.PENDULUM_EVIDENCE_PACKAGE_JSON ?? 'package.json';
const lockfilePath = process.env.PENDULUM_EVIDENCE_LOCKFILE ?? 'package-lock.json';
const volatileEvidenceKeys = new Set(['generatedAt', 'evaluatedAt', 'sourceCommit', 'dirtyWorktree', 'expiresAt']);

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as { version?: string };
const lockfile = await readFile(lockfilePath);
const actualWorktreeDirty = evidenceWorktreeIsDirty();
const sourceCommit = resolveSourceCommit(ciArtifactMode);
const worktreeDirty = ciArtifactMode ? false : actualWorktreeDirty;
if (!checkOnly && actualWorktreeDirty && !ciArtifactMode) {
  throw new Error(
    'Refusing to refresh public evidence from a dirty worktree. Commit the source and successful test report first.'
  );
}
const generatedAt = new Date();
const expiresAfterDays = 14;
const sourceReportEntries = await Promise.all(
  Object.values(sourceReports).map(async (path) => {
    const bytes = await readFile(join(reportRoot, path));
    return [path, createHash('sha256').update(bytes).digest('hex')] as const;
  })
);
const summary = buildEvidenceSummary({
  generatedAt: generatedAt.toISOString(),
  sourceReports,
  sourceReportSha256: Object.fromEntries(sourceReportEntries),
  vitestResults: await readJson(join(reportRoot, sourceReports.vitestResults)),
  reviewerKitManifest: await readJson(join(reportRoot, sourceReports.reviewerKitManifest)),
  publicationStatus: await readJson(join(reportRoot, sourceReports.publicationStatus)),
  literatureAnchors: await readJson(join(reportRoot, sourceReports.literatureAnchors)),
  crossValidation: await readJson(join(reportRoot, sourceReports.crossValidation)),
  gpuAdapterMatrix: await readJson(join(reportRoot, sourceReports.gpuAdapterMatrix)),
  mutationAggregate: await readJson(join(reportRoot, sourceReports.mutationAggregate)),
  energyBenchmark: await readJson(join(reportRoot, sourceReports.energyBenchmark)),
  provenance: {
    sourceCommit,
    packageVersion: packageJson.version ?? 'unknown',
    lockfileSha256: createHash('sha256').update(lockfile).digest('hex'),
    dirtyWorktree: worktreeDirty,
    expiresAfterDays,
    expiresAt: new Date(generatedAt.getTime() + expiresAfterDays * 86_400_000).toISOString()
  }
});

if (checkOnly) {
  const committed = await readJson(evidencePath);
  assertReleaseReadyEvidence(committed);
  await validateEvidenceBindings(bindingOptions());
  const comparable = structuredClone(summary) as unknown;
  preserveVolatileEvidence(comparable, committed, worktreeDirty);
  if (JSON.stringify(comparable) !== JSON.stringify(committed)) {
    throw new Error(
      'Committed evidence is stale. Run `npm run evidence:refresh`, review the scientific diff, and commit it.'
    );
  }
  console.log('Evidence summary is synchronized, clean, and within its release validity window.');
} else {
  await writeJson(evidencePath, summary);
  await validateEvidenceBindings(bindingOptions());
}

function bindingOptions() {
  return {
    evidencePath,
    reportRoot,
    ...(ciArtifactMode ? { expectedCiSourceCommit: sourceCommit } : {})
  };
}

function assertReleaseReadyEvidence(value: unknown): void {
  if (!value || typeof value !== 'object') throw new Error('Committed evidence must be a JSON object.');
  const evidence = value as {
    generatedAt?: unknown;
    provenance?: {
      sourceCommit?: unknown;
      dirtyWorktree?: unknown;
      expiresAt?: unknown;
    };
    tests?: {
      total?: unknown;
      passed?: unknown;
      failed?: unknown;
      success?: unknown;
    };
  };
  const generatedAt = Date.parse(String(evidence.generatedAt ?? ''));
  const expiresAt = Date.parse(String(evidence.provenance?.expiresAt ?? ''));
  if (!Number.isFinite(generatedAt)) throw new Error('Committed evidence generatedAt is missing or invalid.');
  const sourceCommit = String(evidence.provenance?.sourceCommit ?? '');
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit)) {
    throw new Error('Committed evidence provenance.sourceCommit must be a full Git SHA.');
  }
  assertEvidenceSourceCommit(sourceCommit);
  if (evidence.provenance?.dirtyWorktree !== false) {
    throw new Error(
      'Committed evidence was generated from a dirty worktree. Commit the source, then refresh evidence.'
    );
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('Committed evidence has expired. Run `npm run evidence:refresh` from a clean committed tree.');
  }
  if (expiresAt <= generatedAt) throw new Error('Committed evidence expiresAt must be later than generatedAt.');
  const total = Number(evidence.tests?.total);
  const passed = Number(evidence.tests?.passed);
  const failed = Number(evidence.tests?.failed);
  if (!Number.isInteger(total) || total <= 0 || passed !== total || failed !== 0 || evidence.tests?.success !== true) {
    throw new Error('Committed evidence tests must come from a successful, complete Vitest JSON report.');
  }
}

const landingSummaryPath = resolve('..', 'landing page', 'pendulum-landing', 'assets', 'evidence-summary.json');
// Cross-repository writes are opt-in. `npm run verify` must be hermetic even
// when a sibling landing checkout happens to exist on a developer machine.
// The authenticated dispatch workflows own normal evidence synchronization.
if (!checkOnly && !ciArtifactMode) {
  if (process.env.PENDULUM_SYNC_LANDING === '1' && (await exists(dirname(landingSummaryPath)))) {
    await writeJson(landingSummaryPath, summary);
    console.log(`Wrote reports/evidence-summary.json and ${landingSummaryPath}`);
  } else {
    console.log('Wrote reports/evidence-summary.json');
  }
}

function resolveSourceCommit(artifactMode: boolean): string {
  const headCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!artifactMode) return headCommit;

  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.CI !== 'true') {
    throw new Error('PENDULUM_EVIDENCE_CI_ARTIFACT is restricted to the GitHub Actions artifact build.');
  }
  const requested = process.env.PENDULUM_EVIDENCE_SOURCE_COMMIT ?? '';
  if (!/^[0-9a-f]{40}$/.test(requested) || requested !== headCommit || requested !== process.env.GITHUB_SHA) {
    throw new Error('CI evidence source commit must equal both the checked-out HEAD and GITHUB_SHA.');
  }
  try {
    execFileSync('git', ['diff', '--quiet', '--ignore-submodules', '--'], { stdio: 'ignore' });
    execFileSync('git', ['diff', '--cached', '--quiet', '--ignore-submodules', '--'], { stdio: 'ignore' });
  } catch {
    throw new Error('CI evidence artifact requires a clean tracked source checkout.');
  }
  return requested;
}

function preserveVolatileEvidence(candidate: unknown, committed: unknown, preserveTestSnapshot: boolean): void {
  if (!candidate || !committed || typeof candidate !== 'object' || typeof committed !== 'object') return;
  const target = candidate as Record<string, unknown>;
  const source = committed as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    if (!(key in source)) continue;
    if (volatileEvidenceKeys.has(key) || (preserveTestSnapshot && key === 'tests')) {
      target[key] = source[key];
    } else {
      preserveVolatileEvidence(target[key], source[key], preserveTestSnapshot);
    }
  }
}
