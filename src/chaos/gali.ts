import type { Derivative, Jacobian, StateVector } from '../physics/types';
import { rk4Step } from '../physics/integrators';
import { gramSchmidt, makeVariationalRhs, seedTangentFrame } from './variational';

/**
 * GALI_k — the Generalized Alignment Index (Skokos, Bountis & Antonopoulos
 * 2007), the k-vector generalisation of the SALI already shipped in
 * `indicators.ts`. It tracks the volume of the parallelepiped spanned by k
 * unit deviation vectors evolved under the variational flow:
 *
 * - chaotic orbit: all vectors align with the maximal-expansion direction and
 *   GALI_k → 0 exponentially, rate ~ Σ_{i=2..k} (λ1 − λi);
 * - regular orbit on an N-dimensional torus: GALI_k stays bounded away from
 *   zero for k ≤ N and decays only algebraically for k > N.
 *
 * The k > 2 indices are what SALI cannot see: they distinguish motion on
 * lower-dimensional tori and separate single-exponent chaos from hyperchaos
 * (λ2 > 0), because each extra positive gap λ1 − λi steepens the decay.
 * GALI_2 coincides with SALI up to a bounded factor (‖w1 ∧ w2‖ = sin∠(w1, w2)
 * versus min(‖w1+w2‖, ‖w1−w2‖)), which the tests pin.
 *
 * Design notes (adopted from the DynamicalSystems.jl `gali` implementation,
 * re-expressed on this project's variational machinery): the volume is the
 * product of the modified-Gram-Schmidt column norms of the k *unit* deviation
 * vectors — exactly the R-diagonal of a thin QR, i.e. √det(GramMatrix) — so no
 * SVD dependency is needed and the per-sample cost is O(k²n). Vectors are
 * renormalised every step (like SALI/FLI) so nothing overflows; the volume is
 * measured on copies because Gram-Schmidt mutates in place.
 */

export interface GaliSettings {
  dt: number;
  steps: number;
  transientSteps: number;
  seed: number;
  sampleEvery: number;
  /** Stop early once GALI_k falls below this floor (chaotic verdict). */
  threshold: number;
}

export interface GaliResult {
  /** GALI_k at the final evaluated step (before any early stop). */
  finalGali: number;
  /** Number of deviation vectors k. */
  k: number;
  series: { time: number; gali: number }[];
  /** True when the run stopped early because GALI_k fell below `threshold`. */
  collapsed: boolean;
  settings: GaliSettings;
}

const DEFAULTS: GaliSettings = {
  dt: 0.01,
  steps: 10_000,
  transientSteps: 1_000,
  seed: 0x9a11,
  sampleEvery: 50,
  threshold: 1e-12
};

function resolve(partial: Partial<GaliSettings>): GaliSettings {
  return {
    dt: partial.dt ?? DEFAULTS.dt,
    steps: partial.steps ?? DEFAULTS.steps,
    transientSteps: partial.transientSteps ?? DEFAULTS.transientSteps,
    seed: partial.seed ?? DEFAULTS.seed,
    sampleEvery: partial.sampleEvery ?? DEFAULTS.sampleEvery,
    threshold: partial.threshold ?? DEFAULTS.threshold
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

function normalizeInPlace(v: StateVector, n: number): void {
  let norm = 0;
  for (let r = 0; r < n; r += 1) norm += Number(v[r] ?? 0) ** 2;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    const inv = 1 / norm;
    for (let r = 0; r < n; r += 1) v[r] = Number(v[r] ?? 0) * inv;
  }
}

/**
 * Volume of the parallelepiped spanned by the k unit vectors: the product of
 * modified-Gram-Schmidt norms (√det of the Gram matrix). Operates on the
 * caller-provided copy buffers because Gram-Schmidt mutates its input.
 */
function wedgeVolume(unitVectors: readonly StateVector[], copies: StateVector[], n: number): number {
  for (let j = 0; j < unitVectors.length; j += 1) copies[j]!.set(unitVectors[j]!);
  const norms = gramSchmidt(copies, n);
  let volume = 1;
  for (const norm of norms) volume *= norm;
  return volume;
}

export function galiIndicator(
  state0: ArrayLike<number>,
  rhs: Derivative,
  k: number,
  options: Partial<GaliSettings> = {},
  jacobian?: Jacobian
): GaliResult {
  const n = state0.length;
  if (!Number.isInteger(k) || k < 2 || k > n) {
    throw new Error(`galiIndicator: k must be an integer in [2, ${n}], got ${k}`);
  }
  const settings = resolve(options);
  const varRhs = makeVariationalRhs(rhs, n, k, jacobian);
  const aug = new Float64Array(n * (k + 1));
  aug.set(runTransient(state0, rhs, n, settings.transientSteps, settings.dt), 0);
  seedTangentFrame(aug, n, k, settings.seed);

  const augOut = new Float64Array(aug.length);
  const vectors: StateVector[] = Array.from({ length: k }, (_, j) => aug.subarray(n + j * n, n + (j + 1) * n));
  const copies: StateVector[] = Array.from({ length: k }, () => new Float64Array(n));
  const series: { time: number; gali: number }[] = [];
  let gali = 1;
  let collapsed = false;

  for (let i = 0; i < settings.steps; i += 1) {
    rk4Step(aug, settings.dt, varRhs, augOut);
    aug.set(augOut);
    for (let j = 0; j < k; j += 1) normalizeInPlace(vectors[j]!, n);
    gali = wedgeVolume(vectors, copies, n);
    if (i % settings.sampleEvery === 0) series.push({ time: i * settings.dt, gali });
    if (gali < settings.threshold) {
      collapsed = true;
      break;
    }
  }
  return { finalGali: gali, k, series, collapsed, settings };
}
