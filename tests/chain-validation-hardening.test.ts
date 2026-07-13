/**
 * N ≥ 4 validation hardening for the planar N-chain and the spherical N-chain:
 *
 * - mass-matrix structure: exact symmetry + positive definiteness (Cholesky)
 *   over seeded random configurations;
 * - dt-halving convergence: measured RK4 order ≈ 4 on the full nonlinear flow;
 * - seeded random property tests: energy conservation (γ = 0) and monotone
 *   dissipation (γ > 0) across random mild states;
 * - external reference: small-angle normal-mode frequency from the analytic
 *   linearisation (matrices written from theory in this test, solved with an
 *   independent in-test eigensolver) versus the simulated oscillation period;
 * - pole singularity behaviour of the spherical chart (finite RHS at the pole,
 *   bounded drift through near-pole passages, caveat surfaced).
 */
import { describe, expect, it } from 'vitest';
import { chainMassMatrix, energyChain, rhsChain, type ChainParameters } from '../src/physics/nPendulum';
import {
  rhsSphericalChain,
  createSphericalChainWorkspace,
  sphericalChainMassMatrix,
  SphericalChain,
  type SphericalChainParams
} from '../src/physics/sphericalChain';

/** Deterministic LCG so the property tests are reproducible. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function rk4Step(rhs: (s: Float64Array, o: Float64Array) => void, state: Float64Array, h: number): void {
  const n = state.length;
  const k1 = new Float64Array(n);
  const k2 = new Float64Array(n);
  const k3 = new Float64Array(n);
  const k4 = new Float64Array(n);
  const tmp = new Float64Array(n);
  rhs(state, k1);
  for (let i = 0; i < n; i += 1) tmp[i] = state[i]! + (h / 2) * k1[i]!;
  rhs(tmp, k2);
  for (let i = 0; i < n; i += 1) tmp[i] = state[i]! + (h / 2) * k2[i]!;
  rhs(tmp, k3);
  for (let i = 0; i < n; i += 1) tmp[i] = state[i]! + h * k3[i]!;
  rhs(tmp, k4);
  for (let i = 0; i < n; i += 1) state[i] = state[i]! + (h / 6) * (k1[i]! + 2 * k2[i]! + 2 * k3[i]! + k4[i]!);
}

/** In-place Cholesky factorisation; returns false when the matrix is not PD. */
function choleskyPd(matrix: Float64Array, n: number): boolean {
  const a = Float64Array.from(matrix);
  for (let j = 0; j < n; j += 1) {
    let diag = a[j * n + j]!;
    for (let k = 0; k < j; k += 1) diag -= a[j * n + k]! ** 2;
    if (!(diag > 0)) return false;
    const root = Math.sqrt(diag);
    a[j * n + j] = root;
    for (let i = j + 1; i < n; i += 1) {
      let value = a[i * n + j]!;
      for (let k = 0; k < j; k += 1) value -= a[i * n + k]! * a[j * n + k]!;
      a[i * n + j] = value / root;
    }
  }
  return true;
}

function maxAsymmetry(matrix: Float64Array, n: number): number {
  let worst = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      worst = Math.max(worst, Math.abs(matrix[i * n + j]! - matrix[j * n + i]!));
    }
  }
  return worst;
}

/** Solve A x = b with partial pivoting (test-local, independent of src/). */
function solveLocal(aIn: Float64Array, bIn: Float64Array, n: number): Float64Array {
  const a = Float64Array.from(aIn);
  const b = Float64Array.from(bIn);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row * n + col]!) > Math.abs(a[pivot * n + col]!)) pivot = row;
    }
    if (pivot !== col) {
      for (let k = 0; k < n; k += 1) {
        const t = a[col * n + k]!;
        a[col * n + k] = a[pivot * n + k]!;
        a[pivot * n + k] = t;
      }
      const t = b[col]!;
      b[col] = b[pivot]!;
      b[pivot] = t;
    }
    const d = a[col * n + col]!;
    for (let row = col + 1; row < n; row += 1) {
      const f = a[row * n + col]! / d;
      for (let k = col; k < n; k += 1) a[row * n + k] = a[row * n + k]! - f * a[col * n + k]!;
      b[row] = b[row]! - f * b[col]!;
    }
  }
  const x = new Float64Array(n);
  for (let row = n - 1; row >= 0; row -= 1) {
    let acc = b[row]!;
    for (let k = row + 1; k < n; k += 1) acc -= a[row * n + k]! * x[k]!;
    x[row] = acc / a[row * n + row]!;
  }
  return x;
}

const N4: ChainParameters = { masses: [1, 0.8, 1.2, 0.9], lengths: [1, 0.7, 1.1, 0.9], g: 9.81 };
const N6: ChainParameters = { masses: [1, 1, 0.7, 1.3, 0.9, 1.1], lengths: [1, 0.9, 0.8, 1.1, 0.7, 1], g: 9.81 };
const SPH3: SphericalChainParams = { masses: [1, 0.8, 1.1], lengths: [1, 0.7, 0.9], g: 9.81, damping: 0 };

describe('N ≥ 4 mass-matrix structure', () => {
  it('planar chain (N = 4, 6): M is symmetric and positive definite for random states', () => {
    const rng = makeRng(20260611);
    for (const params of [N4, N6]) {
      const n = params.masses.length;
      for (let trial = 0; trial < 25; trial += 1) {
        const state = new Float64Array(2 * n);
        for (let i = 0; i < n; i += 1) state[i] = (rng() - 0.5) * 2 * Math.PI;
        const m = chainMassMatrix(state, params);
        expect(maxAsymmetry(m, n)).toBeLessThan(1e-12);
        expect(choleskyPd(m, n)).toBe(true);
      }
    }
  });

  it('spherical chain (N = 3 → 6 DOF): M is symmetric and PD away from the poles', () => {
    const rng = makeRng(987654321);
    const n = SPH3.masses.length;
    const dof = 2 * n;
    for (let trial = 0; trial < 25; trial += 1) {
      const state = new Float64Array(4 * n);
      // Keep polar angles in (0.15, π − 0.15): chart-regular region.
      for (let k = 0; k < n; k += 1) {
        state[2 * k] = 0.15 + rng() * (Math.PI - 0.3);
        state[2 * k + 1] = (rng() - 0.5) * 2 * Math.PI;
      }
      const m = sphericalChainMassMatrix(state, SPH3);
      expect(maxAsymmetry(m, dof)).toBeLessThan(1e-12);
      expect(choleskyPd(m, dof)).toBe(true);
    }
  });
});

describe('dt-halving convergence (RK4 measured order)', () => {
  function measuredOrder(
    rhs: (s: Float64Array, o: Float64Array) => void,
    state0: number[],
    T: number,
    dts: [coarse: number, half: number, reference: number]
  ): number {
    const integrate = (dt: number): Float64Array => {
      const s = Float64Array.from(state0);
      const steps = Math.round(T / dt);
      for (let i = 0; i < steps; i += 1) rk4Step(rhs, s, dt);
      return s;
    };
    const fine = integrate(dts[2]);
    const errorAt = (dt: number): number => {
      const s = integrate(dt);
      let err = 0;
      for (let i = 0; i < s.length; i += 1) err = Math.max(err, Math.abs(s[i]! - fine[i]!));
      return err;
    };
    return Math.log2(errorAt(dts[0]) / errorAt(dts[1]));
  }

  it('planar N = 4 chain: order ≈ 4', () => {
    const rhs = (s: Float64Array, o: Float64Array): void => {
      rhsChain(s, N4, 0, o);
    };
    const order = measuredOrder(rhs, [0.5, 0.3, -0.2, 0.4, 0, 0, 0, 0], 2, [0.008, 0.004, 0.0005]);
    expect(order).toBeGreaterThan(3.5);
    expect(order).toBeLessThan(4.6);
  });

  it('spherical N = 3 chain: order ≈ 4', () => {
    // The 3D chain is stiffer than the planar one: the asymptotic-order regime
    // needs dt ≤ 2 ms for this state (coarser steps land in the chaos-amplified
    // nonlinear regime and over-estimate the order).
    const workspace = createSphericalChainWorkspace(3);
    const rhs = (s: Float64Array, o: Float64Array): void => {
      rhsSphericalChain(s, SPH3, o, workspace);
    };
    const order = measuredOrder(
      rhs,
      [0.8, 0.2, 1.1, -0.4, 0.7, 0.1, 0.1, 0.5, -0.1, 0.3, 0.2, -0.2],
      1.5,
      [0.002, 0.001, 0.00025]
    );
    expect(order).toBeGreaterThan(3.4);
    expect(order).toBeLessThan(4.6);
  });
});

describe('seeded random property tests (N = 4)', () => {
  it('γ = 0: energy is conserved for random mild states', () => {
    const rng = makeRng(424242);
    const rhs = (s: Float64Array, o: Float64Array): void => {
      rhsChain(s, N4, 0, o);
    };
    for (let trial = 0; trial < 10; trial += 1) {
      const state = new Float64Array(8);
      for (let i = 0; i < 4; i += 1) {
        state[i] = (rng() - 0.5) * 1.6;
        state[4 + i] = (rng() - 0.5) * 1.0;
      }
      const e0 = energyChain(state, N4).total;
      for (let i = 0; i < 1000; i += 1) rk4Step(rhs, state, 0.001);
      const e1 = energyChain(state, N4).total;
      expect(Math.abs((e1 - e0) / (Math.abs(e0) || 1))).toBeLessThan(1e-6);
    }
  });

  it('γ > 0: energy decreases monotonically (sampled) for random states', () => {
    const rng = makeRng(1357913);
    const gamma = 0.4;
    const rhs = (s: Float64Array, o: Float64Array): void => {
      rhsChain(s, N4, gamma, o);
    };
    for (let trial = 0; trial < 6; trial += 1) {
      const state = new Float64Array(8);
      for (let i = 0; i < 4; i += 1) {
        state[i] = (rng() - 0.5) * 1.6;
        state[4 + i] = (rng() - 0.5) * 1.5;
      }
      let previous = energyChain(state, N4).total;
      for (let block = 0; block < 10; block += 1) {
        for (let i = 0; i < 200; i += 1) rk4Step(rhs, state, 0.001);
        const current = energyChain(state, N4).total;
        expect(current).toBeLessThanOrEqual(previous + 1e-9);
        previous = current;
      }
    }
  });
});

describe('external reference: small-angle normal mode (N = 4)', () => {
  it('slowest normal-mode frequency matches the analytic linearisation within 1%', () => {
    // Linearised chain: M0 θ̈ = −K θ with M0_jk = S_{max(j,k)} l_j l_k and
    // K = diag(g l_j S_j) — written here directly from the Lagrangian theory,
    // independent of src/physics. The slowest mode comes from inverse power
    // iteration on K⁻¹ M0 (largest eigenvalue of M0⁻¹… inverted problem).
    const n = 4;
    const { masses, lengths, g } = N4;
    const suffix = new Float64Array(n);
    let acc = 0;
    for (let j = n - 1; j >= 0; j -= 1) {
      acc += masses[j]!;
      suffix[j] = acc;
    }
    const m0 = new Float64Array(n * n);
    const kdiag = new Float64Array(n);
    for (let j = 0; j < n; j += 1) {
      kdiag[j] = g * lengths[j]! * suffix[j]!;
      for (let k = 0; k < n; k += 1) {
        m0[j * n + k] = suffix[Math.max(j, k)]! * lengths[j]! * lengths[k]!;
      }
    }
    // Power iteration on A = K⁻¹ M0: dominant eigenvalue = 1/ω²_slowest.
    let v = Float64Array.from({ length: n }, () => 1);
    let lambda = 0;
    for (let iter = 0; iter < 400; iter += 1) {
      const w = new Float64Array(n);
      for (let j = 0; j < n; j += 1) {
        let sum = 0;
        for (let k = 0; k < n; k += 1) sum += m0[j * n + k]! * v[k]!;
        w[j] = sum / kdiag[j]!;
      }
      const norm = Math.hypot(...w);
      lambda = norm;
      for (let j = 0; j < n; j += 1) v[j] = w[j]! / norm;
    }
    const omegaTheory = 1 / Math.sqrt(lambda);

    // Simulate the eigenvector initial condition at tiny amplitude and measure
    // the period from θ₁ zero crossings.
    const amplitude = 1e-3;
    const rhs = (s: Float64Array, o: Float64Array): void => {
      rhsChain(s, N4, 0, o);
    };
    const state = new Float64Array(2 * n);
    for (let j = 0; j < n; j += 1) state[j] = amplitude * v[j]!;
    const dt = 0.001;
    const crossings: number[] = [];
    let prev = state[0]!;
    const maxSteps = Math.round(30 / omegaTheory / dt);
    for (let i = 1; i <= maxSteps && crossings.length < 9; i += 1) {
      rk4Step(rhs, state, dt);
      const current = state[0]!;
      if (prev < 0 && current >= 0) {
        // Linear interpolation of the crossing time inside the step.
        crossings.push((i - 1 + prev / (prev - current)) * dt);
      }
      prev = current;
    }
    expect(crossings.length).toBeGreaterThanOrEqual(3);
    const periods: number[] = [];
    for (let i = 1; i < crossings.length; i += 1) periods.push(crossings[i]! - crossings[i - 1]!);
    const omegaMeasured = (2 * Math.PI) / (periods.reduce((a, b) => a + b, 0) / periods.length);
    expect(Math.abs(omegaMeasured - omegaTheory) / omegaTheory).toBeLessThan(0.01);
  });
});

describe('pole singularity (spherical chart limits)', () => {
  const SPH2: SphericalChainParams = { masses: [1, 0.8], lengths: [1, 0.7], g: 9.81, damping: 0 };

  it('RHS stays finite exactly at the pole (θ = 0) thanks to chart regularisation', () => {
    const workspace = createSphericalChainWorkspace(2);
    const out = new Float64Array(8);
    // Inner link exactly at the downward pole with azimuthal rate present.
    rhsSphericalChain([0, 0.3, 1.2, -0.5, 0, 2.0, 0.4, 0.1], SPH2, out, workspace);
    expect(Array.from(out).every(Number.isFinite)).toBe(true);
  });

  it('planar pole passage (L_z = 0) is smooth: drift stays at machine precision', () => {
    // With every φ̇ = 0 the vertical angular momentum vanishes and the swing
    // passes straight through the pole; the chart extension θ → −θ is regular
    // there, so the clamp never activates dynamically.
    const chain = new SphericalChain(SPH2, [0.4, 0, -0.3, 0, 1.8, 0, -1.2, 0], { dt: 0.0005, method: 'rk4' });
    chain.step(4);
    const diag = chain.diagnostics();
    expect(Number.isFinite(diag.energy)).toBe(true);
    expect(diag.energyDrift).toBeLessThan(1e-10);
    expect(diag.caveat).toContain('pole');
  });

  it('L_z ≠ 0 trajectories that graze the pole fail loudly, not with NaN garbage', () => {
    // With a tiny but non-zero azimuthal rate, φ̇ = L_z/(m l² sin²θ) genuinely
    // diverges as θ → 0: that is a real limit of the (θ, φ) chart, not an
    // implementation bug. The contract is a clean diagnostic error (so callers
    // can react) instead of silent NaN propagation.
    const chain = new SphericalChain(SPH2, [0.05, 0, 0.1, 0, 1.5, 0.02, -1.0, 0.01], { dt: 0.0005, method: 'rk4' });
    expect(() => chain.step(4)).toThrow(/linear solve failed/);
  });

  it('solver reports a clean failure for non-finite input instead of NaN garbage', () => {
    const workspace = createSphericalChainWorkspace(2);
    const out = new Float64Array(8);
    expect(() => rhsSphericalChain([Number.NaN, 0, 1, 0, 0, 0, 0, 0], SPH2, out, workspace)).toThrow(/non-finite/);
  });

  it('solveLocal helper sanity (test infrastructure self-check)', () => {
    const a = Float64Array.from([4, 1, 1, 3]);
    const x = solveLocal(a, Float64Array.from([1, 2]), 2);
    expect(x[0]!).toBeCloseTo(1 / 11, 10);
    expect(x[1]!).toBeCloseTo(7 / 11, 10);
  });
});
