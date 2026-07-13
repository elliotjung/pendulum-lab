import { describe, expect, test } from 'vitest';
import {
  rhsPendulumNetwork,
  pendulumNetworkEnergy,
  pendulumNetworkStiffnessMatrix,
  ringPhononDispersion,
  buildCouplingMatrix,
  ringCouplingMatrix,
  validatePendulumNetworkParameters,
  type PendulumNetworkParameters
} from '../src/physics/pendulumNetwork';
import { rk4Step } from '../src/physics/integrators';

/**
 * Coupled-pendulum network — the lattice / phonon-dispersion extension. The
 * normal modes of a uniform ring are validated against the closed-form
 * monatomic-lattice dispersion ω²(q) = ω₀² + (2κ/I)(1 − cos q), and the full
 * nonlinear RHS is checked against energy conservation and the small-amplitude
 * normal-mode frequencies.
 */

function applyMatrix(matrix: Float64Array, v: readonly number[], n: number): number[] {
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    for (let j = 0; j < n; j += 1) s += (matrix[i * n + j] ?? 0) * (v[j] ?? 0);
    out[i] = s;
  }
  return out;
}

/** Integrate the network with RK4, returning the max relative energy drift over the run. */
function maxEnergyDrift(params: PendulumNetworkParameters, state0: number[], dt: number, steps: number): number {
  const n = params.masses.length;
  const state = Float64Array.from(state0);
  const out = new Float64Array(2 * n);
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsPendulumNetwork(s, params, o);
  };
  const e0 = pendulumNetworkEnergy(state, params).total;
  let maxDrift = 0;
  for (let k = 0; k < steps; k += 1) {
    rk4Step(state, dt, rhs, out);
    state.set(out);
    const e = pendulumNetworkEnergy(state, params).total;
    maxDrift = Math.max(maxDrift, Math.abs((e - e0) / e0));
  }
  return maxDrift;
}

describe('reduction to a single pendulum (N = 1)', () => {
  test('RHS and energy match the bare pendulum when uncoupled', () => {
    const params: PendulumNetworkParameters = { masses: [1.3], lengths: [0.7], g: 9.81, coupling: [0] };
    for (const [theta, omega] of [
      [0.4, 0.2],
      [-1.1, 0.5],
      [2.0, -0.3]
    ]) {
      const out = new Float64Array(2);
      rhsPendulumNetwork(Float64Array.of(theta!, omega!), params, out);
      expect(out[0]).toBeCloseTo(omega!, 12);
      expect(out[1]).toBeCloseTo(-(9.81 / 0.7) * Math.sin(theta!), 12);
      const e = pendulumNetworkEnergy(Float64Array.of(theta!, omega!), params);
      const expected = 0.5 * 1.3 * 0.7 * 0.7 * omega! * omega! + 1.3 * 9.81 * 0.7 * (1 - Math.cos(theta!));
      expect(e.total).toBeCloseTo(expected, 12);
    }
  });
});

describe('buildCouplingMatrix', () => {
  test('symmetric, accumulates parallel edges, rejects bad input', () => {
    const K = buildCouplingMatrix(3, [
      { i: 0, j: 1, kappa: 2 },
      { i: 1, j: 2, kappa: 3 },
      { i: 0, j: 1, kappa: 0.5 } // parallel edge accumulates
    ]);
    expect(K[0 * 3 + 1]).toBeCloseTo(2.5, 12);
    expect(K[1 * 3 + 0]).toBeCloseTo(2.5, 12);
    expect(K[1 * 3 + 2]).toBeCloseTo(3, 12);
    expect(K[0 * 3 + 2]).toBe(0);
    expect(() => buildCouplingMatrix(2, [{ i: 0, j: 0, kappa: 1 }])).toThrow(/self-edge/);
    expect(() => buildCouplingMatrix(2, [{ i: 0, j: 5, kappa: 1 }])).toThrow(/out of range/);
    expect(() => buildCouplingMatrix(2, [{ i: 0, j: 1, kappa: -1 }])).toThrow(/non-negative/);
  });

  test('validatePendulumNetworkParameters rejects asymmetric / wrong-size coupling', () => {
    expect(() =>
      validatePendulumNetworkParameters({ masses: [1, 1], lengths: [1, 1], g: 9.81, coupling: [0, 1, 2, 0] })
    ).toThrow(/symmetric/);
    expect(() =>
      validatePendulumNetworkParameters({ masses: [1, 1], lengths: [1, 1], g: 9.81, coupling: [0, 1, 1] })
    ).toThrow(/N×N/);
    expect(() =>
      validatePendulumNetworkParameters({ masses: [1, 1], lengths: [1, 1], g: 9.81, coupling: [0, 1, 1, 0] })
    ).not.toThrow();
  });
});

describe('energy conservation and order', () => {
  test('a 3-node chain conserves energy under RK4 (gamma = 0), 4th-order in dt', () => {
    const coupling = buildCouplingMatrix(3, [
      { i: 0, j: 1, kappa: 2 },
      { i: 1, j: 2, kappa: 2 }
    ]);
    const params: PendulumNetworkParameters = { masses: [1, 1, 1], lengths: [1, 1, 1], g: 9.81, coupling };
    const state0 = [0.3, -0.2, 0.1, 0, 0, 0];
    const driftCoarse = maxEnergyDrift(params, state0, 2e-3, 2500); // 5 s
    const driftFine = maxEnergyDrift(params, state0, 1e-3, 5000); // 5 s
    expect(driftFine).toBeLessThan(1e-6);
    // Halving dt should shrink the drift ~16x (RK4); a wrong RHS would leave a floor.
    expect(driftCoarse / driftFine).toBeGreaterThan(6);
  });

  test('per-node damping strictly dissipates energy', () => {
    const coupling = buildCouplingMatrix(2, [{ i: 0, j: 1, kappa: 1.5 }]);
    const params: PendulumNetworkParameters = {
      masses: [1, 1],
      lengths: [1, 1],
      g: 9.81,
      coupling,
      damping: [0.2, 0.2]
    };
    const state0 = [0.5, -0.3, 0, 0];
    const e0 = pendulumNetworkEnergy(Float64Array.from(state0), params).total;
    const state = Float64Array.from(state0);
    const out = new Float64Array(4);
    for (let k = 0; k < 3000; k += 1) {
      rk4Step(state, 1e-3, (s, o) => rhsPendulumNetwork(s, params, o), out);
      state.set(out);
    }
    expect(pendulumNetworkEnergy(state, params).total).toBeLessThan(e0);
  });
});

describe('normal modes & phonon dispersion', () => {
  test('two identical coupled pendula: in-phase ω₀² and anti-phase ω₀² + 2κ/I', () => {
    const coupling = buildCouplingMatrix(2, [{ i: 0, j: 1, kappa: 1.5 }]);
    const params: PendulumNetworkParameters = { masses: [1, 1], lengths: [1, 1], g: 9.81, coupling };
    const K = pendulumNetworkStiffnessMatrix(params);
    const inPhase = applyMatrix(K, [1, 1], 2);
    const antiPhase = applyMatrix(K, [1, -1], 2);
    // In-phase mode: eigenvalue g/l, no coupling restoring torque.
    expect(inPhase[0]).toBeCloseTo(9.81, 10);
    expect(inPhase[1]).toBeCloseTo(9.81, 10);
    // Anti-phase mode: eigenvalue g/l + 2κ/I (I = 1).
    expect(antiPhase[0]).toBeCloseTo(9.81 + 3, 10);
    expect(antiPhase[1]).toBeCloseTo(-(9.81 + 3), 10);
  });

  test('uniform ring: the Fourier modes diagonalise K to the phonon dispersion', () => {
    const n = 6;
    const kappa = 0.8;
    const params: PendulumNetworkParameters = {
      masses: [1, 1, 1, 1, 1, 1],
      lengths: [1, 1, 1, 1, 1, 1],
      g: 4, // g/l = 4 -> ω₀² = 4 exactly
      coupling: Array.from(ringCouplingMatrix(n, kappa))
    };
    const K = pendulumNetworkStiffnessMatrix(params);
    const dispersion = ringPhononDispersion(4, kappa, n); // c = κ/I = 0.8
    for (let k = 0; k <= 3; k += 1) {
      const mode = Array.from({ length: n }, (_, j) => Math.cos((2 * Math.PI * k * j) / n));
      const Kv = applyMatrix(K, mode, n);
      const lambda = dispersion[k]!;
      for (let j = 0; j < n; j += 1) {
        expect(Kv[j]).toBeCloseTo(lambda * mode[j]!, 9);
      }
    }
    // Zone-boundary band top ω²(π) = ω₀² + 4c.
    expect(dispersion[3]).toBeCloseTo(4 + 4 * kappa, 12);
  });

  test('nonlinear RHS reproduces the small-amplitude normal-mode frequencies', () => {
    const coupling = buildCouplingMatrix(2, [{ i: 0, j: 1, kappa: 1.5 }]);
    const params: PendulumNetworkParameters = { masses: [1, 1], lengths: [1, 1], g: 9.81, coupling };
    const eps = 1e-3;

    // First (+ -> -) zero crossing of theta_0 is a quarter period of the excited mode.
    const quarterCrossing = (state0: number[], dt: number): number => {
      const state = Float64Array.from(state0);
      const out = new Float64Array(4);
      let tPrev = 0;
      let prev = state[0]!;
      for (let k = 1; k <= 20000; k += 1) {
        rk4Step(state, dt, (s, o) => rhsPendulumNetwork(s, params, o), out);
        state.set(out);
        const t = k * dt;
        const cur = state[0]!;
        if (prev >= 0 && cur < 0) return tPrev + (dt * prev) / (prev - cur);
        tPrev = t;
        prev = cur;
      }
      throw new Error('no zero crossing found');
    };

    const omegaAnti = Math.sqrt(9.81 + 3); // anti-phase
    const omegaIn = Math.sqrt(9.81); // in-phase
    const tAnti = quarterCrossing([eps, -eps, 0, 0], 2e-4);
    const tIn = quarterCrossing([eps, eps, 0, 0], 2e-4);
    expect(tAnti).toBeCloseTo(Math.PI / 2 / omegaAnti, 2);
    expect(tIn).toBeCloseTo(Math.PI / 2 / omegaIn, 2);
  });
});
