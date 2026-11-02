import { describe, expect, it } from 'vitest';
import { defaultDiscreteConfig, toCanonicalDiscrete } from '../../../../src/product/adapters/physics/discrete';
import { runInverse } from '../../../../src/product/adapters/analysis/inverse/execute';
import type { InverseRequest } from '../../../../src/product/adapters/analysis/inverse/contracts';

function additiveRequest(kind: 'sobol' | 'pce'): InverseRequest {
  const canonical = toCanonicalDiscrete({
    ...defaultDiscreteConfig('system:standard-map'),
    parameters: { kickStrength: 0 },
    initialState: [0.15, 0.3],
    iterations: 1
  });
  if (!canonical.ok) throw new Error('Invalid independent fixture');
  return {
    schema: 'pendulum-inverse-request/v1',
    id: `review-${kind}`,
    experiment: canonical.value,
    settings: {
      kind,
      variables: [
        { group: 'initialConditions', key: 'theta', min: 0.1, max: 0.2 },
        { group: 'initialConditions', key: 'p', min: 0.2, max: 0.4 }
      ],
      metric: { index: 0, statistic: 'final' },
      samples: kind === 'sobol' ? 256 : 32,
      degree: 1,
      seed: 'independent-physical-benchmark'
    }
  };
}

describe('S22 independent physical UQ review', () => {
  it('recovers analytic additive variance fractions through the actual standard-map adapter', async () => {
    // At K=0, a single map step has theta'=theta+p. Away from the wrap,
    // independent uniform widths 0.1 and 0.2 give variance fractions 1/5 and 4/5.
    const request = additiveRequest('sobol');
    const before = JSON.stringify(request);
    const result = await runInverse(request);
    expect(result.rows[0]![1]).toBeCloseTo(0.2, 1);
    expect(result.rows[1]![1]).toBeCloseTo(0.8, 1);
    expect(result.rows[0]![2]).toBeCloseTo(0.2, 1);
    expect(result.rows[1]![2]).toBeCloseTo(0.8, 1);
    expect(result.evaluations).toBe(1024);
    expect(JSON.stringify(request)).toBe(before);
  });

  it('fits and independently validates a linear physical surrogate with exact variance fractions', async () => {
    const result = await runInverse(additiveRequest('pce'));
    expect(result.rows[0]![1]).toBeCloseTo(0.2, 8);
    expect(result.rows[1]![1]).toBeCloseTo(0.8, 8);
    expect(result.payload.validationRmse).toBeLessThan(1e-9);
    expect(result.payload.validationMaxError).toBeLessThan(1e-9);
    const training = result.payload.training as Array<{ inputs: number[] }>;
    const validation = result.payload.validation as Array<{ inputs: number[] }>;
    const keys = new Set(training.map((v) => JSON.stringify(v.inputs)));
    expect(validation.every((v) => !keys.has(JSON.stringify(v.inputs)))).toBe(true);
  });

  it('refuses an undefined Sobol importance ranking for a zero-variance physical observable', async () => {
    const request = additiveRequest('sobol');
    const zero: InverseRequest = {
      ...request,
      experiment: {
        ...request.experiment,
        initialConditions: {
          theta: { kind: 'scalar', value: 0, unit: 'rad' },
          p: { kind: 'scalar', value: 0, unit: '1' }
        }
      },
      settings: {
        ...request.settings,
        kind: 'sobol',
        variables: [{ group: 'parameters', key: 'kickStrength', min: 0, max: 1 }],
        metric: { index: 0, statistic: 'final' },
        samples: 8,
        degree: 1,
        seed: 'zero-variance'
      }
    };
    await expect(runInverse(zero)).rejects.toThrow(/분산/);
  });
});
