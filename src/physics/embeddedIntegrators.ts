import { acquireIntegratorScratch, releaseIntegratorScratch } from './integratorScratch';
import type { Derivative, StateVector, StepOptions } from './types';

function validateEmbeddedFixedStepInput(
  state: StateVector,
  dt: number,
  rhs: Derivative,
  out: StateVector,
  options: StepOptions,
  operation: string
): number {
  const n = state.length;
  if (!Number.isSafeInteger(n) || n < 1 || out.length < n) {
    throw new RangeError(`${operation}: state/output dimensions must match a positive state dimension.`);
  }
  if (!Number.isFinite(dt)) throw new RangeError(`${operation}: dt must be finite.`);
  if (typeof rhs !== 'function') throw new TypeError(`${operation}: rhs must be a function.`);
  for (let i = 0; i < n; i += 1) {
    if (!Number.isFinite(state[i])) throw new RangeError(`${operation}: state[${i}] must be finite.`);
  }
  if (options.errorComponents && options.errorComponents.length < n) {
    throw new RangeError(`${operation}: errorComponents must have at least state.length entries.`);
  }
  if (
    options.previousError !== undefined &&
    (typeof options.previousError !== 'object' ||
      options.previousError === null ||
      !Object.hasOwn(options.previousError, 'value'))
  ) {
    throw new TypeError(`${operation}: previousError must be an object with a value field when supplied.`);
  }
  return n;
}

/** See the fixed-step identity-map contract in `integrators.ts`. */
function completeZeroStep(state: StateVector, out: StateVector, options: StepOptions): StateVector {
  out.set(state);
  if (options.previousError) options.previousError.value = 0;
  if (options.errorComponents) options.errorComponents.fill(0, 0, state.length);
  if (options.diagnostics) {
    options.diagnostics.solver = 'explicit';
    options.diagnostics.iterations = 0;
    options.diagnostics.residualNorm = 0;
    options.diagnostics.converged = true;
    options.diagnostics.accepted = true;
    options.diagnostics.retryable = false;
    delete options.diagnostics.failureReason;
    delete options.diagnostics.errorCode;
    delete options.diagnostics.suggestedDt;
    delete options.diagnostics.conditionEstimate;
  }
  return out;
}

const RKF_A: readonly (readonly number[])[] = [
  [],
  [1 / 4],
  [3 / 32, 9 / 32],
  [1932 / 2197, -7200 / 2197, 7296 / 2197],
  [439 / 216, -8, 3680 / 513, -845 / 4104],
  [-8 / 27, 2, -3544 / 2565, 1859 / 4104, -11 / 40]
];
const RKF_B5 = [16 / 135, 0, 6656 / 12825, 28561 / 56430, -9 / 50, 2 / 55];
const RKF_B4 = [25 / 216, 0, 1408 / 2565, 2197 / 4104, -1 / 5, 0];

/** Embedded Runge-Kutta-Fehlberg 5(4) fixed macro-step. */
export function rkf45Step(
  state: StateVector,
  dt: number,
  rhs: Derivative,
  out: StateVector,
  options: StepOptions = {}
): StateVector {
  const n = validateEmbeddedFixedStepInput(state, dt, rhs, out, options, 'rkf45Step');
  if (dt === 0) return completeZeroStep(state, out, options);
  const stages = acquireIntegratorScratch(n, 7);
  const tmp = stages[6]!;
  try {
    for (let s = 0; s < 6; s += 1) {
      if (s === 0) {
        rhs(state, stages[0]!);
        continue;
      }
      const a = RKF_A[s]!;
      for (let i = 0; i < n; i += 1) {
        let acc = 0;
        for (let j = 0; j < a.length; j += 1) acc += a[j]! * Number(stages[j]![i] ?? 0);
        tmp[i] = Number(state[i] ?? 0) + dt * acc;
      }
      rhs(tmp, stages[s]!);
    }
    let error = 0;
    for (let i = 0; i < n; i += 1) {
      let sum5 = 0;
      let sum4 = 0;
      for (let s = 0; s < 6; s += 1) {
        const stage = Number(stages[s]![i] ?? 0);
        sum5 += RKF_B5[s]! * stage;
        sum4 += RKF_B4[s]! * stage;
      }
      out[i] = Number(state[i] ?? 0) + dt * sum5;
      const componentError = Math.abs(dt * (sum5 - sum4));
      if (options.errorComponents && i < options.errorComponents.length) options.errorComponents[i] = componentError;
      error = Math.max(error, componentError);
    }
    if (options.previousError) options.previousError.value = error;
    return out;
  } finally {
    releaseIntegratorScratch(stages);
  }
}

const DOP853_A: readonly (readonly number[])[] = [
  [],
  [0.05260015195876773],
  [0.0197250569845379, 0.0591751709536137],
  [0.02958758547680685, 0, 0.08876275643042054],
  [0.2413651341592667, 0, -0.8845494793282861, 0.924834003261792],
  [0.037037037037037035, 0, 0, 0.17082860872947386, 0.12546768756682242],
  [0.037109375, 0, 0, 0.17025221101954405, 0.06021653898045596, -0.017578125],
  [0.03709200011850479, 0, 0, 0.17038392571223998, 0.10726203044637328, -0.015319437748624402, 0.008273789163814023],
  [
    0.6241109587160757, 0, 0, -3.3608926294469414, -0.868219346841726, 27.59209969944671, 20.154067550477894,
    -43.48988418106996
  ],
  [
    0.47766253643826434, 0, 0, -2.4881146199716677, -0.590290826836843, 21.230051448181193, 15.279233632882423,
    -33.28821096898486, -0.020331201708508627
  ],
  [
    -0.9371424300859873, 0, 0, 5.186372428844064, 1.0914373489967295, -8.149787010746927, -18.52006565999696,
    22.739487099350505, 2.4936055526796523, -3.0467644718982196
  ],
  [
    2.273310147516538, 0, 0, -10.53449546673725, -2.0008720582248625, -17.9589318631188, 27.94888452941996,
    -2.8589982771350235, -8.87285693353063, 12.360567175794303, 0.6433927460157636
  ]
];

const DOP853_B = [
  0.054293734116568765, 0, 0, 0, 0, 4.450312892752409, 1.8915178993145003, -5.801203960010585, 0.3111643669578199,
  -0.1521609496625161, 0.20136540080403034, 0.04471061572777259
] as const;

const DOP853_E5 = [
  0.01312004499419488, 0, 0, 0, 0, -1.2251564463762044, -0.4957589496572502, 1.6643771824549864, -0.35032884874997366,
  0.3341791187130175, 0.08192320648511571, -0.022355307863886294, 0
] as const;

const DOP853_E3 = [
  -0.18980075407240762, 0, 0, 0, 0, 4.450312892752409, 1.8915178993145003, -5.801203960010585, -0.4226823213237919,
  -0.1521609496625161, 0.20136540080403034, 0.022651792198360825, 0
] as const;

/** DOP853 8(5,3) step with Hairer's combined E5/E3 estimator. */
export function dop853Step(
  state: StateVector,
  dt: number,
  rhs: Derivative,
  out: StateVector,
  options: StepOptions = {}
): StateVector {
  const n = validateEmbeddedFixedStepInput(state, dt, rhs, out, options, 'dop853Step');
  if (dt === 0) return completeZeroStep(state, out, options);
  const stages = acquireIntegratorScratch(n, 14);
  const tmp = stages[13]!;
  try {
    for (let s = 0; s < 12; s += 1) {
      if (s === 0) {
        rhs(state, stages[0]!);
        continue;
      }
      const a = DOP853_A[s]!;
      for (let i = 0; i < n; i += 1) {
        let acc = 0;
        for (let j = 0; j < a.length; j += 1) acc += a[j]! * Number(stages[j]![i] ?? 0);
        tmp[i] = Number(state[i] ?? 0) + dt * acc;
      }
      rhs(tmp, stages[s]!);
    }
    for (let i = 0; i < n; i += 1) {
      let sum = 0;
      for (let s = 0; s < 12; s += 1) sum += DOP853_B[s]! * Number(stages[s]![i] ?? 0);
      out[i] = Number(state[i] ?? 0) + dt * sum;
    }
    rhs(out, stages[12]!);
    if (options.previousError || options.errorComponents) {
      let error = 0;
      for (let i = 0; i < n; i += 1) {
        let e5 = 0;
        let e3 = 0;
        for (let s = 0; s < 13; s += 1) {
          const stage = Number(stages[s]![i] ?? 0);
          e5 += DOP853_E5[s]! * stage;
          e3 += DOP853_E3[s]! * stage;
        }
        const denominator = Math.hypot(e5, 0.1 * e3);
        const componentError = denominator > 0 ? Math.abs(dt) * ((e5 * e5) / denominator) : 0;
        if (options.errorComponents && i < options.errorComponents.length) options.errorComponents[i] = componentError;
        error = Math.max(error, componentError);
      }
      if (options.previousError) options.previousError.value = error;
    }
    return out;
  } finally {
    releaseIntegratorScratch(stages);
  }
}
