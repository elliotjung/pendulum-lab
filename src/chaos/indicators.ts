import type { Derivative, Jacobian, StateVector } from '../physics/types';
import { rk4Step } from '../physics/integrators';
import { makeVariationalRhs, seedTangentFrame } from './variational';

/**
 * Fast chaos indicators that distinguish ordered from chaotic motion far more
 * cheaply than a converged Lyapunov exponent.
 *
 * SALI (Smaller Alignment Index) tracks two deviation vectors: for chaos they
 * align with the maximal expansion direction and SALI decays exponentially to
 * zero; for regular motion it stays bounded away from zero.
 *
 * FLI (Fast Lyapunov Indicator) tracks the logarithmic growth of a single
 * deviation vector: it grows linearly in time for chaos and only ~log(t) for
 * regular motion.
 */

export interface IndicatorSettings {
  dt: number;
  steps: number;
  transientSteps: number;
  seed: number;
  sampleEvery: number;
}

export interface SaliResult {
  finalSali: number;
  series: { time: number; sali: number }[];
  settings: IndicatorSettings;
}

export interface FliResult {
  /** sup over time of log||w(t)|| (the standard FLI definition). */
  fli: number;
  series: { time: number; fli: number }[];
  settings: IndicatorSettings;
}

const DEFAULTS: IndicatorSettings = {
  dt: 0.01,
  steps: 10_000,
  transientSteps: 1_000,
  seed: 0x51ed,
  sampleEvery: 50
};

function resolve(partial: Partial<IndicatorSettings>): IndicatorSettings {
  return {
    dt: partial.dt ?? DEFAULTS.dt,
    steps: partial.steps ?? DEFAULTS.steps,
    transientSteps: partial.transientSteps ?? DEFAULTS.transientSteps,
    seed: partial.seed ?? DEFAULTS.seed,
    sampleEvery: partial.sampleEvery ?? DEFAULTS.sampleEvery
  };
}

function runTransient(state0: ArrayLike<number>, rhs: Derivative, n: number, steps: number, dt: number): Float64Array {
  const refState = new Float64Array(n);
  for (let i = 0; i < n; i += 1) refState[i] = Number(state0[i] ?? 0);
  const refOut = new Float64Array(n);
  for (let i = 0; i < steps; i += 1) {
    rk4Step(refState, dt, rhs, refOut);
    refState.set(refOut);
  }
  return refState;
}

function normalize(v: StateVector, n: number): number {
  let norm = 0;
  for (let r = 0; r < n; r += 1) norm += Number(v[r] ?? 0) ** 2;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    const inv = 1 / norm;
    for (let r = 0; r < n; r += 1) v[r] = Number(v[r] ?? 0) * inv;
  }
  return norm;
}

export function saliIndicator(
  state0: ArrayLike<number>,
  rhs: Derivative,
  options: Partial<IndicatorSettings> = {},
  jacobian?: Jacobian
): SaliResult {
  const settings = resolve(options);
  const n = state0.length;
  const varRhs = makeVariationalRhs(rhs, n, 2, jacobian);
  const aug = new Float64Array(n * 3);
  aug.set(runTransient(state0, rhs, n, settings.transientSteps, settings.dt), 0);
  seedTangentFrame(aug, n, 2, settings.seed);

  const augOut = new Float64Array(aug.length);
  const w1 = aug.subarray(n, 2 * n);
  const w2 = aug.subarray(2 * n, 3 * n);
  const series: { time: number; sali: number }[] = [];
  let sali = Math.SQRT2;

  for (let i = 0; i < settings.steps; i += 1) {
    rk4Step(aug, settings.dt, varRhs, augOut);
    aug.set(augOut);
    normalize(w1, n);
    normalize(w2, n);
    let plus = 0;
    let minus = 0;
    for (let r = 0; r < n; r += 1) {
      plus += (Number(w1[r] ?? 0) + Number(w2[r] ?? 0)) ** 2;
      minus += (Number(w1[r] ?? 0) - Number(w2[r] ?? 0)) ** 2;
    }
    sali = Math.min(Math.sqrt(plus), Math.sqrt(minus));
    if (i % settings.sampleEvery === 0) series.push({ time: i * settings.dt, sali });
  }
  return { finalSali: sali, series, settings };
}

export function fliIndicator(
  state0: ArrayLike<number>,
  rhs: Derivative,
  options: Partial<IndicatorSettings> = {},
  jacobian?: Jacobian
): FliResult {
  const settings = resolve(options);
  const n = state0.length;
  const varRhs = makeVariationalRhs(rhs, n, 1, jacobian);
  const aug = new Float64Array(n * 2);
  aug.set(runTransient(state0, rhs, n, settings.transientSteps, settings.dt), 0);
  seedTangentFrame(aug, n, 1, settings.seed);

  const augOut = new Float64Array(aug.length);
  const w = aug.subarray(n, 2 * n);
  const series: { time: number; fli: number }[] = [];
  let logSum = 0;
  let fli = 0;

  for (let i = 0; i < settings.steps; i += 1) {
    rk4Step(aug, settings.dt, varRhs, augOut);
    aug.set(augOut);
    // Renormalize every step but accumulate the log so ||w|| never overflows.
    const growth = normalize(w, n);
    if (growth > 0) logSum += Math.log(growth);
    if (logSum > fli) fli = logSum;
    if (i % settings.sampleEvery === 0) series.push({ time: i * settings.dt, fli });
  }
  return { fli, series, settings };
}
