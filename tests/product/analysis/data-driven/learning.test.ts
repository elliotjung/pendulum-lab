import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  trainLearning,
  evaluateLearning,
  validateLearning,
  learningDefaults,
  type LearningData,
  type LearningSettings
} from '../../../../src/product/adapters/analysis/data-driven/learning';
import type { SindyResult } from '../../../../src/research/sindy';
import type { HamiltonianModel } from '../../../../src/research/hamiltonianLearning';
import type { DmdResult } from '../../../../src/research/dmd';
import * as sindy from '../../../../src/research/sindy';
import * as dmd from '../../../../src/research/dmd';
import * as havok from '../../../../src/research/havok';
import * as svd from '../../../../src/research/svd';
import * as reservoir from '../../../../src/research/reservoir';
import * as hamiltonian from '../../../../src/research/hamiltonianLearning';
import { rk4Step } from '../../../../src/physics/integrators';
import { rhsDuffing } from '../../../../src/physics/duffing';

afterEach(() => vi.restoreAllMocks());

function circle(canonical = false): LearningData {
  return {
    times: Array.from({ length: 400 }, (_, i) => i * 0.05),
    values: Array.from({ length: 400 }, (_, i) => [Math.sin(i * 0.05), Math.cos(i * 0.05)]),
    labels: canonical ? ['q0', 'p0'] : ['x', 'v'],
    units: ['1', '1'],
    axisUnit: 's',
    provenance: canonical
      ? { canonical: true, coordinateOrder: 'q,p', canonicalUnits: ['1', '1'] }
      : { fixture: 'analytic-oscillator' }
  };
}
function settings(data: LearningData, method: LearningSettings['method']): LearningSettings {
  return {
    ...learningDefaults(data, method),
    polynomialDegree: method === 'hamiltonian' ? 2 : 1,
    ridge: 1e-8,
    rolloutSteps: 24
  };
}
describe('S23 learning native adapters and replay', () => {
  it('recovers sparse harmonic dynamics from split-only central differences', () => {
    const data = circle(),
      s = settings(data, 'sindy'),
      result = trainLearning(data, s),
      fit = result.model.payload as SindyResult;
    expect(fit.equations[0]!.activeTerms.map((t) => t.term)).toEqual(['x1']);
    expect(fit.equations[1]!.activeTerms.map((t) => t.term)).toEqual(['x0']);
    expect(fit.equations[0]!.activeTerms[0]!.coefficient).toBeCloseTo(Math.sin(0.05) / 0.05, 6);
    expect(result.metrics.validationRmse).toBeLessThan(1e-7);
    expect(result.metrics.rolloutRmse).toBeLessThan(0.001);
    expect(evaluateLearning(data, s, JSON.parse(JSON.stringify(result.model)))).toEqual(result);
  });
  it('recovers DMD frequency and forecasts held-out observations', () => {
    const data = circle(),
      s = settings(data, 'dmd'),
      result = trainLearning(data, s),
      fit = result.model.payload as DmdResult;
    expect(fit.angularFrequencies[0]).toBeCloseTo(1, 6);
    expect(result.metrics.validationRmse).toBeLessThan(1e-8);
    expect(result.metrics.rolloutRmse).toBeLessThan(1e-7);
    expect(result.rows[0]![0]).toBe(data.times[s.splitIndex + 1]);
    expect(evaluateLearning(data, s, result.model)).toEqual(result);
  });
  it('fits a seeded reservoir with separate one-step and autonomous rollout diagnostics', () => {
    const data = circle(),
      s = settings(data, 'reservoir'),
      result = trainLearning(data, s);
    expect(result.metrics.validationRmse).toBeLessThan(0.02);
    expect(result.metrics.rolloutRmse).toBeLessThan(0.05);
    expect(trainLearning(data, s)).toEqual(result);
    expect(evaluateLearning(data, s, result.model)).toEqual(result);
  });
  it('learns canonical oscillator H and reports finite integration energy drift', () => {
    const data = circle(true),
      s = settings(data, 'hamiltonian'),
      result = trainLearning(data, s),
      fit = result.model.payload as HamiltonianModel;
    const coefficient = (name: string) => fit.coefficients[fit.terms.findIndex((t) => t.name === name)];
    expect(coefficient('p0^2')).toBeCloseTo((0.5 * Math.sin(0.05)) / 0.05, 5);
    expect(coefficient('q0^2')).toBeCloseTo((0.5 * Math.sin(0.05)) / 0.05, 5);
    expect(result.metrics.learnedEnergyDrift).toBeLessThan(1e-6);
    expect(evaluateLearning(data, s, result.model)).toEqual(result);
  });
  it('freezes HAVOK basis and distinguishes conditional reconstruction from forecast', () => {
    const data = circle(),
      s = { ...settings(data, 'havok'), delays: 12, rank: 2 },
      result = trainLearning(data, s);
    expect(result.metrics.trainingRelativeResidual).toBeLessThan(1e-6);
    expect(result.metrics.validationRmse).toBeLessThan(1e-6);
    expect(result.warnings.join(' ')).toContain('자율 예측이 아닙니다');
    expect(result.columns).toHaveLength(3);
    expect(evaluateLearning(data, s, result.model)).toEqual(result);
  });
  it('recovers the native conservative Duffing quartic Hamiltonian from a held-out trajectory', () => {
    const params = { damping: 0, linearStiffness: -1, cubicStiffness: 1, driveAmplitude: 0, driveFrequency: 1 };
    let state = Float64Array.from([1.2, 0.3, 0]);
    const next = new Float64Array(3),
      values: number[][] = [];
    for (let i = 0; i < 512; i++) {
      values.push([state[0]!, state[1]!]);
      rk4Step(state, 0.01, (row, out) => rhsDuffing(row, params, out), next);
      state = Float64Array.from(next);
    }
    const data: LearningData = {
      times: values.map((_, i) => i * 0.01),
      values,
      labels: ['q0', 'p0'],
      units: ['1', '1'],
      axisUnit: '1',
      provenance: { canonical: true, coordinateOrder: 'q,p', canonicalUnits: ['1', '1'], warnings: ['source-warning'] }
    };
    const s = { ...learningDefaults(data, 'hamiltonian'), polynomialDegree: 4, ridge: 1e-10 },
      output = trainLearning(data, s),
      fit = output.model.payload as HamiltonianModel;
    expect(hamiltonian.hamiltonianCoefficient(fit, 'p0^2')).toBeCloseTo(0.5, 3);
    expect(hamiltonian.hamiltonianCoefficient(fit, 'q0^2')).toBeCloseTo(-0.5, 3);
    expect(hamiltonian.hamiltonianCoefficient(fit, 'q0^4')).toBeCloseTo(0.25, 3);
    expect(output.metrics.rolloutRmse).toBeLessThan(0.001);
    expect(output.warnings).toContain('source-warning');
  });
  it.each(['sindy', 'dmd', 'havok', 'reservoir', 'hamiltonian'] as const)(
    '%s reevaluation invokes no native fitting or SVD',
    (method) => {
      const data = circle(method === 'hamiltonian'),
        s = settings(data, method),
        output = trainLearning(data, s);
      const fail = () => {
        throw new Error('REFIT');
      };
      vi.spyOn(sindy, 'identifyDynamics').mockImplementation(fail);
      vi.spyOn(dmd, 'dynamicModeDecomposition').mockImplementation(fail);
      vi.spyOn(havok, 'havokAnalysis').mockImplementation(fail);
      vi.spyOn(svd, 'thinSvd').mockImplementation(fail);
      vi.spyOn(reservoir, 'trainEsn').mockImplementation(fail);
      vi.spyOn(hamiltonian, 'learnHamiltonian').mockImplementation(fail);
      expect(evaluateLearning(data, s, output.model)).toEqual(output);
    }
  );
});
describe('S23 split integrity and malformed input', () => {
  it.each(['sindy', 'dmd', 'havok', 'reservoir', 'hamiltonian'] as const)(
    '%s never fits on changed validation observations',
    (method) => {
      const data = circle(method === 'hamiltonian'),
        s = {
          ...settings(data, method),
          preprocessing: method === 'hamiltonian' ? ('none' as const) : ('standardize' as const)
        };
      const original = trainLearning(data, s);
      const changed = structuredClone(data);
      changed.values.slice(s.splitIndex).forEach((row) => {
        row[0] = row[0]! * 1.3 + 0.1;
        row[1] = row[1]! * 0.9;
      });
      const perturbed = trainLearning(changed, s);
      expect(perturbed.model).toEqual(original.model);
      expect(perturbed.metrics.validationRmse).not.toBe(original.metrics.validationRmse);
      expect(perturbed.warnings.length).toBeGreaterThan(0);
    }
  );
  it('rejects nonuniform time, rank/canonical mismatch, oversized/ragged/unsafe data', () => {
    const data = circle(),
      s = settings(data, 'dmd');
    for (const mutate of [
      (d: LearningData) => {
        d.times[50]! += 0.01;
      },
      (d: LearningData) => {
        d.values[2]!.pop();
      },
      (d: LearningData) => {
        d.values[2]![0] = Infinity;
      },
      (d: LearningData) => {
        d.units = [];
      },
      (d: LearningData) => {
        d.values = Array(513).fill([0, 1]);
      }
    ]) {
      const invalid = structuredClone(data);
      mutate(invalid);
      expect(() => validateLearning(invalid, s)).toThrow();
    }
    expect(() => validateLearning(data, { ...s, method: 'hamiltonian' })).toThrow(/canonical/);
    expect(() =>
      validateLearning(circle(true), { ...settings(circle(true), 'hamiltonian'), preprocessing: 'standardize' })
    ).toThrow(/canonical/);
    const getter = structuredClone(data);
    Object.defineProperty(getter, 'provenance', {
      enumerable: true,
      get() {
        throw new Error('EXECUTED');
      }
    });
    expect(() => validateLearning(getter, s)).toThrow(/일반 JSON/);
    expect(() => validateLearning(data, { ...s, selection: [0, 0] })).toThrow(/중복/);
    expect(() => validateLearning(data, { ...s, splitIndex: 399 })).toThrow();
    expect(() => validateLearning(data, { ...settings(data, 'havok'), rank: 6, delays: 4 })).toThrow(/HAVOK/);
  });
  it.each(['sindy', 'dmd', 'havok', 'reservoir', 'hamiltonian'] as const)(
    '%s rejects malformed external model payloads without refitting',
    (method) => {
      const data = circle(method === 'hamiltonian'),
        s = settings(data, method),
        trained = trainLearning(data, s);
      const model = structuredClone(trained.model),
        payload = model.payload as Record<string, unknown>;
      payload.unexpected = true;
      expect(() => evaluateLearning(data, s, model)).toThrow(/필드/);
      const mismatch = structuredClone(trained.model);
      mismatch.dimension = 4;
      expect(() => evaluateLearning(data, s, mismatch)).toThrow(/lineage/);
      const changed = structuredClone(data);
      changed.values[10]![0] = changed.values[10]![0]! + 0.1;
      expect(() => evaluateLearning(changed, s, trained.model)).toThrow(/lineage/);
    }
  );
  it('rejects corrupted native model dimensions, unsafe features and singular fits', () => {
    const data = circle();
    for (const method of ['sindy', 'dmd', 'havok', 'reservoir', 'hamiltonian'] as const) {
      const input = method === 'hamiltonian' ? circle(true) : data,
        s = settings(input, method),
        output = trainLearning(input, s),
        model = structuredClone(output.model),
        p = model.payload as Record<string, unknown>;
      if (method === 'sindy') (p.equations as { coefficients: number[] }[])[0]!.coefficients.pop();
      if (method === 'dmd') p.operator = [1];
      if (method === 'havok') (p.basis as number[])[0] = 100;
      if (method === 'reservoir') p.readout = [];
      if (method === 'hamiltonian') (p.terms as { exponents: number[] }[])[0]!.exponents[0] = 100;
      expect(() => evaluateLearning(input, s, model)).toThrow();
    }
    const constant = { ...data, values: data.values.map(() => [1, 1]) };
    expect(() => trainLearning(constant, { ...settings(constant, 'sindy'), ridge: 0 })).toThrow(
      /rank-deficient|positive-definite/
    );
    expect(() => trainLearning(constant, { ...settings(constant, 'dmd'), ridge: 0 })).toThrow(/positive-definite|유한/);
    expect(() => trainLearning(constant, { ...settings(constant, 'dmd'), preprocessing: 'standardize' })).toThrow(
      /상수/
    );
  });
  it.each(['sindy', 'dmd', 'havok', 'reservoir', 'hamiltonian'] as const)(
    '%s rejects forged finite diagnostic metadata without refitting',
    (method) => {
      const data = circle(method === 'hamiltonian'),
        s = settings(data, method),
        output = trainLearning(data, s);
      const forged = structuredClone(output.model),
        payload = forged.payload as Record<string, unknown>;
      if (method === 'sindy') (payload.equations as { residualNorm: number }[])[0]!.residualNorm = 999;
      if (method === 'dmd') payload.angularFrequencies = [999, 999];
      if (method === 'havok') payload.trainingResidual = 999;
      if (method === 'reservoir') payload.trainNrmse = [999, 999];
      if (method === 'hamiltonian') payload.rSquared = 999;
      expect(() => evaluateLearning(data, s, forged)).toThrow(/진단/);
    }
  );
});
