import { rk4Step } from './integrators';
import { gramSchmidt, makeVariationalRhs, seedTangentFrame } from './variational';
import { createChainJacobianWorkspace, jacobianChain, jacobianDriven } from './jacobians';
import { analyzeSpectrumConsistency } from './spectrumConsistency';
import { chainLength } from './nPendulum';
import type { Jacobian, StateVector } from './types';
import { chainParams, createExpansionSystem, drivenParams, expansionModelDefinition, finiteParam, numberAt } from './expandedModels-factory';
import type { ExpansionLyapunovProfile, ExpansionLyapunovTimelinePoint, ExpansionModelId, ExpansionParameterMap, ExpansionSuiteConfig } from './expandedModels-types';

function cloneState(state: ArrayLike<number>): Float64Array {
  return Float64Array.from(Array.from({ length: state.length }, (_, i) => numberAt(state, i)));
}

function rounded(value: number, digits = 6): number {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : value;
}

/** Kaplan–Yorke (Lyapunov) dimension from a spectrum (descending or not). */
function kaplanYorke(spectrumInput: readonly number[]): number {
  const spectrum = [...spectrumInput].sort((a, b) => b - a);
  let partial = 0;
  let j = 0;
  for (; j < spectrum.length; j += 1) {
    const next = partial + (spectrum[j] ?? 0);
    if (next < 0) break;
    partial = next;
  }
  if (j === 0) return 0;
  if (j >= spectrum.length) return spectrum.length;
  const nextExp = spectrum[j] ?? 0;
  return nextExp === 0 ? j : j + partial / Math.abs(nextExp);
}

const LYAPUNOV_SEED = 0x5eed_1357;

/**
 * Batched-means ("non-overlapping block bootstrap") standard error over the
 * converged tail of a per-interval local-exponent series. The per-interval
 * exponents are strongly autocorrelated, so the naive standard error is an
 * optimistic lower bound; splitting the converged tail into `numBlocks`
 * contiguous blocks and taking the standard error of the block means
 * decorrelates the estimate. Falls back to the naive tail SE when there are too
 * few samples to form blocks. Mirrors `batchedStandardError` (chaos/lyapunov).
 */
function blockStandardError(samples: readonly number[], numBlocks = 10): number {
  const start = Math.floor(samples.length / 2);
  const tail = samples.slice(start);
  const m = tail.length;
  const naive = (): number => {
    if (m < 2) return 0;
    let mean = 0;
    for (const value of tail) mean += value;
    mean /= m;
    let variance = 0;
    for (const value of tail) variance += (value - mean) ** 2;
    variance /= m - 1;
    return Math.sqrt(variance / m);
  };
  if (numBlocks < 2 || m < 2 * numBlocks) return naive();
  const blockLen = Math.floor(m / numBlocks);
  const means: number[] = [];
  for (let b = 0; b < numBlocks; b += 1) {
    let s = 0;
    for (let i = 0; i < blockLen; i += 1) s += tail[b * blockLen + i] ?? 0;
    means.push(s / blockLen);
  }
  let mean = 0;
  for (const value of means) mean += value;
  mean /= numBlocks;
  let variance = 0;
  for (const value of means) variance += (value - mean) ** 2;
  variance /= numBlocks - 1;
  return Math.sqrt(variance / numBlocks);
}

/**
 * Exact analytic Jacobian for the expansion models that have one — the driven
 * pendulum (closed form) and the planar N-link chain (autodiff) — built from
 * the same parameters as the exact RHS `createExpansionSystem` integrates.
 * Returns `undefined` for the models without a closed-form/autodiff Jacobian
 * (coupled, inverted, cart-pole, parametric, spherical), which keep the O(h²)
 * central-difference Jacobian.
 */
function exactJacobianFor(model: ExpansionModelId, parameters: ExpansionParameterMap): Jacobian | undefined {
  if (model === 'driven') {
    const params = drivenParams(parameters);
    return (state, jac) => {
      jacobianDriven(state, params, jac);
    };
  }
  if (model === 'chain') {
    const params = chainParams(parameters);
    const gamma = finiteParam(parameters, 'damping', 0);
    const workspace = createChainJacobianWorkspace(chainLength(params));
    return (state, jac) => {
      jacobianChain(state, params, gamma, jac, workspace);
    };
  }
  return undefined;
}

/**
 * The true Lyapunov profile of an expansion model: integrate the model together
 * with `count` deviation vectors under the variational equation v' = J(x)·v,
 * reorthonormalize with Gram-Schmidt at a fixed cadence, and accumulate the log
 * growth of each direction. This is the standard Benettin–Shimada–Nagashima /
 * Wolf QR algorithm, so every exponent is a genuine Lyapunov exponent — unlike
 * the ghost divergence, which saturates once the trajectories decorrelate and
 * can only ever probe the leading direction. The driven pendulum and the planar
 * chain use their exact analytic Jacobian; the other models use an O(h²)
 * central-difference Jacobian. A reliable fixed-step RK4 advances the tangent
 * flow regardless of which integrator the comparison table is exercising. Each
 * exponent carries a block-bootstrap standard error, and the whole spectrum is
 * checked for Hamiltonian self-consistency (Σλ ≈ 0, symplectic pairing).
 */
// ===== Section: Lyapunov Profiler (expansionLyapunovProfile) =================
// NOTE: the suite/matrix runners take this as an injected `lyapunovProfiler`
// option (default here) rather than hard-calling it, so the file split into
// factory/runners/lyapunov is now unblocked — see ROADMAP.md "Architecture".

export function expansionLyapunovProfile(
  config: ExpansionSuiteConfig,
  options: { maxTimelinePoints?: number; horizonCap?: number; forceNumericalJacobian?: boolean } = {}
): ExpansionLyapunovProfile {
  const definition = expansionModelDefinition(config.model);
  const system = createExpansionSystem(config.model, config.parameterOverrides ?? {}, config.initialState);
  const n = definition.dimension;
  const k = n;
  const dt = Math.max(1e-4, Math.min(config.dt ?? definition.defaultDt, 0.02));
  const horizon = Math.max(4, Math.min(config.horizon ?? definition.defaultHorizon, options.horizonCap ?? 24));
  const steps = Math.max(200, Math.min(60_000, Math.round(horizon / dt)));
  const renormEvery = Math.max(1, Math.round(0.05 / dt));
  const transientSteps = Math.min(steps >> 1, Math.max(0, Math.round(steps * 0.1)));
  const jacobian = options.forceNumericalJacobian ? undefined : exactJacobianFor(definition.id, system.parameters);
  const varRhs = makeVariationalRhs(system.rhs, n, k, jacobian);

  // Burn the transient on the reference alone before attaching the tangent frame.
  const refState = cloneState(system.initialState);
  const refOut = new Float64Array(n);
  for (let i = 0; i < transientSteps; i += 1) {
    rk4Step(refState, dt, system.rhs, refOut);
    refState.set(refOut);
  }
  const aug = new Float64Array(n * (k + 1));
  aug.set(refState, 0);
  seedTangentFrame(aug, n, k, LYAPUNOV_SEED);
  const augOut = new Float64Array(aug.length);
  const views: StateVector[] = [];
  for (let j = 0; j < k; j += 1) views.push(aug.subarray(n + j * n, n + (j + 1) * n));

  const accum = new Array<number>(k).fill(0);
  const localSeries: number[][] = Array.from({ length: k }, () => []);
  const intervalTime = renormEvery * dt;
  const renormIntervals = Math.floor((steps - transientSteps) / renormEvery);
  const timeline: ExpansionLyapunovTimelinePoint[] = [];
  const maxPoints = Math.max(8, options.maxTimelinePoints ?? 140);
  const recordStride = Math.max(1, Math.floor(renormIntervals / maxPoints));
  let elapsed = 0;
  for (let interval = 0; interval < renormIntervals; interval += 1) {
    for (let s = 0; s < renormEvery; s += 1) {
      rk4Step(aug, dt, varRhs, augOut);
      aug.set(augOut);
    }
    const norms = gramSchmidt(views, n);
    for (let j = 0; j < k; j += 1) {
      const growth = Math.log(Math.max(norms[j] ?? 1e-300, 1e-300));
      accum[j] = (accum[j] ?? 0) + growth;
      localSeries[j]!.push(growth / intervalTime);
    }
    elapsed += intervalTime;
    if (interval % recordStride === 0 || interval === renormIntervals - 1) {
      // Each GS direction yields one exponent; at finite time their running
      // estimates can cross, so the *leading* and *secondary* curves are the two
      // largest running exponents (which converge onto spectrum[0]/spectrum[1]).
      const running = accum.map((value) => (value ?? 0) / elapsed).sort((a, b) => b - a);
      const leading = running[0] ?? 0;
      const secondary = k > 1 ? running[1] ?? 0 : 0;
      if (Number.isFinite(leading) && Number.isFinite(secondary)) {
        timeline.push({ time: rounded(elapsed, 4), leading: rounded(leading, 6), secondary: rounded(secondary, 6) });
      }
    }
  }

  // Pair each exponent with its block standard error before sorting so the
  // error bars stay aligned with the descending-sorted exponents.
  const paired = accum.map((value, j) => ({
    lambda: elapsed > 0 ? value / elapsed : 0,
    blockSe: blockStandardError(localSeries[j] ?? [])
  }));
  paired.sort((a, b) => b.lambda - a.lambda);
  const spectrum = paired.map((p) => p.lambda);
  const sum = spectrum.reduce((acc, value) => acc + value, 0);
  return {
    spectrum: spectrum.map((value) => rounded(value, 6)),
    blockStdError: paired.map((p) => rounded(p.blockSe, 6)),
    sum: rounded(sum, 8),
    kaplanYorkeDimension: rounded(kaplanYorke(spectrum), 4),
    leadingExponent: rounded(spectrum[0] ?? 0, 6),
    consistency: analyzeSpectrumConsistency(spectrum),
    timeline,
    settings: { dt, steps, renormEvery, transientSteps, count: k, jacobian: jacobian ? 'exact' : 'central-difference' }
  };
}
