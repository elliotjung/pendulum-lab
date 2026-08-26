import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalClaimEvidenceSurface,
  claimEvidenceById,
  claimEvidenceMarkdown,
  claimEvidenceRuntimeRows,
  claimEvidenceWarnings,
  clearRuntimeClaimEvidence,
  currentClaimEvidenceSurface,
  setRuntimeClaimEvidence
} from '../src/research/claimEvidenceSurfaces';
import { createSubmissionManifest } from '../src/export/manifest';
import type { RuntimeSnapshot } from '../src/types/domain';

const NOW = '2026-08-25T00:00:00.000Z';

function evidence() {
  return {
    schemaVersion: 'pendulum-evidence-summary/v1',
    generatedAt: '2026-08-20T00:00:00.000Z',
    provenance: {
      sourceCommit: 'a'.repeat(40),
      expiresAt: '2026-09-03T00:00:00.000Z',
      dirtyWorktree: false
    },
    sourceReportSha256: Object.fromEntries(
      [
        'reports/vitest-public-results.json',
        'reports/cross-validation.json',
        'reports/mutation-aggregate.json',
        'reports/energy-benchmark.json',
        'reports/gpu-adapter-matrix.json',
        'reports/publication-status.json'
      ].map((path) => [path, 'b'.repeat(64)])
    ),
    mutation: { status: 'low' },
    gpu: { status: 'partial' },
    publication: { status: 'partial' },
    claims: [
      {
        id: 'tests.unit',
        displayValue: '1600 / 1600 pass',
        status: 'passed',
        evidenceGeneratedAt: '2026-08-20T00:00:00.000Z',
        sourceCommit: 'a'.repeat(40),
        sourceReport: 'reports/vitest-public-results.json',
        reproduce: 'npm run verify'
      },
      {
        id: 'validation.scipy.regular',
        displayValue: '~6e-14',
        status: 'passed',
        evidenceGeneratedAt: '2026-08-20T00:00:00.000Z',
        sourceCommit: 'a'.repeat(40),
        sourceReport: 'reports/cross-validation.json',
        reproduce: 'npm run validate:cross'
      },
      {
        id: 'testing.mutation',
        displayValue: '65.32%',
        status: 'low',
        evidenceGeneratedAt: '2026-08-20T00:00:00.000Z',
        sourceCommit: 'a'.repeat(40),
        sourceReport: 'reports/mutation-aggregate.json',
        reproduce:
          'npm run mutation:aggregate -- reports/mutation-shards --out-dir reports --break 65 --low 70 --high 85'
      },
      {
        id: 'benchmark.energy.methods',
        displayValue: '14 methods profiled',
        status: 'measured',
        evidenceGeneratedAt: '2026-08-20T00:00:00.000Z',
        sourceCommit: 'a'.repeat(40),
        sourceReport: 'reports/energy-benchmark.json',
        reproduce: 'npm run benchmark:energy'
      },
      {
        id: 'gpu.vendor-matrix',
        displayValue: '1 / 3 vendors',
        status: 'partial',
        evidenceGeneratedAt: '2026-08-20T00:00:00.000Z',
        sourceCommit: 'a'.repeat(40),
        sourceReport: 'reports/gpu-adapter-matrix.json',
        reproduce: 'npm run benchmark:gpu-matrix'
      },
      {
        id: 'publication.release',
        displayValue: 'partial',
        status: 'partial',
        evidenceGeneratedAt: '2026-08-20T00:00:00.000Z',
        sourceCommit: 'a'.repeat(40),
        sourceReport: 'reports/publication-status.json',
        reproduce: 'npm run release:status'
      }
    ]
  };
}

const SNAPSHOT: RuntimeSnapshot = {
  schemaVersion: 'pendulum-session/v10-ts',
  systemType: 'double',
  method: 'rk4',
  mode: 'research',
  dt: 0.003,
  tolerance: 1e-7,
  stepsPerFrame: 6,
  damping: 0,
  parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 },
  state: [0.1, 0.2, 0, 0],
  simTime: 0,
  seed: 1,
  hash: 'claim-surface-fixture'
};

afterEach(() => {
  clearRuntimeClaimEvidence();
});

describe('canonical claim evidence surfaces', () => {
  it('propagates low mutation, partial GPU, and partial publication downgrades with their caveats', () => {
    const surface = canonicalClaimEvidenceSurface(evidence(), { now: NOW });

    expect(claimEvidenceById(surface, 'testing.mutation')).toMatchObject({
      effectiveVisibleLevel: 'measured',
      displayValue: '65.32%',
      validity: 'current'
    });
    expect(claimEvidenceById(surface, 'gpu.vendor-matrix')).toMatchObject({
      effectiveVisibleLevel: 'measured',
      displayValue: '1 / 3 vendors'
    });
    expect(claimEvidenceById(surface, 'publication.release')).toMatchObject({
      effectiveVisibleLevel: 'informational',
      displayValue: 'partial'
    });
    expect(claimEvidenceById(surface, 'testing.mutation')?.caveats.join(' ')).toContain('below the quality target');
    expect(claimEvidenceById(surface, 'gpu.vendor-matrix')?.caveats.join(' ')).toContain(
      'cannot imply complete GPU certification'
    );
    expect(claimEvidenceById(surface, 'publication.release')?.caveats.join(' ')).toContain('remain visibly partial');
    expect(claimEvidenceWarnings(surface)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('testing.mutation: validated -> measured'),
        expect.stringContaining('gpu.vendor-matrix: validated -> measured'),
        expect.stringContaining('publication.release: publication-ready -> informational')
      ])
    );
  });

  it('re-evaluates freshness at consumption time and labels formerly current evidence informational', () => {
    const surface = canonicalClaimEvidenceSurface(evidence(), { now: '2026-09-10T00:00:00.000Z' });

    expect(claimEvidenceById(surface, 'tests.unit')).toMatchObject({
      validity: 'expired',
      effectiveVisibleLevel: 'informational'
    });
    expect(claimEvidenceById(surface, 'testing.mutation')?.effectiveVisibleLevel).toBe('informational');
    expect(claimEvidenceById(surface, 'gpu.vendor-matrix')?.effectiveVisibleLevel).toBe('informational');
    expect(claimEvidenceById(surface, 'tests.unit')?.caveats.join(' ')).toContain('Expired or undated');
  });

  it('fails closed on malformed or missing evidence and clears a previously loaded runtime snapshot', () => {
    setRuntimeClaimEvidence(evidence());
    expect(currentClaimEvidenceSurface({ now: NOW }).loadState).toBe('loaded');

    setRuntimeClaimEvidence({ schemaVersion: 'pendulum-evidence-summary/v1', claims: [] });
    const unavailable = currentClaimEvidenceSurface({ now: NOW });

    expect(unavailable.loadState).toBe('unavailable');
    expect(claimEvidenceById(unavailable, 'testing.mutation')).toMatchObject({
      effectiveVisibleLevel: 'withheld',
      displayValue: null
    });
    expect(claimEvidenceById(unavailable, 'gpu.vendor-matrix')?.effectiveVisibleLevel).toBe('withheld');
    expect(claimEvidenceById(unavailable, 'publication.release')?.effectiveVisibleLevel).toBe('withheld');
    expect(claimEvidenceWarnings(unavailable)[0]).toContain('fail-closed');
  });

  it('hides quantified unit and SciPy values when their bound claim status is failed', () => {
    const failed = evidence();
    for (const claim of failed.claims) {
      if (claim.id === 'tests.unit' || claim.id === 'validation.scipy.regular') claim.status = 'failed';
    }
    const surface = canonicalClaimEvidenceSurface(failed, { now: NOW });
    for (const id of ['tests.unit', 'validation.scipy.regular']) {
      expect(claimEvidenceById(surface, id)).toMatchObject({
        effectiveVisibleLevel: 'withheld',
        displayValue: null
      });
    }
    expect(claimEvidenceMarkdown(surface)).not.toContain('1600 / 1600 pass');
    expect(claimEvidenceMarkdown(surface)).not.toContain('~6e-14');
  });

  it('withholds the energy method count when its bound benchmark is missing', () => {
    const missing = evidence();
    const energy = missing.claims.find((claim) => claim.id === 'benchmark.energy.methods');
    if (!energy) throw new Error('energy claim fixture is missing');
    energy.status = 'missing';
    const surface = canonicalClaimEvidenceSurface(missing, { now: NOW });

    expect(claimEvidenceById(surface, 'benchmark.energy.methods')).toMatchObject({
      effectiveVisibleLevel: 'withheld',
      displayValue: null,
      evidenceStatus: 'missing'
    });
    expect(claimEvidenceMarkdown(surface)).not.toContain('14 methods profiled');
  });

  it('never propagates a quantified value after the canonical evaluator withholds a revoked artifact', () => {
    const baseline = canonicalClaimEvidenceSurface(evidence(), { now: NOW });
    const digest = claimEvidenceById(baseline, 'testing.mutation')!.sourceArtifactSha256;
    if (!digest) throw new Error('testing.mutation fixture is missing its source binding');
    const revoked = canonicalClaimEvidenceSurface(evidence(), {
      now: NOW,
      revokedArtifactSha256: [digest]
    });
    const claim = claimEvidenceById(revoked, 'testing.mutation')!;

    expect(claim.effectiveVisibleLevel).toBe('withheld');
    expect(claim.displayValue).toBeNull();
    expect(claim.caveats.join(' ')).toContain('revoked mutation artifact');
    expect(claimEvidenceMarkdown(revoked)).not.toContain('65.32%');
  });

  it('uses the same evaluated snapshot in runtime rows and research submission manifests', () => {
    const surface = canonicalClaimEvidenceSurface(evidence(), { now: NOW });
    const rows = new Map(claimEvidenceRuntimeRows(surface));
    const manifest = createSubmissionManifest(SNAPSHOT, surface);

    expect(rows.get('testing.mutation')).toBe('measured · current · 65.32%');
    expect(rows.get('gpu.vendor-matrix')).toBe('measured · current · 1 / 3 vendors');
    expect(manifest.claimEvidence).toEqual(surface);
    expect(manifest.claimEvidence.claims.find((claim) => claim.id === 'publication.release')).toMatchObject({
      effectiveVisibleLevel: 'informational',
      displayValue: 'partial'
    });
  });
});
