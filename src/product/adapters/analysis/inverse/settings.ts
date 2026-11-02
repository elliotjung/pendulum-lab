import { builderFields } from '../../../lab/experiments/builders';
import type { ExperimentStateV1 } from '../../../contracts/experiment';
import type { ObservationArtifact } from '../../../observations/types';
import type { EstimateSettings, UqSettings } from './contracts';

export function defaultEstimateSettings(observation: ObservationArtifact): EstimateSettings {
  return { kind: 'estimate', observation, parameters: [{ key: 'g', min: 0.1, max: 30 }], maxIterations: 30 };
}
export function defaultInverseSettings(experiment: ExperimentStateV1, kind: 'sobol' | 'pce'): UqSettings {
  const fields = builderFields(experiment);
  const preferred = fields.filter((v) => v.group === 'initialConditions').slice(0, 2);
  const selected = preferred.length ? preferred : fields.slice(0, 1);
  return {
    kind,
    variables: selected.map((field) => ({
      group: field.group,
      key: field.key,
      ...(field.index === undefined ? {} : { index: field.index }),
      min: field.value - 0.01,
      max: field.value + 0.01
    })),
    metric: { index: 0, statistic: 'final' },
    samples: 32,
    degree: 2,
    seed: 'inverse-22'
  };
}
