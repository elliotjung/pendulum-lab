import type { IntegratorId } from '../types/domain';
import type { Derivative, IntegratorMeta, StateVector, StepOptions } from './types';
import { dormandPrince54Step, bulirschStoerStep } from './adaptive';
import { trBdf2Step } from './stiff';
import { implicitMidpointNewton } from './implicitDiagnostics';

function ensureScratch(n: number): Float64Array[] {
  return Array.from({ length: 5 }, () => new Float64Array(n));
}

function addScaled(dst: StateVector, a: StateVector, k: number, b: StateVector, n: number): void {
  for (let i = 0; i < n; i += 1) dst[i] = Number(a[i] ?? 0) + k * Number(b[i] ?? 0);
}

/**
 * Evaluate the acceleration block of a second-order system encoded as
 * y = [q (first half), v (second half)] with rhs(y) = [v, a(q, v)].
 * Writes a(q, v) into `accOut` (length half). Returns the half length.
 */
function evalAcceleration(
  rhs: Derivative,
  q: ArrayLike<number>,
  v: ArrayLike<number>,
  half: number,
  scratchState: StateVector,
  scratchDeriv: StateVector,
  accOut: StateVector
): void {
  for (let i = 0; i < half; i += 1) {
    scratchState[i] = Number(q[i] ?? 0);
    scratchState[half + i] = Number(v[i] ?? 0);
  }
  rhs(scratchState, scratchDeriv);
  for (let i = 0; i < half; i += 1) accOut[i] = Number(scratchDeriv[half + i] ?? 0);
}

function isSplittable(n: number): boolean {
  return n > 0 && n % 2 === 0;
}

export const integratorRegistry: Readonly<Record<IntegratorId, IntegratorMeta>> = Object.freeze({
  euler: {
    id: 'euler',
    name: 'Explicit Euler',
    order: 1,
    symplectic: 'no',
    dampingSupport: 'supported',
    stabilityNotes: ['Fast smoke-test method only; large energy drift is expected.'],
    recommendedDt: [0.0005, 0.002]
  },
  rk2: {
    id: 'rk2',
    name: 'Midpoint RK2',
    order: 2,
    symplectic: 'no',
    dampingSupport: 'supported',
    stabilityNotes: ['Useful for qualitative comparison, not a publication baseline.'],
    recommendedDt: [0.0005, 0.004]
  },
  rk4: {
    id: 'rk4',
    name: 'Runge-Kutta 4',
    order: 4,
    symplectic: 'no',
    dampingSupport: 'supported',
    stabilityNotes: ['Good general baseline; energy conservation is diagnostic only.'],
    recommendedDt: [0.0005, 0.006]
  },
  verlet: {
    id: 'verlet',
    name: 'Velocity Verlet Alias',
    order: 2,
    symplectic: 'separable-approximation',
    dampingSupport: 'diagnostic-only',
    stabilityNotes: [
      'Legacy compatibility alias for the leapfrog KDK path.',
      'Kept for imported sessions that used the single-file compatibility method id.'
    ],
    recommendedDt: [0.0005, 0.004]
  },
  leapfrog: {
    id: 'leapfrog',
    name: 'Leapfrog Approximation',
    order: 2,
    symplectic: 'separable-approximation',
    dampingSupport: 'diagnostic-only',
    stabilityNotes: ['Only symplectic for separable canonical Hamiltonians; theta/omega coordinates are not sufficient for a blanket claim.'],
    recommendedDt: [0.0005, 0.004]
  },
  symplectic: {
    id: 'symplectic',
    name: 'Semi-Implicit Euler',
    order: 1,
    symplectic: 'pseudo-coordinate',
    dampingSupport: 'diagnostic-only',
    stabilityNotes: ['Treat as a qualitative phase-space view unless canonical coordinates are explicitly used.'],
    recommendedDt: [0.0005, 0.002]
  },
  yoshida4: {
    id: 'yoshida4',
    name: 'Yoshida 4 Composition',
    order: 4,
    symplectic: 'separable-approximation',
    dampingSupport: 'diagnostic-only',
    stabilityNotes: ['Composition method inherits symplectic claims only from a valid separable canonical sub-step.'],
    recommendedDt: [0.0005, 0.004]
  },
  hmidpoint: {
    id: 'hmidpoint',
    name: 'Implicit Midpoint',
    order: 'implicit',
    symplectic: 'canonical-only',
    dampingSupport: 'diagnostic-only',
    stabilityNotes: [
      'Canonical symplectic claims require theta/p coordinates, gamma = 0, and residual reporting.',
      'Uses Newton iteration when an analytic Jacobian is supplied; otherwise falls back to Picard fixed-point iteration.'
    ],
    recommendedDt: [0.0005, 0.008]
  },
  gauss2: {
    id: 'gauss2',
    name: 'Gauss-Legendre 4 (2-stage)',
    order: 'implicit',
    symplectic: 'canonical-only',
    dampingSupport: 'diagnostic-only',
    stabilityNotes: [
      'Two-stage collocation: classical order 4, symplectic and A-stable for canonical systems.',
      'Stage equations are solved by fixed-point iteration; the final residual is exported via previousError.'
    ],
    recommendedDt: [0.0005, 0.012]
  },
  rkf45: {
    id: 'rkf45',
    name: 'RKF45 Adaptive',
    order: 'adaptive',
    symplectic: 'no',
    dampingSupport: 'supported',
    stabilityNotes: ['Adaptive step statistics must be exported for replay and comparison.'],
    recommendedDt: [0.0002, 0.01]
  },
  dopri5: {
    id: 'dopri5',
    name: 'Dormand-Prince 5(4)',
    order: 5,
    symplectic: 'no',
    dampingSupport: 'supported',
    stabilityNotes: [
      'The fifth-order solution advances; the embedded fourth-order pair provides the error estimate (the method underlying MATLAB ode45).'
    ],
    recommendedDt: [0.0002, 0.012]
  },
  dop853: {
    id: 'dop853',
    name: 'DOP853 8(5,3)',
    order: 8,
    symplectic: 'no',
    dampingSupport: 'supported',
    stabilityNotes: [
      'Explicit Dormand-Prince 8th-order tableau with embedded 5th/3rd error monitors.',
      'Use as a high-accuracy fixed macro-step reference; SciPy DOP853 remains the independent external oracle.'
    ],
    recommendedDt: [0.0005, 0.03]
  },
  gbs: {
    id: 'gbs',
    name: 'Gragg-Bulirsch-Stoer',
    order: 'adaptive',
    symplectic: 'no',
    dampingSupport: 'supported',
    stabilityNotes: [
      'Modified-midpoint extrapolation; effective order grows with the number of stages.',
      'Extrapolation weights are computed from substep ratios, not transcribed, so high accuracy is reached without a large hand-written tableau.'
    ],
    recommendedDt: [0.001, 0.05]
  },
  bdf2: {
    id: 'bdf2',
    name: 'TR-BDF2 (stiff, L-stable)',
    order: 'implicit',
    symplectic: 'no',
    dampingSupport: 'supported',
    stabilityNotes: [
      'One-step, self-starting, L-stable second-order method for stiff systems.',
      'Each stage uses Newton iteration with a finite-difference Jacobian; the final residual is exported via previousError.'
    ],
    recommendedDt: [0.001, 0.05]
  }
});

export function eulerStep(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  const n = state.length;
  const scratch = ensureScratch(n);
  const k1 = scratch[0]!;
  rhs(state, k1);
  for (let i = 0; i < n; i += 1) out[i] = Number(state[i] ?? 0) + dt * Number(k1[i] ?? 0);
  return out;
}

export function rk2Step(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  const n = state.length;
  const scratch = ensureScratch(n);
  const k1 = scratch[0]!;
  const k2 = scratch[1]!;
  const tmp = scratch[2]!;
  rhs(state, k1);
  addScaled(tmp, state, 0.5 * dt, k1, n);
  rhs(tmp, k2);
  for (let i = 0; i < n; i += 1) out[i] = Number(state[i] ?? 0) + dt * Number(k2[i] ?? 0);
  return out;
}

export function rk4Step(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  const n = state.length;
  const scratch = ensureScratch(n);
  const k1 = scratch[0]!;
  const k2 = scratch[1]!;
  const k3 = scratch[2]!;
  const k4 = scratch[3]!;
  const tmp = scratch[4]!;
  rhs(state, k1);
  addScaled(tmp, state, 0.5 * dt, k1, n);
  rhs(tmp, k2);
  addScaled(tmp, state, 0.5 * dt, k2, n);
  rhs(tmp, k3);
  addScaled(tmp, state, dt, k3, n);
  rhs(tmp, k4);
  for (let i = 0; i < n; i += 1) {
    out[i] = Number(state[i] ?? 0) + (dt / 6) * (Number(k1[i] ?? 0) + 2 * Number(k2[i] ?? 0) + 2 * Number(k3[i] ?? 0) + Number(k4[i] ?? 0));
  }
  return out;
}

export function implicitMidpointStep(state: StateVector, dt: number, rhs: Derivative, out: StateVector, options: StepOptions = {}): StateVector {
  if (options.jacobian) {
    const newtonOptions: { tolerance?: number; maxIterations: number } = { maxIterations: 25 };
    if (options.tolerance !== undefined) newtonOptions.tolerance = options.tolerance;
    const report = implicitMidpointNewton(state, dt, rhs, options.jacobian, newtonOptions);
    out.set(report.state);
    if (options.previousError) options.previousError.value = report.residualNorm;
    if (options.diagnostics) {
      options.diagnostics.solver = 'newton';
      options.diagnostics.iterations = report.iterations;
      options.diagnostics.residualNorm = report.residualNorm;
      options.diagnostics.conditionEstimate = report.conditionEstimate;
      options.diagnostics.converged = report.converged;
      if (report.failureReason) options.diagnostics.failureReason = report.failureReason;
      else delete options.diagnostics.failureReason;
    }
    return out;
  }
  const n = state.length;
  const scratch = ensureScratch(n);
  const k = scratch[0]!;
  const mid = scratch[1]!;
  const trial = scratch[2]!;
  trial.set(state);
  const tolerance = options.tolerance ?? 1e-10;
  let residual = Infinity;
  let iterations = 0;
  let converged = false;
  let failureReason: string | undefined;
  for (let iter = 0; iter < 10; iter += 1) {
    iterations = iter + 1;
    for (let i = 0; i < n; i += 1) mid[i] = 0.5 * (Number(state[i] ?? 0) + Number(trial[i] ?? 0));
    rhs(mid, k);
    residual = 0;
    for (let i = 0; i < n; i += 1) {
      const next = Number(state[i] ?? 0) + dt * Number(k[i] ?? 0);
      residual = Math.max(residual, Math.abs(next - Number(trial[i] ?? 0)));
      trial[i] = next;
    }
    if (!Number.isFinite(residual)) {
      failureReason = 'non-finite-input';
      break;
    }
    if (residual < tolerance) {
      converged = true;
      break;
    }
  }
  if (!converged && !failureReason) failureReason = 'max-iterations';
  out.set(trial);
  if (options.previousError) options.previousError.value = residual;
  if (options.diagnostics) {
    options.diagnostics.solver = 'fixed-point';
    options.diagnostics.iterations = iterations;
    options.diagnostics.residualNorm = residual;
    options.diagnostics.converged = converged;
    if (failureReason) options.diagnostics.failureReason = failureReason;
    else delete options.diagnostics.failureReason;
    delete options.diagnostics.conditionEstimate;
  }
  return out;
}

/**
 * Semi-implicit (symplectic) Euler for second-order systems split as
 * y = [q, v]. Updates v first using a(q, v) then advances q with the new v.
 * First order, but preserves phase-space structure far better than explicit
 * Euler. Falls back to explicit Euler when the state is not splittable.
 */
export function symplecticEulerStep(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  const n = state.length;
  if (!isSplittable(n)) return eulerStep(state, dt, rhs, out);
  const half = n / 2;
  const scratch = ensureScratch(n);
  const ss = scratch[0]!;
  const sd = scratch[1]!;
  const acc = scratch[2]!;
  const q = state.subarray(0, half);
  const v = state.subarray(half, n);
  evalAcceleration(rhs, q, v, half, ss, sd, acc);
  for (let i = 0; i < half; i += 1) {
    const vNew = Number(v[i] ?? 0) + dt * Number(acc[i] ?? 0);
    out[half + i] = vNew;
    out[i] = Number(q[i] ?? 0) + dt * vNew;
  }
  return out;
}

/**
 * Velocity-Verlet ("leapfrog") kick-drift-kick for y = [q, v]. Second order.
 * Strictly symplectic only when a depends on q alone; for the velocity-coupled
 * pendulum it is a separable approximation (see registry stability notes).
 */
export function leapfrogStep(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  const n = state.length;
  if (!isSplittable(n)) return rk2Step(state, dt, rhs, out);
  const half = n / 2;
  const scratch = ensureScratch(n);
  const ss = scratch[0]!;
  const sd = scratch[1]!;
  const acc = scratch[2]!;
  const qHalf = scratch[3]!;
  const vHalf = scratch[4]!;
  const q = state.subarray(0, half);
  const v = state.subarray(half, n);
  evalAcceleration(rhs, q, v, half, ss, sd, acc);
  for (let i = 0; i < half; i += 1) {
    vHalf[i] = Number(v[i] ?? 0) + 0.5 * dt * Number(acc[i] ?? 0);
    qHalf[i] = Number(q[i] ?? 0) + dt * Number(vHalf[i] ?? 0);
  }
  evalAcceleration(rhs, qHalf, vHalf, half, ss, sd, acc);
  for (let i = 0; i < half; i += 1) {
    out[i] = Number(qHalf[i] ?? 0);
    out[half + i] = Number(vHalf[i] ?? 0) + 0.5 * dt * Number(acc[i] ?? 0);
  }
  return out;
}

// Yoshida's fourth-order symmetric composition coefficients.
const YOSHIDA_W1 = 1 / (2 - Math.cbrt(2));
const YOSHIDA_W0 = -Math.cbrt(2) * YOSHIDA_W1;

/**
 * Fourth-order symplectic integrator built from a triple Yoshida composition
 * of the leapfrog step. Order 4 by construction; symplectic claims inherit the
 * leapfrog separability caveat.
 */
export function yoshida4Step(state: StateVector, dt: number, rhs: Derivative, out: StateVector): StateVector {
  const n = state.length;
  if (!isSplittable(n)) return rk4Step(state, dt, rhs, out);
  const a = new Float64Array(state);
  const b = new Float64Array(n);
  leapfrogStep(a, YOSHIDA_W1 * dt, rhs, b);
  leapfrogStep(b, YOSHIDA_W0 * dt, rhs, a);
  leapfrogStep(a, YOSHIDA_W1 * dt, rhs, out);
  return out;
}

// Runge-Kutta-Fehlberg 4(5) Butcher tableau.
const RKF_A: readonly (readonly number[])[] = [
  [],
  [1 / 4],
  [3 / 32, 9 / 32],
  [1932 / 2197, -7200 / 2197, 7296 / 2197],
  [439 / 216, -8, 3680 / 513, -845 / 4104],
  [-8 / 27, 2, -3544 / 2565, 1859 / 4104, -11 / 40]
];
// Fifth-order solution weights (used to advance) and the 4th-order weights.
const RKF_B5 = [16 / 135, 0, 6656 / 12825, 28561 / 56430, -9 / 50, 2 / 55];
const RKF_B4 = [25 / 216, 0, 1408 / 2565, 2197 / 4104, -1 / 5, 0];

/**
 * One embedded Runge-Kutta-Fehlberg step. Advances with the 5th-order solution
 * and reports the infinity-norm difference against the embedded 4th-order
 * solution through `options.previousError` for adaptive step-size control.
 */
export function rkf45Step(state: StateVector, dt: number, rhs: Derivative, out: StateVector, options: StepOptions = {}): StateVector {
  const n = state.length;
  const k: StateVector[] = Array.from({ length: 6 }, () => new Float64Array(n));
  const tmp = new Float64Array(n);
  for (let s = 0; s < 6; s += 1) {
    if (s === 0) {
      rhs(state, k[0]!);
      continue;
    }
    const a = RKF_A[s]!;
    for (let i = 0; i < n; i += 1) {
      let acc = 0;
      for (let j = 0; j < a.length; j += 1) acc += a[j]! * Number(k[j]![i] ?? 0);
      tmp[i] = Number(state[i] ?? 0) + dt * acc;
    }
    rhs(tmp, k[s]!);
  }
  let error = 0;
  for (let i = 0; i < n; i += 1) {
    let sum5 = 0;
    let sum4 = 0;
    for (let s = 0; s < 6; s += 1) {
      const ki = Number(k[s]![i] ?? 0);
      sum5 += RKF_B5[s]! * ki;
      sum4 += RKF_B4[s]! * ki;
    }
    out[i] = Number(state[i] ?? 0) + dt * sum5;
    error = Math.max(error, Math.abs(dt * (sum5 - sum4)));
  }
  if (options.previousError) options.previousError.value = error;
  return out;
}

// Dormand-Prince DOP853 8(5,3) coefficients. The tableau matches the Hairer,
// Norsett & Wanner DOP853 scheme used by SciPy solve_ivp; this in-repo stepper
// advances with the 8th-order solution and reports the embedded 5th-order
// infinity-norm difference through previousError.
const DOP853_C = [
  0,
  0.05260015195876773,
  0.0789002279381516,
  0.1183503419072274,
  0.2816496580927726,
  1 / 3,
  0.25,
  0.3076923076923077,
  0.6512820512820513,
  0.6,
  0.8571428571428571,
  1
] as const;

const DOP853_A: readonly (readonly number[])[] = [
  [],
  [0.05260015195876773],
  [0.0197250569845379, 0.0591751709536137],
  [0.02958758547680685, 0, 0.08876275643042054],
  [0.2413651341592667, 0, -0.8845494793282861, 0.924834003261792],
  [0.037037037037037035, 0, 0, 0.17082860872947386, 0.12546768756682242],
  [0.037109375, 0, 0, 0.17025221101954405, 0.06021653898045596, -0.017578125],
  [0.03709200011850479, 0, 0, 0.17038392571223998, 0.10726203044637328, -0.015319437748624402, 0.008273789163814023],
  [0.6241109587160757, 0, 0, -3.3608926294469414, -0.868219346841726, 27.59209969944671, 20.154067550477894, -43.48988418106996],
  [0.47766253643826434, 0, 0, -2.4881146199716677, -0.590290826836843, 21.230051448181193, 15.279233632882423, -33.28821096898486, -0.020331201708508627],
  [-0.9371424300859873, 0, 0, 5.186372428844064, 1.0914373489967295, -8.149787010746927, -18.52006565999696, 22.739487099350505, 2.4936055526796523, -3.0467644718982196],
  [2.273310147516538, 0, 0, -10.53449546673725, -2.0008720582248625, -17.9589318631188, 27.94888452941996, -2.8589982771350235, -8.87285693353063, 12.360567175794303, 0.6433927460157636]
];

const DOP853_B = [
  0.054293734116568765,
  0,
  0,
  0,
  0,
  4.450312892752409,
  1.8915178993145003,
  -5.801203960010585,
  0.3111643669578199,
  -0.1521609496625161,
  0.20136540080403034,
  0.04471061572777259
] as const;

const DOP853_E5 = [
  0.01312004499419488,
  0,
  0,
  0,
  0,
  -1.2251564463762044,
  -0.4957589496572502,
  1.6643771824549864,
  -0.35032884874997366,
  0.3341791187130175,
  0.08192320648511571,
  -0.022355307863886294,
  0
] as const;

void DOP853_C;

export function dop853Step(state: StateVector, dt: number, rhs: Derivative, out: StateVector, options: StepOptions = {}): StateVector {
  const n = state.length;
  const k: StateVector[] = Array.from({ length: 13 }, () => new Float64Array(n));
  const tmp = new Float64Array(n);
  for (let s = 0; s < 12; s += 1) {
    if (s === 0) {
      rhs(state, k[0]!);
      continue;
    }
    const a = DOP853_A[s]!;
    for (let i = 0; i < n; i += 1) {
      let acc = 0;
      for (let j = 0; j < a.length; j += 1) acc += a[j]! * Number(k[j]![i] ?? 0);
      tmp[i] = Number(state[i] ?? 0) + dt * acc;
    }
    rhs(tmp, k[s]!);
  }
  for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let s = 0; s < 12; s += 1) sum += DOP853_B[s]! * Number(k[s]![i] ?? 0);
    out[i] = Number(state[i] ?? 0) + dt * sum;
  }
  rhs(out, k[12]!);
  if (options.previousError) {
    let error = 0;
    for (let i = 0; i < n; i += 1) {
      let e5 = 0;
      for (let s = 0; s < 13; s += 1) e5 += DOP853_E5[s]! * Number(k[s]![i] ?? 0);
      error = Math.max(error, Math.abs(dt * e5));
    }
    options.previousError.value = error;
  }
  return out;
}

/**
 * Generic s-stage Gauss-Legendre implicit Runge-Kutta step solved by fixed-point
 * iteration on the stage derivatives. The 2-stage tableau is order 4, the
 * 3-stage tableau order 6; both are symplectic and A-stable for canonical
 * systems. `options.previousError` receives the final fixed-point residual.
 */
function gaussLegendreStep(
  a: readonly (readonly number[])[],
  b: readonly number[],
  state: StateVector,
  dt: number,
  rhs: Derivative,
  out: StateVector,
  options: StepOptions
): StateVector {
  const n = state.length;
  const s = b.length;
  const tolerance = options.tolerance ?? 1e-12;
  const k: StateVector[] = Array.from({ length: s }, () => new Float64Array(n));
  const stage = new Float64Array(n);
  // Seed each stage derivative with f(state) so iteration starts sensibly.
  rhs(state, stage);
  for (let i = 0; i < s; i += 1) k[i]!.set(stage);
  let residual = Infinity;
  for (let iter = 0; iter < 50 && residual > tolerance; iter += 1) {
    residual = 0;
    for (let i = 0; i < s; i += 1) {
      for (let m = 0; m < n; m += 1) {
        let acc = 0;
        for (let j = 0; j < s; j += 1) acc += a[i]![j]! * Number(k[j]![m] ?? 0);
        stage[m] = Number(state[m] ?? 0) + dt * acc;
      }
      const knew = new Float64Array(n);
      rhs(stage, knew);
      for (let m = 0; m < n; m += 1) {
        residual = Math.max(residual, Math.abs(knew[m]! - Number(k[i]![m] ?? 0)));
      }
      k[i]!.set(knew);
    }
  }
  for (let m = 0; m < n; m += 1) {
    let acc = 0;
    for (let i = 0; i < s; i += 1) acc += b[i]! * Number(k[i]![m] ?? 0);
    out[m] = Number(state[m] ?? 0) + dt * acc;
  }
  if (options.previousError) options.previousError.value = residual;
  return out;
}

const SQRT3 = Math.sqrt(3);
const GL4_A: readonly (readonly number[])[] = [
  [1 / 4, 1 / 4 - SQRT3 / 6],
  [1 / 4 + SQRT3 / 6, 1 / 4]
];
const GL4_B = [1 / 2, 1 / 2];

const SQRT15 = Math.sqrt(15);
const GL6_A: readonly (readonly number[])[] = [
  [5 / 36, 2 / 9 - SQRT15 / 15, 5 / 36 - SQRT15 / 30],
  [5 / 36 + SQRT15 / 24, 2 / 9, 5 / 36 - SQRT15 / 24],
  [5 / 36 + SQRT15 / 30, 2 / 9 + SQRT15 / 15, 5 / 36]
];
const GL6_B = [5 / 18, 4 / 9, 5 / 18];

export function gaussLegendre4Step(state: StateVector, dt: number, rhs: Derivative, out: StateVector, options: StepOptions = {}): StateVector {
  return gaussLegendreStep(GL4_A, GL4_B, state, dt, rhs, out, options);
}

export function gaussLegendre6Step(state: StateVector, dt: number, rhs: Derivative, out: StateVector, options: StepOptions = {}): StateVector {
  return gaussLegendreStep(GL6_A, GL6_B, state, dt, rhs, out, options);
}

export function step(method: IntegratorId, state: StateVector, dt: number, rhs: Derivative, out: StateVector, options: StepOptions = {}): StateVector {
  switch (method) {
    case 'euler':
      return eulerStep(state, dt, rhs, out);
    case 'rk2':
      return rk2Step(state, dt, rhs, out);
    case 'hmidpoint':
      return implicitMidpointStep(state, dt, rhs, out, options);
    case 'gauss2':
      return gaussLegendre4Step(state, dt, rhs, out, options);
    case 'symplectic':
      return symplecticEulerStep(state, dt, rhs, out);
    case 'verlet':
      return leapfrogStep(state, dt, rhs, out);
    case 'leapfrog':
      return leapfrogStep(state, dt, rhs, out);
    case 'yoshida4':
      return yoshida4Step(state, dt, rhs, out);
    case 'rkf45':
      return rkf45Step(state, dt, rhs, out, options);
    case 'dopri5': {
      const result = dormandPrince54Step(state, dt, rhs);
      out.set(result.y);
      if (options.previousError) options.previousError.value = result.error;
      return out;
    }
    case 'dop853':
      return dop853Step(state, dt, rhs, out, options);
    case 'gbs': {
      const result = bulirschStoerStep(state, dt, rhs);
      out.set(result.y);
      if (options.previousError) options.previousError.value = result.error;
      return out;
    }
    case 'bdf2':
      return trBdf2Step(state, dt, rhs, out, options);
    case 'rk4':
    default:
      return rk4Step(state, dt, rhs, out);
  }
}
