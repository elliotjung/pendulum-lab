import { describe, expect, test } from 'vitest';
import {
  AutoChartSphericalChain,
  DissipatedWorkTracker,
  PhysicsEvaluationError,
  adaptiveStep,
  createDoublePendulumDerivative,
  createTripleRhsWorkspace,
  doubleMassMatrixDiagnostics,
  energyDouble,
  forceLevelDampingPower,
  integrateAdaptive,
  integratorRegistry,
  replayAcceptedSteps,
  rhsDouble,
  rhsTriple,
  step
} from '../src/physics';
import { bulirschStoerStep } from '../src/physics/adaptive';
import { implicitMidpointNewton } from '../src/physics/implicitDiagnostics';
import { trBdf2Step } from '../src/physics/stiff';
import { poincareResultCsv, poincareSection } from '../src/chaos/poincare';
import { shadowingHorizon } from '../src/chaos/shadowing';
import type { Derivative, StepDiagnostics } from '../src/physics/types';

const doubleParams = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

const oscillator: Derivative = (state, out): void => {
  out[0] = state[1]!;
  out[1] = -state[0]!;
};

describe('relative mass-matrix conditioning and structured failures', () => {
  test('a uniformly tiny but well-conditioned system is not mistaken for a singular one', () => {
    const params = { m1: 1e-6, m2: 1e-6, l1: 1e-3, l2: 1e-3, g: 9.81 };
    const state = Float64Array.of(0.3, -0.2, 0.1, -0.4);
    const diagnostics = doubleMassMatrixDiagnostics(state, params);
    expect(Math.abs(diagnostics.determinant)).toBeLessThan(1e-14);
    expect(diagnostics.singular).toBe(false);
    const out = new Float64Array(4);
    rhsDouble(state, params, 0, out);
    expect(Array.from(out).every(Number.isFinite)).toBe(true);
  });

  test('an ill-conditioned solve throws a stable code without partially publishing output', () => {
    const out = new Float64Array([7, 7, 7, 7]);
    try {
      rhsDouble([0, 0, 0, 0], { ...doubleParams, m1: 1e-20 }, 0, out);
      throw new Error('expected a structured singularity');
    } catch (error) {
      expect(error).toBeInstanceOf(PhysicsEvaluationError);
      expect((error as PhysicsEvaluationError).code).toBe('SINGULAR_MASS_MATRIX');
    }
    expect(Array.from(out)).toEqual([7, 7, 7, 7]);
  });

  test('triple RHS reuses an SPD workspace and exposes solve diagnostics', () => {
    const workspace = createTripleRhsWorkspace();
    const matrix = workspace.matrix;
    const params = { ...doubleParams, m3: 0.8, l3: 0.7 };
    const out = new Float64Array(6);
    rhsTriple([0.4, -0.2, 0.7, 0.1, -0.3, 0.2], params, 0.1, out, workspace);
    rhsTriple([0.5, -0.1, 0.6, 0.2, -0.2, 0.1], params, 0.1, out, workspace);
    expect(workspace.matrix).toBe(matrix);
    expect(workspace.lastSolve?.ok).toBe(true);
    expect(workspace.lastSolve?.conditionEstimate).toBeGreaterThanOrEqual(1);
  });
});

describe('component-wise adaptive control and replay metadata', () => {
  test('normalises every component against its own atol/rtol scale', () => {
    const state = Float64Array.of(1, 1e-3);
    const rhs: Derivative = (s, out): void => {
      out[0] = s[0]!;
      out[1] = 20 * s[1]! + 1;
    };
    const absTol = Float64Array.of(1e-8, 1e-5);
    const relTol = Float64Array.of(1e-6, 1e-3);
    const outcome = adaptiveStep(state, 0.05, rhs, { absTol, relTol, maxDt: 0.1 });
    const expected = Math.max(
      outcome.errorComponents[0]! / (absTol[0]! + relTol[0]! * Math.max(Math.abs(state[0]!), Math.abs(outcome.y[0]!))),
      outcome.errorComponents[1]! / (absTol[1]! + relTol[1]! * Math.max(Math.abs(state[1]!), Math.abs(outcome.y[1]!)))
    );
    expect(outcome.errorNorm).toBeCloseTo(expected, 14);
  });

  test('fails explicitly instead of accepting an inaccurate minimum step', () => {
    const one = adaptiveStep(Float64Array.of(1, 0), 1, oscillator, {
      absTol: 1e-20,
      relTol: 1e-20,
      minDt: 1,
      maxDt: 1
    });
    expect(one.accepted).toBe(false);
    expect(one.failureReason).toBe('minimum-step-tolerance');

    const run = integrateAdaptive(Float64Array.of(1, 0), 1, oscillator, {
      absTol: 1e-20,
      relTol: 1e-20,
      minDt: 1,
      maxDt: 1,
      initialDt: 1
    });
    expect(run.reachedTarget).toBe(false);
    expect(run.finalTime).toBe(0);
    expect(run.terminationReason).toBe('minimum-step-tolerance');
  });

  test('exports an accepted sequence that exactly replays the adaptive trajectory', () => {
    const run = integrateAdaptive(Float64Array.of(1, 0), 3, oscillator, {
      absTol: Float64Array.of(1e-10, 1e-11),
      relTol: Float64Array.of(1e-9, 1e-9),
      initialDt: 0.05,
      maxDt: 0.2,
      controller: 'pi'
    });
    expect(run.reachedTarget).toBe(true);
    expect(run.acceptedSteps).toHaveLength(run.accepted);
    expect(run.acceptedSteps.at(-1)?.endTime).toBe(3);
    const replay = replayAcceptedSteps(Float64Array.of(1, 0), oscillator, run.acceptedSteps);
    expect(replay.finalTime).toBe(3);
    expect(Array.from(replay.y)).toEqual(Array.from(run.y));
  });

  test('validates controller bounds and reports an exhausted iteration budget', () => {
    expect(() => adaptiveStep(Float64Array.of(1), 0.1, (s, o) => (o[0] = s[0]!), { safety: 2 })).toThrow(/safety/);
    const run = integrateAdaptive(Float64Array.of(1, 0), 10, oscillator, {
      initialDt: 0.01,
      maxIterations: 1
    });
    expect(run.reachedTarget).toBe(false);
    expect(run.terminationReason).toBe('iteration-budget-exhausted');
    expect(run.finalTime).toBeGreaterThan(0);
  });
});

describe('implicit fail-closed contract and method honesty', () => {
  test('Newton midpoint keeps the previous state when its matrix is singular', () => {
    const rhs: Derivative = (s, out): void => {
      out[0] = s[0]!;
    };
    const report = implicitMidpointNewton([2], 2, rhs, (_s, jac) => {
      jac[0] = 1;
    });
    expect(report.converged).toBe(false);
    expect(report.errorCode).toBe('SINGULAR_NEWTON_MATRIX');
    expect(report.state[0]).toBe(2);
    expect(report.attemptedState).toBeInstanceOf(Float64Array);
  });

  test('Picard/Gauss/TR-BDF2 expose retry diagnostics and never advance a failed state', () => {
    const unstable: Derivative = (s, out): void => {
      out[0] = s[0]!;
    };
    const state = Float64Array.of(1);
    for (const method of ['hmidpoint', 'gauss2'] as const) {
      const diagnostics: Partial<StepDiagnostics> = {};
      const out = new Float64Array(1);
      step(method, state, 10, unstable, out, { diagnostics });
      expect(diagnostics.accepted).toBe(false);
      expect(diagnostics.errorCode).toBe('IMPLICIT_SOLVER_DID_NOT_CONVERGE');
      expect(out[0]).toBe(state[0]);
    }

    const diagnostics: Partial<StepDiagnostics> = {};
    const out = new Float64Array(1);
    trBdf2Step(state, 2 / (2 - Math.SQRT2), unstable, out, { diagnostics });
    expect(diagnostics.accepted).toBe(false);
    expect(out[0]).toBe(state[0]);
  });

  test('model factories attach analytic Jacobians and fixed-step embedded methods are labelled honestly', () => {
    const rhs = createDoublePendulumDerivative(doubleParams, 0);
    expect(rhs.jacobian).toBeTypeOf('function');
    expect(rhs.jacobianProvenance).toBe('analytic-model');
    expect(integratorRegistry.rkf45.name).toContain('monitored fixed-step');
    expect(integratorRegistry.gbs.name).toContain('fixed macro-step');
    expect(() => bulirschStoerStep(Float64Array.of(1, 0), 0.1, oscillator, 1)).toThrow(/kMax/);
  });
});

describe('dissipation, crossing certification, shadowing bands, and chart atlas', () => {
  test('reports dissipated-work balance rather than mislabelling physical loss as drift', () => {
    const gamma = 0.2;
    const state = Float64Array.of(0.5, -0.2, 0.1, 0.3);
    const out = new Float64Array(4);
    const initialEnergy = energyDouble(state, doubleParams).total;
    const tracker = new DissipatedWorkTracker(initialEnergy, (value) => forceLevelDampingPower(value, gamma, 2));
    const rhs: Derivative = (s, o): void => {
      rhsDouble(s, doubleParams, gamma, o);
    };
    const dt = 2e-4;
    for (let i = 0; i < 5000; i += 1) {
      const previous = new Float64Array(state);
      step('rk4', state, dt, rhs, out);
      state.set(out);
      tracker.acceptStep(previous, state, dt);
    }
    const balance = tracker.report(energyDouble(state, doubleParams).total);
    expect(balance.dissipatedWork).toBeGreaterThan(0);
    expect(balance.mechanicalEnergyChange).toBeLessThan(0);
    expect(balance.relativeBalanceError).toBeLessThan(1e-6);
  });

  test('Poincare result/CSV export residual and direction metadata', () => {
    const result = poincareSection(Float64Array.of(1, 0), oscillator, {
      section: (state) => state[0]!,
      direction: 'falling',
      dt: 0.1,
      maxTime: 2,
      maxPoints: 1,
      rootTol: 1e-10
    });
    expect(result.directions).toEqual([-1]);
    expect(result.rootResiduals[0]).toBeLessThan(1e-8);
    expect(result.rootBracketWidths[0]).toBeLessThanOrEqual(1e-10);
    const csv = poincareResultCsv(result, ['q', 'v']);
    expect(csv).toContain('crossing_direction,root_residual,root_bracket_width');
    expect(csv).toContain('falling');
    expect(csv).toContain('# root_tolerance=');
  });

  test('shadowing comparison includes a horizon and discretisation uncertainty band', () => {
    const result = shadowingHorizon(Float64Array.of(1, 0), oscillator, {
      dt: 0.05,
      T: 1,
      threshold: 1e-5,
      referenceDt: 0.01
    });
    expect(result.series.length).toBeGreaterThan(0);
    for (const sample of result.series) {
      expect(sample.lowerBound).toBeLessThanOrEqual(sample.separation);
      expect(sample.upperBound).toBeGreaterThanOrEqual(sample.separation);
    }
    expect(result.finalReferenceUncertainty).toBeGreaterThanOrEqual(0);
  });

  test('spherical-chain atlas enters/exits the embedded chart and certifies invariants', () => {
    const atlas = new AutoChartSphericalChain(
      { masses: [1], lengths: [1], g: 9.81, damping: 0 },
      Float64Array.of(1e-5, 0.3, 1, 0),
      { dt: 2e-4, enterPoleSin: 1e-3, exitPoleSin: 5e-3 }
    );
    expect(atlas.chart).toBe('embedded');
    atlas.step(0.02);
    expect(atlas.chart).toBe('polar');
    const diagnostics = atlas.diagnostics();
    expect(diagnostics.transitions.length).toBeGreaterThanOrEqual(2);
    expect(diagnostics.maxTransitionInvariantError).toBeLessThan(1e-10);
  });
});
