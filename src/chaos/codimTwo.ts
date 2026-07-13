import { maximalLyapunov } from './lyapunov';
import { buildRhs, type SystemSpec } from '../physics/systemSpec';
import { hashText } from '../research/researchExportUtils';

/**
 * Two-parameter (codimension-2 style) regime diagram: classify each cell of an
 * (A, γ) — or any two-parameter — grid of the driven pendulum by its maximal
 * Lyapunov exponent sign. The λ = 0 contour traces the chaotic boundary; points
 * where bifurcation curves of different type meet on that boundary are the
 * codim-2 organising centres a researcher then examines with continuation.
 */

export interface CodimTwoOptions {
  /** Grid resolution per axis. Default 12 (cells = n²; each runs a Lyapunov estimate). */
  n?: number;
  /** Lyapunov steps per cell. Default 4000 (coarse but fast scan). */
  steps?: number;
  dt?: number;
  /** |λ| below this is classified neutral/marginal. Default 5e-3. */
  neutralBand?: number;
}

export interface CodimTwoCell {
  x: number;
  y: number;
  lambda: number;
  /** -1 regular (λ<-band), 0 marginal, +1 chaotic (λ>band). */
  regime: -1 | 0 | 1;
}

export interface CodimTwoResult {
  schemaVersion: 'pendulum-codim2/v1';
  xParam: string;
  yParam: string;
  xValues: number[];
  yValues: number[];
  /** Row-major cells, y-major (cells[j*n + i] ↔ (xValues[i], yValues[j])). */
  cells: CodimTwoCell[];
  chaoticFraction: number;
  /** Cells adjacent to a regime change (the λ-sign boundary). */
  boundaryCells: number;
  method: string;
  dt: number;
  steps: number;
  neutralBand: number;
  transientHandling: string;
  caveat: string;
  reproducibilityHash: string;
  generatedAt: string;
}

export function codimTwoDiagram(
  makeSpec: (x: number, y: number) => SystemSpec,
  state0: readonly number[],
  xParam: string,
  xRange: [number, number],
  yParam: string,
  yRange: [number, number],
  options: CodimTwoOptions = {}
): CodimTwoResult {
  const n = Math.max(4, Math.min(40, Math.round(options.n ?? 12)));
  const steps = Math.max(500, Math.round(options.steps ?? 4000));
  const dt = options.dt ?? 0.01;
  const neutralBand = options.neutralBand ?? 5e-3;
  const xValues = Array.from({ length: n }, (_, i) => xRange[0] + ((xRange[1] - xRange[0]) * i) / (n - 1));
  const yValues = Array.from({ length: n }, (_, j) => yRange[0] + ((yRange[1] - yRange[0]) * j) / (n - 1));
  const cells: CodimTwoCell[] = [];
  let chaotic = 0;
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = xValues[i]!;
      const y = yValues[j]!;
      let lambda = Number.NaN;
      try {
        const rhs = buildRhs(makeSpec(x, y));
        lambda = maximalLyapunov(new Float64Array(state0), rhs, { steps, dt }).lambdaMax;
      } catch {
        lambda = Number.NaN;
      }
      const regime: -1 | 0 | 1 = !Number.isFinite(lambda) || Math.abs(lambda) <= neutralBand ? 0 : lambda > 0 ? 1 : -1;
      if (regime === 1) chaotic += 1;
      cells.push({ x, y, lambda, regime });
    }
  }
  let boundaryCells = 0;
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const here = cells[j * n + i]!.regime;
      const right = i + 1 < n ? cells[j * n + i + 1]!.regime : here;
      const up = j + 1 < n ? cells[(j + 1) * n + i]!.regime : here;
      if (here !== right || here !== up) boundaryCells += 1;
    }
  }
  return {
    schemaVersion: 'pendulum-codim2/v1',
    xParam,
    yParam,
    xValues,
    yValues,
    cells,
    chaoticFraction: cells.length > 0 ? chaotic / cells.length : 0,
    boundaryCells,
    method: `maximal Lyapunov (Benettin, ${steps} steps, dt=${dt}) sign classification on an ${n}x${n} (${xParam}, ${yParam}) grid; neutral band |lambda|<=${neutralBand}`,
    dt,
    steps,
    neutralBand,
    transientHandling:
      'Benettin renormalisation discards the orientation transient; finite-time lambda over the full window',
    caveat:
      'Coarse finite-time scan: the lambda=0 contour locates the chaotic boundary to grid resolution only; organising (codim-2) points need continuation of the bracketing bifurcation curves.',
    reproducibilityHash: hashText(
      JSON.stringify({ xParam, yParam, xRange, yRange, n, steps, dt, neutralBand, state0: [...state0] })
    ),
    generatedAt: new Date().toISOString()
  };
}
