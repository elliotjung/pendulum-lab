import type { BifurcationColumn } from './poincare';

/**
 * Automated bifurcation detection on a computed bifurcation diagram: scan the
 * per-parameter attractor columns for changes in the number of distinct
 * section values (period-doubling cascades, periodic windows) and for the
 * periodic→chaotic transition (attractor count exceeding a band threshold).
 */

export type BifurcationEventType =
  'period-doubling' | 'period-halving' | 'chaos-onset' | 'chaos-exit' | 'attractor-change';

export interface BifurcationEvent {
  type: BifurcationEventType;
  /** Parameter value where the new regime is first seen. */
  param: number;
  /** Parameter of the previous column (the event lies in between). */
  previousParam: number;
  fromCount: number;
  toCount: number;
}

export interface BifurcationDetectionOptions {
  /** Distinct-value tolerance when counting attractor branches. Default 1e-3. */
  tolerance?: number;
  /** Columns with more distinct values than this count as chaotic. Default 24. */
  chaosCountThreshold?: number;
}

export interface BifurcationDetectionResult {
  events: BifurcationEvent[];
  /** Distinct-value count per column (aligned with `params`). */
  counts: number[];
  params: number[];
  chaoticColumns: number;
  method: string;
  caveat: string;
}

function distinctCount(values: readonly number[], tolerance: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let count = 1;
  let anchor = sorted[0]!;
  for (let i = 1; i < sorted.length; i += 1) {
    if (Math.abs(sorted[i]! - anchor) > tolerance) {
      count += 1;
      anchor = sorted[i]!;
    }
  }
  return count;
}

export function detectBifurcations(
  columns: readonly Pick<BifurcationColumn<number>, 'param' | 'values'>[],
  options: BifurcationDetectionOptions = {}
): BifurcationDetectionResult {
  const tolerance = options.tolerance ?? 1e-3;
  const chaosThreshold = options.chaosCountThreshold ?? 24;
  const params = columns.map((column) => column.param);
  const counts = columns.map((column) => distinctCount(column.values, tolerance));
  const events: BifurcationEvent[] = [];
  let chaoticColumns = 0;

  for (let i = 0; i < counts.length; i += 1) {
    if (counts[i]! >= chaosThreshold) chaoticColumns += 1;
    if (i === 0) continue;
    const from = counts[i - 1]!;
    const to = counts[i]!;
    if (from === to) continue;
    const fromChaotic = from >= chaosThreshold;
    const toChaotic = to >= chaosThreshold;
    const base = { param: params[i]!, previousParam: params[i - 1]!, fromCount: from, toCount: to };
    if (!fromChaotic && toChaotic) events.push({ type: 'chaos-onset', ...base });
    else if (fromChaotic && !toChaotic) events.push({ type: 'chaos-exit', ...base });
    else if (to === from * 2) events.push({ type: 'period-doubling', ...base });
    else if (from === to * 2) events.push({ type: 'period-halving', ...base });
    else events.push({ type: 'attractor-change', ...base });
  }
  return {
    events,
    counts,
    params,
    chaoticColumns,
    method: `distinct section values per parameter (tolerance ${tolerance}); chaos when count >= ${chaosThreshold}`,
    caveat:
      'Counting distinct stroboscopic values is resolution- and transient-limited; events between sampled parameters are bracketed, not located. Refine the parameter grid around reported events.'
  };
}
