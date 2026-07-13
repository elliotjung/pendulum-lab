/**
 * Multi-dimensional experiment design for parameter studies: true multi-variable
 * Sobol and Latin-hypercube sampling, adaptive refinement around high
 * |∇λ| regions, boundary refinement around λ sign changes, uncertainty-driven
 * resampling, replicate runs, and budget controls. All samplers are
 * deterministic given (variables, count, seed) so studies are reproducible.
 */

export interface StudyVariable {
  /** Patch key understood by the study runner (e.g. 'theta1', 'damping'). */
  key: string;
  min: number;
  max: number;
}

export interface DesignPoint {
  /** Values per variable key, in variable order. */
  values: Record<string, number>;
  /** Why the point exists: initial design or one of the refinement passes. */
  origin: 'design' | 'adaptive' | 'boundary' | 'uncertainty' | 'replicate';
  /** Replicate index (0 = primary run). */
  replicate: number;
}

export interface DesignBudget {
  maxPoints: number;
  maxTimeMs: number;
  maxFailures: number;
}

export const DEFAULT_DESIGN_BUDGET: DesignBudget = { maxPoints: 256, maxTimeMs: 10 * 60 * 1000, maxFailures: 12 };

export type MultiStrategy = 'sobol' | 'latin-hypercube' | 'grid';

/** First 12 primitive-polynomial direction sets (Joe–Kuo) for the Sobol sequence. */
const SOBOL_PRIMITIVES: { a: number; m: number[] }[] = [
  { a: 0, m: [1] },
  { a: 1, m: [1, 3] },
  { a: 1, m: [1, 3, 1] },
  { a: 2, m: [1, 1, 1] },
  { a: 1, m: [1, 1, 3, 3] },
  { a: 4, m: [1, 3, 5, 13] },
  { a: 2, m: [1, 1, 5, 5, 17] },
  { a: 4, m: [1, 1, 5, 5, 5] },
  { a: 7, m: [1, 1, 7, 11, 19] },
  { a: 11, m: [1, 1, 5, 1, 1] },
  { a: 13, m: [1, 1, 1, 3, 11] },
  { a: 14, m: [1, 3, 5, 5, 31] }
];

const SOBOL_BITS = 30;

function sobolDirections(dim: number): number[][] {
  const directions: number[][] = [];
  for (let d = 0; d < dim; d += 1) {
    const v = new Array<number>(SOBOL_BITS).fill(0);
    if (d === 0) {
      for (let i = 0; i < SOBOL_BITS; i += 1) v[i] = 1 << (SOBOL_BITS - 1 - i);
    } else {
      const { a, m } = SOBOL_PRIMITIVES[Math.min(d, SOBOL_PRIMITIVES.length - 1)]!;
      const s = m.length;
      for (let i = 0; i < s; i += 1) v[i] = m[i]! << (SOBOL_BITS - 1 - i);
      for (let i = s; i < SOBOL_BITS; i += 1) {
        let value = v[i - s]! ^ (v[i - s]! >> s);
        for (let k = 1; k < s; k += 1) {
          if ((a >> (s - 1 - k)) & 1) value ^= v[i - k]!;
        }
        v[i] = value;
      }
    }
    directions.push(v);
  }
  return directions;
}

/** Gray-code Sobol sequence: `count` points in [0,1)^dim (skipping the all-zeros point). */
export function sobolSequence(dim: number, count: number): number[][] {
  const d = Math.max(1, Math.min(12, Math.round(dim)));
  const n = Math.max(0, Math.round(count));
  const directions = sobolDirections(d);
  const x = new Array<number>(d).fill(0);
  const points: number[][] = [];
  for (let i = 1; i <= n; i += 1) {
    // Index of the lowest zero bit of (i-1) drives the Gray-code update.
    let c = 0;
    let value = i - 1;
    while (value & 1) {
      value >>= 1;
      c += 1;
    }
    const point = new Array<number>(d);
    for (let j = 0; j < d; j += 1) {
      x[j] = (x[j]! ^ directions[j]![c]!) >>> 0;
      point[j] = x[j]! / 2 ** SOBOL_BITS;
    }
    points.push(point);
  }
  return points;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Multi-variable Latin hypercube: each variable's marginal is stratified into n bins. */
export function latinHypercube(dim: number, count: number, seedText = 'pendulum-lhs'): number[][] {
  const d = Math.max(1, Math.round(dim));
  const n = Math.max(1, Math.round(count));
  const rng = mulberry32(seedFromText(seedText));
  const columns: number[][] = [];
  for (let j = 0; j < d; j += 1) {
    const perm = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i -= 1) {
      const k = Math.floor(rng() * (i + 1));
      [perm[i], perm[k]] = [perm[k]!, perm[i]!];
    }
    columns.push(perm.map((cell) => (cell + rng()) / n));
  }
  return Array.from({ length: n }, (_, i) => columns.map((column) => column[i]!));
}

/** Full-factorial grid with ⌈count^(1/dim)⌉ levels per axis, truncated to count. */
export function factorialGrid(dim: number, count: number): number[][] {
  const d = Math.max(1, Math.round(dim));
  const levels = Math.max(2, Math.ceil(Math.max(2, count) ** (1 / d)));
  const points: number[][] = [];
  const index = new Array<number>(d).fill(0);
  for (;;) {
    points.push(index.map((i) => (levels === 1 ? 0.5 : i / (levels - 1))));
    if (points.length >= count) break;
    let j = 0;
    while (j < d) {
      index[j] = (index[j] ?? 0) + 1;
      if (index[j]! < levels) break;
      index[j] = 0;
      j += 1;
    }
    if (j === d) break;
  }
  return points.slice(0, count);
}

function scalePoint(unit: number[], variables: StudyVariable[]): Record<string, number> {
  const values: Record<string, number> = {};
  variables.forEach((variable, i) => {
    values[variable.key] = variable.min + (variable.max - variable.min) * (unit[i] ?? 0.5);
  });
  return values;
}

/** Initial multi-variable design, with optional replicates per point. */
export function generateDesign(
  variables: StudyVariable[],
  strategy: MultiStrategy,
  count: number,
  options: { seedText?: string; replicates?: number; budget?: DesignBudget } = {}
): DesignPoint[] {
  if (variables.length === 0) return [];
  const budget = options.budget ?? DEFAULT_DESIGN_BUDGET;
  const replicates = Math.max(1, Math.min(8, Math.round(options.replicates ?? 1)));
  const n = Math.max(1, Math.min(budget.maxPoints, Math.round(count)));
  const unitPoints =
    strategy === 'sobol'
      ? sobolSequence(variables.length, n)
      : strategy === 'latin-hypercube'
        ? latinHypercube(variables.length, n, options.seedText ?? 'pendulum-lhs')
        : factorialGrid(variables.length, n);
  const points: DesignPoint[] = [];
  for (const unit of unitPoints) {
    for (let r = 0; r < replicates; r += 1) {
      if (points.length >= budget.maxPoints) return points;
      points.push({ values: scalePoint(unit, variables), origin: r === 0 ? 'design' : 'replicate', replicate: r });
    }
  }
  return points;
}

export interface EvaluatedPoint {
  values: Record<string, number>;
  lambdaMax: number;
  lambdaStdError: number;
}

function distance(a: Record<string, number>, b: Record<string, number>, variables: StudyVariable[]): number {
  let sum = 0;
  for (const variable of variables) {
    const span = variable.max - variable.min || 1;
    const delta = ((a[variable.key] ?? 0) - (b[variable.key] ?? 0)) / span;
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function midpoint(
  a: Record<string, number>,
  b: Record<string, number>,
  variables: StudyVariable[]
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const variable of variables) {
    values[variable.key] = ((a[variable.key] ?? 0) + (b[variable.key] ?? 0)) / 2;
  }
  return values;
}

function dedupe(
  candidates: DesignPoint[],
  existing: EvaluatedPoint[],
  variables: StudyVariable[],
  minSeparation = 1e-3
): DesignPoint[] {
  const kept: DesignPoint[] = [];
  for (const candidate of candidates) {
    const tooCloseExisting = existing.some(
      (point) => distance(point.values, candidate.values, variables) < minSeparation
    );
    const tooCloseKept = kept.some((point) => distance(point.values, candidate.values, variables) < minSeparation);
    if (!tooCloseExisting && !tooCloseKept) kept.push(candidate);
  }
  return kept;
}

/**
 * Adaptive refinement: estimate the local λ gradient from nearest-neighbour
 * pairs and propose midpoints across the steepest pairs (chaos onsets, crisis
 * boundaries). Returns up to `maxNew` proposals inside the variable box.
 */
export function adaptiveRefinement(evaluated: EvaluatedPoint[], variables: StudyVariable[], maxNew = 8): DesignPoint[] {
  if (evaluated.length < 2 || variables.length === 0) return [];
  const pairs: { i: number; j: number; gradient: number }[] = [];
  for (let i = 0; i < evaluated.length; i += 1) {
    for (let j = i + 1; j < evaluated.length; j += 1) {
      const d = distance(evaluated[i]!.values, evaluated[j]!.values, variables);
      if (d <= 1e-9 || !Number.isFinite(evaluated[i]!.lambdaMax) || !Number.isFinite(evaluated[j]!.lambdaMax)) continue;
      pairs.push({ i, j, gradient: Math.abs(evaluated[i]!.lambdaMax - evaluated[j]!.lambdaMax) / d });
    }
  }
  pairs.sort((a, b) => b.gradient - a.gradient);
  const proposals = pairs.slice(0, maxNew * 2).map(({ i, j }) => ({
    values: midpoint(evaluated[i]!.values, evaluated[j]!.values, variables),
    origin: 'adaptive' as const,
    replicate: 0
  }));
  return dedupe(proposals, evaluated, variables).slice(0, maxNew);
}

/**
 * Boundary refinement: bisect every neighbour pair whose λ values change sign
 * (the chaotic/regular boundary λ = 0 is the headline object in a study).
 */
export function boundaryRefinement(evaluated: EvaluatedPoint[], variables: StudyVariable[], maxNew = 8): DesignPoint[] {
  if (evaluated.length < 2 || variables.length === 0) return [];
  const crossings: { i: number; j: number; d: number }[] = [];
  for (let i = 0; i < evaluated.length; i += 1) {
    for (let j = i + 1; j < evaluated.length; j += 1) {
      const a = evaluated[i]!.lambdaMax;
      const b = evaluated[j]!.lambdaMax;
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.sign(a) === Math.sign(b)) continue;
      crossings.push({ i, j, d: distance(evaluated[i]!.values, evaluated[j]!.values, variables) });
    }
  }
  // Closest sign-changing pairs first: they bracket the boundary most tightly.
  crossings.sort((a, b) => a.d - b.d);
  const proposals = crossings.slice(0, maxNew * 2).map(({ i, j }) => ({
    values: midpoint(evaluated[i]!.values, evaluated[j]!.values, variables),
    origin: 'boundary' as const,
    replicate: 0
  }));
  return dedupe(proposals, evaluated, variables).slice(0, maxNew);
}

/**
 * Uncertainty-driven resampling: replicate the points whose λ standard error is
 * largest relative to the study's median error (noisy estimates get more data).
 */
export function uncertaintyResampling(evaluated: EvaluatedPoint[], maxNew = 4, relativeThreshold = 2): DesignPoint[] {
  const errors = evaluated
    .map((point) => point.lambdaStdError)
    .filter((stdError) => Number.isFinite(stdError) && stdError > 0);
  if (errors.length === 0) return [];
  const sorted = [...errors].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  if (median <= 0) return [];
  return evaluated
    .filter((point) => point.lambdaStdError > relativeThreshold * median)
    .sort((a, b) => b.lambdaStdError - a.lambdaStdError)
    .slice(0, maxNew)
    .map((point) => ({ values: { ...point.values }, origin: 'uncertainty' as const, replicate: 1 }));
}

export interface BudgetState {
  pointsRun: number;
  elapsedMs: number;
  failures: number;
}

/** Whether the study may continue under its budget, with the limiting reason. */
export function budgetAllows(budget: DesignBudget, state: BudgetState): { allowed: boolean; reason: string } {
  if (state.pointsRun >= budget.maxPoints)
    return { allowed: false, reason: `point budget exhausted (${budget.maxPoints})` };
  if (state.elapsedMs >= budget.maxTimeMs)
    return { allowed: false, reason: `time budget exhausted (${Math.round(budget.maxTimeMs / 1000)}s)` };
  if (state.failures >= budget.maxFailures)
    return { allowed: false, reason: `failure budget exhausted (${budget.maxFailures})` };
  return { allowed: true, reason: 'within budget' };
}

/** Star-discrepancy-flavoured uniformity proxy: max gap between sorted marginals. */
export function marginalUniformity(points: number[][], dim: number): number {
  if (points.length === 0) return 1;
  let worst = 0;
  for (let j = 0; j < dim; j += 1) {
    const sorted = points.map((point) => point[j] ?? 0).sort((a, b) => a - b);
    let maxGap = sorted[0] ?? 0;
    for (let i = 1; i < sorted.length; i += 1) maxGap = Math.max(maxGap, sorted[i]! - sorted[i - 1]!);
    maxGap = Math.max(maxGap, 1 - (sorted[sorted.length - 1] ?? 0));
    worst = Math.max(worst, maxGap);
  }
  return worst;
}
