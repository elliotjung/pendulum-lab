import { describe, expect, it } from 'vitest';
import { CLI_BATCH_SCHEMA, runCliBatch, validateCliBatchSpec, type CliBatchSpec } from '../src/research/cliBatchSpec';
import type { ChaosRequest, ChaosResponse } from '../src/workers/chaosProtocol';

const spec: CliBatchSpec = {
  schemaVersion: CLI_BATCH_SCHEMA,
  description: 'test batch',
  jobs: [
    {
      name: 'lyap-baseline',
      request: {
        kind: 'lyapunov',
        spec: { kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
        state0: [2, 2.5, 0, 0],
        settings: { steps: 500 }
      } as Omit<ChaosRequest, 'id'>
    },
    {
      name: 'rqa-baseline',
      request: {
        kind: 'rqa',
        spec: { kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
        state0: [2, 2.5, 0, 0],
        settings: { samples: 60, transientSteps: 100 }
      } as Omit<ChaosRequest, 'id'>
    }
  ]
};

describe('CLI batch spec', () => {
  it('validates a correct spec', () => {
    const verdict = validateCliBatchSpec(spec);
    expect(verdict.ok).toBe(true);
    expect(verdict.spec).not.toBeNull();
  });

  it('rejects bad schema, empty jobs, duplicates, and unknown kinds', () => {
    expect(validateCliBatchSpec(null).ok).toBe(false);
    expect(validateCliBatchSpec({ schemaVersion: 'nope', jobs: [] }).ok).toBe(false);
    const duplicate = { ...spec, jobs: [spec.jobs[0]!, spec.jobs[0]!] };
    expect(validateCliBatchSpec(duplicate).problems.join(' ')).toContain('duplicate');
    const unknown = { ...spec, jobs: [{ name: 'x', request: { kind: 'mystery' } }] };
    expect(validateCliBatchSpec(unknown).problems.join(' ')).toContain('unknown kind');
  });

  it('runs every job with real physics and reports hashes and timings', () => {
    const result = runCliBatch(spec);
    expect(result.schemaVersion).toBe('pendulum-cli-batch-results/v1');
    expect(result.jobs).toHaveLength(2);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
    for (const job of result.jobs) {
      expect(job.ok).toBe(true);
      expect(job.requestHash).toMatch(/^[0-9a-f]+$/);
      expect(job.responseHash).toMatch(/^[0-9a-f]+$/);
      expect(job.elapsedMs).toBeGreaterThanOrEqual(0);
    }
    expect(result.specHash).toMatch(/^[0-9a-f]+$/);
  }, 30_000);

  it('captures failed jobs without aborting the batch', () => {
    const failingRunner = (request: ChaosRequest): ChaosResponse => ({ id: request.id, ok: false, error: 'boom' });
    const result = runCliBatch(spec, failingRunner);
    expect(result.failed).toBe(2);
    expect(result.jobs[0]!.response.ok).toBe(false);
  });
});
