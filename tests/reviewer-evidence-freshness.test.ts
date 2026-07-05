import { describe, expect, it } from 'vitest';
import { evidenceFreshness, evidenceProvenance, needsAttention } from '../src/reviewer/evidenceFreshness';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-05T00:00:00.000Z');

describe('evidenceFreshness', () => {
  it('classifies fresh vs stale against the TTL, preferring metadata.generatedAt', () => {
    const fresh = evidenceFreshness({ metadata: { generatedAt: new Date(NOW - 2 * DAY).toISOString() } }, 30, NOW);
    expect(fresh.state).toBe('fresh');
    expect(fresh.ageDays).toBeCloseTo(2, 6);
    expect(fresh.label).toBe('fresh (2.0d)');

    const stale = evidenceFreshness({ generatedAt: new Date(NOW - 41 * DAY).toISOString() }, 30, NOW);
    expect(stale.state).toBe('stale');
    expect(stale.label).toBe('stale (41.0d / TTL 30d)');
  });

  it('metadata timestamp wins over the top-level one', () => {
    const result = evidenceFreshness({
      generatedAt: new Date(NOW - 100 * DAY).toISOString(),
      metadata: { generatedAt: new Date(NOW - 1 * DAY).toISOString() }
    }, 30, NOW);
    expect(result.state).toBe('fresh');
    expect(result.ageDays).toBeCloseTo(1, 6);
  });

  it('reports unknown when there is no parseable timestamp', () => {
    for (const report of [{}, null, { generatedAt: 'not-a-date' }, { metadata: {} }]) {
      const result = evidenceFreshness(report, 30, NOW);
      expect(result.state).toBe('unknown');
      expect(result.ageDays).toBeNull();
      expect(result.label).toBe('freshness unknown');
    }
  });

  it('boundary: exactly at the TTL is still fresh, just past it is stale', () => {
    const atTtl = evidenceFreshness({ generatedAt: new Date(NOW - 30 * DAY).toISOString() }, 30, NOW);
    expect(atTtl.state).toBe('fresh');
    const past = evidenceFreshness({ generatedAt: new Date(NOW - 30 * DAY - 60 * 1000).toISOString() }, 30, NOW);
    expect(past.state).toBe('stale');
  });
});

describe('evidenceProvenance', () => {
  it('extracts sourceSha, run id/url, and attested from report metadata', () => {
    const provenance = evidenceProvenance({
      metadata: {
        sourceSha: 'abc123',
        gitSha: 'def456',
        sourceRunId: '99',
        sourceRunUrl: 'https://github.com/x/y/actions/runs/99',
        attested: true
      }
    });
    expect(provenance).toEqual({
      sourceSha: 'abc123',
      runId: '99',
      runUrl: 'https://github.com/x/y/actions/runs/99',
      attested: true
    });
  });

  it('falls back to gitSha for pre-dual-field reports and nulls when absent', () => {
    expect(evidenceProvenance({ metadata: { gitSha: 'def456' } }).sourceSha).toBe('def456');
    expect(evidenceProvenance({ metadata: { gitSha: 'def456' } }).attested).toBeNull();
    expect(evidenceProvenance({})).toEqual({ sourceSha: null, runId: null, runUrl: null, attested: null });
  });
});

describe('needsAttention (missing-evidence filter)', () => {
  it('passing status + fresh report does not need attention', () => {
    for (const status of ['pass', 'PASS', 'passed', 'done', 'ready-for-owner-publish', 'published', 'verified', 'ok']) {
      expect(needsAttention(status, { state: 'fresh' })).toBe(false);
    }
  });

  it('non-passing statuses always need attention', () => {
    for (const status of ['fail', 'missing', 'partial', 'unknown', '']) {
      expect(needsAttention(status, { state: 'fresh' })).toBe(true);
    }
  });

  it('stale or unknown freshness flags even passing evidence', () => {
    expect(needsAttention('pass', { state: 'stale' })).toBe(true);
    expect(needsAttention('pass', { state: 'unknown' })).toBe(true);
  });
});
