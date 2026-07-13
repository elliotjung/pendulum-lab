import { describe, expect, test } from 'vitest';
import { implicitMidpointNewton } from '../src/physics/implicitDiagnostics';
import { implicitMidpointStep } from '../src/physics/integrators';
import type { StateVector, StepDiagnostics } from '../src/physics/types';

/**
 * Newton-instrumented implicit midpoint. Pinned against the exact linear update
 * (harmonic oscillator), the closed-form condition number of the 2×2 Newton
 * matrix, quadratic Newton convergence on the nonlinear pendulum, and agreement
 * with the production fixed-point stepper where both converge.
 */

const harmonicRhs =
  (omega: number) =>
  (s: StateVector, out: StateVector): void => {
    out[0] = s[1]!;
    out[1] = -omega * omega * s[0]!;
  };
const harmonicJac =
  (omega: number) =>
  (_s: StateVector, jac: Float64Array): void => {
    jac[0] = 0;
    jac[1] = 1;
    jac[2] = -omega * omega;
    jac[3] = 0;
  };

/** Exact implicit-midpoint step for y' = A y: y₁ = (I-½dtA)⁻¹(I+½dtA)y₀. */
function harmonicExact(y0: readonly number[], dt: number, omega: number): [number, number] {
  const a = dt / 2;
  const r0 = y0[0]! + a * y0[1]!;
  const r1 = -a * omega * omega * y0[0]! + y0[1]!;
  const det = 1 + a * a * omega * omega;
  return [(r0 + a * r1) / det, (-a * omega * omega * r0 + r1) / det];
}

describe('implicit midpoint Newton — accuracy', () => {
  test('matches the exact linear update for the harmonic oscillator', () => {
    const omega = 1.3;
    const dt = 0.1;
    const y0 = [1, 0.2];
    const report = implicitMidpointNewton(y0, dt, harmonicRhs(omega), harmonicJac(omega));
    const exact = harmonicExact(y0, dt, omega);
    expect(report.state[0]).toBeCloseTo(exact[0], 11);
    expect(report.state[1]).toBeCloseTo(exact[1], 11);
    expect(report.converged).toBe(true);
    // Linear problem: Newton is exact after one step (converges within a couple iters).
    expect(report.iterations).toBeLessThanOrEqual(3);
  });

  test('agrees with the production fixed-point stepper on the nonlinear pendulum', () => {
    const rhs = (s: StateVector, out: StateVector): void => {
      out[0] = s[1]!;
      out[1] = -Math.sin(s[0]!);
    };
    const jac = (s: StateVector, j: Float64Array): void => {
      j[0] = 0;
      j[1] = 1;
      j[2] = -Math.cos(s[0]!);
      j[3] = 0;
    };
    const y0 = [0.5, 0];
    const dt = 0.05;
    const report = implicitMidpointNewton(y0, dt, rhs, jac);
    const fixedOut = new Float64Array(2);
    implicitMidpointStep(Float64Array.from(y0), dt, rhs, fixedOut);
    expect(report.converged).toBe(true);
    expect(report.finalResidual).toBeLessThan(1e-10);
    expect(report.state[0]).toBeCloseTo(fixedOut[0]!, 9);
    expect(report.state[1]).toBeCloseTo(fixedOut[1]!, 9);
  });

  test('Newton residual decreases monotonically to convergence', () => {
    const rhs = (s: StateVector, out: StateVector): void => {
      out[0] = s[1]!;
      out[1] = -Math.sin(s[0]!);
    };
    const jac = (s: StateVector, j: Float64Array): void => {
      j[0] = 0;
      j[1] = 1;
      j[2] = -Math.cos(s[0]!);
      j[3] = 0;
    };
    const report = implicitMidpointNewton([2.5, 0.5], 0.2, rhs, jac);
    expect(report.converged).toBe(true);
    for (let i = 1; i < report.history.length; i += 1) {
      expect(report.history[i]!.residualNorm).toBeLessThanOrEqual(report.history[i - 1]!.residualNorm);
    }
  });

  test('production hmidpoint exposes Newton diagnostics when a Jacobian is supplied', () => {
    const diagnostics: Partial<StepDiagnostics> = {};
    const out = new Float64Array(2);
    implicitMidpointStep(Float64Array.from([0.5, 0]), 0.05, harmonicRhs(1), out, {
      jacobian: harmonicJac(1),
      diagnostics
    });
    expect(diagnostics.solver).toBe('newton');
    expect(diagnostics.converged).toBe(true);
    expect(diagnostics.iterations).toBeGreaterThan(0);
    expect(diagnostics.residualNorm).toBeLessThan(1e-10);
    expect(diagnostics.conditionEstimate).toBeGreaterThanOrEqual(1);
    expect(diagnostics.failureReason).toBeUndefined();
  });

  test('production hmidpoint keeps Picard residual diagnostics without a Jacobian', () => {
    const diagnostics: Partial<StepDiagnostics> = {};
    const out = new Float64Array(2);
    implicitMidpointStep(Float64Array.from([0.5, 0]), 0.05, harmonicRhs(1), out, { diagnostics });
    expect(diagnostics.solver).toBe('fixed-point');
    expect(diagnostics.iterations).toBeGreaterThan(0);
    expect(diagnostics.residualNorm).toBeLessThan(1e-8);
    expect(diagnostics.converged).toBe(true);
    expect(diagnostics.conditionEstimate).toBeUndefined();
  });
});

describe('implicit midpoint Newton — conditioning', () => {
  test('condition number matches the closed form κ = (1+dt/2)²/(1+dt²/4) at ω=1', () => {
    const dt = 0.1;
    const report = implicitMidpointNewton([1, 0], dt, harmonicRhs(1), harmonicJac(1));
    const expected = (1 + dt / 2) ** 2 / (1 + (dt * dt) / 4);
    expect(report.conditionNumber).toBeCloseTo(expected, 9);
  });

  test('condition number is ≥ 1, → 1 as dt → 0, and grows with dt', () => {
    const tiny = implicitMidpointNewton([1, 0], 1e-4, harmonicRhs(1), harmonicJac(1));
    const small = implicitMidpointNewton([1, 0], 0.1, harmonicRhs(1), harmonicJac(1));
    const big = implicitMidpointNewton([1, 0], 0.8, harmonicRhs(1), harmonicJac(1));
    expect(tiny.conditionNumber).toBeGreaterThanOrEqual(1);
    expect(tiny.conditionNumber).toBeCloseTo(1, 3);
    expect(big.conditionNumber).toBeGreaterThan(small.conditionNumber);
    expect(small.conditionNumber).toBeGreaterThan(tiny.conditionNumber);
  });
});
