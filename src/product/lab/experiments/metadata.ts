import type { ExperimentStateV1 } from '../../contracts/experiment';
import { readDiagnosticConfiguration } from '../../adapters/analysis/core/source-config';
import { createDiagnosticSeries } from '../../adapters/analysis/core/source';
import { fieldStepCount } from '../../adapters/physics/field-contract';
/** Exact existing adapter policies: fixed-grid field stepping, otherwise relative-ulp ceiling. */
export function batchStepCount(experiment: ExperimentStateV1): number {
  if (experiment.runtime.domain === 'evaluation') return 0;
  if (experiment.runtime.domain === 'iteration') return experiment.runtime.iterations;
  const source = readDiagnosticConfiguration(experiment);
  if (source.family === 'field') return fieldStepCount(source.config);
  const ratio = experiment.runtime.duration.value / experiment.runtime.step.value;
  return Math.ceil(ratio - 8 * Number.EPSILON * ratio);
}
/** Static labels/dimensions follow declared model shape; no eigensolver/relaxation is run to read metadata. */
export function batchMetricMetadata(experiment: ExperimentStateV1) {
  const series = createDiagnosticSeries(experiment, []);
  if (experiment.runtime.domain !== 'evaluation') return series;
  const source = readDiagnosticConfiguration(experiment);
  const n =
    source.family === 'field'
      ? source.config.grid.points
      : source.family === 'discrete'
        ? (source.config.matrix?.re.length ?? 0)
        : 0;
  const label =
    experiment.systemId === 'system:unitary-floquet'
      ? 'quasienergy'
      : experiment.systemId === 'system:lattice-fk-limit'
        ? 'omegaSquared'
        : 'theta';
  return {
    ...series,
    labels: Array.from({ length: n }, (_, i) => `${label}-${i + 1}`),
    units: Array<string>(n).fill(experiment.systemId === 'system:frenkel-kontorova' ? 'rad' : '1'),
    ...(experiment.systemId === 'system:frenkel-kontorova' ? { energyUnit: 'normalized' } : {})
  };
}
