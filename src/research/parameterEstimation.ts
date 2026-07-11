/**
 * Parameter estimation — the inverse problem.
 *
 * Everything else in the platform is a *forward* map: given physical parameters
 * (masses, lengths, gravity, damping) it produces a trajectory. This module
 * inverts that map: given an *observed* trajectory it recovers the parameters
 * that best explain it, by nonlinear least squares.
 *
 * The optimiser is Levenberg–Marquardt (LM) with Marquardt's diagonal scaling,
 * which interpolates between Gauss–Newton (fast, near the optimum) and gradient
 * descent (robust, far away). With residual vector r(p) and cost
 * C(p) = ½‖r(p)‖², each step solves the damped normal equations
 *
 *     (JᵀJ + λ·diag(JᵀJ)) δ = −Jᵀr,        J_ij = ∂r_i/∂p_j
 *
 * accepting δ when it lowers the cost (and shrinking λ) or rejecting it (and
 * growing λ). The Jacobian is obtained by forward finite differences of the
 * residual — generic over any forward model, no hand-derived sensitivities.
 *
 * The double-pendulum specialisation (`fitDoublePendulum`) re-integrates
 * `rhsDouble` with RK4 and matches the simulated angles to the observations,
 * wrapping the angular residual into (−π, π] so it is well defined regardless of
 * winding. This is the same habit device/TCAD work calls *parameter
 * extraction*: fit a physics model's coefficients to measured data, with the
 * model's own solver in the loop.
 *
 * Determinism: no randomness anywhere — identical inputs give identical fits.
 */

import { rhsDouble } from '../physics/double';
import { rk4Step } from '../physics/integrators';
import { solveLinearInPlace } from '../physics/linearSolve';
import type { StateVector } from '../physics/types';
import type { PendulumParameters } from '../types/domain';

/** A residual function maps a parameter vector to the vector of residuals. */
export type ResidualFunction = (parameters: readonly number[]) => number[];

export interface LevenbergMarquardtOptions {
  /** Maximum outer iterations. Default 100. */
  maxIterations?: number;
  /** Stop when the relative cost reduction falls below this. Default 1e-10. */
  costTolerance?: number;
  /** Stop when ‖δ‖∞ falls below this. Default 1e-12. */
  stepTolerance?: number;
  /** Stop when ‖Jᵀr‖∞ falls below this. Default 1e-12. */
  gradientTolerance?: number;
  /** Initial Marquardt damping λ. Default 1e-3. */
  initialLambda?: number;
  /** Factor λ is multiplied by on a rejected step. Default 10. */
  lambdaUp?: number;
  /** Factor λ is divided by on an accepted step. Default 10. */
  lambdaDown?: number;
  /** Largest λ tried before giving up on an iteration. Default 1e12. */
  maxLambda?: number;
  /** Relative step for forward-difference Jacobian columns. Default 1e-6. */
  finiteDiffStep?: number;
  /** Optional per-parameter lower bounds (projected after each accepted step). */
  lowerBounds?: readonly number[];
  /** Optional per-parameter upper bounds. */
  upperBounds?: readonly number[];
}

export type LeastSquaresStatus =
  | 'cost-converged'
  | 'step-converged'
  | 'gradient-converged'
  | 'max-iterations'
  | 'lambda-overflow';

export interface LeastSquaresResult {
  /** Best-fit parameter vector. */
  parameters: number[];
  /** Final cost C = ½‖r‖². */
  cost: number;
  /** Root-mean-square residual, √(‖r‖²/m). */
  rmse: number;
  /** Number of outer iterations performed. */
  iterations: number;
  /** Whether a convergence criterion (not iteration cap / overflow) was met. */
  converged: boolean;
  status: LeastSquaresStatus;
  /** Final Marquardt damping. */
  lambda: number;
  /** ‖Jᵀr‖∞ at the returned point. */
  gradientNorm: number;
  /** Degrees of freedom m − n (residuals minus parameters). */
  degreesOfFreedom: number;
  /** Unbiased residual variance s² = ‖r‖²/(m−n); NaN if m ≤ n. */
  residualVariance: number;
  /**
   * Parameter covariance estimate s²·(JᵀJ)⁻¹ at the solution (n×n). Empty if
   * JᵀJ was singular at the optimum. For a linear-in-parameters model with
   * Gaussian noise this is the *exact* estimator covariance; for a nonlinear
   * model it is the standard linearised (asymptotic) approximation.
   */
  covariance: number[][];
  /** Per-parameter standard errors √diag(covariance); NaN where unavailable. */
  standardErrors: number[];
  /** Correlation matrix derived from `covariance` (n×n); empty if unavailable. */
  correlation: number[][];
}

/**
 * Invert a row-major n×n matrix by solving A·x = e_k for each unit column.
 * Returns null if any column solve is singular. `solveLinearInPlace` mutates
 * its inputs, so each column gets a fresh copy.
 */
function invertMatrix(a: Float64Array, n: number): number[][] | null {
  const inverse: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let col = 0; col < n; col += 1) {
    const matrix = new Float64Array(a);
    const rhs = new Float64Array(n);
    rhs[col] = 1;
    const result = solveLinearInPlace(matrix, rhs, n, { fallbackPolicy: 'return-diagnostics' });
    if (!result.ok) return null;
    for (let row = 0; row < n; row += 1) inverse[row]![col] = rhs[row]!;
  }
  return inverse;
}

function sumSquares(values: readonly number[]): number {
  let s = 0;
  for (const v of values) s += v * v;
  return s;
}

function clampToBounds(
  parameters: number[],
  lower: readonly number[] | undefined,
  upper: readonly number[] | undefined
): void {
  for (let i = 0; i < parameters.length; i += 1) {
    if (lower && i < lower.length) parameters[i] = Math.max(parameters[i]!, lower[i]!);
    if (upper && i < upper.length) parameters[i] = Math.min(parameters[i]!, upper[i]!);
  }
}

/**
 * Levenberg–Marquardt least-squares fit of `residual` starting from
 * `initialParameters`. The forward model lives entirely inside `residual`; this
 * routine only needs to evaluate it. Throws if the residual length changes
 * between calls or is non-finite at the start (an ill-posed problem the caller
 * should fix rather than have silently masked).
 */
export function levenbergMarquardt(
  residual: ResidualFunction,
  initialParameters: readonly number[],
  options: LevenbergMarquardtOptions = {}
): LeastSquaresResult {
  const maxIterations = options.maxIterations ?? 100;
  const costTolerance = options.costTolerance ?? 1e-10;
  const stepTolerance = options.stepTolerance ?? 1e-12;
  const gradientTolerance = options.gradientTolerance ?? 1e-12;
  const lambdaUp = options.lambdaUp ?? 10;
  const lambdaDown = options.lambdaDown ?? 10;
  const maxLambda = options.maxLambda ?? 1e12;
  const relStep = options.finiteDiffStep ?? 1e-6;

  const n = initialParameters.length;
  if (n === 0) throw new Error('levenbergMarquardt: need at least one parameter to estimate.');

  let params = initialParameters.slice();
  clampToBounds(params, options.lowerBounds, options.upperBounds);

  let r = residual(params);
  const m = r.length;
  if (m === 0) throw new Error('levenbergMarquardt: residual is empty.');
  if (m < n) throw new Error(`levenbergMarquardt: underdetermined (${m} residuals < ${n} parameters).`);
  if (!r.every(Number.isFinite)) throw new Error('levenbergMarquardt: residual is non-finite at the initial guess.');

  let cost = 0.5 * sumSquares(r);
  let lambda = options.initialLambda ?? 1e-3;

  // Scratch for the n×n normal-equation system (reused each iteration).
  const jtj = new Float64Array(n * n);
  const jtr = new Float64Array(n);
  const damped = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  const jacobian: number[][] = []; // m rows × n cols

  let status: LeastSquaresStatus = 'max-iterations';
  let converged = false;
  let gradientNorm = Infinity;
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter += 1) {
    iterations = iter + 1;

    // Forward-difference Jacobian: column j = (r(p + h e_j) − r) / h.
    jacobian.length = 0;
    for (let i = 0; i < m; i += 1) jacobian.push(new Array(n).fill(0));
    for (let j = 0; j < n; j += 1) {
      const pj = params[j]!;
      const h = relStep * (Math.abs(pj) + relStep);
      const perturbed = params.slice();
      perturbed[j] = pj + h;
      const rPerturbed = residual(perturbed);
      if (rPerturbed.length !== m) throw new Error('levenbergMarquardt: residual length changed between evaluations.');
      const invH = 1 / h;
      for (let i = 0; i < m; i += 1) jacobian[i]![j] = (rPerturbed[i]! - r[i]!) * invH;
    }

    // Normal-equation matrices JᵀJ and Jᵀr.
    jtj.fill(0);
    jtr.fill(0);
    for (let i = 0; i < m; i += 1) {
      const row = jacobian[i]!;
      const ri = r[i]!;
      for (let a = 0; a < n; a += 1) {
        const ja = row[a]!;
        jtr[a] = jtr[a]! + ja * ri;
        for (let b = a; b < n; b += 1) jtj[a * n + b] = jtj[a * n + b]! + ja * row[b]!;
      }
    }
    // Symmetrise (we only filled the upper triangle above).
    for (let a = 0; a < n; a += 1) {
      for (let b = a + 1; b < n; b += 1) jtj[b * n + a] = jtj[a * n + b]!;
    }

    gradientNorm = 0;
    for (let a = 0; a < n; a += 1) gradientNorm = Math.max(gradientNorm, Math.abs(jtr[a]!));
    if (gradientNorm < gradientTolerance) {
      status = 'gradient-converged';
      converged = true;
      break;
    }

    // Inner loop: grow λ until a step reduces the cost (or λ overflows).
    let stepAccepted = false;
    let stepInfNorm = 0;
    while (lambda <= maxLambda) {
      // (JᵀJ + λ·diag(JᵀJ)) δ = −Jᵀr.
      for (let a = 0; a < n; a += 1) {
        for (let b = 0; b < n; b += 1) damped[a * n + b] = jtj[a * n + b]!;
        const diag = jtj[a * n + a]!;
        // Floor the scaling so a zero diagonal still gets Levenberg's λ·I term.
        damped[a * n + a] = diag + lambda * (diag > 0 ? diag : 1);
        rhs[a] = -jtr[a]!;
      }
      const solve = solveLinearInPlace(damped, rhs, n, { fallbackPolicy: 'return-diagnostics' });
      if (!solve.ok) {
        lambda *= lambdaUp;
        continue;
      }

      const candidate = params.slice();
      stepInfNorm = 0;
      for (let a = 0; a < n; a += 1) {
        candidate[a] = params[a]! + rhs[a]!;
        stepInfNorm = Math.max(stepInfNorm, Math.abs(rhs[a]!));
      }
      clampToBounds(candidate, options.lowerBounds, options.upperBounds);

      const rCandidate = residual(candidate);
      const candidateCost = rCandidate.every(Number.isFinite) ? 0.5 * sumSquares(rCandidate) : Infinity;
      if (candidateCost < cost) {
        const relReduction = (cost - candidateCost) / Math.max(cost, Number.MIN_VALUE);
        params = candidate;
        r = rCandidate;
        const previousCost = cost;
        cost = candidateCost;
        lambda = Math.max(lambda / lambdaDown, 1e-15);
        stepAccepted = true;
        if (relReduction < costTolerance && previousCost > 0) {
          status = 'cost-converged';
          converged = true;
        }
        break;
      }
      lambda *= lambdaUp;
    }

    if (!stepAccepted) {
      status = 'lambda-overflow';
      break;
    }
    if (converged) break;
    if (stepInfNorm < stepTolerance) {
      status = 'step-converged';
      converged = true;
      break;
    }
  }

  // --- Uncertainty: s²·(JᵀJ)⁻¹ at the solution -----------------------------
  // `r` is the residual at the final `params` (every accepted step updated both
  // together), so a fresh forward-difference Jacobian here is taken at the
  // optimum.
  const degreesOfFreedom = m - n;
  const residualVariance = degreesOfFreedom > 0 ? (2 * cost) / degreesOfFreedom : NaN;
  // Forward-difference Jacobian columns at the optimum.
  const columns: number[][] = [];
  for (let j = 0; j < n; j += 1) {
    const pj = params[j]!;
    const h = relStep * (Math.abs(pj) + relStep);
    const perturbed = params.slice();
    perturbed[j] = pj + h;
    const rPerturbed = residual(perturbed);
    const invH = 1 / h;
    const column = new Array<number>(m);
    for (let i = 0; i < m; i += 1) column[i] = (rPerturbed[i]! - r[i]!) * invH;
    columns.push(column);
  }
  const jtjFinal = new Float64Array(n * n);
  for (let a = 0; a < n; a += 1) {
    for (let b = 0; b < n; b += 1) {
      let acc = 0;
      const ca = columns[a]!;
      const cb = columns[b]!;
      for (let i = 0; i < m; i += 1) acc += ca[i]! * cb[i]!;
      jtjFinal[a * n + b] = acc;
    }
  }

  const geometricCovariance = invertMatrix(jtjFinal, n);
  let covariance: number[][] = [];
  let standardErrors = new Array<number>(n).fill(NaN);
  let correlation: number[][] = [];
  if (geometricCovariance) {
    covariance = geometricCovariance.map((row) => row.map((v) => v * residualVariance));
    standardErrors = covariance.map((row, i) => Math.sqrt(Math.max(row[i]!, 0)));
    correlation = covariance.map((row, i) =>
      row.map((v, j) => {
        const denom = standardErrors[i]! * standardErrors[j]!;
        return denom > 0 ? v / denom : i === j ? 1 : 0;
      })
    );
  }

  return {
    parameters: params,
    cost,
    rmse: Math.sqrt((2 * cost) / m),
    iterations,
    converged,
    status,
    lambda,
    gradientNorm,
    degreesOfFreedom,
    residualVariance,
    covariance,
    standardErrors,
    correlation
  };
}

/** Estimable scalar parameters of the planar double pendulum. */
export type DoublePendulumParameterName = 'm1' | 'm2' | 'l1' | 'l2' | 'g';

export interface DoublePendulumObservation {
  /** Strictly increasing sample times starting at (or after) 0. */
  times: readonly number[];
  /** Observed (θ₁, θ₂) at each sample time (same length as `times`). */
  angles: ReadonlyArray<readonly [number, number]>;
}

export interface DoublePendulumFitSpec {
  /** Known initial state [θ₁, θ₂, ω₁, ω₂] at t = 0. */
  initialState: readonly [number, number, number, number];
  /** Base parameters; entries not in `estimate` are held fixed at these values. */
  base: PendulumParameters;
  /** Damping coefficient γ (held fixed; the inverse problem is over the others). */
  gamma: number;
  /** Which parameters to estimate. */
  estimate: readonly DoublePendulumParameterName[];
  /** Initial guesses for the estimated parameters, in the same order. */
  initialGuess: readonly number[];
  /** RK4 step used by the forward model. Default 2e-3. */
  dt?: number;
  /**
   * Also estimate the initial angles (θ₁, θ₂ at t = 0) as two trailing fit
   * parameters, seeded from `initialState`. Use this when θ₀ comes from the
   * same noisy measurement as the trajectory (e.g. video tracking): fixing θ₀
   * at a noisy first sample injects a *systematic* state error that the
   * optimiser can only absorb by biasing the physical parameters. Angular
   * velocities stay fixed at `initialState[2..3]` (a release-from-rest
   * protocol makes ω₀ = 0 credible without estimating it).
   */
  estimateInitialAngles?: boolean;
}

export interface DoublePendulumFitResult extends LeastSquaresResult {
  /** Estimated values keyed by parameter name. */
  estimated: Partial<Record<DoublePendulumParameterName, number>>;
  /** The full parameter set with the estimates substituted in. */
  parametersFull: PendulumParameters;
  /**
   * Initial angles used by the best-fit forward model: the estimated (θ₁, θ₂)
   * when `estimateInitialAngles` is set, otherwise the fixed `initialState`
   * values echoed back.
   */
  initialAngles: readonly [number, number];
}

function wrapPi(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Integrate the double pendulum from `initialState` and return the simulated
 * (θ₁, θ₂) at each `times[i]`, sub-stepping each inter-sample interval into an
 * integer number of RK4 steps of size ≤ `dt` so every sample lands exactly on a
 * step boundary.
 */
function simulateDoubleAngles(
  parameters: PendulumParameters,
  gamma: number,
  initialState: readonly [number, number, number, number],
  times: readonly number[],
  dt: number
): Array<[number, number]> {
  const state = Float64Array.from(initialState) as StateVector;
  const out = new Float64Array(4) as StateVector;
  const rhs = (s: StateVector, o: StateVector): void => {
    rhsDouble(s, parameters, gamma, o);
  };
  const angles: Array<[number, number]> = [];
  let t = 0;
  for (const target of times) {
    const span = target - t;
    if (span < 0) throw new Error('simulateDoubleAngles: observation times must be non-decreasing.');
    if (span > 0) {
      const steps = Math.max(1, Math.ceil(span / dt - 1e-9));
      const h = span / steps;
      for (let k = 0; k < steps; k += 1) {
        rk4Step(state, h, rhs, out);
        state.set(out);
      }
      t = target;
    }
    angles.push([state[0]!, state[1]!]);
  }
  return angles;
}

/**
 * Recover double-pendulum parameters from an observed angle trajectory by
 * nonlinear least squares. The forward model is the platform's own `rhsDouble`
 * integrated with RK4; residuals are the (−π, π]-wrapped angle differences at
 * each observation time, so the fit is insensitive to winding.
 */
export function fitDoublePendulum(
  observation: DoublePendulumObservation,
  spec: DoublePendulumFitSpec,
  options: LevenbergMarquardtOptions = {}
): DoublePendulumFitResult {
  const { times, angles } = observation;
  if (times.length !== angles.length) throw new Error('fitDoublePendulum: times and angles length mismatch.');
  if (times.length === 0) throw new Error('fitDoublePendulum: no observations.');
  if (spec.estimate.length !== spec.initialGuess.length) {
    throw new Error('fitDoublePendulum: estimate and initialGuess length mismatch.');
  }
  const dt = spec.dt ?? 2e-3;
  const withInitialAngles = spec.estimateInitialAngles === true;

  const buildParameters = (values: readonly number[]): PendulumParameters => {
    const p: PendulumParameters = { ...spec.base };
    spec.estimate.forEach((name, index) => {
      p[name] = values[index]!;
    });
    return p;
  };

  const buildInitialState = (values: readonly number[]): readonly [number, number, number, number] => {
    if (!withInitialAngles) return spec.initialState;
    const base = spec.estimate.length;
    return [values[base]!, values[base + 1]!, spec.initialState[2], spec.initialState[3]];
  };

  const residual: ResidualFunction = (values) => {
    const parameters = buildParameters(values);
    const simulated = simulateDoubleAngles(parameters, spec.gamma, buildInitialState(values), times, dt);
    const out: number[] = [];
    for (let i = 0; i < simulated.length; i += 1) {
      out.push(wrapPi(simulated[i]![0] - angles[i]![0]));
      out.push(wrapPi(simulated[i]![1] - angles[i]![1]));
    }
    return out;
  };

  // Default to physically meaningful positivity bounds unless the caller
  // overrides; estimated initial angles are unbounded (angles wrap).
  const defaultLower = withInitialAngles
    ? [...spec.estimate.map(() => 1e-6), -Infinity, -Infinity]
    : spec.estimate.map(() => 1e-6);
  const initialGuess = withInitialAngles
    ? [...spec.initialGuess, spec.initialState[0], spec.initialState[1]]
    : spec.initialGuess;
  const fit = levenbergMarquardt(residual, initialGuess, {
    lowerBounds: options.lowerBounds ?? defaultLower,
    ...options
  });

  const estimated: Partial<Record<DoublePendulumParameterName, number>> = {};
  spec.estimate.forEach((name, index) => {
    estimated[name] = fit.parameters[index]!;
  });

  const finalInitial = buildInitialState(fit.parameters);
  return {
    ...fit,
    estimated,
    parametersFull: buildParameters(fit.parameters),
    initialAngles: [finalInitial[0], finalInitial[1]]
  };
}
