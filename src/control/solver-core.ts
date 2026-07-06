import { matZeros } from './lqr';
import { boxQpSolve, cholSmall, cholSolve } from './box-qp';
import type { DiscreteDynamics, IlqrOptions, IlqrProblem, IlqrResult } from './ilqr-types';

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

/** Central-difference Jacobians of the step map at (x, u): fx (n by n), fu (n by m). */
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

  const fxs = Array.from({ length: horizon }, () => matZeros(n, n));
  const fus = Array.from({ length: horizon }, () => matZeros(n, m));
  const kff = Array.from({ length: horizon }, () => new Array<number>(m).fill(0));
  const Kfb = Array.from({ length: horizon }, () => matZeros(m, n));

  for (let iter = 0; iter < maxIterations && !converged; iter += 1) {
    iterations = iter + 1;
    for (let k = 0; k < horizon; k += 1) {
      if (problem.derivatives) problem.derivatives(current.xs[k]!, us[k]!, fxs[k]!, fus[k]!);
      else stepJacobians(problem.dynamics, current.xs[k]!, us[k]!, n, m, h, fxs[k]!, fus[k]!);
    }

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
        const qx = new Array<number>(n).fill(0);
        const qu = new Array<number>(m).fill(0);
        for (let i = 0; i < n; i += 1) {
          for (let j = 0; j < n; j += 1) qx[i] = (qx[i] ?? 0) + (problem.Q[i]![j] ?? 0) * ((x[j] ?? 0) - (problem.goal[j] ?? 0));
        }
        for (let i = 0; i < m; i += 1) {
          for (let j = 0; j < m; j += 1) qu[i] = (qu[i] ?? 0) + (problem.R[i]![j] ?? 0) * (u[j] ?? 0);
        }
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
        const limit = problem.torqueLimit ?? Infinity;
        if (Number.isFinite(limit) && m <= 3) {
          const lo = Array.from({ length: m }, (_, i) => -limit - (u[i] ?? 0));
          const hi = Array.from({ length: m }, (_, i) => limit - (u[i] ?? 0));
          const qp = boxQpSolve(Quu, Qu, lo, hi);
          if (!qp) {
            reg *= regFactor;
            backwardOk = false;
            break;
          }
          const freeIdx: number[] = [];
          for (let i = 0; i < m; i += 1) {
            if (qp.free[i]) freeIdx.push(i);
            kff[k]![i] = qp.u[i] ?? 0;
            for (let j = 0; j < n; j += 1) Kfb[k]![i]![j] = 0;
            gradientNorm = Math.max(gradientNorm, Math.abs(kff[k]![i] ?? 0));
          }
          if (freeIdx.length > 0) {
            const hff = freeIdx.map((r) => freeIdx.map((c) => Quu[r]![c] ?? 0));
            const cholFree = cholSmall(hff);
            if (!cholFree) {
              reg *= regFactor;
              backwardOk = false;
              break;
            }
            const rhsFree = freeIdx.map((r) => Array.from({ length: n }, (_, j) => Qux[r]![j] ?? 0));
            const solFree = cholSolve(cholFree, rhsFree);
            for (let f = 0; f < freeIdx.length; f += 1) {
              for (let j = 0; j < n; j += 1) Kfb[k]![freeIdx[f]!]![j] = -(solFree[f]![j] ?? 0);
            }
          }
        } else {
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
        }
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
    if (!backwardOk) break;

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
