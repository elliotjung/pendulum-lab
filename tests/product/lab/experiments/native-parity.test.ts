import { describe, expect, it } from 'vitest';
import { latinHypercube } from '../../../../src/research/experimentDesign';
import { runExpansionSuite } from '../../../../src/physics/expandedModels-runners';
import { energyDriftProfile } from '../../../../src/research/structurePreservation';
import { defaultDrivenConfig, toCanonicalDriven } from '../../../../src/product/adapters/physics/driven';
import {
  defaultPlanarConfig,
  toCanonicalPlanar,
  createPlanarDerivative,
  createPlanarSimulation
} from '../../../../src/product/adapters/physics/planar';
import { energyDouble } from '../../../../src/physics/double';
import { buildBatch, defaultBatchSettings } from '../../../../src/product/lab/experiments/builders';
import { executeBatchRun } from '../../../../src/product/lab/experiments/execute';
import type { ContractResult } from '../../../../src/product/contracts/validation';
const unwrap = <T>(result: ContractResult<T>): T => {
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
};
describe('S21 preserved native research computation parity', () => {
  it('maps exact existing latinHypercube points into requested physical ranges', () => {
    const source = unwrap(toCanonicalPlanar({ ...defaultPlanarConfig(), duration: 0.2, step: 0.01 })),
      axes = [
        { group: 'initialConditions' as const, key: 'theta1', start: -0.2, end: 0.4, count: 3 },
        { group: 'initialConditions' as const, key: 'theta2', start: 0.1, end: 1, count: 4 }
      ],
      seed = 'native-lhs-parity',
      count = 19;
    const plan = buildBatch(source, { ...defaultBatchSettings(source), kind: 'lhs', axes, count, seed });
    const expected = latinHypercube(2, count, seed).map((point) =>
      axes.map((axis, i) => axis.start + (axis.end - axis.start) * point[i]!)
    );
    expect(plan.runs.map((run) => run.assignments.map((assignment) => assignment.value))).toEqual(expected);
  });
  it('current Euler/RK2/RK4 comparison matches native expansion suite in an equivalent driven model', () => {
    const config = { ...defaultDrivenConfig(), duration: 0.2, step: 0.01 },
      source = unwrap(toCanonicalDriven(config)),
      methods = ['euler', 'rk2', 'rk4'] as const;
    const plan = buildBatch(source, {
      ...defaultBatchSettings(source),
      kind: 'integrators',
      axes: [],
      integratorIds: methods.map((method) => `integrator:${method}`)
    });
    const native = runExpansionSuite({
      model: 'driven',
      methods,
      dt: config.step,
      horizon: config.duration,
      initialState: config.initialState,
      parameterOverrides: {
        ...config.parameters,
        driveAmplitude: config.forcing!.amplitude,
        driveFrequency: config.forcing!.frequency
      },
      bifurcationColumns: 1
    });
    for (const [index, run] of plan.runs.entries()) {
      const result = executeBatchRun({ batchId: plan.id, run });
      expect(result.summary.steps).toBe(native.rows[index]!.completedSteps);
      result.summary.metrics.forEach((metric, i) =>
        expect(metric.final).toBeCloseTo(native.rows[index]!.finalState[i]!, 12)
      );
    }
  });
  it.each(['euler', 'rk2', 'rk4'] as const)(
    '%s: native energyDriftProfile samples equal conservative physical adapter energy measurements',
    (method) => {
      const config = {
          ...defaultPlanarConfig(),
          gamma: 0,
          duration: 0.2,
          step: 0.01,
          integratorId: `integrator:${method}` as const
        },
        initialEnergy = energyDouble(config.initialState, config.parameters).total;
      const profile = energyDriftProfile({
        method,
        rhs: createPlanarDerivative(config),
        energy: (state) => energyDouble(state, config.parameters).total,
        initialState: config.initialState,
        dt: config.step,
        totalTime: config.duration,
        samples: 3
      });
      const native = createPlanarSimulation(config),
        energies: number[] = [];
      while (!native.done) {
        const sample = native.step();
        if (sample.step % 6 === 0 && energies.length < 3)
          energies.push((sample.energy.total - initialEnergy) / (Math.abs(initialEnergy) || 1));
      }
      expect(profile.drift).toEqual(energies);
      expect(profile.times).toEqual([0.06, 0.12, 0.18]);
    }
  );
});
