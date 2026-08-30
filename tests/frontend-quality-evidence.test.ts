import { describe, expect, it } from 'vitest';
import {
  validateFlakeLedger,
  validateFrontendPerformanceEvidence
} from '../scripts/validate-frontend-quality-evidence';

describe('cold/warm performance evidence contract', () => {
  it('keeps the cold sample separate and proves a regression fixture trips a gate', () => {
    expect(
      validateFrontendPerformanceEvidence({
        schemaVersion: 'pendulum-frontend-performance/v1',
        generatedAt: '2026-08-26T00:00:00.000Z',
        sourceCommit: 'a'.repeat(40),
        runnerFingerprint: { osImage: 'ubuntu-x', browserRevision: 'chromium-x', nodeVersion: '26.3.0' },
        cold: { samples: [{ lcpMs: 1800, tbtMs: 100 }], thresholds: { lcpMs: 2500, tbtMs: 200 }, status: 'pass' },
        warm: {
          samples: [
            { lcpMs: 1200, tbtMs: 20 },
            { lcpMs: 1250, tbtMs: 25 },
            { lcpMs: 1300, tbtMs: 30 }
          ],
          thresholds: { lcpMs: 2000, tbtMs: 150 },
          status: 'pass'
        },
        longTasks: [{ lane: 'cold', durationMs: 62, attribution: 'initial app chunk evaluation' }],
        regressionFixture: { name: 'extra-blocking-js', coldFailed: true, warmFailed: false }
      })
    ).toEqual([]);
  });
});

describe('browser flake ledger contract', () => {
  const now = Date.parse('2026-08-26T00:00:00.000Z');

  it('requires raw traces, expiring upstream exceptions, and an honest 1% alert', () => {
    expect(
      validateFlakeLedger(
        {
          schemaVersion: 'pendulum-flake-ledger/v1',
          generatedAt: '2026-08-26T00:00:00.000Z',
          windowDays: 30,
          suite: 'landing-firefox',
          totalRuns: 50,
          thresholdRate: 0.01,
          retryPolicy: { preserveOriginalFailure: true },
          events: [
            {
              occurredAt: '2026-08-25T00:00:00.000Z',
              browser: 'firefox',
              step: 'teardown',
              traceArtifact: 'artifacts/run-1/trace.zip',
              knownUpstream: 'https://example.invalid/upstream/1',
              expiresAt: '2026-09-26T00:00:00.000Z'
            }
          ],
          alert: true
        },
        { now }
      )
    ).toEqual([]);
  });
});
