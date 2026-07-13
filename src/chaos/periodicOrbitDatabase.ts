import { determinant } from './ftle';
import { findPeriodicOrbit, mapJacobianFD, type MapFn } from './chaosControl';

export const PERIODIC_ORBIT_DATABASE_SCHEMA = 'pendulum-periodic-orbits/v1' as const;

export interface PeriodicOrbitRecord {
  id: string;
  period: number;
  dimension: number;
  representative: number[];
  points: number[][];
  residual: number;
  monodromy: number[];
  /** |det(I-M_p)|, the standard prime-cycle stability denominator. */
  stabilityDeterminant: number;
}

export interface PeriodicOrbitDatabase {
  schemaVersion: typeof PERIODIC_ORBIT_DATABASE_SCHEMA;
  dimension: number;
  tolerance: number;
  records: PeriodicOrbitRecord[];
  attempts: number;
  rejected: { unconverged: number; nonFinite: number };
}

export interface PeriodicOrbitDatabaseOptions {
  tolerance?: number;
  maxIterations?: number;
  jacobianStep?: number;
}

function orbitPoints(map: MapFn, point: readonly number[], period: number): number[][] {
  const points: number[][] = [];
  let current = Array.from(point);
  for (let i = 0; i < period; i += 1) {
    points.push(current.slice());
    const next = new Array<number>(point.length).fill(0);
    map(current, next);
    current = next;
  }
  return points;
}

function pointDistance(a: readonly number[], b: readonly number[]): number {
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) distance = Math.max(distance, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return distance;
}

/** Smallest cyclic pointwise infinity-distance between two sampled orbits. */
export function cyclicOrbitDistance(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): number {
  if (a.length !== b.length || a.length === 0 || a[0]!.length !== b[0]!.length) return Infinity;
  let best = Infinity;
  for (let shift = 0; shift < b.length; shift += 1) {
    let distance = 0;
    for (let i = 0; i < a.length; i += 1)
      distance = Math.max(distance, pointDistance(a[i]!, b[(i + shift) % b.length]!));
    best = Math.min(best, distance);
  }
  return best;
}

function divisors(period: number): number[] {
  const out: number[] = [];
  for (let candidate = 1; candidate < period; candidate += 1) if (period % candidate === 0) out.push(candidate);
  return out;
}

function primitivePeriod(points: readonly (readonly number[])[], tolerance: number): number {
  for (const candidate of divisors(points.length)) {
    let repeats = true;
    for (let i = candidate; i < points.length; i += 1) {
      if (pointDistance(points[i]!, points[i % candidate]!) > tolerance) {
        repeats = false;
        break;
      }
    }
    if (repeats) return candidate;
  }
  return points.length;
}

function canonicalRotation(points: readonly (readonly number[])[], tolerance: number): number[][] {
  const token = (point: readonly number[]): string => point.map((value) => Math.round(value / tolerance)).join(',');
  let best = points.map((point) => Array.from(point));
  let bestKey = best.map(token).join('|');
  for (let shift = 1; shift < points.length; shift += 1) {
    const rotated = Array.from({ length: points.length }, (_, index) =>
      Array.from(points[(index + shift) % points.length]!)
    );
    const key = rotated.map(token).join('|');
    if (key < bestKey) {
      best = rotated;
      bestKey = key;
    }
  }
  return best;
}

function multiply(a: readonly number[], b: readonly number[], n: number): number[] {
  const out = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let value = 0;
      for (let k = 0; k < n; k += 1) value += (a[i * n + k] ?? 0) * (b[k * n + j] ?? 0);
      out[i * n + j] = value;
    }
  }
  return out;
}

function monodromyForMap(map: MapFn, points: readonly (readonly number[])[], jacobianStep: number): number[] {
  const n = points[0]!.length;
  let monodromy: number[] = Array.from({ length: n * n }, (_, index) => (Math.floor(index / n) === index % n ? 1 : 0));
  for (const point of points) {
    const jacobian = mapJacobianFD(map, point, jacobianStep).flat();
    monodromy = multiply(jacobian, monodromy, n);
  }
  return monodromy;
}

function stabilityDenominator(monodromy: readonly number[], dimension: number): number {
  const identityMinus = Float64Array.from(
    monodromy,
    (value, index) => (Math.floor(index / dimension) === index % dimension ? 1 : 0) - value
  );
  return Math.abs(determinant(identityMinus, dimension));
}

/**
 * Newton-shoot candidate seeds over requested periods, reduce subperiodic
 * solutions to their primitive orbit, and deduplicate cyclic rotations.
 */
export function buildPeriodicOrbitDatabase(
  map: MapFn,
  seeds: readonly (readonly number[])[],
  periods: readonly number[],
  options: PeriodicOrbitDatabaseOptions = {}
): PeriodicOrbitDatabase {
  if (seeds.length === 0) throw new Error('periodic-orbit database requires at least one seed.');
  const dimension = seeds[0]!.length;
  if (dimension === 0 || seeds.some((seed) => seed.length !== dimension))
    throw new Error('periodic-orbit seeds must have one common positive dimension.');
  if (periods.length === 0 || periods.some((period) => !Number.isInteger(period) || period < 1)) {
    throw new Error('periodic-orbit periods must be positive integers.');
  }
  const tolerance = options.tolerance ?? 1e-8;
  if (!(tolerance > 0) || !Number.isFinite(tolerance))
    throw new Error('periodic-orbit tolerance must be positive and finite.');
  const jacobianStep = options.jacobianStep ?? 1e-7;
  const records: PeriodicOrbitRecord[] = [];
  let unconverged = 0;
  let nonFinite = 0;
  for (const requestedPeriod of periods) {
    for (const seed of seeds) {
      const found = findPeriodicOrbit(map, seed, requestedPeriod, {
        tolerance: Math.min(tolerance * 0.1, 1e-12),
        ...(options.maxIterations === undefined ? {} : { maxIterations: options.maxIterations }),
        jacobianStep
      });
      if (!found.converged) {
        unconverged += 1;
        continue;
      }
      const sampled = orbitPoints(map, found.point, requestedPeriod);
      if (!sampled.flat().every(Number.isFinite)) {
        nonFinite += 1;
        continue;
      }
      const period = primitivePeriod(sampled, tolerance);
      const points = canonicalRotation(sampled.slice(0, period), tolerance);
      if (records.some((record) => record.period === period && cyclicOrbitDistance(record.points, points) <= tolerance))
        continue;
      const monodromy = monodromyForMap(map, points, jacobianStep);
      const key = points.map((point) => point.map((value) => Math.round(value / tolerance)).join(',')).join('|');
      records.push({
        id: `p${period}:${key}`,
        period,
        dimension,
        representative: points[0]!.slice(),
        points,
        residual: found.residual,
        monodromy,
        stabilityDeterminant: stabilityDenominator(monodromy, dimension)
      });
    }
  }
  records.sort((a, b) => a.period - b.period || a.id.localeCompare(b.id));
  return {
    schemaVersion: PERIODIC_ORBIT_DATABASE_SCHEMA,
    dimension,
    tolerance,
    records,
    attempts: seeds.length * periods.length,
    rejected: { unconverged, nonFinite }
  };
}

export interface CycleExpansionOptions {
  maxPeriod?: number;
  /** Exponential time weight exp(-s n_p), default s=0. */
  decayRate?: number;
  marginalFloor?: number;
}

export interface CycleExpansionObservableResult {
  weightedAverage: number;
  totalWeight: number;
  usedOrbits: number;
  /** Coefficients of product_p (1 - t_p z^n_p), truncated at maxPeriod. */
  zetaCoefficients: number[];
  /** beta derivative coefficients when t_p -> t_p exp(beta n_p A_p). */
  observableDerivativeCoefficients: number[];
  primeCycles: Array<{ id: string; period: number; average: number; weight: number }>;
  maxPeriod: number;
  caveat: string;
}

/**
 * Finite-prime-cycle observable demo.  It returns both the genuine truncated
 * Euler-product coefficients and the transparent leading prime-weighted
 * average sum_p t_p A_p / sum_p t_p.  Curvature convergence must be checked by
 * increasing maxPeriod before treating the average as a research result.
 */
export function cycleExpansionObservable(
  records: readonly PeriodicOrbitRecord[],
  observable: (point: readonly number[]) => number,
  options: CycleExpansionOptions = {}
): CycleExpansionObservableResult {
  if (records.length === 0) throw new Error('cycleExpansionObservable requires at least one prime orbit.');
  const maxPeriod = options.maxPeriod ?? Math.max(...records.map((record) => record.period));
  if (!Number.isInteger(maxPeriod) || maxPeriod < 1)
    throw new Error('cycle-expansion maxPeriod must be a positive integer.');
  const decayRate = options.decayRate ?? 0;
  const floor = options.marginalFloor ?? 1e-10;
  const primeCycles: Array<{ id: string; period: number; average: number; weight: number }> = [];
  for (const record of records) {
    if (record.period > maxPeriod || !(record.stabilityDeterminant > floor)) continue;
    const values = record.points.map(observable);
    if (!values.every(Number.isFinite)) throw new Error(`cycle observable is non-finite on ${record.id}.`);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const weight = Math.exp(-decayRate * record.period) / record.stabilityDeterminant;
    primeCycles.push({ id: record.id, period: record.period, average, weight });
  }
  if (primeCycles.length === 0)
    throw new Error('cycleExpansionObservable found no non-marginal orbit inside maxPeriod.');
  let coefficients = new Array<number>(maxPeriod + 1).fill(0);
  let derivatives = new Array<number>(maxPeriod + 1).fill(0);
  coefficients[0] = 1;
  for (const cycle of primeCycles) {
    const next = coefficients.slice();
    const nextDerivative = derivatives.slice();
    for (let order = cycle.period; order <= maxPeriod; order += 1) {
      next[order] = (next[order] ?? 0) - cycle.weight * (coefficients[order - cycle.period] ?? 0);
      nextDerivative[order] =
        (nextDerivative[order] ?? 0) -
        cycle.weight * (derivatives[order - cycle.period] ?? 0) -
        cycle.weight * cycle.period * cycle.average * (coefficients[order - cycle.period] ?? 0);
    }
    coefficients = next;
    derivatives = nextDerivative;
  }
  const totalWeight = primeCycles.reduce((sum, cycle) => sum + cycle.weight, 0);
  const weightedAverage = primeCycles.reduce((sum, cycle) => sum + cycle.weight * cycle.average, 0) / totalWeight;
  return {
    weightedAverage,
    totalWeight,
    usedOrbits: primeCycles.length,
    zetaCoefficients: coefficients,
    observableDerivativeCoefficients: derivatives,
    primeCycles,
    maxPeriod,
    caveat:
      'Finite prime-cycle truncation: inspect coefficient decay and max-period stability. The weightedAverage is the leading prime-weight approximation; full cycle-expansion curvature corrections are represented by the returned Euler-product coefficients, not silently folded into that scalar.'
  };
}
