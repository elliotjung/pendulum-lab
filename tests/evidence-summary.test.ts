import { describe, expect, it } from 'vitest';
import { approxScientific, buildEvidenceSummary } from '../src/research/evidenceSummary';

describe('evidence summary', () => {
  it('formats the shared pass count and external blockers from report JSON', () => {
    const summary = buildEvidenceSummary({
      generatedAt: '2026-07-07T00:00:00.000Z',
      sourceReports: { vitestResults: 'reports/vitest-results.json' },
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
        cases: [
          { name: 'regular small-angle', maxDivergence: 4.1e-14 },
          { name: 'chaotic', maxDivergence: 1e-8 }
        ]
      },
      gpuAdapterMatrix: {
        status: 'partial',
        coverage: { passed: 1, required: 3 },
        rows: [{ vendor: 'nvidia', status: 'missing' }],
        reproduce: 'npm run benchmark:gpu-matrix',
        caveat: 'Physical evidence only.'
      },
      mutationAggregate: {
        status: 'passed', mutationScore: 65.32, coveredMutationScore: 68.34, reportCount: 29,
        statusCounts: { Survived: 2006, NoCoverage: 293 }
      },
      energyBenchmark: {
        steps: 100000,
        rows: [
          { name: 'RK4', maxRelDrift: 5.4e-8 },
          { name: 'GBS', maxRelDrift: 8.9e-13 }
        ]
      },
      provenance: {
        sourceCommit: 'abc123', packageVersion: '10.35.0', lockfileSha256: 'deadbeef',
        dirtyWorktree: false, expiresAfterDays: 14, expiresAt: '2026-07-21T00:00:00.000Z'
      }
    });

    expect(summary.tests.passLabel).toBe('959 / 959 pass');
    expect(summary.validation.scipyAgreement.display).toBe('~4e-14');
    expect(summary.finalization.find((item) => item.id === 'npm-publish')?.status).toBe('blocked-external');
    expect(summary.finalization.find((item) => item.id === 'gpu-vendor-matrix')?.note).toContain('nvidia');
    expect(summary.mutation.score).toBe(65.32);
    expect(summary.energy.profiledMethods).toBe(2);
    expect(summary.energy.bestMethod).toBe('GBS');
    expect(summary.provenance.sourceCommit).toBe('abc123');
  });

  it('uses a compact approximate scientific notation for display values', () => {
    expect(approxScientific(5.76e-14)).toBe('~6e-14');
    expect(approxScientific(null)).toBe('n/a');
  });
});
