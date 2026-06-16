import type { Derivative } from '../physics/types';
import { rk4Step } from '../physics/integrators';
import { rhsDriven, type DrivenParameters } from '../physics/driven';
import { solveLinearInPlace } from '../physics/linearSolve';
import { eigenvalues2x2, monodromyMatrix, type FloquetMultiplier } from './floquet';

/**
 * Branch switching at a period-doubling bifurcation of the driven pendulum.
 *
 * When the period-1 orbit's real Floquet multiplier crosses −1 at A = A_PD, a
 * period-2 orbit branches off along the critical eigenvector. Natural
 * continuation of the period-1 branch sails straight past (the orbit persists,
 * just unstable); *following the new branch* requires switching maps: the
 * period-2 orbit is a fixed point of the **double-period stroboscopic map** P²,
 * found by Newton seeded a small step along the critical eigenvector of the
 * monodromy — the direction in which the new branch peels off.
 *
 * For the classic damped driven pendulum (γ = 0.5, ω = 2/3) this is the first
 * step of the Feigenbaum cascade: P1 → A ≈ 1.066 → P2 → … → chaos near 1.08.
 */

export interface PeriodNOrbitResult {
  /** Fixed point of Pⁿ (θ, ω) at drive phase φ = 0. */
  orbit: [number, number];
  /** All n cycle points under the single-period strobe P. */
  cycle: Array<[number, number]>;
  /** Multipliers of the n-period monodromy (eigenvalues of DPⁿ). */
  multipliers: FloquetMultiplier[];
  maxModulus: number;
  stable: boolean;
  /** Map multiplicity (n = 2 for the period-doubled orbit). */
  n: number;
  /** Single drive period T; the orbit's period is n·T. */
  drivePeriod: number;
  converged: boolean;
  residual: number;
  iterations: number;
}

export interface BranchSwitchOptions {
  dt?: number;
  tolerance?: number;
  maxIterations?: number;
  /** Eigenvector step sizes tried in order until the Newton leaves the old orbit. */
  seedSteps?: number[];
  /** Minimum (θ, ω) distance from the period-1 point for a switch to count. */
  minSeparation?: number;
}

export interface BranchSwitchResult {
  /** The period-doubled orbit (fixed point of P², 2-cycle of P). */
  doubled: PeriodNOrbitResult;
  /** Multiplier of the period-1 orbit nearest −1 (the one that crossed). */
  criticalMultiplier: FloquetMultiplier;
  /** Unit eigenvector along which the new branch was seeded. */
  eigenvector: [number, number];
  /** Seed step that produced the successful switch. */
  seedStep: number;
  /** (θ, ω) distance between the period-2 orbit and the period-1 point. */
  separation: number;
  switched: boolean;
}

/** Real eigenvector of a 2×2 row-major matrix for a (real) eigenvalue, normalised. */
export function realEigenvector2x2(M: ArrayLike<number>, lambda: number): [number, number] {
  const a = Number(M[0] ?? 0);
  const b = Number(M[1] ?? 0);
  const c = Number(M[2] ?? 0);
  const d = Number(M[3] ?? 0);
  // Rows of (M − λI) are orthogonal to v; take the larger row for conditioning.
  const r1: [number, number] = [a - lambda, b];
  const r2: [number, number] = [c, d - lambda];
  const n1 = Math.hypot(r1[0], r1[1]);
  const n2 = Math.hypot(r2[0], r2[1]);
  const row = n1 >= n2 ? r1 : r2;
  const norm = Math.max(n1, n2);
  if (norm < 1e-14) return [1, 0]; // M ≈ λI: any direction is an eigenvector
  const v: [number, number] = [-row[1] / norm, row[0] / norm];
  const vn = Math.hypot(v[0], v[1]);
  return [v[0] / vn, v[1] / vn];
}

/** n-fold strobe with an exact-period step (dt adjusted so steps·dt = T exactly). */
function strobeN(rhs: Derivative, theta: number, omega: number, drivePeriod: number, n: number, dt: number): Array<[number, number]> {
  const stepsPerPeriod = Math.max(1, Math.round(drivePeriod / dt));
  const dtEff = drivePeriod / stepsPerPeriod;
  const cur = new Float64Array([theta, omega, 0]);
  const nxt = new Float64Array(3);
  const points: Array<[number, number]> = [];
  for (let k = 0; k < n; k += 1) {
    for (let s = 0; s < stepsPerPeriod; s += 1) {
      rk4Step(cur, dtEff, rhs, nxt);
      cur.set(nxt);
    }
    points.push([cur[0] ?? 0, cur[1] ?? 0]);
  }
  return points;
}

/**
 * Fixed point of the n-fold stroboscopic map Pⁿ via 2-D Newton (the Jacobian is
 * the (θ, ω) block of the state-transition matrix over n·T), with the cycle
 * points and the n-period Floquet verdict. `n = 1` reproduces the period-1
 * solver; `n = 2` targets the period-doubled orbit.
 */
export function drivenPeriodicOrbitN(
  params: DrivenParameters,
  guess: [number, number],
  n: number,
  options: BranchSwitchOptions = {}
): PeriodNOrbitResult {
  const drivePeriod = (2 * Math.PI) / params.driveFrequency;
  const dt = options.dt ?? 0.005;
  const tol = options.tolerance ?? 1e-9;
  const maxIterations = options.maxIterations ?? 60;
  const rhs: Derivative = (s, o) => {
    rhsDriven(s, params, o);
  };

  let theta = guess[0];
  let omega = guess[1];
  let residual = Infinity;
  let iterations = 0;
  let converged = false;

  for (let it = 0; it < maxIterations; it += 1) {
    iterations = it + 1;
    const end = strobeN(rhs, theta, omega, drivePeriod, n, dt)[n - 1]!;
    const f0 = end[0] - theta;
    const f1 = end[1] - omega;
    residual = Math.hypot(f0, f1);
    if (residual < tol) {
      converged = true;
      break;
    }
    const M = monodromyMatrix([theta, omega, 0], rhs, n * drivePeriod, { dt }, undefined, 2);
    const a = (M[0] ?? 0) - 1;
    const b = M[1] ?? 0;
    const c = M[2] ?? 0;
    const d = (M[3] ?? 0) - 1;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-14) break;
    theta += (-f0 * d + b * f1) / det;
    omega += (-a * f1 + c * f0) / det;
  }

  const M = monodromyMatrix([theta, omega, 0], rhs, n * drivePeriod, { dt }, undefined, 2);
  const multipliers = eigenvalues2x2(M);
  const maxModulus = Math.max(multipliers[0]!.modulus, multipliers[1]!.modulus);
  const cycle = strobeN(rhs, theta, omega, drivePeriod, n, dt);
  // The last cycle point is Pⁿ(x) ≈ x; report the fixed point itself first.
  cycle.pop();
  cycle.unshift([theta, omega]);

  return {
    orbit: [theta, omega],
    cycle,
    multipliers,
    maxModulus,
    stable: maxModulus <= 1 + 1e-6,
    n,
    drivePeriod,
    converged,
    residual,
    iterations
  };
}

/**
 * Switch from a period-1 orbit just past its period-doubling onto the
 * period-2 branch. `period1` must be the (possibly unstable) period-1 fixed
 * point at the *current* parameters, with a real multiplier ρ < −1 (or near
 * −1). The Newton for P² is seeded at x* + ε·v with v the critical
 * eigenvector, retrying over `seedSteps` until it converges to a genuinely
 * different orbit (Newton can fall back into x*, which is also a fixed point
 * of P² — that is rejected by the separation check, not reported as success).
 */
export function switchPeriodDoubling(
  params: DrivenParameters,
  period1: [number, number],
  options: BranchSwitchOptions = {}
): BranchSwitchResult {
  const drivePeriod = (2 * Math.PI) / params.driveFrequency;
  const dt = options.dt ?? 0.005;
  const minSeparation = options.minSeparation ?? 1e-3;
  const seedSteps = options.seedSteps ?? [0.02, 0.05, 0.1, 0.2];
  const rhs: Derivative = (s, o) => {
    rhsDriven(s, params, o);
  };

  const M = monodromyMatrix([period1[0], period1[1], 0], rhs, drivePeriod, { dt }, undefined, 2);
  const multipliers = eigenvalues2x2(M);
  // The PD-critical multiplier: the real one nearest −1.
  const critical = multipliers.reduce((best, mu) =>
    Math.abs(mu.im) < 1e-9 && Math.abs(mu.re + 1) < Math.abs(best.re + 1) ? mu : best
  );
  const eigenvector = realEigenvector2x2(M, critical.re);

  let last: PeriodNOrbitResult | null = null;
  for (const step of seedSteps) {
    const seed: [number, number] = [period1[0] + step * eigenvector[0], period1[1] + step * eigenvector[1]];
    const candidate = drivenPeriodicOrbitN(params, seed, 2, options);
    last = candidate;
    const separation = Math.hypot(candidate.orbit[0] - period1[0], candidate.orbit[1] - period1[1]);
    if (candidate.converged && separation > minSeparation) {
      return { doubled: candidate, criticalMultiplier: critical, eigenvector, seedStep: step, separation, switched: true };
    }
  }
  return {
    doubled: last ?? drivenPeriodicOrbitN(params, period1, 2, options),
    criticalMultiplier: critical,
    eigenvector,
    seedStep: seedSteps[seedSteps.length - 1] ?? 0,
    separation: 0,
    switched: false
  };
}

export interface SymmetryBreakOptions extends BranchSwitchOptions {
  /** Reject candidates further than this from the symmetric orbit (rotating/other solutions). Default 1.0. */
  maxSeparation?: number;
  /** Two converged orbits closer than this count as the same branch. Default 0.01. */
  clusterTolerance?: number;
  /** Max |midpoint − symmetric| for the pair to be accepted as a pitchfork. Default 0.05. */
  pitchforkTolerance?: number;
}

export interface SymmetryBreakResult {
  /** The two mirror-image asymmetric period-1 orbits, ordered by θ then ω. */
  branches: [PeriodNOrbitResult, PeriodNOrbitResult];
  /** The (now unstable) symmetric period-1 orbit they straddle. */
  symmetric: [number, number];
  /** The critical real multiplier of the symmetric orbit (nearest +1). */
  criticalMultiplier: FloquetMultiplier;
  /** Unit eigenvector of the +1 multiplier — the symmetry-breaking direction. */
  eigenvector: [number, number];
  /** Midpoint ½(branchA + branchB); ≈ `symmetric` for a genuine pitchfork. */
  midpoint: [number, number];
  /** Distance |midpoint − symmetric| (the pitchfork residual). */
  pitchforkResidual: number;
  /** (θ, ω) distance between the two branches. */
  separation: number;
  /** True iff two distinct stable straddling branches were found. */
  switched: boolean;
}

function distance(a: readonly [number, number], b: readonly [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Branch switching at a **symmetry-breaking pitchfork** of the driven pendulum.
 *
 * The symmetric oscillating period-1 orbit of the (Z₂-symmetric) damped driven
 * pendulum loses stability when a *real* Floquet multiplier crosses **+1**.
 * Generically for a symmetric system this is a supercritical pitchfork: two
 * mirror-image asymmetric period-1 orbits are born and inherit the stability,
 * straddling the now-unstable symmetric orbit. Unlike period-doubling (the −1
 * crossing handled by {@link switchPeriodDoubling}), both new branches are still
 * fixed points of the *single*-period map P¹ — they are found by Newton seeded a
 * small step along the critical +1 eigenvector, in both directions.
 *
 * `symmetricOrbit` must be the (now unstable, real-multiplier-near-+1) symmetric
 * period-1 fixed point at the *current* parameters — typically obtained by
 * continuing the branch to just past the +1 crossing. The routine scans several
 * seed steps each way, keeps the converged, stable orbits that sit a sensible
 * distance from the symmetric one (rejecting both fall-backs onto it and faraway
 * rotating solutions), clusters them, and returns the straddling pair. The
 * pitchfork is confirmed only when the pair's midpoint coincides with the
 * symmetric orbit (`pitchforkResidual < pitchforkTolerance`) — a falsifiable
 * Z₂ signature, not an assumption.
 */
export function switchSymmetryBreaking(
  params: DrivenParameters,
  symmetricOrbit: [number, number],
  options: SymmetryBreakOptions = {}
): SymmetryBreakResult {
  const drivePeriod = (2 * Math.PI) / params.driveFrequency;
  const dt = options.dt ?? 0.004;
  const minSeparation = options.minSeparation ?? 0.01;
  const maxSeparation = options.maxSeparation ?? 1.0;
  const clusterTolerance = options.clusterTolerance ?? 0.01;
  const pitchforkTolerance = options.pitchforkTolerance ?? 0.05;
  const seedSteps = options.seedSteps ?? [0.04, 0.06, 0.1, 0.15, 0.2];
  const rhs: Derivative = (s, o) => {
    rhsDriven(s, params, o);
  };

  const M = monodromyMatrix([symmetricOrbit[0], symmetricOrbit[1], 0], rhs, drivePeriod, { dt }, undefined, 2);
  const multipliers = eigenvalues2x2(M);
  // Critical multiplier: the real one nearest +1.
  const critical = multipliers.reduce((best, mu) =>
    Math.abs(mu.im) < 1e-9 && Math.abs(mu.re - 1) < Math.abs(best.re - 1) ? mu : best
  );
  const eigenvector = realEigenvector2x2(M, critical.re);

  // Scan ± seed steps; keep converged stable orbits at a sensible distance.
  const found: PeriodNOrbitResult[] = [];
  for (const magnitude of seedSteps) {
    for (const sign of [1, -1]) {
      const step = sign * magnitude;
      const seed: [number, number] = [
        symmetricOrbit[0] + step * eigenvector[0],
        symmetricOrbit[1] + step * eigenvector[1]
      ];
      const candidate = drivenPeriodicOrbitN(params, seed, 1, options);
      const sep = distance(candidate.orbit, symmetricOrbit);
      if (!candidate.converged || !candidate.stable) continue;
      if (sep <= minSeparation || sep >= maxSeparation) continue;
      if (found.some((f) => distance(f.orbit, candidate.orbit) < clusterTolerance)) continue;
      found.push(candidate);
    }
  }

  // Choose the straddling pair: distinct stable orbits whose midpoint is closest
  // to the symmetric orbit (the pitchfork signature).
  let bestPair: [PeriodNOrbitResult, PeriodNOrbitResult] | null = null;
  let bestMidpoint: [number, number] = symmetricOrbit;
  let bestResidual = Infinity;
  for (let i = 0; i < found.length; i += 1) {
    for (let j = i + 1; j < found.length; j += 1) {
      const a = found[i]!;
      const b = found[j]!;
      const midpoint: [number, number] = [
        0.5 * (a.orbit[0] + b.orbit[0]),
        0.5 * (a.orbit[1] + b.orbit[1])
      ];
      const residual = distance(midpoint, symmetricOrbit);
      if (residual < bestResidual) {
        bestResidual = residual;
        bestMidpoint = midpoint;
        bestPair = [a, b];
      }
    }
  }

  if (bestPair) {
    // Deterministic ordering by (θ, ω).
    const [a, b] = bestPair;
    const ordered: [PeriodNOrbitResult, PeriodNOrbitResult] =
      a.orbit[0] < b.orbit[0] || (a.orbit[0] === b.orbit[0] && a.orbit[1] <= b.orbit[1]) ? [a, b] : [b, a];
    const separation = distance(a.orbit, b.orbit);
    return {
      branches: ordered,
      symmetric: symmetricOrbit,
      criticalMultiplier: critical,
      eigenvector,
      midpoint: bestMidpoint,
      pitchforkResidual: bestResidual,
      separation,
      switched: bestResidual < pitchforkTolerance && separation > minSeparation
    };
  }

  // No straddling pair: report honestly (switched = false) with placeholders.
  const fallback = found[0] ?? drivenPeriodicOrbitN(params, symmetricOrbit, 1, options);
  return {
    branches: [fallback, fallback],
    symmetric: symmetricOrbit,
    criticalMultiplier: critical,
    eigenvector,
    midpoint: symmetricOrbit,
    pitchforkResidual: Infinity,
    separation: 0,
    switched: false
  };
}

export interface BranchResidualSystem {
  dimension: number;
  residual(state: Float64Array, parameter: number, out: Float64Array): void;
  /** Optional row-major Jacobian d residual_i / d state_j at fixed parameter. */
  jacobian?: (state: Float64Array, parameter: number, out: Float64Array) => void;
}

export interface TranscriticalPoint {
  state: readonly number[];
  parameter: number;
}

export interface TranscriticalSwitchOptions {
  /**
   * Signed parameter step away from the detected crossing. The target branch is
   * solved at critical.parameter + parameterStep.
   */
  parameterStep: number;
  /** State tangent dx/dlambda of the other branch at the crossing. */
  branchTangent: readonly number[];
  /** Reference branch used to reject falling back onto the original branch. */
  referenceBranch?: (parameter: number) => readonly number[];
  tolerance?: number;
  maxIterations?: number;
  minSeparation?: number;
  finiteDifferenceEpsilon?: number;
}

export interface TranscriticalSwitchResult {
  state: number[];
  targetParameter: number;
  seed: number[];
  residual: number;
  iterations: number;
  converged: boolean;
  switched: boolean;
  separation: number;
  method: string;
  caveat: string;
}

function residualNorm(values: Float64Array): number {
  let norm = 0;
  for (let i = 0; i < values.length; i += 1) norm = Math.max(norm, Math.abs(values[i] ?? 0));
  return norm;
}

function fillFiniteDifferenceJacobian(
  system: BranchResidualSystem,
  state: Float64Array,
  parameter: number,
  residual: Float64Array,
  jacobian: Float64Array,
  eps: number
): void {
  const n = system.dimension;
  const probe = new Float64Array(state);
  const residualProbe = new Float64Array(n);
  for (let col = 0; col < n; col += 1) {
    const h = eps * Math.max(1, Math.abs(state[col] ?? 0));
    probe[col] = (state[col] ?? 0) + h;
    system.residual(probe, parameter, residualProbe);
    for (let row = 0; row < n; row += 1) jacobian[row * n + col] = ((residualProbe[row] ?? 0) - (residual[row] ?? 0)) / h;
    probe[col] = state[col] ?? 0;
  }
}

/**
 * Generic transcritical branch switch for algebraic or fixed-point residuals.
 *
 * At a transcritical crossing two solution branches exchange stability while
 * both remain present. The caller supplies the crossing point and the local
 * tangent of the other branch. This routine steps the parameter, Newton-solves
 * the residual from that off-branch seed, and rejects solutions that fall back
 * onto an optional reference branch.
 */
export function switchTranscriticalBranch(
  system: BranchResidualSystem,
  critical: TranscriticalPoint,
  options: TranscriticalSwitchOptions
): TranscriticalSwitchResult {
  const n = system.dimension;
  if (n < 1) throw new Error('switchTranscriticalBranch: system.dimension must be positive.');
  if (critical.state.length !== n) throw new Error('switchTranscriticalBranch: critical.state length does not match system.dimension.');
  if (options.branchTangent.length !== n) throw new Error('switchTranscriticalBranch: branchTangent length does not match system.dimension.');
  if (!Number.isFinite(options.parameterStep) || options.parameterStep === 0) throw new Error('switchTranscriticalBranch: parameterStep must be finite and non-zero.');

  const targetParameter = critical.parameter + options.parameterStep;
  const tolerance = options.tolerance ?? 1e-10;
  const maxIterations = options.maxIterations ?? 25;
  const minSeparation = options.minSeparation ?? Math.max(1e-8, Math.abs(options.parameterStep) * 1e-4);
  const eps = options.finiteDifferenceEpsilon ?? 1e-6;
  const state = new Float64Array(n);
  const seed: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const value = (critical.state[i] ?? 0) + (options.branchTangent[i] ?? 0) * options.parameterStep;
    state[i] = value;
    seed.push(value);
  }

  const residual = new Float64Array(n);
  const jacobian = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  let residualValue = Infinity;
  let iterations = 0;
  let converged = false;

  for (let it = 0; it < maxIterations; it += 1) {
    iterations = it + 1;
    system.residual(state, targetParameter, residual);
    residualValue = residualNorm(residual);
    if (residualValue <= tolerance) {
      converged = true;
      break;
    }
    if (system.jacobian) system.jacobian(state, targetParameter, jacobian);
    else fillFiniteDifferenceJacobian(system, state, targetParameter, residual, jacobian, eps);
    for (let i = 0; i < n; i += 1) rhs[i] = -(residual[i] ?? 0);
    const solve = solveLinearInPlace(new Float64Array(jacobian), rhs, n, { pivotTolerance: 1e-14 });
    if (!solve.ok) break;
    for (let i = 0; i < n; i += 1) state[i] = (state[i] ?? 0) + (rhs[i] ?? 0);
  }

  if (!converged) {
    system.residual(state, targetParameter, residual);
    residualValue = residualNorm(residual);
    converged = residualValue <= tolerance;
  }

  const reference = options.referenceBranch ? options.referenceBranch(targetParameter) : critical.state;
  let separation = 0;
  for (let i = 0; i < n; i += 1) separation = Math.max(separation, Math.abs((state[i] ?? 0) - (reference[i] ?? 0)));
  const switched = converged && separation > minSeparation;
  return {
    state: Array.from(state),
    targetParameter,
    seed,
    residual: residualValue,
    iterations,
    converged,
    switched,
    separation,
    method: system.jacobian ? 'Newton switch with analytic state Jacobian' : 'Newton switch with finite-difference state Jacobian',
    caveat: 'Generic transcritical switching needs the target-branch tangent from local normal-form or nullspace analysis; this routine verifies the switched residual but does not classify the crossing by itself.'
  };
}
