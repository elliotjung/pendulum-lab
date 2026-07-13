import type { EnergyBreakdown } from '../types/domain';
import type { StateVector } from './types';

/**
 * Magnetic pendulum — an iron bob swinging on a long string over N fixed magnets
 * lying a height d below the plane of motion. In the small-swing (planar)
 * approximation the bob is a 2-D point with a linear restoring pull toward the
 * origin (the pendulum's own gravity), viscous air drag, and an inverse-square
 * attraction to each magnet:
 *
 *   ẍ = -k x - γ ẋ + Σ_i C_i (X_i - x) / r_i³
 *   ÿ = -k y - γ ẏ + Σ_i C_i (Y_i - y) / r_i³,   r_i = √((x-X_i)² + (y-Y_i)² + d²)
 *
 * The height d > 0 regularises the magnet singularity. With dissipation the bob
 * always settles onto one magnet, but *which* one is a famously fractal function
 * of the launch point — the textbook generator of Wada basin boundaries, which
 * is exactly what the basin / Wada diagnostics in `chaos/basin.ts` quantify.
 *
 * State layout: [x, y, ẋ, ẏ] (positions then velocities, splittable).
 */
export interface MagnetSpec {
  x: number;
  y: number;
  /** Attractive strength C_i (> 0). */
  strength: number;
}

export interface MagneticPendulumParameters {
  /** Fixed magnets in the plane (N ≥ 1). */
  magnets: readonly MagnetSpec[];
  /** Linear restoring constant k (≥ 0) pulling the bob toward the origin. */
  restoring: number;
  /** Viscous drag γ (≥ 0). γ > 0 makes the bob eventually settle on a magnet. */
  damping: number;
  /** Regularising height d (> 0) of the bob plane above the magnets. */
  height: number;
}

/** Three equal magnets on an equilateral triangle of unit radius — the classic demo. */
export const THREE_MAGNET_PRESET: MagneticPendulumParameters = Object.freeze({
  magnets: Object.freeze([
    { x: Math.cos(Math.PI / 2), y: Math.sin(Math.PI / 2), strength: 1 },
    { x: Math.cos(Math.PI / 2 + (2 * Math.PI) / 3), y: Math.sin(Math.PI / 2 + (2 * Math.PI) / 3), strength: 1 },
    { x: Math.cos(Math.PI / 2 + (4 * Math.PI) / 3), y: Math.sin(Math.PI / 2 + (4 * Math.PI) / 3), strength: 1 }
  ]) as readonly MagnetSpec[],
  restoring: 0.5,
  damping: 0.2,
  height: 0.25
});

export function rhsMagneticPendulum(
  state: ArrayLike<number>,
  parameters: MagneticPendulumParameters,
  out: StateVector
): StateVector {
  const x = Number(state[0] ?? 0);
  const y = Number(state[1] ?? 0);
  const vx = Number(state[2] ?? 0);
  const vy = Number(state[3] ?? 0);
  const { magnets, restoring, damping, height } = parameters;
  const d2 = height * height;
  let fx = -restoring * x - damping * vx;
  let fy = -restoring * y - damping * vy;
  for (let i = 0; i < magnets.length; i += 1) {
    const m = magnets[i]!;
    const dx = m.x - x;
    const dy = m.y - y;
    const r = Math.sqrt(dx * dx + dy * dy + d2);
    const inv3 = m.strength / (r * r * r);
    fx += dx * inv3;
    fy += dy * inv3;
  }
  out[0] = vx;
  out[1] = vy;
  out[2] = fx;
  out[3] = fy;
  return out;
}

/**
 * Mechanical energy E = ½(ẋ² + ẏ²) + ½k(x² + y²) - Σ_i C_i / r_i. Dissipated by
 * drag (dE/dt = -γ(ẋ² + ẏ²) ≤ 0), so it is monotone non-increasing when γ ≥ 0.
 * PE here bundles the harmonic restoring well and the attractive magnet wells.
 */
export function magneticPendulumEnergy(
  state: ArrayLike<number>,
  parameters: MagneticPendulumParameters
): EnergyBreakdown {
  const x = Number(state[0] ?? 0);
  const y = Number(state[1] ?? 0);
  const vx = Number(state[2] ?? 0);
  const vy = Number(state[3] ?? 0);
  const { magnets, restoring, height } = parameters;
  const d2 = height * height;
  const KE = 0.5 * (vx * vx + vy * vy);
  let PE = 0.5 * restoring * (x * x + y * y);
  for (let i = 0; i < magnets.length; i += 1) {
    const m = magnets[i]!;
    const dx = m.x - x;
    const dy = m.y - y;
    PE -= m.strength / Math.sqrt(dx * dx + dy * dy + d2);
  }
  return { total: KE + PE, KE, PE };
}

/** Index of the magnet nearest to the bob's current planar position. */
export function nearestMagnetIndex(x: number, y: number, parameters: MagneticPendulumParameters): number {
  const { magnets } = parameters;
  let best = -1;
  let bestD2 = Infinity;
  for (let i = 0; i < magnets.length; i += 1) {
    const m = magnets[i]!;
    const dx = m.x - x;
    const dy = m.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

export interface MagneticSettleResult {
  /** Index of the magnet the bob settled on (nearest at the final state). */
  magnet: number;
  /** Whether the bob came to rest (speed below `speedTolerance`) within the budget. */
  converged: boolean;
  /** Steps actually integrated. */
  steps: number;
  /** Final [x, y, ẋ, ẏ]. */
  finalState: readonly number[];
}

export interface MagneticSettleOptions {
  dt?: number;
  maxSteps?: number;
  /** Settling threshold on speed √(ẋ²+ẏ²). */
  speedTolerance?: number;
}

export interface MagneticBasinGridOptions extends MagneticSettleOptions {
  /** Grid cells per axis. */
  n?: number;
  xRange?: readonly [number, number];
  yRange?: readonly [number, number];
}

export interface MagneticBasinGrid {
  labels: Int32Array;
  converged: Uint8Array;
  width: number;
  height: number;
  convergedFraction: number;
  meanSteps: number;
  xRange: readonly [number, number];
  yRange: readonly [number, number];
}

/**
 * Integrate (velocity-Verlet, which is symplectic-friendly and cheap for this
 * separable-force system) from rest at (x0, y0) until the bob settles, returning
 * the magnet it lands on. This is the per-cell kernel for a fractal-basin scan
 * that feeds `chaos/basin.ts`. Requires γ > 0 to be meaningful.
 */
export function magneticPendulumSettle(
  parameters: MagneticPendulumParameters,
  x0: number,
  y0: number,
  options: MagneticSettleOptions = {}
): MagneticSettleResult {
  const dt = options.dt ?? 5e-3;
  const maxSteps = options.maxSteps ?? 20000;
  const speedTol = options.speedTolerance ?? 1e-3;
  const state = Float64Array.of(x0, y0, 0, 0);
  const out = new Float64Array(4);
  let steps = 0;
  let restCount = 0;
  for (let k = 0; k < maxSteps; k += 1) {
    rhsMagneticPendulum(state, parameters, out);
    // Semi-implicit (symplectic) Euler: update velocity then position.
    const vx = state[2]! + dt * out[2]!;
    const vy = state[3]! + dt * out[3]!;
    state[0] = state[0]! + dt * vx;
    state[1] = state[1]! + dt * vy;
    state[2] = vx;
    state[3] = vy;
    steps = k + 1;
    const speed = Math.hypot(vx, vy);
    if (speed < speedTol) {
      restCount += 1;
      if (restCount > 50) break; // sustained rest
    } else {
      restCount = 0;
    }
  }
  const speed = Math.hypot(state[2]!, state[3]!);
  return {
    magnet: nearestMagnetIndex(state[0]!, state[1]!, parameters),
    converged: speed < speedTol,
    steps,
    finalState: Array.from(state)
  };
}

/**
 * Fractal launch-basin grid ready for `basinEntropy`/`wadaCandidate` and the
 * existing label-grid renderer. Labels are nearest-magnet outcomes; a separate
 * convergence mask prevents a finite integration budget from being mistaken
 * for a certified settled basin.
 */
export function magneticPendulumBasinGrid(
  parameters: MagneticPendulumParameters,
  options: MagneticBasinGridOptions = {}
): MagneticBasinGrid {
  const n = options.n ?? 80;
  if (!Number.isInteger(n) || n < 2) throw new Error('magneticPendulumBasinGrid: n must be an integer >= 2.');
  const xRange = options.xRange ?? ([-2, 2] as const);
  const yRange = options.yRange ?? ([-2, 2] as const);
  if (!(xRange[1] > xRange[0]) || !(yRange[1] > yRange[0]))
    throw new Error('magneticPendulumBasinGrid: ranges must be increasing.');
  const labels = new Int32Array(n * n);
  const converged = new Uint8Array(n * n);
  let convergedCount = 0;
  let stepSum = 0;
  for (let iy = 0; iy < n; iy += 1) {
    const y = yRange[0] + ((yRange[1] - yRange[0]) * iy) / (n - 1);
    for (let ix = 0; ix < n; ix += 1) {
      const x = xRange[0] + ((xRange[1] - xRange[0]) * ix) / (n - 1);
      const result = magneticPendulumSettle(parameters, x, y, options);
      const index = iy * n + ix;
      labels[index] = result.magnet;
      converged[index] = result.converged ? 1 : 0;
      convergedCount += result.converged ? 1 : 0;
      stepSum += result.steps;
    }
  }
  return {
    labels,
    converged,
    width: n,
    height: n,
    convergedFraction: convergedCount / (n * n),
    meanSteps: stepSum / (n * n),
    xRange,
    yRange
  };
}
