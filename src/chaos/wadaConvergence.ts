import type { PendulumParameters } from '../types/domain';
import { doublePendulumFlipBasin, wadaCandidate, type LabelGrid } from './basin';
import { hashText } from '../research/researchExportUtils';

/**
 * Wada-property resolution-convergence analysis.
 *
 * A single-resolution grid Wada test (Daza, Wagemakers & Sanjuán, Sci. Rep.
 * 2018) is *evidence at one resolution*, not a verdict: a fraction near 1 can
 * collapse on refinement (false positive from coarse cells straddling three
 * basins), and a low fraction can climb as thin basin filaments resolve. This
 * analysis runs the same test on several independent grid resolutions and
 * reports the convergence curve, the adjacent-resolution deltas, and a
 * stability verdict — making explicit that finite-grid evidence is NOT a
 * mathematical proof (a proof requires the unrestricted refinement limit or
 * the saddle-straddle method of Wagemakers et al.).
 */

export interface WadaConvergenceOptions {
  /** Independent grid resolutions (cells per axis), ascending. Default [40, 60, 90]. */
  resolutions?: number[];
  /** Neighbourhood radius (cells) for the per-resolution Wada test. Default 2. */
  radius?: number;
  /** Wada-candidate fraction threshold. Default 0.95. */
  threshold?: number;
  /** Max |fraction(i+1) − fraction(i)| for the curve to count as converged. Default 0.05. */
  convergenceTolerance?: number;
  /** Integration step for the flip-basin grids. Default 0.01. */
  dt?: number;
  /** Max integration time per cell before "no flip". Default 20. */
  maxTime?: number;
  /** Angle range for both θ₁ and θ₂. Default [-3, 3]. */
  range?: [number, number];
}

export type WadaConvergenceVerdict = 'stable-wada-evidence' | 'stable-non-wada' | 'unstable' | 'insufficient-data';

export interface WadaConvergenceResult {
  schemaVersion: 'pendulum-wada-convergence/v1';
  method: string;
  /** Resolutions actually analysed, ascending. */
  resolutions: number[];
  /** Wada fraction at each resolution (convergence curve). */
  wadaFractions: number[];
  /** Distinct basin colours per resolution. */
  numColors: number[];
  /** Boundary cells examined per resolution. */
  boundaryCells: number[];
  /** |fraction(i+1) − fraction(i)| between adjacent resolutions. */
  adjacentDeltas: number[];
  /** Largest adjacent delta (the stability statistic). */
  maxAdjacentDelta: number;
  verdict: WadaConvergenceVerdict;
  /** True only for 'stable-wada-evidence'. */
  wadaCandidate: boolean;
  radius: number;
  threshold: number;
  convergenceTolerance: number;
  dt: number;
  maxTime: number;
  range: [number, number];
  transientHandling: string;
  /** Content hash of each resolution's label grid. */
  gridHashes: string[];
  caveat: string;
  reproducibilityHash: string;
  generatedAt: string;
}

const WADA_CAVEAT =
  'Finite-grid evidence only: a converged Wada fraction at several resolutions supports (does not prove) the Wada property. ' +
  'Mathematical proof requires the unrestricted grid-refinement limit or the saddle-straddle method; ' +
  'treat this verdict as numerical evidence with the stated tolerance.';

function hashGrid(grid: LabelGrid): string {
  // Hash a deterministic decimation of the labels (full grids can be ~100k cells).
  const stride = Math.max(1, Math.floor(grid.labels.length / 4096));
  const parts: number[] = [grid.width, grid.height];
  for (let i = 0; i < grid.labels.length; i += stride) parts.push(grid.labels[i] ?? 0);
  return hashText(parts.join(','));
}

/**
 * Pure core: convergence analysis over precomputed grids (unit-testable without
 * integrating the pendulum). `resolutions[i]` must describe `grids[i]`.
 */
export function wadaConvergenceFromGrids(
  grids: LabelGrid[],
  resolutions: number[],
  options: Pick<WadaConvergenceOptions, 'radius' | 'threshold' | 'convergenceTolerance'> = {},
  context: { dt: number; maxTime: number; range: [number, number] } = { dt: 0.01, maxTime: 20, range: [-3, 3] }
): WadaConvergenceResult {
  const radius = options.radius ?? 2;
  const threshold = options.threshold ?? 0.95;
  const convergenceTolerance = options.convergenceTolerance ?? 0.05;

  const wadaFractions: number[] = [];
  const numColors: number[] = [];
  const boundaryCells: number[] = [];
  const gridHashes: string[] = [];
  for (const grid of grids) {
    const wada = wadaCandidate(grid, radius, threshold);
    wadaFractions.push(wada.wadaFraction);
    numColors.push(wada.numColors);
    boundaryCells.push(wada.boundaryCells);
    gridHashes.push(hashGrid(grid));
  }

  const adjacentDeltas: number[] = [];
  for (let i = 1; i < wadaFractions.length; i += 1) {
    adjacentDeltas.push(Math.abs(wadaFractions[i]! - wadaFractions[i - 1]!));
  }
  const maxAdjacentDelta = adjacentDeltas.length > 0 ? Math.max(...adjacentDeltas) : Number.NaN;

  let verdict: WadaConvergenceVerdict;
  if (grids.length < 3) {
    verdict = 'insufficient-data';
  } else if (Number.isFinite(maxAdjacentDelta) && maxAdjacentDelta <= convergenceTolerance) {
    const finest = wadaFractions[wadaFractions.length - 1] ?? 0;
    const finestColors = numColors[numColors.length - 1] ?? 0;
    verdict = finestColors >= 3 && finest >= threshold ? 'stable-wada-evidence' : 'stable-non-wada';
  } else {
    verdict = 'unstable';
  }

  const result: WadaConvergenceResult = {
    schemaVersion: 'pendulum-wada-convergence/v1',
    method:
      `Grid Wada test (Daza et al. 2018) at ${grids.length} independent resolutions; ` +
      `RK4 flip-basin grids, neighbourhood radius ${radius} cells, candidacy threshold ${threshold}; ` +
      `verdict from adjacent-resolution deltas <= ${convergenceTolerance}.`,
    resolutions: [...resolutions],
    wadaFractions,
    numColors,
    boundaryCells,
    adjacentDeltas,
    maxAdjacentDelta,
    verdict,
    wadaCandidate: verdict === 'stable-wada-evidence',
    radius,
    threshold,
    convergenceTolerance,
    dt: context.dt,
    maxTime: context.maxTime,
    range: context.range,
    transientHandling: `each cell integrated from rest up to maxTime=${context.maxTime}s; cells that never flip are their own basin class`,
    gridHashes,
    caveat: WADA_CAVEAT,
    reproducibilityHash: '',
    generatedAt: new Date().toISOString()
  };
  result.reproducibilityHash = hashText(
    JSON.stringify({
      resolutions: result.resolutions,
      radius,
      threshold,
      convergenceTolerance,
      dt: context.dt,
      maxTime: context.maxTime,
      range: context.range,
      gridHashes
    })
  );
  return result;
}

/** Full analysis: compute flip-basin grids at each resolution, then converge-test them. */
export function wadaResolutionConvergence(
  params: PendulumParameters,
  options: WadaConvergenceOptions = {}
): WadaConvergenceResult {
  const resolutions = (options.resolutions ?? [40, 60, 90])
    .map((n) => Math.max(16, Math.min(240, Math.round(n))))
    .sort((a, b) => a - b)
    .filter((n, index, all) => all.indexOf(n) === index);
  const dt = options.dt ?? 0.01;
  const maxTime = options.maxTime ?? 20;
  const range = options.range ?? [-3, 3];
  const grids = resolutions.map((n) => doublePendulumFlipBasin(params, { n, dt, maxTime, range }));
  return wadaConvergenceFromGrids(grids, resolutions, options, { dt, maxTime, range });
}
