import type { Point2D } from '../viz/poincare';

export type EnsembleSampleWarning = 'insufficient-sample' | 'small-sample' | null;

export interface EnsembleSeparationQuantiles {
  p05: number | null;
  p50: number | null;
  p95: number | null;
  requestedCount: number;
  validCount: number;
  excludedCount: number;
  warning: EnsembleSampleWarning;
}

export interface EnsembleSeparationSample extends EnsembleSeparationQuantiles {
  time: number;
}

/** R-7 / NumPy-linear quantile over an already sorted finite sample. */
export function type7Quantile(sorted: readonly number[], probability: number): number | null {
  if (sorted.length === 0) return null;
  const q = Math.max(0, Math.min(1, probability));
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const fraction = index - lower;
  const a = sorted[lower]!;
  const b = sorted[Math.min(sorted.length - 1, lower + 1)]!;
  return a + fraction * (b - a);
}

/**
 * Summarize physical endpoint separation in metres. Members containing a
 * non-finite endpoint are excluded at that instant and reported explicitly.
 */
export function endpointSeparationQuantiles(
  reference: Point2D,
  members: readonly Point2D[],
  requestedCount = members.length,
  smallSampleThreshold = 10
): EnsembleSeparationQuantiles {
  const separations: number[] = [];
  if (Number.isFinite(reference.x) && Number.isFinite(reference.y)) {
    for (const member of members) {
      if (!Number.isFinite(member.x) || !Number.isFinite(member.y)) continue;
      const distance = Math.hypot(member.x - reference.x, member.y - reference.y);
      if (Number.isFinite(distance)) separations.push(distance);
    }
  }
  separations.sort((left, right) => left - right);
  const validCount = separations.length;
  const requested = Math.max(0, Math.round(requestedCount));
  return {
    p05: type7Quantile(separations, 0.05),
    p50: type7Quantile(separations, 0.5),
    p95: type7Quantile(separations, 0.95),
    requestedCount: requested,
    validCount,
    excludedCount: Math.max(0, requested - validCount),
    warning: validCount < 3 ? 'insufficient-sample' : validCount < smallSampleThreshold ? 'small-sample' : null
  };
}
