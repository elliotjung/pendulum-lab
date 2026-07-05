import { describe, expect, it } from 'vitest';
import {
  freshnessPolicy,
  isGeneratedArtifactPath,
  reportAgeDays,
  reportFreshnessStatus,
  type ReportMetadata
} from '../scripts/report-metadata';

function metadataFixture(overrides: Partial<ReportMetadata> = {}): ReportMetadata {
  return {
    schemaVersion: 'pendulum-report-metadata/v1',
    generatedAt: new Date().toISOString(),
    gitSha: 'abc',
    buildSha: 'abc',
    sourceSha: 'abc',
    attested: true,
    dirty: false,
    dirtyFiles: [],
    sourceDirty: false,
    sourceDirtyFiles: [],
    command: 'test',
    node: process.version,
    os: { type: 't', platform: 'p', release: 'r' },
    sourceRunId: null,
    sourceRunAttempt: null,
    sourceRunUrl: null,
    freshnessPolicy: freshnessPolicy(7, 'warn'),
    ...overrides
  };
}

describe('generated-artifact path classification', () => {
  it('treats evidence and build outputs as generated (never source-dirty)', () => {
    for (const path of [
      'reports/worldclass-scorecard.json',
      'reports/reproduce/manifest.json',
      'dist/index.html',
      'dist-lib/pendulum-lab-core.js',
      'standalone/index.html',
      'docs/api/index.html',
      'coverage/coverage-final.json',
      'test-results/results.xml',
      'paper/paper.pdf',
      'pendulum-lab-v10-10.35.0.tgz'
    ]) {
      expect(isGeneratedArtifactPath(path), path).toBe(true);
    }
  });

  it('treats source, tests, workflows, and docs as source (dirty when modified)', () => {
    for (const path of [
      'src/lib.ts',
      'src/physics/double.ts',
      'tests/report-metadata.test.ts',
      'scripts/report-metadata.ts',
      '.github/workflows/release.yml',
      'docs/api-overview.md',
      'README.md',
      'package.json',
      'paper/paper.md'
    ]) {
      expect(isGeneratedArtifactPath(path), path).toBe(false);
    }
  });
});

describe('report freshness', () => {
  it('computes age in days from generatedAt', () => {
    const now = Date.parse('2026-07-04T00:00:00.000Z');
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(reportAgeDays({ generatedAt: twoDaysAgo }, now)).toBeCloseTo(2, 6);
    expect(reportAgeDays({ generatedAt: 'not-a-date' }, now)).toBeNull();
    expect(reportAgeDays(undefined, now)).toBeNull();
  });

  it('classifies fresh vs stale against the policy window', () => {
    const now = Date.parse('2026-07-04T00:00:00.000Z');
    const fresh = metadataFixture({ generatedAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString() });
    const stale = metadataFixture({ generatedAt: new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString() });
    expect(reportFreshnessStatus(fresh, now)).toBe('fresh');
    expect(reportFreshnessStatus(stale, now)).toBe('stale');
    expect(reportFreshnessStatus(undefined, now)).toBe('missing-metadata');
  });

  it('freshnessPolicy records the window and action', () => {
    const policy = freshnessPolicy(30, 'fail');
    expect(policy.maxAgeDays).toBe(30);
    expect(policy.action).toBe('fail');
    expect(Date.parse(policy.staleAfter)).toBeGreaterThan(Date.now());
  });
});
