import type { ClvResult } from './clv';
import type { FtleField } from './ftle';
import type { LyapunovSpectrumResult } from './lyapunov';

export type ChaosAccelerationTarget = 'lyapunov-spectrum' | 'clv' | 'ftle-field';

export interface AccelerationTolerance {
  spectrum?: number;
  exponents?: number;
  angle?: number;
  field?: number;
  aggregate?: number;
}

export interface AccelerationComparison {
  target: ChaosAccelerationTarget;
  passed: boolean;
  tolerances: Required<AccelerationTolerance>;
  metrics: Record<string, number | boolean>;
  caveat: string;
}

export interface ChaosAccelerationContract {
  target: ChaosAccelerationTarget;
  cpuOracle: string;
  acceleratedCandidate: string;
  acceptanceRule: string;
  caveat: string;
}

export const CHAOS_ACCELERATION_CONTRACTS: readonly ChaosAccelerationContract[] = [
  {
    target: 'lyapunov-spectrum',
    cpuOracle: 'lyapunovSpectrum(state0, rhs, count, settings, jacobian) in f64 variational flow',
    acceleratedCandidate: 'GPU/parallel tangent-frame propagation returning the same LyapunovSpectrumResult schema',
    acceptanceRule:
      'compareLyapunovSpectrumAcceleration(candidate, cpu) must pass on regular, chaotic, and near-zero-spectrum fixtures.',
    caveat:
      'Finite-time spectra are noisy; the comparison validates the same settings and seed, not an asymptotic theorem.'
  },
  {
    target: 'clv',
    cpuOracle: 'covariantLyapunovVectors(...) Ginelli backward pass in f64',
    acceleratedCandidate: 'GPU/parallel QR-window and backward triangular solves returning the same ClvResult schema',
    acceptanceRule:
      'compareClvAcceleration(candidate, cpu) must pass exponent and hyperbolicity-angle gates before UI badges can claim GPU science.',
    caveat: 'CLV vector signs are arbitrary, so the contract compares exponents and sign-invariant angles.'
  },
  {
    target: 'ftle-field',
    cpuOracle: 'doublePendulumFtleField / finiteTimeLyapunov variational STM path in f64',
    acceleratedCandidate: 'GPU flow-map / STM field path returning the same FtleField schema',
    acceptanceRule:
      'compareFtleFieldAcceleration(candidate, cpu) must pass cellwise and aggregate gates, with CPU fallback on failure.',
    caveat:
      'Finite-difference GPU FTLE and variational STM FTLE are different methods; publication claims must name which oracle was used.'
  }
] as const;

const DEFAULT_TOLERANCES: Required<AccelerationTolerance> = {
  spectrum: 5e-3,
  exponents: 5e-3,
  angle: 5e-2,
  field: 5e-2,
  aggregate: 2e-2
};

function resolved(tolerances: AccelerationTolerance = {}): Required<AccelerationTolerance> {
  return { ...DEFAULT_TOLERANCES, ...tolerances };
}

function maxAbsDiff(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  let max = Math.abs(a.length - b.length);
  for (let i = 0; i < n; i += 1) max = Math.max(max, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  return max;
}

function meanAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Math.abs(a.length - b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += Math.abs(Number(a[i] ?? 0) - Number(b[i] ?? 0));
  return sum / n;
}

export function compareLyapunovSpectrumAcceleration(
  candidate: Pick<LyapunovSpectrumResult, 'spectrum' | 'sum' | 'kaplanYorkeDimension'>,
  reference: Pick<LyapunovSpectrumResult, 'spectrum' | 'sum' | 'kaplanYorkeDimension'>,
  tolerances: AccelerationTolerance = {}
): AccelerationComparison {
  const tol = resolved(tolerances);
  const spectrumMaxAbsDiff = maxAbsDiff(candidate.spectrum, reference.spectrum);
  const sumAbsDiff = Math.abs(candidate.sum - reference.sum);
  const kyAbsDiff = Math.abs(candidate.kaplanYorkeDimension - reference.kaplanYorkeDimension);
  const passed = spectrumMaxAbsDiff <= tol.spectrum && sumAbsDiff <= tol.aggregate && kyAbsDiff <= tol.aggregate;
  return {
    target: 'lyapunov-spectrum',
    passed,
    tolerances: tol,
    metrics: { spectrumMaxAbsDiff, sumAbsDiff, kaplanYorkeAbsDiff: kyAbsDiff },
    caveat:
      'Compares finite-time spectrum outputs for identical settings; does not certify a different integration horizon or seed.'
  };
}

export function compareClvAcceleration(
  candidate: Pick<ClvResult, 'exponents' | 'meanHyperbolicityAngle' | 'minHyperbolicityAngle'>,
  reference: Pick<ClvResult, 'exponents' | 'meanHyperbolicityAngle' | 'minHyperbolicityAngle'>,
  tolerances: AccelerationTolerance = {}
): AccelerationComparison {
  const tol = resolved(tolerances);
  const exponentMaxAbsDiff = maxAbsDiff(candidate.exponents, reference.exponents);
  const meanAngleAbsDiff = Math.abs(candidate.meanHyperbolicityAngle - reference.meanHyperbolicityAngle);
  const minAngleAbsDiff = Math.abs(candidate.minHyperbolicityAngle - reference.minHyperbolicityAngle);
  const passed = exponentMaxAbsDiff <= tol.exponents && meanAngleAbsDiff <= tol.angle && minAngleAbsDiff <= tol.angle;
  return {
    target: 'clv',
    passed,
    tolerances: tol,
    metrics: { exponentMaxAbsDiff, meanAngleAbsDiff, minAngleAbsDiff },
    caveat:
      'Compares sign-invariant CLV summary quantities; individual vector signs and ordering must be handled by the caller.'
  };
}

export function compareFtleFieldAcceleration(
  candidate: Pick<FtleField, 'values' | 'width' | 'height' | 'min' | 'max'>,
  reference: Pick<FtleField, 'values' | 'width' | 'height' | 'min' | 'max'>,
  tolerances: AccelerationTolerance = {}
): AccelerationComparison {
  const tol = resolved(tolerances);
  const sameShape =
    candidate.width === reference.width &&
    candidate.height === reference.height &&
    candidate.values.length === reference.values.length;
  const fieldMeanAbsDiff = meanAbsDiff(candidate.values, reference.values);
  let fieldMaxAbsDiff = sameShape ? 0 : Infinity;
  if (sameShape) {
    for (let i = 0; i < candidate.values.length; i += 1) {
      fieldMaxAbsDiff = Math.max(fieldMaxAbsDiff, Math.abs((candidate.values[i] ?? 0) - (reference.values[i] ?? 0)));
    }
  }
  const minAbsDiff = Math.abs(candidate.min - reference.min);
  const maxAbsDiffValue = Math.abs(candidate.max - reference.max);
  const passed =
    sameShape &&
    fieldMaxAbsDiff <= tol.field &&
    fieldMeanAbsDiff <= tol.aggregate &&
    minAbsDiff <= tol.field &&
    maxAbsDiffValue <= tol.field;
  return {
    target: 'ftle-field',
    passed,
    tolerances: tol,
    metrics: { sameShape, fieldMaxAbsDiff, fieldMeanAbsDiff, minAbsDiff, maxAbsDiff: maxAbsDiffValue },
    caveat:
      'Compares like-for-like FTLE fields. Variational STM and finite-difference flow-map fields must not be mixed without a method caveat.'
  };
}
