import { describe, expect, test } from 'vitest';
import unit1 from '../../../content/learn/course-1/1.1';
import unit2 from '../../../content/learn/course-1/1.2';
import unit3 from '../../../content/learn/course-1/1.3';
import unit4 from '../../../content/learn/course-1/1.4';
import unit5 from '../../../content/learn/course-1/1.5';
import unit6 from '../../../content/learn/course-1/1.6';
import unit7 from '../../../content/learn/course-1/1.7';
import unit8 from '../../../content/learn/course-1/1.8';
import golden from '../../characterization/numerical-golden.fixture.json';
import {
  createFocusDiagnostics,
  createFocusLinearReference,
  focusStateDistance,
  focusFiniteTimeRate
} from '../../../src/product/adapters/physics/focus-diagnostics';
import {
  createFocusRuntime,
  focusPresetConfig,
  FOCUS_NEARBY_OFFSET,
  type FocusFrame,
  type FocusSnapshot
} from '../../../src/product/experiments/runtime';
import {
  defaultPlanarConfig,
  createPlanarSimulation,
  planarPositions,
  type PlanarState,
  type PlanarConfig
} from '../../../src/product/adapters/physics/planar';
import { energyDouble } from '../../../src/physics/double';
import type { LearnUnit } from '../../../src/product/learn/schema';
import { focusScheduler, unwrap } from './fixtures';

function close(actual: number, expected: number, absolute = 1e-12) {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(absolute);
}

function runUnit(unit: LearnUnit, fields: Readonly<Record<string, number>> = {}): FocusSnapshot {
  const scheduler = focusScheduler();
  const runtime = createFocusRuntime(unit.focusExperiment, { schedule: scheduler.schedule });
  unwrap(runtime.setFields(fields));
  runtime.run();
  scheduler.flush();
  const result = runtime.getSnapshot();
  expect(result.status).toBe('completed');
  runtime.dispose();
  return result;
}

function assertConstraints(frame: FocusFrame, config: PlanarConfig) {
  const { first, second } = frame.sample.positions;
  const [v1, v2] = frame.diagnostics.velocities;
  close(Math.hypot(first.x, first.y), config.parameters.l1);
  close(Math.hypot(second.x - first.x, second.y - first.y), config.parameters.l2);
  close(first.x * v1.x + first.y * v1.y, 0);
  close((second.x - first.x) * (v2.x - v1.x) + (second.y - first.y) * (v2.y - v1.y), 0);
}

describe('S09 all eight declared scientific observation tasks', () => {
  test('1.1 coordinate-point: vertical configuration, absolute second angle and full-turn equivalence', () => {
    const runtime = createFocusRuntime(unit1.focusExperiment);
    unwrap(runtime.setFields({ theta1: 0, theta2: 0 }));
    let frame = runtime.getSnapshot();
    close(frame.sample.positions.first.x, 0);
    close(frame.sample.positions.first.y, -1);
    close(frame.sample.positions.second.x, 0);
    close(frame.sample.positions.second.y, -2);
    unwrap(runtime.setFields({ theta1: Math.PI / 2, theta2: 0 }));
    frame = runtime.getSnapshot();
    close(frame.sample.positions.first.x, 1);
    close(frame.sample.positions.second.x, 1);
    close(frame.sample.positions.second.y, -1);
    unwrap(runtime.setFields({ theta1: Math.PI / 2 + 2 * Math.PI, theta2: 2 * Math.PI }));
    const equivalent = runtime.getSnapshot();
    close(equivalent.sample.positions.first.x, frame.sample.positions.first.x);
    close(equivalent.sample.positions.second.y, frame.sample.positions.second.y);
    expect(equivalent.sample.state[0]).toBe(Math.PI / 2 + 2 * Math.PI);
    runtime.dispose();
  });

  test('1.2 length-constraint: default and edited geometry preserve lengths and velocity tangency at all samples', () => {
    const original = runUnit(unit2);
    const extended = runUnit(unit2, { l1: 2, l2: 1 });
    for (const run of [original, extended]) for (const frame of run.series) assertConstraints(frame, run.config);
    expect(extended.series[0]!.sample.state).toEqual([0.3, 0.6, 0, 0]);
    close(extended.series[0]!.sample.positions.first.x, 2 * Math.sin(0.3));
    expect(focusStateDistance(original.sample.state, extended.sample.state)).toBeGreaterThan(0.01);
  });

  test('1.3 matrix-posture: independent aligned and perpendicular inertia/energy limits', () => {
    const runtime = createFocusRuntime(unit3.focusExperiment);
    unwrap(runtime.setFields({ m2: 1, theta1: 0, theta2: 0, omega1: 1, omega2: 1 }));
    const aligned = runtime.getSnapshot();
    aligned.diagnostics.massMatrix.flat().forEach((value, i) => close(value, [2, 1, 1, 1][i]!));
    close(aligned.diagnostics.determinant, 1);
    close(aligned.diagnostics.relativeDeterminant, 0.25);
    close(aligned.sample.energy.KE, 2.5);
    close(aligned.diagnostics.energyTerms.coupling, 1);
    unwrap(runtime.setFields({ theta1: Math.PI / 2, theta2: 0 }));
    const rightAngle = runtime.getSnapshot();
    close(rightAngle.diagnostics.massMatrix[0][1], 0);
    close(rightAngle.diagnostics.massMatrix[1][0], 0);
    close(rightAngle.diagnostics.determinant, 2);
    close(rightAngle.diagnostics.energyTerms.coupling, 0);
    close(rightAngle.sample.energy.KE, 1.5);
    runtime.dispose();
  });

  test('1.4 derivation-balance: independent Euler-Lagrange residual and acceleration contribution sum', () => {
    const config = unwrap(focusPresetConfig(unit4.focusExperiment));
    const [q1, q2, w1, w2] = config.initialState;
    const { m1, m2, l1, l2, g } = config.parameters;
    const { massMatrix: matrix, acceleration } = createFocusDiagnostics(config)(config.initialState);
    // Source-based independent algebra belongs in the scientific oracle only.
    // Tong §2.5.2 (2.72–2.74), generalized to unequal masses/lengths.
    const B = m2 * l1 * l2;
    const C = [B * Math.sin(q1 - q2) * w2 ** 2, -B * Math.sin(q1 - q2) * w1 ** 2];
    const G = [(m1 + m2) * g * l1 * Math.sin(q1), m2 * g * l2 * Math.sin(q2)];
    for (let row = 0; row < 2; row++) {
      close(
        matrix[row]![0] * acceleration.total[0] + matrix[row]![1] * acceleration.total[1] + C[row]! + G[row]!,
        0,
        1e-10
      );
      close(
        acceleration.gravity[row]! + acceleration.velocity[row]! + acceleration.damping[row]!,
        acceleration.total[row]!,
        1e-10
      );
    }
    const [a1, a2] = acceleration.total;
    const dp1 = matrix[0][0] * a1 + B * Math.cos(q1 - q2) * a2 - B * Math.sin(q1 - q2) * (w1 - w2) * w2;
    const dp2 = matrix[1][1] * a2 + B * Math.cos(q1 - q2) * a1 - B * Math.sin(q1 - q2) * (w1 - w2) * w1;
    const dL1 = -B * Math.sin(q1 - q2) * w1 * w2 - G[0]!;
    const dL2 = B * Math.sin(q1 - q2) * w1 * w2 - G[1]!;
    close(dp1 - dL1, 0, 1e-10);
    close(dp2 - dL2, 0, 1e-10);
  });

  test('1.5 zero-velocity: rest contribution vanishes while gravity persists; reversal preserves quadratic acceleration', () => {
    const config = unwrap(focusPresetConfig(unit5.focusExperiment));
    const evaluate = createFocusDiagnostics(config);
    const resting = evaluate([0.5, -0.3, 0, 0]);
    for (let index = 0; index < 2; index++) {
      close(resting.acceleration.velocity[index]!, 0);
      close(resting.acceleration.gravity[index]!, resting.acceleration.total[index]!, 1e-10);
    }
    expect(Math.hypot(...resting.acceleration.gravity)).toBeGreaterThan(0);
    const moving = evaluate(config.initialState);
    const reversed = evaluate([
      config.initialState[0],
      config.initialState[1],
      -config.initialState[2],
      -config.initialState[3]
    ]);
    reversed.acceleration.total.forEach((value, i) => close(value, moving.acceleration.total[i]!));
    expect(Math.hypot(...moving.acceleration.velocity)).toBeGreaterThan(0);
    const aligned = evaluate([0.5, 0.5, 1, 2]);
    aligned.acceleration.velocity.forEach((value) => close(value, 0));
    expect(aligned.massMatrix[0][1]).toBeGreaterThan(0);
  });

  test('1.6 amplitude-error: independently known normal modes and bounded small-amplitude error increase on scaling', () => {
    const small = runUnit(unit6);
    const large = runUnit(unit6, { theta1: 0.5, theta2: Math.SQRT2 * 0.5 });
    close(small.modes![0].frequency, Math.sqrt(9.81 * (2 - Math.SQRT2)));
    close(small.modes![1].frequency, Math.sqrt(9.81 * (2 + Math.SQRT2)));
    close(small.modes![0].shape[1], Math.SQRT2);
    close(small.modes![1].shape[1], -Math.SQRT2);
    const maxError = (run: FocusSnapshot) =>
      Math.max(
        ...run.series.map((frame) =>
          Math.hypot(
            frame.sample.state[0] - frame.linearState![0],
            frame.sample.state[1] - frame.linearState![1]
          )
        )
      );
    expect(maxError(small)).toBeLessThan(0.01);
    expect(maxError(large)).toBeGreaterThan(maxError(small));
    for (const frame of small.series) {
      close(frame.linearState![1], Math.SQRT2 * frame.linearState![0]);
      close(frame.linearState![3], Math.SQRT2 * frame.linearState![2]);
    }
  });

  test('1.7 exchange-total: every stored decomposition sums to shifted energy and total drift stays below 1e-5 J', () => {
    const run = runUnit(unit7);
    const minimum = energyDouble([0, 0, 0, 0], run.config.parameters).PE;
    for (const frame of run.series) {
      const terms = frame.diagnostics.energyTerms;
      close(terms.link1 + terms.link2 + terms.coupling, frame.sample.energy.total - minimum, 1e-10);
      close(terms.totalAboveMinimum, frame.sample.energy.total - minimum, 1e-10);
    }
    const drift = Math.max(
      ...run.series.map((frame) => Math.abs(frame.sample.energy.total - run.series[0]!.sample.energy.total))
    );
    expect(drift).toBeLessThan(1e-5);
    for (const key of ['link1', 'link2', 'coupling'] as const) {
      const values = run.series.map((frame) => frame.diagnostics.energyTerms[key]);
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.01);
    }
  });

  test('1.8 nearby-growth: paired public-engine trajectories, declared norm, finite rate and step refinement', () => {
    const run = runUnit(unit8);
    const initial = run.series[0]!;
    close(initial.nearbyState![0] - initial.sample.state[0], FOCUS_NEARBY_OFFSET);
    close(initial.distance!, FOCUS_NEARBY_OFFSET);
    expect(initial.growthRate).toBeNull();
    expect(run.distance!).toBeGreaterThan(initial.distance!);
    close(run.growthRate!, Math.log(run.distance! / initial.distance!) / 20, 1e-10);
    const companion = createPlanarSimulation({ ...run.config, initialState: [2 + FOCUS_NEARBY_OFFSET, 1, 0, 0] });
    for (const frame of run.series) {
      while (companion.snapshot().step < frame.sample.step) companion.step();
      expect(frame.nearbyState).toEqual(companion.snapshot().state);
    }
    // A short common interval tests numerical convergence without asserting a
    // universal long-time Lyapunov value for this unrenormalized pair.
    const coarse = createPlanarSimulation({ ...run.config, duration: 2 });
    const fine = createPlanarSimulation({ ...run.config, step: run.config.step / 2, duration: 2 });
    while (!coarse.done) coarse.step();
    while (!fine.done) fine.step();
    expect(focusStateDistance(coarse.snapshot().state, fine.snapshot().state)).toBeLessThan(1e-5);
  });
});

describe('Read-only diagnostic parity and scientific limits', () => {
  test('diagnostic total acceleration and energies retain every S01 double golden state', () => {
    const config: PlanarConfig = {
      ...defaultPlanarConfig(),
      parameters: golden.inputs.planar.parameters,
      gamma: golden.inputs.planar.gamma,
      initialState: golden.inputs.planar.initialState as unknown as PlanarState,
      step: golden.inputs.planar.dt,
      duration: golden.inputs.planar.dt * golden.inputs.planar.steps
    };
    const evaluate = createFocusDiagnostics(config);
    for (const frame of golden.expected.double.snapshots) {
      const diagnostics = evaluate(frame.state as unknown as PlanarState);
      diagnostics.acceleration.total.forEach((value, index) =>
        close(value, frame.rhs[index + 2]!, 1e-11 + 1e-10 * Math.abs(frame.rhs[index + 2]!))
      );
      close(
        diagnostics.energyTerms.kinetic1 + diagnostics.energyTerms.kinetic2 + diagnostics.energyTerms.coupling,
        frame.energy.KE,
        1e-10
      );
    }
  });

  test('Cartesian velocities agree with differentiated position, and matrix quadratic form equals particle kinetic energy', () => {
    const config: PlanarConfig = {
      ...defaultPlanarConfig(),
      parameters: { m1: 1.7, m2: 0.8, l1: 0.9, l2: 1.3, g: 9.81 },
      initialState: [0.7, -0.4, 1.2, -0.8],
      gamma: 0.17
    };
    const diagnostic = createFocusDiagnostics(config)(config.initialState);
    const [q1, q2, w1, w2] = config.initialState;
    const h = 1e-6;
    const before = planarPositions(config, [q1 - h * w1, q2 - h * w2, w1, w2]);
    const after = planarPositions(config, [q1 + h * w1, q2 + h * w2, w1, w2]);
    for (const [index, key] of ['first', 'second'].entries()) {
      const name = key as 'first' | 'second';
      close(diagnostic.velocities[index]!.x, (after[name].x - before[name].x) / (2 * h), 1e-9);
      close(diagnostic.velocities[index]!.y, (after[name].y - before[name].y) / (2 * h), 1e-9);
    }
    const {
      massMatrix: M,
      velocities: [v1, v2],
      acceleration: a
    } = diagnostic;
    const particleKE =
      0.5 * config.parameters.m1 * (v1.x ** 2 + v1.y ** 2) + 0.5 * config.parameters.m2 * (v2.x ** 2 + v2.y ** 2);
    close(0.5 * (M[0][0] * w1 ** 2 + 2 * M[0][1] * w1 * w2 + M[1][1] * w2 ** 2), particleKE);
    close(a.gravity[0] + a.velocity[0] + a.damping[0], a.total[0]);
    close(a.gravity[1] + a.velocity[1] + a.damping[1], a.total[1]);
    close(M[0][0] * a.damping[0] + M[0][1] * a.damping[1], -config.gamma * w1);
    close(M[1][0] * a.damping[0] + M[1][1] * a.damping[1], -config.gamma * w2);
    const frozen = createFocusDiagnostics(config);
    const expected = frozen(config.initialState);
    config.parameters.l1 = 5;
    expect(frozen(config.initialState)).toEqual(expected);
  });

  test('modal propagation recovers general initial position/velocity and solves the legacy equilibrium Jacobian', () => {
    const config: PlanarConfig = {
      ...defaultPlanarConfig(),
      parameters: { m1: 1.3, m2: 0.7, l1: 0.8, l2: 1.4, g: 8 },
      initialState: [0.02, -0.03, 0.01, 0.04]
    };
    const reference = createFocusLinearReference(config);
    reference.stateAt(0).forEach((value, i) => close(value, config.initialState[i]!));
    const at = reference.stateAt(1.2);
    const h = 1e-5;
    const before = reference.stateAt(1.2 - h);
    const after = reference.stateAt(1.2 + h);
    for (let row = 0; row < 4; row++) {
      const rhs = at.reduce((sum, value, col) => sum + reference.jacobian[row * 4 + col]! * value, 0);
      close((after[row]! - before[row]!) / (2 * h), rhs, 1e-8);
    }
    expect(() => reference.stateAt(-1)).toThrow();
    expect(() => reference.stateAt(Number.NaN)).toThrow();
    expect(() => createFocusLinearReference({ ...config, gamma: 1 })).toThrow();
    expect(() => createFocusLinearReference({ ...config, parameters: { ...config.parameters, g: 0 } })).toThrow();
    expect(() => createFocusDiagnostics(defaultPlanarConfig('system:compound-double'))).toThrow();
    expect(() => createFocusDiagnostics(config)([Number.NaN, 0, 0, 0])).toThrow();
  });

  test('norm wraps angle seams, includes a one-second velocity scale, and does not claim growth at zero/collapse', () => {
    close(focusStateDistance([Math.PI - 0.01, 0, 0, 0], [-Math.PI + 0.01, 0, 0, 0]), 0.02);
    close(focusStateDistance([0, 0, 0, 0], [0, 0, 3, 4]), 5);
    close(focusStateDistance([0, 0, 0, 0], [2 * Math.PI, -2 * Math.PI, 0, 0]), 0);
    expect(focusFiniteTimeRate(1, 1, 0)).toBeNull();
    expect(focusFiniteTimeRate(0, 1, 1)).toBeNull();
    expect(focusFiniteTimeRate(1, 0, 1)).toBeNull();
    expect(focusFiniteTimeRate(Infinity, 1, 1)).toBeNull();
    expect(focusFiniteTimeRate(1, 1, -1)).toBeNull();
    close(focusFiniteTimeRate(Math.E ** 2, 1, 2)!, 1);
    close(focusFiniteTimeRate(1, Math.E ** 2, 2)!, -1);
    close(focusFiniteTimeRate(1e300, 1e-300, 2)!, 300 * Math.log(10));
    expect(focusFiniteTimeRate(1e300, 1e-300, Number.MIN_VALUE)).toBeNull();
  });
});
