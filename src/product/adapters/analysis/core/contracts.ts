import type { ExperimentStateV1 } from '../../../contracts/experiment';
import type { JsonValue } from '../../../persistence/safe-data';

export const CORE_DIAGNOSTIC_VERSION = 'core-diagnostics-v1';
export const CORE_DIAGNOSTIC_KINDS = [
  'state-time',
  'energy',
  'phase',
  'fft',
  'naff',
  'poincare',
  'lyapunov',
  'sali',
  'fli',
  'zero-one',
  'shadowing'
] as const;
export type CoreDiagnosticKind = (typeof CORE_DIAGNOSTIC_KINDS)[number];
export const CORE_DIAGNOSTIC_NAMES: Record<CoreDiagnosticKind, string> = {
  'state-time': '상태 / 시간',
  energy: '에너지 변화',
  phase: '위상공간',
  fft: 'FFT 스펙트럼',
  naff: 'NAFF 주파수',
  poincare: 'Poincaré 단면',
  lyapunov: 'Lyapunov spectrum',
  sali: 'SALI',
  fli: 'FLI',
  'zero-one': '0–1 검사',
  shadowing: '궤도 신뢰 시간'
};
export const CORE_DIAGNOSTIC_LIMITS = Object.freeze({
  samples: 8192,
  dimension: 256,
  scalars: 1_000_000,
  steps: 100_000,
  tangentDimension: 32,
  tangentWork: 2_000_000,
  artifactBytes: 16 * 1024 * 1024
});
export type CoreDiagnosticSettings = Record<string, number | string>;
/** Observations are detached native samples; no implicit resampling or coordinate conversion. */
export interface DiagnosticSeries {
  axisUnit: 's' | 'iteration' | 'normalized-time';
  labels: string[];
  units: string[];
  times: number[];
  states: number[][];
  energy?: number[];
  energyUnit?: string;
  warnings: string[];
}
export interface CoreDiagnosticRequest {
  id: string;
  kind: CoreDiagnosticKind;
  experiment: ExperimentStateV1;
  series: DiagnosticSeries;
  settings: CoreDiagnosticSettings;
}
/** Rows and units are an explicit plotting projection; details preserve native estimator output. */
export interface CoreDiagnosticResult {
  kind: CoreDiagnosticKind;
  summary: string;
  columns: string[];
  units: string[];
  rows: number[][];
  details: JsonValue;
  warnings: string[];
  method: string;
}
export interface CoreDiagnosticProgress {
  fraction: number | null;
  work: number;
  phase: 'calculating' | 'complete';
}
export type CoreDiagnosticEvent =
  | ({ type: 'progress'; id: string } & CoreDiagnosticProgress)
  | { type: 'result'; id: string; result: CoreDiagnosticResult }
  | { type: 'error'; id: string; message: string }
  | { type: 'cancelled'; id: string };
export interface CoreDiagnosticArtifact {
  schema: 'pendulum-core-diagnostic/v1';
  algorithmVersion: typeof CORE_DIAGNOSTIC_VERSION;
  artifactId: string;
  inputRunId: string;
  createdAt: string;
  request: CoreDiagnosticRequest;
  result: CoreDiagnosticResult;
}
