import { describe, expect, it } from 'vitest';
import { validateReleaseMutation } from '../scripts/release-mutation-gate';

const now = Date.parse('2026-08-19T00:00:00.000Z');

function report(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'pendulum-mutation-aggregate/v1',
    generatedAt: '2026-08-18T00:00:00.000Z',
    mutationScore: 72,
    coveredMutationScore: 75,
    statusCounts: { Killed: 72, Survived: 28 },
    files: [{ filePath: 'src/app/tabRouting.ts' }],
    ...overrides
  };
}

describe('release mutation gate', () => {
  it('accepts fresh 70%+ evidence that includes routing lifecycle mutations', () => {
    expect(() => validateReleaseMutation(report(), { now })).not.toThrow();
  });

  it('rejects the historical low-band aggregate', () => {
    expect(() => validateReleaseMutation(report({ mutationScore: 65.32 }), { now })).toThrow(/at least 70/);
  });

  it('rejects missing routing scope, stale evidence, and runtime errors', () => {
    expect(() => validateReleaseMutation(report({ files: [] }), { now })).toThrow(/routing lifecycle/);
    expect(() => validateReleaseMutation(report({ generatedAt: '2026-07-01T00:00:00.000Z' }), { now })).toThrow(
      /no older/
    );
    expect(() => validateReleaseMutation(report({ statusCounts: { RuntimeError: 1 } }), { now })).toThrow(
      /runtime-error/
    );
  });
});
