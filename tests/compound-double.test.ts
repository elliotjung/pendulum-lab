import { describe, expect, it } from 'vitest';
import {
  compoundDoubleMassMatrix,
  compoundDoubleMassMatrixDiagnostics,
  createCompoundDoublePendulumDerivative,
  energyCompoundDouble,
  rhsCompoundDouble
} from '../src/physics/compoundDouble';
import { PhysicsEvaluationError } from '../src/physics/errors';
import { rk4Step } from '../src/physics/integrators';
import {
  compoundDoubleReferenceEnergy,
  compoundDoubleReferenceMassMatrix,
  rhsCompoundDoubleReference
} from '../src/validation/compoundDoubleReference';
import type { PendulumParameters } from '../src/types/domain';

const PARAMETERS: PendulumParameters = { m1: 1.7, m2: 0.9, l1: 1.2, l2: 0.8, g: 9.81 };

function expectClose(actual: number, expected: number, relativeTolerance = 2e-12): void {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(relativeTolerance * scale);
}

describe('uniform-rod compound double pendulum derivation', () => {
  it('builds the COM-plus-I_cm mass matrix without double-counting hinge inertia', () => {
    const state = [0.7, -0.4, 0, 0];
    const matrix = compoundDoubleMassMatrix(state, PARAMETERS);
    const coupling = 0.5 * PARAMETERS.m2 * PARAMETERS.l1 * PARAMETERS.l2;
    expectClose(matrix.m11, (PARAMETERS.m1 / 3 + PARAMETERS.m2) * PARAMETERS.l1 ** 2);
    expectClose(matrix.m12, coupling * Math.cos(state[0]! - state[1]!));
    expectClose(matrix.m22, (PARAMETERS.m2 * PARAMETERS.l2 ** 2) / 3);

    const reference = compoundDoubleReferenceMassMatrix(state, PARAMETERS);
    expectClose(matrix.m11, reference.m11);
    expectClose(matrix.m12, reference.m12);
    expectClose(matrix.m22, reference.m22);
    expectClose(matrix.determinant, reference.determinant);

    const diagnostics = compoundDoubleMassMatrixDiagnostics(state, PARAMETERS);
    expect(diagnostics.positiveDefinite).toBe(true);
    expect(diagnostics.singular).toBe(false);
    const configurationIndependentLowerBound =
      PARAMETERS.m2 * PARAMETERS.l1 ** 2 * PARAMETERS.l2 ** 2 * (PARAMETERS.m1 / 9 + PARAMETERS.m2 / 12);
    expect(matrix.determinant).toBeGreaterThanOrEqual(configurationIndependentLowerBound * (1 - 2e-15));
  });

  it('counts COM translation and I_cm rotation exactly once in the energy', () => {
    const omega = 2.3;
    const firstOnly = energyCompoundDouble([0, 0, omega, 0], PARAMETERS);
    const secondOnly = energyCompoundDouble([0, 0, 0, omega], PARAMETERS);
    const rest = energyCompoundDouble([0, 0, 0, 0], PARAMETERS);
    expectClose(firstOnly.KE, 0.5 * (PARAMETERS.m1 / 3 + PARAMETERS.m2) * PARAMETERS.l1 ** 2 * omega ** 2);
    expectClose(secondOnly.KE, (0.5 * (PARAMETERS.m2 * PARAMETERS.l2 ** 2 * omega ** 2)) / 3);
    expectClose(firstOnly.PE, rest.PE);
    expectClose(secondOnly.PE, rest.PE);
  });

  it('matches an independent Cartesian virtual-work reference', () => {
    const cases: Array<{ parameters: PendulumParameters; state: number[]; gamma: number }> = [
      { parameters: PARAMETERS, state: [0.8, -0.5, 1.1, -0.7], gamma: 0 },
      {
        parameters: { m1: 0.6, m2: 2.4, l1: 0.7, l2: 1.8, g: 3.7 },
        state: [-2.2, 1.4, -3.1, 2.6],
        gamma: 0.17
      },
      {
        parameters: { m1: 4.2, m2: 0.3, l1: 2.1, l2: 0.45, g: 0 },
        state: [Math.PI - 0.02, -Math.PI + 0.04, 0.6, 1.9],
        gamma: -0.05
      }
    ];
    for (const fixture of cases) {
      const production = rhsCompoundDouble(fixture.state, fixture.parameters, fixture.gamma, new Float64Array(4));
      const reference = rhsCompoundDoubleReference(fixture.state, fixture.parameters, fixture.gamma);
      for (let index = 0; index < 4; index += 1) {
        expectClose(production[index]!, reference[index]!, 2e-11);
      }
      const productionEnergy = energyCompoundDouble(fixture.state, fixture.parameters);
      const referenceEnergy = compoundDoubleReferenceEnergy(fixture.state, fixture.parameters);
      expectClose(productionEnergy.KE, referenceEnergy.KE);
      expectClose(productionEnergy.PE, referenceEnergy.PE);
      expectClose(productionEnergy.total, referenceEnergy.total);
    }
  });
});

describe('compound double pendulum physical invariants', () => {
  it('conserves mechanical energy in a bounded undamped RK4 trajectory', () => {
    const state = new Float64Array([1.1, -0.7, 0.3, -0.2]);
    const next = new Float64Array(4);
    const derivative = createCompoundDoublePendulumDerivative(PARAMETERS);
    const initialEnergy = energyCompoundDouble(state, PARAMETERS).total;
    const energyScale = Math.max(
      1,
      Math.abs(initialEnergy),
      PARAMETERS.g * (PARAMETERS.l1 * (PARAMETERS.m1 / 2 + PARAMETERS.m2) + (PARAMETERS.m2 * PARAMETERS.l2) / 2)
    );
    let maxRelativeDrift = 0;
    for (let step = 0; step < 12_000; step += 1) {
      rk4Step(state, 0.00025, derivative, next);
      state.set(next);
      if (step % 20 === 0) {
        maxRelativeDrift = Math.max(
          maxRelativeDrift,
          Math.abs(energyCompoundDouble(state, PARAMETERS).total - initialEnergy) / energyScale
        );
      }
    }
    expect(maxRelativeDrift).toBeLessThan(2e-9);
  });

  it('reproduces both independently derived small-angle normal modes', () => {
    const a = (PARAMETERS.m1 / 3 + PARAMETERS.m2) * PARAMETERS.l1 ** 2;
    const b = 0.5 * PARAMETERS.m2 * PARAMETERS.l1 * PARAMETERS.l2;
    const d = (PARAMETERS.m2 * PARAMETERS.l2 ** 2) / 3;
    const k1 = (PARAMETERS.m1 / 2 + PARAMETERS.m2) * PARAMETERS.g * PARAMETERS.l1;
    const k2 = 0.5 * PARAMETERS.m2 * PARAMETERS.g * PARAMETERS.l2;
    const determinant = a * d - b * b;
    const traceCoefficient = k1 * d + k2 * a;
    const discriminant = traceCoefficient ** 2 - 4 * determinant * k1 * k2;
    const eigenvalues = [
      (traceCoefficient - Math.sqrt(discriminant)) / (2 * determinant),
      (traceCoefficient + Math.sqrt(discriminant)) / (2 * determinant)
    ];

    for (const omegaSquared of eigenvalues) {
      const rawMode: [number, number] = [omegaSquared * b, k1 - omegaSquared * a];
      const norm = Math.hypot(...rawMode);
      const mode: [number, number] = [rawMode[0] / norm, rawMode[1] / norm];
      const amplitude = 1e-6;
      const derivative = rhsCompoundDouble(
        [amplitude * mode[0], amplitude * mode[1], 0, 0],
        PARAMETERS,
        0,
        new Float64Array(4)
      );
      expectClose(derivative[2]! / amplitude, -omegaSquared * mode[0], 2e-9);
      expectClose(derivative[3]! / amplitude, -omegaSquared * mode[1], 2e-9);
    }
  });

  it('obeys reflection and 2-pi periodic symmetries', () => {
    const state = [1.3, -0.9, 0.8, -1.1];
    const reflected = state.map((value) => -value);
    const shifted = [state[0]! + 2 * Math.PI, state[1]! - 2 * Math.PI, state[2]!, state[3]!];
    const forward = rhsCompoundDouble(state, PARAMETERS, 0.2, new Float64Array(4));
    const mirror = rhsCompoundDouble(reflected, PARAMETERS, 0.2, new Float64Array(4));
    const periodic = rhsCompoundDouble(shifted, PARAMETERS, 0.2, new Float64Array(4));
    for (let index = 0; index < 4; index += 1) {
      expectClose(mirror[index]!, -forward[index]!);
      expectClose(periodic[index]!, forward[index]!);
    }
    expectClose(energyCompoundDouble(reflected, PARAMETERS).total, energyCompoundDouble(state, PARAMETERS).total);
    expectClose(energyCompoundDouble(shifted, PARAMETERS).total, energyCompoundDouble(state, PARAMETERS).total);
  });
});

describe('compound double pendulum parameter limits and guards', () => {
  it('approaches a single uniform rod as the second-rod mass tends to zero', () => {
    const parameters = { ...PARAMETERS, m2: 1e-7 };
    const theta1 = 0.6;
    const derivative = rhsCompoundDouble([theta1, -0.3, 0, 0], parameters, 0, new Float64Array(4));
    const singleUniformRodAcceleration = (-3 * parameters.g * Math.sin(theta1)) / (2 * parameters.l1);
    expectClose(derivative[2]!, singleUniformRodAcceleration, 2e-6);
  });

  it('has no acceleration without gravity, motion, or damping torque', () => {
    const derivative = rhsCompoundDouble([1.2, -2.1, 0, 0], { ...PARAMETERS, g: 0 }, 0, new Float64Array(4));
    expect(Array.from(derivative)).toEqual([0, 0, 0, 0]);
  });

  it('rejects invalid parameters and fails loudly at the numerical singularity threshold', () => {
    expect(() => rhsCompoundDouble([0, 0, 0, 0], { ...PARAMETERS, m1: 0 }, 0, new Float64Array(4))).toThrow(
      PhysicsEvaluationError
    );
    try {
      rhsCompoundDouble([0, 0, 0, 0], { ...PARAMETERS, m2: 1e-20 }, 0, new Float64Array(4));
      throw new Error('expected a singular-matrix diagnostic');
    } catch (error) {
      expect(error).toBeInstanceOf(PhysicsEvaluationError);
      expect((error as PhysicsEvaluationError).code).toBe('SINGULAR_MASS_MATRIX');
    }
  });
});
