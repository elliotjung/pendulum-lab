import type { ExperimentStateV1 } from '../../../contracts/experiment';
import type { ObservationArtifact } from '../../../observations/types';
import type { DoublePendulumParameterName } from '../../../../research/parameterEstimation';

export const INVERSE_VERSION = 'observations-inverse-uq-v1';
export const INVERSE_LIMITS = Object.freeze({
  artifactBytes: 24 * 1024 * 1024,
  samples: 256,
  observations: 1024,
  variables: 3,
  iterations: 80,
  work: 4_000_000,
  forwardSteps: 4096
});
export interface EstimateSettings {
  readonly kind: 'estimate';
  readonly observation: ObservationArtifact;
  readonly parameters: readonly {
    readonly key: DoublePendulumParameterName;
    readonly min: number;
    readonly max: number;
  }[];
  readonly maxIterations: number;
}
export interface UqVariable {
  readonly group: 'parameters' | 'initialConditions';
  readonly key: string;
  readonly index?: number;
  readonly min: number;
  readonly max: number;
}
export interface UqSettings {
  readonly kind: 'sobol' | 'pce';
  readonly variables: readonly UqVariable[];
  readonly metric: { readonly index: number; readonly statistic: 'final' | 'mean' | 'rms' };
  /** Sobol base size N, or PCE training size. PCE adds max(8,ceil(N/4)) validation runs. */
  readonly samples: number;
  readonly degree: number;
  /** PCE design seed. Native Sobol uses its fixed deterministic low-discrepancy sequence. */
  readonly seed: string;
}
export interface InverseRequest {
  readonly schema: 'pendulum-inverse-request/v1';
  readonly id: string;
  readonly experiment: ExperimentStateV1;
  readonly settings: EstimateSettings | UqSettings;
}
export interface InverseResult {
  readonly schema: 'pendulum-inverse-result/v1';
  readonly algorithmVersion: typeof INVERSE_VERSION;
  readonly id: string;
  readonly inputId: string;
  readonly observationId?: string;
  readonly kind: InverseRequest['settings']['kind'];
  readonly request: InverseRequest;
  readonly columns: readonly string[];
  readonly units: readonly string[];
  readonly rows: readonly (readonly number[])[];
  readonly details: readonly string[];
  readonly warnings: readonly string[];
  /** UQ: actual forward evaluations; estimation: completed native optimizer outer iterations. */
  readonly evaluations: number;
  readonly payload: Readonly<Record<string, unknown>>;
}
export type InverseEvent =
  | { type: 'progress'; id: string; fraction: number | null; work: number }
  | { type: 'result'; id: string; result: InverseResult }
  | { type: 'error'; id: string; message: string }
  | { type: 'cancelled'; id: string };
export type InverseProgress = (value: { fraction: number | null; work: number }) => void;
