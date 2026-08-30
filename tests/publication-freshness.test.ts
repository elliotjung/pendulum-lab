import { describe, expect, it } from 'vitest';
import {
  attachPublicationSnapshotMetadata,
  evaluatePublicationFreshness,
  publicationStatusForDisplay
} from '../scripts/publication-status-core';

const generatedAt = '2026-08-26T00:00:00.000Z';
const sourceCommit = '1234567890abcdef1234567890abcdef12345678';

function snapshot() {
  return attachPublicationSnapshotMetadata(
    { status: 'published' as const, pages: { published: true } },
    {
      reportKind: 'source-snapshot',
      snapshotGeneratedAt: generatedAt,
      checkedSourceCommit: sourceCommit,
      environment: { execution: 'local', workflow: null, runId: null },
      freshnessTtl: 'PT24H'
    }
  );
}

describe('publication snapshot freshness', () => {
  it('binds source, purpose, environment, TTL, and expiry into the v2 schema', () => {
    expect(snapshot()).toMatchObject({
      schemaVersion: 'pendulum-publication-status/v2',
      reportKind: 'source-snapshot',
      generatedAt,
      snapshotGeneratedAt: generatedAt,
      checkedSourceCommit: sourceCommit,
      freshnessTtl: 'PT24H',
      expiresAt: '2026-08-27T00:00:00.000Z'
    });
  });

  it('withholds a stale or legacy status instead of displaying historical success as current', () => {
    expect(evaluatePublicationFreshness(snapshot(), { now: Date.parse('2026-08-26T12:00:00Z') })).toBe('current');
    expect(publicationStatusForDisplay(snapshot(), { now: Date.parse('2026-08-27T00:00:01Z') })).toBe('unknown');
    expect(publicationStatusForDisplay({ schemaVersion: 'pendulum-publication-status/v1', status: 'published' })).toBe(
      'unknown'
    );
  });

  it('fails closed when source, environment, or generation aliases are not trustworthy', () => {
    expect(
      evaluatePublicationFreshness({ ...snapshot(), checkedSourceCommit: null }, { now: Date.parse(generatedAt) })
    ).toBe('unknown');
    expect(
      evaluatePublicationFreshness(
        { ...snapshot(), generatedAt: '2026-08-25T00:00:00.000Z' },
        { now: Date.parse(generatedAt) }
      )
    ).toBe('unknown');
    expect(
      evaluatePublicationFreshness(
        { ...snapshot(), environment: { execution: 'mystery' } },
        { now: Date.parse(generatedAt) }
      )
    ).toBe('unknown');
  });

  it('rejects malformed source coordinates and TTLs at report construction', () => {
    expect(() =>
      attachPublicationSnapshotMetadata(
        { status: 'partial' },
        {
          reportKind: 'deployment-probe',
          snapshotGeneratedAt: generatedAt,
          checkedSourceCommit: 'short',
          environment: { execution: 'github-actions', workflow: 'Pages', runId: '1' },
          freshnessTtl: 'P1D'
        }
      )
    ).toThrow(/freshness TTL|checkedSourceCommit/);
  });
});
