import { describe, expect, it } from 'vitest';
import { createDesignBudget, parseDesignVariableLines } from '../src/app/parity/research-design-controller';
import { studyBatchTargets, studySpecFromSnapshot } from '../src/app/parity/research-batch-runner';
import type { ParameterStudyPlan } from '../src/app/parity/shared';
import type { RuntimeSnapshot } from '../src/types/domain';

const snapshot: RuntimeSnapshot = {
  schemaVersion: 'runtime-snapshot/v2',
  systemType: 'double',
  method: 'rk4',
  mode: 'research',
  dt: 0.01,
  tolerance: 1e-6,
  stepsPerFrame: 1,
  damping: 0,
  state: [1, 2, 0, 0],
  parameters: { m1: 1, m2: 2, l1: 1, l2: 1.5, g: 9.81 },
  simTime: 0,
  seed: null,
  hash: 'abc'
};

describe('research controller helpers', () => {
  it('parses design variable lines and clamps design budgets', () => {
    expect(parseDesignVariableLines('theta1,2,1\nbad,0,1\ndamping,0,0.4')).toEqual([
      { key: 'theta1', min: 1, max: 2 },
      { key: 'damping', min: 0, max: 0.4 }
    ]);
    expect(createDesignBudget(999, 1, 0)).toEqual({ maxPoints: 256, maxTimeMs: 10000, maxFailures: 1 });
  });

  it('selects pending and failed study-batch targets', () => {
    const plan: ParameterStudyPlan = {
      id: 'study',
      generatedAt: 'now',
      variable: 'theta1',
      strategy: 'grid',
      min: 0,
      max: 1,
      count: 3,
      values: [0, 0.5, 1],
      experiments: [
        {
          id: 'a',
          label: 'a',
          patch: {},
          snapshot,
          estimate: 'ok',
          results: {
            lambdaMax: 0,
            lambdaBlockStdError: 0,
            rqaDeterminism: 1,
            rqaDivergence: 0,
            ftle: 0,
            completedAt: 'now'
          }
        },
        { id: 'b', label: 'b', patch: {}, snapshot, estimate: 'todo' },
        { id: 'c', label: 'c', patch: {}, snapshot, estimate: 'failed', error: 'timeout' }
      ]
    };
    expect(studyBatchTargets(plan).map((target) => target.point.id)).toEqual(['b', 'c']);
    expect(studyBatchTargets(plan, { failedOnly: true }).map((target) => target.point.id)).toEqual(['c']);
  });

  it('maps snapshots to declarative chaos job specs', () => {
    const { spec, state0 } = studySpecFromSnapshot(snapshot);
    expect(spec).toEqual({ kind: 'double', m1: 1, m2: 2, l1: 1, l2: 1.5, g: 9.81 });
    expect(state0).toEqual([1, 2, 0, 0]);
  });
});
