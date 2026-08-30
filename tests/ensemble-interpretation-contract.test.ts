import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  validateEnsembleInterpretation,
  type EnsembleInterpretation
} from '../scripts/validate-ensemble-interpretation';

describe('finite-time ensemble interpretation contract', () => {
  it('accepts the checked reference-to-perturbation-to-ensemble example', async () => {
    const example = JSON.parse(
      await readFile('documents/examples/ensemble-interpretation-example.json', 'utf8')
    ) as EnsembleInterpretation;
    expect(validateEnsembleInterpretation(example)).toEqual([]);
  });

  it('rejects an unexplained spaghetti plot that changes multiple initial components', () => {
    expect(
      validateEnsembleInterpretation({
        schemaVersion: 'pendulum-ensemble-interpretation/v1',
        stages: ['ensemble'],
        referenceInitialState: [2, 2.1, 0, 0],
        perturbation: {
          component: 'theta2',
          componentIndex: 1,
          delta: 1e-4,
          unit: 'rad',
          model: 'unspecified',
          seed: null
        },
        members: [
          { id: 'a', role: 'perturbation', initialState: [2.2, 2.1001, 0, 0], color: 'red', legend: '' },
          { id: 'b', role: 'perturbation', initialState: [2, 2.1002, 0, 0], color: 'red', legend: '' }
        ],
        horizon: { duration: 30, unit: 's', finiteTime: false },
        numerics: { integrator: 'rk4', stepPolicy: '' },
        summary: { observable: '', quantiles: { p05: 3, p50: 2, p95: 1 }, uncertaintyMethod: '' },
        interpretation: { question: '', nonClaim: '' }
      })
    ).toEqual(
      expect.arrayContaining([
        'interpretation must progress from reference to one perturbation to ensemble',
        'ensemble must contain exactly one reference member',
        'perturbation members may change only the declared component',
        'horizon must be positive seconds and explicitly finite-time',
        'interpretation requires a question and an explicit finite-scope non-claim'
      ])
    );
  });
});
