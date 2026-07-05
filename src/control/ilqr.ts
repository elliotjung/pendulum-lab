import type { PendulumParameters } from '../types/domain';
import type { StateVector } from '../physics/types';
import { rk4Step } from '../physics/integrators';
import { rhsDoubleActuated, type ActuationMode } from './actuated';
import { actuatedChannels, matZeros } from './lqr';

/**
 * iLQR (iterative LQR) trajectory optimisation — the workhorse behind the
 * swing-up controllers in Crocoddyl, Drake, OCS2, and the DFKI
 * `double_pendulum` benchmark, re-designed for this codebase as a dependency-
 * free solver over an arbitrary discrete step map:
 *
 * 1. roll the current control sequence out through the dynamics;
 * 2. backward pass: Riccati-like recursion on the quadratic expansion of cost
 *    and dynamics along the trajectory, with Levenberg-Marquardt
 *    regularisation on Q_uu so a non-convex stretch cannot break the solve;
 * 3. forward pass: backtracking line search on the feedforward step, keeping
 *    the time-varying feedback gains so the rollout does not diverge from the
 *    linearisation.
 *
 * The returned cost history is non-increasing by construction (steps are only
 * accepted on actual cost decrease), which the tests pin along with the
 * swing-up itself. Dynamics derivatives use central differences on the step
 * map (the map is one RK4 step, so an analytic discrete Jacobian would need
 * the chain rule through all four stages; central differencing at h ≈ 1e-5
 * gives ~1e-9 accuracy, far below iLQR's own linearisation error).
 *
 * Torque limits are enforced by clamping inside the rollout (and on the
 * returned sequence). Near-active limits this leaves the derivative slightly
 * stale — the well-known clamping-iLQR caveat; the box-constrained backward
 * pass (Tassa's box-DDP, Crocoddyl's BoxFDDP) is the documented upgrade path.
 */

export type DiscreteDynamics = (x: ArrayLike<number>, u: ArrayLike<number>, out: Float64Array) => void;

export interface IlqrProblem {
  dynamics: DiscreteDynamics;
  n: number;
  m: number;
  /** Number of control knots N; states run 0..N. */
  horizon: number;
  x0: readonly number[];
  goal: readonly number[];
  /** Running state cost (n×n), running control cost (m×m), terminal cost (n×n). */
  Q: number[][];
  R: number[][];
  Qf: number[][];
  /** Initial control sequence (horizon × m); defaults to zeros. */
  uInit?: readonly (readonly number[])[];
  /** Symmetric clamp |u_i| ≤ torqueLimit applied inside every rollout. */
  torqueLimit?: number;
}

export interface IlqrOptions {
  maxIterations?: number;
  /** Relative cost-decrease threshold that declares convergence. */
  costTolerance?: number;
  regInit?: number;
  regMin?: number;
  regMax?: number;
  regFactor?: number;
  lineSearchBacktracks?: number;
  /** Central-difference step for the dynamics derivatives. */
  fdStep?: number;
}

export interface IlqrResult {
  /** Optimised states (horizon+1 vectors of length n). */
  xs: Float64Array[];
  /** Optimised controls (horizon vectors of length m). */
  us: Float64Array[];
  cost: number;
  /** Accepted-iteration costs, non-increasing, starting at the initial rollout. */
  costHistory: number[];
  iterations: number;
  converged: boolean;
  /** Final Levenberg-Marquardt regularisation. */
  regularization: number;
  /** ∞-norm of the final feedforward step (first-order optimality proxy). */
  gradientNorm: number;
}

function clampControls(u: Float64Array, limit: number): void {
  for (let i = 0; i < u.length; i += 1) u[i] = Math.min(limit, Math.max(-limit, u[i]!));
}

function quadCost(dx: readonly number[], W: readonly (readonly number[])[]): number {
  let acc = 0;
  for (let i = 0; i < dx.length; i += 1) {
    for (let j = 0; j < dx.length; j += 1) acc += (dx[i] ?? 0) * (W[i]![j] ?? 0) * (dx[j] ?? 0);
  }
  return 0.5 * acc;
}

/** In-place Cholesky of a small symmetric matrix; returns null when not PD. */
function cholSmall(a: readonly (readonly number[])[]): number[][] | null {
  const n = a.length;
  const l = matZeros(n, n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = a[i]![j] ?? 0;
      for (let k = 0; k < j; k += 1) sum -= (l[i]![k] ?? 0) * (l[j]![k] ?? 0);
      if (i === j) {
        if (sum <= 0) return null;
        l[i]![i] = Math.sqrt(sum);
      } else {
        l[i]![j] = sum / (l[j]![j] ?? 1);
      }
    }
  }
  return l;
}

/** Solve L Lᵀ x = b for each column of b using a Cholesky factor. */
function cholSolve(l: readonly (readonly number[])[], b: readonly (readonly number[])[]): number[][] {
  const n = l.length;
  const cols = b[0]?.length ?? 0;
  const x = b.map((row) => row.slice());
  for (let c = 0; c < cols; c += 1) {
    for (let i = 0; i < n; i += 1) {
      let sum = x[i]![c] ?? 0;
      for (let k = 0; k < i; k += 1) sum -= (l[i]![k] ?? 0) * (x[k]![c] ?? 0);
      x[i]![c] = sum / (l[i]![i] ?? 1);
    }
    for (let i = n - 1; i >= 0; i -= 1) {
      let sum = x[i]![c] ?? 0;
      for (let k = i + 1; k < n; k += 1) sum -= (l[k]![i] ?? 0) * (x[k]![c] ?? 0);
      x[i]![c] = sum / (l[i]![i] ?? 1);
    }
  }
  return x;
}

interface Rollout {
  xs: Float64Array[];
  us: Float64Array[];
  cost: number;
}

function rollout(problem: IlqrProblem, us: readonly Float64Array[]): Rollout {
  const { n, horizon, dynamics, goal, Q, R, Qf } = problem;
  const limit = problem.torqueLimit ?? Infinity;
  const xs: Float64Array[] = [Float64Array.from(problem.x0)];
  const usOut: Float64Array[] = [];
  let cost = 0;
  const dx = new Array<number>(n).fill(0);
  for (let k = 0; k < horizon; k += 1) {
    const u = Float64Array.from(us[k]!);
    clampControls(u, limit);
    usOut.push(u);
    const x = xs[k]!;
    for (let i = 0; i < n; i += 1) dx[i] = (x[i] ?? 0) - (goal[i] ?? 0);
    cost += quadCost(dx, Q) + quadCost(Array.from(u), R);
    const next = new Float64Array(n);
    dynamics(x, u, next);
    xs.push(next);
  }
  const xN = xs[horizon]!;
  for (let i = 0; i < n; i += 1) dx[i] = (xN[i] ?? 0) - (goal[i] ?? 0);
  cost += quadCost(dx, Qf);
  return { xs, us: usOut, cost };
}

/** Central-difference Jacobians of the step map at (x, u): fx (n×n), fu (n×m). */
function stepJacobians(
  dynamics: DiscreteDynamics,
  x: Float64Array,
  u: Float64Array,
  n: number,
  m: number,
  h: number,
  fx: number[][],
  fu: number[][]
): void {
  const xp = new Float64Array(x);
  const up = new Float64Array(u);
  const fPlus = new Float64Array(n);
  const fMinus = new Float64Array(n);
  for (let j = 0; j < n; j += 1) {
    const eps = h * Math.max(1, Math.abs(x[j] ?? 0));
    xp[j] = (x[j] ?? 0) + eps;
    dynamics(xp, u, fPlus);
    xp[j] = (x[j] ?? 0) - eps;
    dynamics(xp, u, fMinus);
    xp[j] = x[j] ?? 0;
    const inv = 0.5 / eps;
    for (let i = 0; i < n; i += 1) fx[i]![j] = ((fPlus[i] ?? 0) - (fMinus[i] ?? 0)) * inv;
  }
  for (let j = 0; j < m; j += 1) {
    const eps = h * Math.max(1, Math.abs(u[j] ?? 0));
    up[j] = (u[j] ?? 0) + eps;
    dynamics(x, up, fPlus);
    up[j] = (u[j] ?? 0) - eps;
    dynamics(x, up, fMinus);
    up[j] = u[j] ?? 0;
    const inv = 0.5 / eps;
    for (let i = 0; i < n; i += 1) fu[i]![j] = ((fPlus[i] ?? 0) - (fMinus[i] ?? 0)) * inv;
  }
}

export function ilqrSolve(problem: IlqrProblem, options: IlqrOptions = {}): IlqrResult {
  const { n, m, horizon } = problem;
  const maxIterations = options.maxIterations ?? 200;
  const costTolerance = options.costTolerance ?? 1e-8;
  const regMin = options.regMin ?? 1e-9;
  const regMax = options.regMax ?? 1e10;
  const regFactor = options.regFactor ?? 10;
  const backtracks = options.lineSearchBacktracks ?? 10;
  const h = options.fdStep ?? 1e-5;

  let us: Float64Array[] = Array.from({ length: horizon }, (_, k) => {
    const u = new Float64Array(m);
    const init = problem.uInit?.[k];
    if (init) for (let i = 0; i < m; i += 1) u[i] = Number(init[i] ?? 0);
    return u;
  });
  let current = rollout(problem, us);
  us = current.us;
  const costHistory = [current.cost];
  let reg = options.regInit ?? 1e-6;
  let converged = false;
  let iterations = 0;
  let gradientNorm = Infinity;

  // Per-knot derivative and gain storage.
  const fxs = Array.from({ length: horizon }, () => matZeros(n, n));
  const fus = Array.from({ length: horizon }, () => matZeros(n, m));
  const kff = Array.from({ length: horizon }, () => new Array<number>(m).fill(0));
  const Kfb = Array.from({ length: horizon }, () => matZeros(m, n));

  for (let iter = 0; iter < maxIterations && !converged; iter += 1) {
    iterations = iter + 1;
    for (let k = 0; k < horizon; k += 1) {
      stepJacobians(problem.dynamics, current.xs[k]!, us[k]!, n, m, h, fxs[k]!, fus[k]!);
    }

    // Backward pass with regularisation retries.
    let backwardOk = false;
    while (!backwardOk && reg <= regMax) {
      backwardOk = true;
      const vx = new Array<number>(n).fill(0);
      const vxx = matZeros(n, n);
      const xN = current.xs[horizon]!;
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          vxx[i]![j] = problem.Qf[i]![j] ?? 0;
          vx[i] = (vx[i] ?? 0) + (problem.Qf[i]![j] ?? 0) * ((xN[j] ?? 0) - (problem.goal[j] ?? 0));
        }
      }
      gradientNorm = 0;
      for (let k = horizon - 1; k >= 0; k -= 1) {
        const fx = fxs[k]!;
        const fu = fus[k]!;
        const x = current.xs[k]!;
        const u = us[k]!;
        // Cost expansions.
        const qx = new Array<number>(n).fill(0);
        const qu = new Array<number>(m).fill(0);
        for (let i = 0; i < n; i += 1) {
          for (let j = 0; j < n; j += 1) qx[i] = (qx[i] ?? 0) + (problem.Q[i]![j] ?? 0) * ((x[j] ?? 0) - (problem.goal[j] ?? 0));
        }
        for (let i = 0; i < m; i += 1) {
          for (let j = 0; j < m; j += 1) qu[i] = (qu[i] ?? 0) + (problem.R[i]![j] ?? 0) * (u[j] ?? 0);
        }
        // Q-function expansions: Qx = qx + fxᵀvx, Qu = qu + fuᵀvx,
        // Qxx = Q + fxᵀVxx fx, Quu = R + fuᵀVxx fu, Qux = fuᵀVxx fx.
        const fxT_vxx = matZeros(n, n);
        for (let i = 0; i < n; i += 1) {
          for (let j = 0; j < n; j += 1) {
            let acc = 0;
            for (let r = 0; r < n; r += 1) acc += (fx[r]![i] ?? 0) * (vxx[r]![j] ?? 0);
            fxT_vxx[i]![j] = acc;
          }
        }
        const fuT_vxx = matZeros(m, n);
        for (let i = 0; i < m; i += 1) {
          for (let j = 0; j < n; j += 1) {
            let acc = 0;
            for (let r = 0; r < n; r += 1) acc += (fu[r]![i] ?? 0) * (vxx[r]![j] ?? 0);
            fuT_vxx[i]![j] = acc;
          }
        }
        const Qx = qx.map((v, i) => {
          let acc = v;
          for (let r = 0; r < n; r += 1) acc += (fx[r]![i] ?? 0) * (vx[r] ?? 0);
          return acc;
        });
        const Qu = qu.map((v, i) => {
          let acc = v;
          for (let r = 0; r < n; r += 1) acc += (fu[r]![i] ?? 0) * (vx[r] ?? 0);
          return acc;
        });
        const Qxx = matZeros(n, n);
        for (let i = 0; i < n; i += 1) {
          for (let j = 0; j < n; j += 1) {
            let acc = problem.Q[i]![j] ?? 0;
            for (let r = 0; r < n; r += 1) acc += (fxT_vxx[i]![r] ?? 0) * (fx[r]![j] ?? 0);
            Qxx[i]![j] = acc;
          }
        }
        const Quu = matZeros(m, m);
        for (let i = 0; i < m; i += 1) {
          for (let j = 0; j < m; j += 1) {
            let acc = problem.R[i]![j] ?? 0;
            for (let r = 0; r < n; r += 1) acc += (fuT_vxx[i]![r] ?? 0) * (fu[r]![j] ?? 0);
            Quu[i]![j] = acc + (i === j ? reg : 0);
          }
        }
        const Qux = matZeros(m, n);
        for (let i = 0; i < m; i += 1) {
          for (let j = 0; j < n; j += 1) {
            let acc = 0;
            for (let r = 0; r < n; r += 1) acc += (fuT_vxx[i]![r] ?? 0) * (fx[r]![j] ?? 0);
            Qux[i]![j] = acc;
          }
        }
        const chol = cholSmall(Quu);
        if (!chol) {
          reg *= regFactor;
          backwardOk = false;
          break;
        }
        const rhs = matZeros(m, n + 1);
        for (let i = 0; i < m; i += 1) {
          rhs[i]![0] = Qu[i] ?? 0;
          for (let j = 0; j < n; j += 1) rhs[i]![j + 1] = Qux[i]![j] ?? 0;
        }
        const sol = cholSolve(chol, rhs);
        for (let i = 0; i < m; i += 1) {
          kff[k]![i] = -(sol[i]![0] ?? 0);
          for (let j = 0; j < n; j += 1) Kfb[k]![i]![j] = -(sol[i]![j + 1] ?? 0);
          gradientNorm = Math.max(gradientNorm, Math.abs(kff[k]![i] ?? 0));
        }
        // Value update: Vx = Qx + Kᵀ Quu k + Kᵀ Qu + Quxᵀ k ; Vxx analogous.
        const K = Kfb[k]!;
        const kv = kff[k]!;
        for (let i = 0; i < n; i += 1) {
          let acc = Qx[i] ?? 0;
          for (let a = 0; a < m; a += 1) {
            let quuK = 0;
            for (let b = 0; b < m; b += 1) quuK += (Quu[a]![b] ?? 0) * (kv[b] ?? 0);
            acc += (K[a]![i] ?? 0) * (quuK + (Qu[a] ?? 0)) + (Qux[a]![i] ?? 0) * (kv[a] ?? 0);
          }
          vx[i] = acc;
        }
        const newVxx = matZeros(n, n);
        for (let i = 0; i < n; i += 1) {
          for (let j = 0; j < n; j += 1) {
            let acc = Qxx[i]![j] ?? 0;
            for (let a = 0; a < m; a += 1) {
              let quuK = 0;
              for (let b = 0; b < m; b += 1) quuK += (Quu[a]![b] ?? 0) * (K[b]![j] ?? 0);
              acc += (K[a]![i] ?? 0) * quuK + (K[a]![i] ?? 0) * (Qux[a]![j] ?? 0) + (Qux[a]![i] ?? 0) * (K[a]![j] ?? 0);
            }
            newVxx[i]![j] = acc;
          }
        }
        for (let i = 0; i < n; i += 1) {
          for (let j = 0; j < n; j += 1) vxx[i]![j] = 0.5 * ((newVxx[i]![j] ?? 0) + (newVxx[j]![i] ?? 0));
        }
      }
    }
    if (!backwardOk) break; // regularisation exhausted

    // Forward pass: backtracking line search with feedback tracking.
    let accepted = false;
    for (let ls = 0; ls < backtracks && !accepted; ls += 1) {
      const alpha = 0.5 ** ls;
      const trialUs: Float64Array[] = [];
      const x = Float64Array.from(problem.x0);
      const next = new Float64Array(n);
      const limit = problem.torqueLimit ?? Infinity;
      for (let k = 0; k < horizon; k += 1) {
        const u = new Float64Array(m);
        for (let i = 0; i < m; i += 1) {
          let du = alpha * (kff[k]![i] ?? 0);
          for (let j = 0; j < n; j += 1) du += (Kfb[k]![i]![j] ?? 0) * ((x[j] ?? 0) - (current.xs[k]![j] ?? 0));
          u[i] = (us[k]![i] ?? 0) + du;
        }
        clampControls(u, limit);
        trialUs.push(u);
        problem.dynamics(x, u, next);
        x.set(next);
      }
      const trial = rollout(problem, trialUs);
      if (Number.isFinite(trial.cost) && trial.cost < current.cost) {
        const decrease = current.cost - trial.cost;
        current = trial;
        us = trial.us;
        costHistory.push(trial.cost);
        reg = Math.max(regMin, reg / regFactor);
        accepted = true;
        if (decrease < costTolerance * Math.max(1, Math.abs(trial.cost))) converged = true;
      }
    }
    if (!accepted) {
      reg *= regFactor;
      if (reg > regMax) break;
    }
  }

  return {
    xs: current.xs,
    us,
    cost: current.cost,
    costHistory,
    iterations,
    converged,
    regularization: reg,
    gradientNorm
  };
}

// ---------------------------------------------------------------------------
// Double-pendulum swing-up problem builder
// ---------------------------------------------------------------------------

export interface DoubleSwingUpSpec {
  parameters: PendulumParameters;
  gamma: number;
  dt: number;
  horizon: number;
  mode?: ActuationMode;
  /** Weights in actuated-channel space; sensible swing-up defaults otherwise. */
  Q?: number[][];
  R?: number[][];
  Qf?: number[][];
  goal?: readonly number[];
  torqueLimit?: number;
}

/**
 * One-RK4-step discrete map of the actuated double pendulum with zero-order-
 * hold torque on the actuated channels of `mode`. The control vector has one
 * entry per actuated channel (m = 1 for acrobot/pendubot, 2 for full).
 */
export function makeDoublePendulumStepMap(
  parameters: PendulumParameters,
  gamma: number,
  dt: number,
  mode: ActuationMode = 'full'
): DiscreteDynamics {
  const channels = actuatedChannels(mode);
  const tau = new Float64Array(2);
  const scratch = new Float64Array(4);
  const rhs = (s: StateVector, o: StateVector): void => {
    rhsDoubleActuated(s, parameters, gamma, tau, o);
  };
  return (x, u, out) => {
    tau.fill(0);
    for (let c = 0; c < channels.length; c += 1) tau[channels[c]!] = Number(u[c] ?? 0);
    for (let i = 0; i < 4; i += 1) scratch[i] = Number(x[i] ?? 0);
    rk4Step(scratch, dt, rhs, out);
  };
}

const SWINGUP_Q_DIAG = [0.1, 0.1, 0.1, 0.1];

function diag(values: readonly number[]): number[][] {
  const m = matZeros(values.length, values.length);
  for (let i = 0; i < values.length; i += 1) m[i]![i] = values[i]!;
  return m;
}

/** Swing-up problem: hanging start [0,0,0,0] to upright goal [π,π,0,0]. */
export function makeDoubleSwingUpProblem(spec: DoubleSwingUpSpec): IlqrProblem {
  const mode = spec.mode ?? 'full';
  const m = actuatedChannels(mode).length;
  const problem: IlqrProblem = {
    dynamics: makeDoublePendulumStepMap(spec.parameters, spec.gamma, spec.dt, mode),
    n: 4,
    m,
    horizon: spec.horizon,
    x0: [0, 0, 0, 0],
    goal: [...(spec.goal ?? [Math.PI, Math.PI, 0, 0])],
    Q: spec.Q ?? diag(SWINGUP_Q_DIAG.map((v) => v * spec.dt)),
    R: spec.R ?? diag(new Array<number>(m).fill(0.1 * spec.dt)),
    Qf: spec.Qf ?? diag([100, 100, 10, 10])
  };
  if (spec.torqueLimit !== undefined) problem.torqueLimit = spec.torqueLimit;
  return problem;
}
