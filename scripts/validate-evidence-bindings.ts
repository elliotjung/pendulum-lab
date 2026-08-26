import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type JsonObject = Record<string, unknown>;

export interface EvidenceBindingOptions {
  evidencePath: string;
  reportRoot: string;
  expectedCiSourceCommit?: string;
}

export interface EvidenceBindingResult {
  reportCount: number;
  claimCount: number;
  sourceCommit: string;
}

/**
 * Verify the generated summary against the bytes it names. This intentionally
 * runs after summary generation: claim-registry unit tests use synthetic
 * metadata and never need a previous evidence-summary/vitest result to exist.
 */
export async function validateEvidenceBindings(options: EvidenceBindingOptions): Promise<EvidenceBindingResult> {
  const evidence = JSON.parse(await readFile(options.evidencePath, 'utf8')) as JsonObject;
  const sourceReports = object(evidence.sourceReports);
  const sourceHashes = object(evidence.sourceReportSha256);
  const provenance = object(evidence.provenance);
  if (!sourceReports || !sourceHashes || !provenance) throw new Error('Evidence binding metadata is incomplete.');

  const sourceCommit = String(provenance.sourceCommit ?? '');
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error('Evidence sourceCommit must be a full lowercase Git SHA.');
  if (provenance.dirtyWorktree !== false) throw new Error('Evidence binding requires dirtyWorktree=false.');
  if ('expectedCiSourceCommit' in options) {
    if (
      !/^[0-9a-f]{40}$/.test(options.expectedCiSourceCommit ?? '') ||
      sourceCommit !== options.expectedCiSourceCommit
    ) {
      throw new Error('CI evidence bindings must target the current GitHub Actions source commit.');
    }
  }

  const paths = Object.values(sourceReports);
  if (paths.length === 0 || paths.some((path) => typeof path !== 'string')) {
    throw new Error('Evidence sourceReports must contain repository-relative report paths.');
  }
  const uniquePaths = new Set(paths as string[]);
  if (uniquePaths.size !== paths.length) throw new Error('Evidence sourceReports must not contain duplicate paths.');
  const hashPaths = Object.keys(sourceHashes);
  if (hashPaths.length !== uniquePaths.size || hashPaths.some((path) => !uniquePaths.has(path))) {
    throw new Error('Evidence sourceReportSha256 keys must exactly match sourceReports paths.');
  }

  for (const path of uniquePaths) {
    if (!safeReportPath(path)) throw new Error(`Unsafe evidence source report path: ${path}`);
    const expected = sourceHashes[path];
    if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/.test(expected)) {
      throw new Error(`Evidence source report has no SHA-256 binding: ${path}`);
    }
    const actual = createHash('sha256')
      .update(await readFile(join(options.reportRoot, path)))
      .digest('hex');
    if (actual !== expected) throw new Error(`Evidence source report SHA-256 mismatch: ${path}`);
  }

  const claims = Array.isArray(evidence.claims) ? evidence.claims.map(object) : [];
  if (claims.length === 0 || claims.some((claim) => claim === null)) throw new Error('Evidence claims are missing.');
  const claimIds = new Set<string>();
  const publicClaims = new Map<string, JsonObject>();
  for (const claim of claims as JsonObject[]) {
    const id = String(claim.id ?? '');
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/.test(id) || claimIds.has(id)) {
      throw new Error(`Evidence claim id is missing, invalid, or duplicated: ${id || '<missing-id>'}`);
    }
    claimIds.add(id);
    publicClaims.set(id, claim);
    const sourceReport = claim.sourceReport;
    if (typeof sourceReport !== 'string' || !uniquePaths.has(sourceReport)) {
      throw new Error(`Evidence claim ${id} is not bound to a declared source report.`);
    }
    if (claim.sourceCommit !== sourceCommit) throw new Error(`Evidence claim ${id} sourceCommit mismatch.`);
    if (!isoInstant(claim.evidenceGeneratedAt)) {
      throw new Error(`Evidence claim ${id} evidenceGeneratedAt is missing or invalid.`);
    }
  }

  validateCanonicalClaimSurface(evidence, provenance, sourceHashes, publicClaims);

  return { reportCount: uniquePaths.size, claimCount: claims.length, sourceCommit };
}

function validateCanonicalClaimSurface(
  evidence: JsonObject,
  provenance: JsonObject,
  sourceHashes: JsonObject,
  publicClaims: Map<string, JsonObject>
): void {
  const surface = object(evidence.claimEvidence);
  const claims = surface && Array.isArray(surface.claims) ? surface.claims.map(object) : [];
  const levels = ['withheld', 'informational', 'measured', 'validated', 'publication-ready'] as const;
  if (
    !surface ||
    surface.schemaVersion !== 'pendulum-claim-evidence-surface/v1' ||
    surface.loadState !== 'loaded' ||
    surface.evidenceGeneratedAt !== evidence.generatedAt ||
    surface.evidenceSourceCommit !== provenance.sourceCommit ||
    surface.evidenceExpiresAt !== provenance.expiresAt ||
    !isoInstant(surface.evaluatedAt) ||
    claims.length !== publicClaims.size ||
    claims.some((claim) => claim === null)
  ) {
    throw new Error('Canonical claim evidence surface is missing, malformed, or not source-bound.');
  }

  const expectedCounts = Object.fromEntries(levels.map((level) => [level, 0])) as Record<
    (typeof levels)[number],
    number
  >;
  const seen = new Set<string>();
  for (const surfaceClaim of claims as JsonObject[]) {
    const id = String(surfaceClaim.id ?? '');
    const publicClaim = publicClaims.get(id);
    const level = surfaceClaim.effectiveVisibleLevel;
    const sourceArtifact = surfaceClaim.sourceArtifact;
    if (!publicClaim || seen.has(id))
      throw new Error(`Canonical claim evidence id is missing or duplicated: ${id || '<missing-id>'}`);
    seen.add(id);
    if (typeof level !== 'string' || !levels.includes(level as (typeof levels)[number])) {
      throw new Error(`Canonical claim evidence ${id} has an invalid visible level.`);
    }
    expectedCounts[level as (typeof levels)[number]] += 1;
    if (
      typeof sourceArtifact !== 'string' ||
      sourceArtifact !== publicClaim.sourceReport ||
      surfaceClaim.sourceArtifactSha256 !== sourceHashes[sourceArtifact]
    ) {
      throw new Error(`Canonical claim evidence ${id} source artifact binding mismatch.`);
    }
    if (
      surfaceClaim.evidenceStatus !== publicClaim.status ||
      surfaceClaim.validFrom !== publicClaim.evidenceGeneratedAt
    ) {
      throw new Error(`Canonical claim evidence ${id} status or validity origin mismatch.`);
    }
    if (level === 'withheld') {
      if (surfaceClaim.displayValue !== null) {
        throw new Error(`Canonical claim evidence ${id} must omit a withheld display value.`);
      }
    } else if (surfaceClaim.displayValue !== publicClaim.displayValue) {
      throw new Error(`Canonical claim evidence ${id} display value mismatch.`);
    }
    if (
      typeof surfaceClaim.defaultVisibleLevel !== 'string' ||
      !levels.includes(surfaceClaim.defaultVisibleLevel as (typeof levels)[number]) ||
      !['current', 'expired', 'unknown'].includes(String(surfaceClaim.validity)) ||
      !Array.isArray(surfaceClaim.caveats) ||
      surfaceClaim.caveats.some((caveat) => typeof caveat !== 'string')
    ) {
      throw new Error(`Canonical claim evidence ${id} metadata is malformed.`);
    }
  }
  if ([...publicClaims.keys()].some((id) => !seen.has(id))) {
    throw new Error('Canonical claim evidence surface is incomplete.');
  }

  const counts = object(surface.counts);
  if (
    !counts ||
    Object.keys(counts).length !== levels.length ||
    levels.some((level) => counts[level] !== expectedCounts[level])
  ) {
    throw new Error('Canonical claim evidence counts do not match the evaluated claims.');
  }
}

function safeReportPath(path: string): boolean {
  return /^reports\/[a-z0-9][a-z0-9./-]*\.json$/.test(path) && !path.includes('..') && !path.includes('//');
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

function isoInstant(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function directExecution(): boolean {
  const script = process.argv[1];
  return Boolean(script && pathToFileURL(resolve(script)).href === import.meta.url);
}

if (directExecution()) {
  const ciArtifactMode = process.env.PENDULUM_EVIDENCE_CI_ARTIFACT === '1';
  if (ciArtifactMode && (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true')) {
    throw new Error('PENDULUM_EVIDENCE_CI_ARTIFACT is restricted to GitHub Actions.');
  }
  const result = await validateEvidenceBindings({
    evidencePath: process.env.PENDULUM_EVIDENCE_BINDING_SUMMARY ?? 'reports/evidence-summary.json',
    reportRoot: process.env.PENDULUM_EVIDENCE_BINDING_ROOT ?? '.',
    ...(ciArtifactMode ? { expectedCiSourceCommit: process.env.GITHUB_SHA ?? '' } : {})
  });
  console.log(
    `Evidence bindings verified (${result.reportCount} reports, ${result.claimCount} claims, ${result.sourceCommit}).`
  );
}
