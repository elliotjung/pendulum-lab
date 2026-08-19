import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { buildEvidenceSummary } from '../src/research/evidenceSummary';
import { assertEvidenceSourceCommit, evidenceWorktreeIsDirty } from './evidence-provenance';

const sourceReports = {
  vitestResults: 'reports/vitest-results.json',
  reviewerKitManifest: 'reports/reviewer-kit-manifest.json',
  publicationStatus: 'reports/publication-status.json',
  literatureAnchors: 'reports/literature-anchors.json',
  crossValidation: 'reports/cross-validation.json',
  gpuAdapterMatrix: 'reports/gpu-adapter-matrix.json',
  mutationAggregate: 'reports/mutation-aggregate.json',
  energyBenchmark: 'reports/energy-benchmark.json'
};

const checkOnly = process.argv.includes('--check');
const evidencePath = 'reports/evidence-summary.json';
const volatileEvidenceKeys = new Set(['generatedAt', 'sourceCommit', 'dirtyWorktree', 'expiresAt']);

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

const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as { version?: string };
const lockfile = await readFile('package-lock.json');
const worktreeDirty = evidenceWorktreeIsDirty();
if (!checkOnly && worktreeDirty) {
  throw new Error(
    'Refusing to refresh public evidence from a dirty worktree. Commit the source and successful test report first.'
  );
}
const generatedAt = new Date();
const expiresAfterDays = 14;
const summary = buildEvidenceSummary({
  generatedAt: generatedAt.toISOString(),
  sourceReports,
  vitestResults: await readJson(sourceReports.vitestResults),
  reviewerKitManifest: await readJson(sourceReports.reviewerKitManifest),
  publicationStatus: await readJson(sourceReports.publicationStatus),
  literatureAnchors: await readJson(sourceReports.literatureAnchors),
  crossValidation: await readJson(sourceReports.crossValidation),
  gpuAdapterMatrix: await readJson(sourceReports.gpuAdapterMatrix),
  mutationAggregate: await readJson(sourceReports.mutationAggregate),
  energyBenchmark: await readJson(sourceReports.energyBenchmark),
  provenance: {
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
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
if (!checkOnly) {
  if (process.env.PENDULUM_SYNC_LANDING === '1' && (await exists(dirname(landingSummaryPath)))) {
    await writeJson(landingSummaryPath, summary);
    console.log(`Wrote reports/evidence-summary.json and ${landingSummaryPath}`);
  } else {
    console.log('Wrote reports/evidence-summary.json');
  }
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
