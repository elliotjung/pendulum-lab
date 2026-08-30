import { describe, expect, it } from 'vitest';
import { validateReleaseMutation } from '../scripts/release-mutation-gate';

const now = Date.parse('2026-08-26T00:00:00.000Z');
const baseline = {
  schemaVersion: 'pendulum-mutation-aggregate/v1',
  generatedAt: '2026-08-25T00:00:00.000Z',
  mutationScore: 72,
  coveredMutationScore: 71,
  statusCounts: { Killed: 71, Survived: 29, Timeout: 0 },
  files: [{ filePath: 'src/app/tabRouting.ts' }]
};

describe('mutation quality target', () => {
  it('requires both total and covered mutation scores to reach 70 percent', () => {
    expect(() => validateReleaseMutation(baseline, { now })).not.toThrow();
    expect(() => validateReleaseMutation({ ...baseline, coveredMutationScore: 69.99 }, { now })).toThrow(
      /covered mutation score/
    );
  });
});
