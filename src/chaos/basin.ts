import type { PendulumParameters } from '../types/domain';
import { rhsDouble } from '../physics/double';
import { rk4Step } from '../physics/integrators';
import { checkedWorkProduct, integrationStepCount, NUMERICAL_WORK_BUDGETS } from '../validation/numericalBudgets';

/**
 * Basin/exit-set diagnostics for the double pendulum: the basin entropy of
 * Daza, Wagemakers, Georgeot, Guéry-Odelin & Sanjuán (Sci. Rep. 2016) and the
 * box-counting (fractal) dimension of a classification boundary.
 *
 * The undamped double pendulum is conservative and so has no attractors, but it
 * is famous for a fractal *exit/flip* structure: colouring each initial angle by
 * which rod flips over first produces the classic double-pendulum fractal. Basin
 * entropy quantifies how unpredictable that outcome is, and the boundary
 * basin entropy crossing ln 2 is a *sufficient condition* for a fractal (and
 * possibly Wada) boundary — a rigorous, quantitative claim rather than "it looks
 * fractal".
 *
 * The entropy and box-counting routines are pure functions of an integer
 * label grid, so they apply equally to genuine attractor basins of the driven
 * damped pendulum.
 */

export interface LabelGrid {
  /** Row-major labels, length width*height; small non-negative integers (colours). */
  labels: Int32Array;
  width: number;
  height: number;
}

export interface BasinEntropyResult {
  /** Mean Gibbs entropy per box, Sb (natural log). */
  basinEntropy: number;
  /** Mean entropy over boundary boxes only, Sbb. */
  boundaryBasinEntropy: number;
  numBoxes: number;
  numBoundaryBoxes: number;
  numColors: number;
  /** Sbb > ln 2 is a sufficient condition for a fractal basin boundary. */
  fractalBoundary: boolean;
  boxSide: number;
  /** Standard error of the mean of Sb over boxes. */
  basinEntropyStdError: number;
  /** Standard error of the mean of Sbb over boundary boxes. */
  boundaryBasinEntropyStdError: number;
}

/**
 * Basin entropy of a label grid. The grid is tiled into square boxes of side
 * `boxSide`; each box contributes the Gibbs entropy of its colour distribution.
 * Boxes containing more than one colour are "boundary boxes".
 */
export function basinEntropy(grid: LabelGrid, boxSide = 5): BasinEntropyResult {
  const { labels, width, height } = grid;
  let numColors = 0;
  for (let i = 0; i < labels.length; i += 1) numColors = Math.max(numColors, (labels[i] ?? 0) + 1);

  const boxesX = Math.floor(width / boxSide);
  const boxesY = Math.floor(height / boxSide);
  let entropySum = 0;
  let entropySqSum = 0;
  let boundaryEntropySum = 0;
  let boundaryEntropySqSum = 0;
  let numBoxes = 0;
  let numBoundaryBoxes = 0;

  const counts = new Int32Array(numColors);
  for (let by = 0; by < boxesY; by += 1) {
    for (let bx = 0; bx < boxesX; bx += 1) {
      counts.fill(0);
      let total = 0;
      for (let dy = 0; dy < boxSide; dy += 1) {
        for (let dx = 0; dx < boxSide; dx += 1) {
          const x = bx * boxSide + dx;
          const y = by * boxSide + dy;
          const label = labels[y * width + x] ?? 0;
          counts[label] = (counts[label] ?? 0) + 1;
          total += 1;
        }
      }
      let entropy = 0;
      let distinct = 0;
      for (let c = 0; c < numColors; c += 1) {
        const n = counts[c] ?? 0;
        if (n > 0) {
          distinct += 1;
          const p = n / total;
          entropy -= p * Math.log(p);
        }
      }
      entropySum += entropy;
      entropySqSum += entropy * entropy;
      numBoxes += 1;
      if (distinct > 1) {
        boundaryEntropySum += entropy;
        boundaryEntropySqSum += entropy * entropy;
        numBoundaryBoxes += 1;
      }
    }
  }

  const boundaryBasinEntropy = numBoundaryBoxes > 0 ? boundaryEntropySum / numBoundaryBoxes : 0;
  // SEM over boxes: Sb is a mean of per-box entropies, so its sampling error is
  // std(per-box entropy)/√n. Boxes are nearly independent at boxSide ≥ the
  // boundary correlation length; treat the SEM as a (slightly optimistic) floor.
  const sem = (sum: number, sqSum: number, n: number): number => {
    if (n < 2) return 0;
    const mean = sum / n;
    const variance = Math.max(0, sqSum / n - mean * mean) * (n / (n - 1));
    return Math.sqrt(variance / n);
  };
  return {
    basinEntropy: numBoxes > 0 ? entropySum / numBoxes : 0,
    boundaryBasinEntropy,
    numBoxes,
    numBoundaryBoxes,
    numColors,
    fractalBoundary: boundaryBasinEntropy > Math.LN2,
    boxSide,
    basinEntropyStdError: sem(entropySum, entropySqSum, numBoxes),
    boundaryBasinEntropyStdError: sem(boundaryEntropySum, boundaryEntropySqSum, numBoundaryBoxes)
  };
}

/** Mark cells that have a 4-neighbour with a different label (the classification boundary). */
export function boundaryMask(grid: LabelGrid): Uint8Array {
  const { labels, width, height } = grid;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const here = labels[y * width + x] ?? 0;
      let isBoundary = false;
      if (x > 0 && (labels[y * width + x - 1] ?? 0) !== here) isBoundary = true;
      else if (x < width - 1 && (labels[y * width + x + 1] ?? 0) !== here) isBoundary = true;
      else if (y > 0 && (labels[(y - 1) * width + x] ?? 0) !== here) isBoundary = true;
      else if (y < height - 1 && (labels[(y + 1) * width + x] ?? 0) !== here) isBoundary = true;
      if (isBoundary) mask[y * width + x] = 1;
    }
  }
  return mask;
}

export interface BoxCountingResult {
  /** Estimated box-counting dimension (slope of log N(ε) vs log(1/ε)). */
  dimension: number;
  /** (ε, N(ε)) pairs used in the fit, coarse → fine. */
  points: { epsilon: number; count: number }[];
  /** Standard error of the regression slope (scaling-fit quality, not sampling error). */
  stdError: number;
  /** Coefficient of determination R² of the log-log fit. */
  r2: number;
  /** Student-t 95% confidence interval for the slope (n−2 degrees of freedom). */
  ci95: [number, number];
}

/**
 * Box-counting (Minkowski–Bouligand) dimension of a binary mask. At each scale ε
 * (in cells), the plane is tiled into ε×ε boxes and the boxes containing at least
 * one set cell are counted; the dimension is the least-squares slope of
 * log N(ε) against log(1/ε).
 */
export function boxCountingDimension(
  mask: Uint8Array,
  width: number,
  height: number,
  scales?: number[]
): BoxCountingResult {
  const usedScales = scales ?? defaultScales(Math.min(width, height));
  const points: { epsilon: number; count: number }[] = [];
  for (const epsilon of usedScales) {
    const boxesX = Math.ceil(width / epsilon);
    const boxesY = Math.ceil(height / epsilon);
    const occupied = new Uint8Array(boxesX * boxesY);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (mask[y * width + x]) {
          const bx = Math.floor(x / epsilon);
          const by = Math.floor(y / epsilon);
          occupied[by * boxesX + bx] = 1;
        }
      }
    }
    let count = 0;
    for (let i = 0; i < occupied.length; i += 1) count += occupied[i] ?? 0;
    if (count > 0) points.push({ epsilon, count });
  }

  // Least-squares slope of ln(count) vs ln(1/epsilon), with the regression
  // standard error of the slope and R² as scaling-quality diagnostics: a true
  // power law gives a tight straight line, so a large slope SE / low R² flags
  // a dimension estimate that should not be trusted.
  const n = points.length;
  if (n < 2) return { dimension: 0, points, stdError: 0, r2: 0, ci95: [0, 0] };
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const { epsilon, count } of points) {
    const lx = Math.log(1 / epsilon);
    const ly = Math.log(count);
    sx += lx;
    sy += ly;
    sxx += lx * lx;
    sxy += lx * ly;
    syy += ly * ly;
  }
  const denom = n * sxx - sx * sx;
  const dimension = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const intercept = n > 0 ? (sy - dimension * sx) / n : 0;
  let sse = 0;
  for (const { epsilon, count } of points) {
    const lx = Math.log(1 / epsilon);
    const resid = Math.log(count) - (dimension * lx + intercept);
    sse += resid * resid;
  }
  const meanY = sy / n;
  const sst = syy - n * meanY * meanY;
  const r2 = sst > 0 ? 1 - sse / sst : 1;
  const sxxCentered = sxx - (sx * sx) / n;
  const stdError = n > 2 && sxxCentered > 0 ? Math.sqrt(sse / (n - 2) / sxxCentered) : 0;
  const t = tQuantile975(n - 2);
  return { dimension, points, stdError, r2, ci95: [dimension - t * stdError, dimension + t * stdError] };
}

/** Two-sided 97.5% Student-t quantile for small degrees of freedom (≈1.96 beyond the table). */
function tQuantile975(dof: number): number {
  const table = [
    12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131
  ];
  if (dof < 1) return 0;
  return dof <= table.length ? table[dof - 1]! : 1.96 + 4.4 / dof;
}

function defaultScales(maxExtent: number): number[] {
  const scales: number[] = [];
  for (let epsilon = 1; epsilon <= maxExtent / 2; epsilon *= 2) scales.push(epsilon);
  return scales;
}

export interface FlipBasinOptions {
  /** Number of grid cells per axis (the map is n×n). Default 60. */
  n?: number;
  /** Inclusive angle range [lo, hi] (radians) for both θ₁ and θ₂. Default [-3, 3]. */
  range?: [number, number];
  dt?: number;
  /** Maximum integration time before declaring "no flip". Default 20. */
  maxTime?: number;
}

// This routine is synchronous and performs O(n² maxTime/dt) RK4 steps. Keep
// malformed worker/UI input from allocating an enormous grid or monopolising
// the main thread indefinitely while retaining ample headroom above the
// platform's normal 40–90 cell research grids.
/**
 * Classify a grid of initial angles (θ₁, θ₂), both rods released from rest, by
 * which rod first flips over the top (|θ| exceeds π): label 0 = first rod flips
 * first, 1 = second rod flips first, 2 = neither flips within `maxTime`. This is
 * the classic double-pendulum fractal, returned as a {@link LabelGrid} ready for
 * {@link basinEntropy} / {@link boxCountingDimension}.
 */
export function doublePendulumFlipBasin(params: PendulumParameters, options: FlipBasinOptions = {}): LabelGrid {
  const n = options.n ?? 60;
  const [lo, hi] = options.range ?? [-3, 3];
  const dt = options.dt ?? 0.01;
  const maxTime = options.maxTime ?? 20;
  if (!Number.isSafeInteger(n) || n < 2 || n > NUMERICAL_WORK_BUDGETS.flipBasin.maxResolution) {
    throw new Error(
      `doublePendulumFlipBasin: n must be an integer between 2 and ${NUMERICAL_WORK_BUDGETS.flipBasin.maxResolution}.`
    );
  }
  if (!(dt > 0) || !Number.isFinite(dt)) {
    throw new Error('doublePendulumFlipBasin: dt must be positive and finite.');
  }
  if (maxTime < 0 || !Number.isFinite(maxTime)) {
    throw new Error('doublePendulumFlipBasin: maxTime must be finite and non-negative.');
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo) || !Number.isFinite(hi - lo)) {
    throw new Error('doublePendulumFlipBasin: range endpoints must be finite and strictly increasing.');
  }
  const integrationSteps = integrationStepCount(maxTime, dt, 'doublePendulumFlipBasin');
  if (integrationSteps > NUMERICAL_WORK_BUDGETS.flipBasin.maxStepsPerCell) {
    throw new Error(
      `doublePendulumFlipBasin: maxTime/dt must not exceed ${NUMERICAL_WORK_BUDGETS.flipBasin.maxStepsPerCell} steps per cell.`
    );
  }
  const totalWork = checkedWorkProduct([n, n, integrationSteps], 'doublePendulumFlipBasin');
  if (totalWork > NUMERICAL_WORK_BUDGETS.flipBasin.maxGridTrajectorySteps) {
    throw new Error(
      `doublePendulumFlipBasin: requested grid exceeds the ${NUMERICAL_WORK_BUDGETS.flipBasin.maxGridTrajectorySteps}-step work budget.`
    );
  }
  const fullSteps = Math.floor(maxTime / dt);
  const remainder = maxTime - fullSteps * dt;
  const labels = new Int32Array(n * n);
  const rhs = (s: Float64Array, o: Float64Array): void => {
    rhsDouble(s, params, 0, o);
  };

  const current = new Float64Array(4);
  const next = new Float64Array(4);
  const advanceAndClassify = (stepDt: number): number => {
    rk4Step(current, stepDt, rhs, next);
    current.set(next);
    const flip1 = Math.abs(current[0]!) > Math.PI;
    const flip2 = Math.abs(current[1]!) > Math.PI;
    if (!flip1 && !flip2) return 2;
    return flip1 && (!flip2 || Math.abs(current[0]!) >= Math.abs(current[1]!)) ? 0 : 1;
  };
  for (let iy = 0; iy < n; iy += 1) {
    const theta2 = lo + ((hi - lo) * iy) / (n - 1);
    for (let ix = 0; ix < n; ix += 1) {
      const theta1 = lo + ((hi - lo) * ix) / (n - 1);
      current[0] = theta1;
      current[1] = theta2;
      current[2] = 0;
      current[3] = 0;
      let label = 2;
      for (let step = 0; step < fullSteps; step += 1) {
        label = advanceAndClassify(dt);
        if (label !== 2) break;
      }
      // Integrate the exact tail rather than rounding maxTime/dt up or down.
      if (label === 2 && remainder > 0) label = advanceAndClassify(remainder);
      labels[iy * n + ix] = label;
    }
  }
  return { labels, width: n, height: n };
}

export interface WadaResult {
  /** Fraction of boundary cells whose r-neighbourhood touches >= 3 basins. */
  wadaFraction: number;
  /** Histogram: fractionByColors[k] = fraction of boundary cells seeing exactly k distinct colours (k >= 2). */
  fractionByColors: number[];
  /** Number of boundary cells examined. */
  boundaryCells: number;
  /** Neighbourhood radius (cells) used for the test. */
  radius: number;
  /** Distinct colours present in the grid. */
  numColors: number;
  /** True when the grid has >= 3 colours and wadaFraction >= threshold. */
  wadaCandidate: boolean;
  /** Threshold used for the verdict. */
  threshold: number;
}

/**
 * Grid-based Wada-property candidate test (the "grid approach" of Daza,
 * Wagemakers & Sanjuán, Sci. Rep. 2018, at a single resolution). A boundary has
 * the Wada property when every boundary point lies on the boundary of *all*
 * basins simultaneously. Numerically, each boundary cell's r-neighbourhood is
 * scanned for the set of distinct basin colours it touches; the fraction of
 * boundary cells seeing >= 3 colours is reported. A fraction near 1 with >= 3
 * basins makes the boundary a *Wada candidate* at this resolution — it is
 * evidence, not a proof (a proof needs the unrestricted refinement limit, or
 * the saddle-straddle method).
 */
export function wadaCandidate(grid: LabelGrid, radius = 2, threshold = 0.95): WadaResult {
  const { labels, width, height } = grid;
  let numColors = 0;
  for (let i = 0; i < labels.length; i += 1) numColors = Math.max(numColors, (labels[i] ?? 0) + 1);

  const mask = boundaryMask(grid);
  const seen = new Uint8Array(numColors);
  const countsByColors = new Array<number>(numColors + 1).fill(0);
  let boundaryCells = 0;
  let wadaCells = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] !== 1) continue;
      boundaryCells += 1;
      seen.fill(0);
      let distinct = 0;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      for (let ny = y0; ny <= y1; ny += 1) {
        for (let nx = x0; nx <= x1; nx += 1) {
          const label = labels[ny * width + nx] ?? 0;
          if (seen[label] === 0) {
            seen[label] = 1;
            distinct += 1;
          }
        }
      }
      countsByColors[distinct] = (countsByColors[distinct] ?? 0) + 1;
      if (distinct >= 3) wadaCells += 1;
    }
  }

  const wadaFraction = boundaryCells > 0 ? wadaCells / boundaryCells : 0;
  return {
    wadaFraction,
    fractionByColors: countsByColors.map((count) => (boundaryCells > 0 ? count / boundaryCells : 0)),
    boundaryCells,
    radius,
    numColors,
    wadaCandidate: numColors >= 3 && wadaFraction >= threshold,
    threshold
  };
}
