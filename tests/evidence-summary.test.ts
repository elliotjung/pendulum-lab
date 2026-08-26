import { describe, expect, it } from 'vitest';
import {
  acceptedGpuEvidenceGeneratedAt,
  approxScientific,
  buildEvidenceSummary,
  type EvidenceSummaryInput
} from '../src/research/evidenceSummary';

describe('evidence summary', () => {
  it('formats the shared pass count and external blockers from report JSON', () => {
    const input: EvidenceSummaryInput = {
      generatedAt: '2026-07-07T00:00:00.000Z',
      sourceReports: { vitestResults: 'reports/vitest-public-results.json' },
      vitestResults: {
        numTotalTests: 959,
        numPassedTests: 959,
        numFailedTests: 0,
        numTotalTestSuites: 462,
        testResults: [{}, {}],
        success: true,
        startTime: Date.parse('2026-07-07T00:00:00.000Z')
      },
      reviewerKitManifest: {
        status: 'ready',
        artifacts: [
          { priority: 'required', available: true },
          { priority: 'recommended', available: true }
        ],
        missingRequired: [],
        missingRecommended: []
      },
      publicationStatus: {
        generatedAt: '2026-07-06T00:00:00.000Z',
        status: 'partial',
        npm: { published: false },
        zenodo: { published: false, doi: null },
        githubRelease: { url: 'https://example.test/release' },
        pages: { url: 'https://example.test/reviewer' },
        caveats: ['No DOI yet.']
      },
      literatureAnchors: {
        allPass: true,
        anchors: [
          { id: 'period-doubling-onset', computed: 1.0663715, published: 1.0663, tolerance: 0.005, pass: true },
          { id: 'melnikov-threshold', computed: 1.0187742, published: 1.0187743, tolerance: 1e-8, pass: true }
        ]
      },
      crossValidation: {
        generatedAt: '2026-07-05T00:00:00.000Z',
        cases: [
          { name: 'regular small-angle', maxDivergence: 4.1e-14, pass: true },
          { name: 'chaotic', maxDivergence: 1e-8, pass: true }
        ]
      },
      gpuAdapterMatrix: {
        generatedAt: '2026-07-07T00:00:00.000Z',
        status: 'partial',
        coverage: { passed: 1, required: 3 },
        rows: [
          { vendor: 'intel', status: 'pass', generatedAt: '2026-06-30T00:00:00.000Z' },
          { vendor: 'nvidia', status: 'missing', generatedAt: null }
        ],
        reproduce: 'npm run benchmark:gpu-matrix',
        caveat: 'Physical evidence only.'
      },
      mutationAggregate: {
        generatedAt: '2026-07-04T00:00:00.000Z',
        status: 'passed',
        mutationScore: 65.32,
        coveredMutationScore: 68.34,
        reportCount: 29,
        statusCounts: { Survived: 2006, NoCoverage: 293 }
      },
      energyBenchmark: {
        generatedAt: '2026-07-03T00:00:00.000Z',
        steps: 100000,
        rows: [
          { name: 'RK4', maxRelDrift: 5.4e-8 },
          { name: 'GBS', maxRelDrift: 8.9e-13 }
        ]
      },
      provenance: {
        sourceCommit: 'abc123',
        packageVersion: '10.35.0',
        lockfileSha256: 'deadbeef',
        dirtyWorktree: false,
        expiresAfterDays: 14,
        expiresAt: '2026-07-21T00:00:00.000Z'
      }
    };
    const summary = buildEvidenceSummary(input);

    expect(summary.tests.passLabel).toBe('959 / 959 pass');
    expect(summary.validation.scipyAgreement.display).toBe('~4e-14');
    expect(summary.finalization.find((item) => item.id === 'npm-publish')?.status).toBe('blocked-external');
    expect(summary.finalization.find((item) => item.id === 'gpu-vendor-matrix')?.note).toContain('nvidia');
    expect(summary.mutation.score).toBe(65.32);
    expect(summary.energy.profiledMethods).toBe(2);
    expect(summary.energy.bestMethod).toBe('GBS');
    expect(summary.provenance.sourceCommit).toBe('abc123');
    expect(summary.claims.find((claim) => claim.id === 'tests.unit')?.status).toBe('passed');
    expect(summary.claims.find((claim) => claim.id === 'validation.scipy.regular')?.status).toBe('passed');
    expect(summary.claims.find((claim) => claim.id === 'gpu.vendor-matrix')?.evidenceGeneratedAt).toBe(
      '2026-06-30T00:00:00.000Z'
    );

    const failed = buildEvidenceSummary({
      ...input,
      vitestResults: {
        numTotalTests: 2,
        numPassedTests: 1,
        numFailedTests: 1,
        success: false,
        startTime: Date.parse('2026-07-07T00:00:00.000Z')
      },
      crossValidation: {
        generatedAt: '2026-07-05T00:00:00.000Z',
        cases: [{ name: 'regular small-angle', maxDivergence: 1, pass: false }]
      }
    });
    expect(failed.claims.find((claim) => claim.id === 'tests.unit')?.status).toBe('failed');
    expect(failed.claims.find((claim) => claim.id === 'validation.scipy.regular')?.status).toBe('failed');

    const missing = buildEvidenceSummary({ ...input, vitestResults: {}, crossValidation: { cases: [] } });
    expect(missing.claims.find((claim) => claim.id === 'tests.unit')?.status).toBe('missing');
    expect(missing.claims.find((claim) => claim.id === 'validation.scipy.regular')?.status).toBe('missing');
  });

  it('uses the oldest accepted physical GPU row and fails closed on inconsistent coverage', () => {
    expect(
      acceptedGpuEvidenceGeneratedAt({
        generatedAt: '2026-08-20T00:00:00.000Z',
        coverage: { passed: 2 },
        rows: [
          { status: 'pass', generatedAt: '2026-08-10T00:00:00.000Z' },
          { status: 'pass', generatedAt: '2026-08-01T00:00:00.000Z' }
        ]
      })
    ).toBe('2026-08-01T00:00:00.000Z');
    expect(
      acceptedGpuEvidenceGeneratedAt({
        generatedAt: '2026-08-20T00:00:00.000Z',
        coverage: { passed: 2 },
        rows: [{ status: 'pass', generatedAt: '2026-08-10T00:00:00.000Z' }]
      })
    ).toBeNull();
  });

  it('uses a compact approximate scientific notation for display values', () => {
    expect(approxScientific(5.76e-14)).toBe('~6e-14');
    expect(approxScientific(null)).toBe('n/a');
  });
});
