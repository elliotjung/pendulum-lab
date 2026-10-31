import type { ExperimentStateV1 } from '../../../contracts/experiment';
import type { JsonValue } from '../../../persistence/safe-data';

export const STABILITY_VERSION = 'stability-workflow-v1';
export const STABILITY_KINDS = [
  'fixed-point',
  'periodic-shooting',
  'floquet',
  'melnikov',
  'continuation',
  'pseudo-arclength',
  'branch-switch',
  'neimark-sacker',
  'torus',
  'arnold-tongue',
  'codim-two'
] as const;
export type StabilityKind = (typeof STABILITY_KINDS)[number];
export const STABILITY_NAMES: Record<StabilityKind, string> = {
  'fixed-point': '반환 맵 고정점',
  'periodic-shooting': '주기궤도 shooting',
  floquet: 'Floquet 안정성',
  melnikov: 'Melnikov 약섭동 진단',
  continuation: '매개변수 continuation',
  'pseudo-arclength': 'Pseudo-arclength · fold 통과',
  'branch-switch': 'Branch switching · 대칭 깨짐',
  'neimark-sacker': 'Neimark–Sacker 후보',
  torus: '불변 원 · torus 단면',
  'arnold-tongue': 'Arnold tongue · 주파수 잠김',
  'codim-two': '2매개변수 유한시간 안정성 지도'
};
export const STABILITY_LIMITS = Object.freeze({
  artifactBytes: 8 * 1024 * 1024,
  branchPoints: 256,
  rows: 8192,
  dimension: 8,
  work: 2_000_000
});
export type StabilitySettings = Record<string, number | string>;
export interface StabilityRestart {
  artifactId: string;
  inputRunId: string;
  source: string;
  state: number[];
  parameter: number;
  direction: 1 | -1;
}
export interface StabilityRequest {
  id: string;
  kind: StabilityKind;
  experiment: ExperimentStateV1;
  settings: StabilitySettings;
  restart?: StabilityRestart;
}
export interface StabilityPoint {
  parameter: number;
  state: number[];
  residual: number;
  converged: boolean;
  stable: boolean | null;
}
export interface StabilityLog {
  step: number;
  residual: number;
  converged: boolean;
}
export interface StabilityResult {
  kind: StabilityKind;
  source: string;
  summary: string;
  columns: string[];
  units: string[];
  rows: number[][];
  details: JsonValue;
  warnings: string[];
  method: string;
  branch: StabilityPoint[];
  log: StabilityLog[];
  status: 'converged' | 'partial' | 'nonconverged' | 'diagnostic';
}
export interface StabilityProgress {
  fraction: number | null;
  work: number;
  phase: 'calculating' | 'complete';
}
export type StabilityEvent =
  | ({ type: 'progress'; id: string } & StabilityProgress)
  | { type: 'result'; id: string; result: StabilityResult }
  | { type: 'error'; id: string; message: string }
  | { type: 'cancelled'; id: string };
export interface StabilityArtifact {
  schema: 'pendulum-stability-workflow/v1';
  algorithmVersion: typeof STABILITY_VERSION;
  artifactId: string;
  inputRunId: string;
  createdAt: string;
  request: StabilityRequest;
  result: StabilityResult;
}
