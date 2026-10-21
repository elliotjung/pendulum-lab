import type { ExperimentStateV1 } from '../../../contracts/experiment';
import type { JsonValue } from '../../../persistence/safe-data';
import type { DiagnosticSeries } from '../core/contracts';
export type { DiagnosticSeries } from '../core/contracts';

export const ADVANCED_DIAGNOSTIC_VERSION = 'advanced-diagnostics-v1';
export const ADVANCED_DIAGNOSTIC_KINDS = [
  'rqa',
  'recurrence-network',
  'correlation-dimension',
  'multifractal',
  'topological-entropy',
  'transfer-operator',
  'clv',
  'ftle',
  'lcs-ridge',
  'basin',
  'uncertainty',
  'wada'
] as const;
export type AdvancedDiagnosticKind = (typeof ADVANCED_DIAGNOSTIC_KINDS)[number];
export const ADVANCED_DIAGNOSTIC_NAMES: Record<AdvancedDiagnosticKind, string> = {
  rqa: '재귀 정량화 (RQA)',
  'recurrence-network': '재귀 네트워크',
  'correlation-dimension': '상관 차원',
  multifractal: '다중 프랙탈 스펙트럼',
  'topological-entropy': '1D 기준 맵 위상 엔트로피',
  'transfer-operator': '1D 기준 맵 전이 연산자',
  clv: '공변 Lyapunov 벡터 (CLV)',
  ftle: '유한 시간 Lyapunov 지수 (FTLE)',
  'lcs-ridge': 'FTLE 격자·능선 후보',
  basin: '반전 영역·경계 엔트로피',
  uncertainty: '반전 경계 불확실성 척도',
  wada: 'Wada 후보 해상도 비교'
};
export const ADVANCED_DIAGNOSTIC_LIMITS = Object.freeze({
  samples: 8192,
  dimension: 256,
  scalars: 1_000_000,
  seriesPoints: 512,
  networkPoints: 256,
  embeddingDimension: 8,
  tangentDimension: 16,
  tangentWork: 2_000_000,
  gridResolution: 32,
  refinedGridResolution: 64,
  gridWork: 1_000_000,
  artifactBytes: 16 * 1024 * 1024
});
export type AdvancedDiagnosticSettings = Record<string, number | string>;
export interface AdvancedDiagnosticRequest {
  id: string;
  kind: AdvancedDiagnosticKind;
  experiment: ExperimentStateV1;
  series: DiagnosticSeries;
  settings: AdvancedDiagnosticSettings;
}
export interface AdvancedDiagnosticResult {
  kind: AdvancedDiagnosticKind;
  summary: string;
  columns: string[];
  units: string[];
  rows: number[][];
  details: JsonValue;
  warnings: string[];
  method: string;
}
export interface AdvancedDiagnosticProgress {
  fraction: number | null;
  work: number;
  phase: 'calculating' | 'complete';
}
export type AdvancedDiagnosticEvent =
  | ({ type: 'progress'; id: string } & AdvancedDiagnosticProgress)
  | { type: 'result'; id: string; result: AdvancedDiagnosticResult }
  | { type: 'error'; id: string; message: string }
  | { type: 'cancelled'; id: string };
export interface AdvancedDiagnosticArtifact {
  schema: 'pendulum-advanced-diagnostic/v1';
  algorithmVersion: typeof ADVANCED_DIAGNOSTIC_VERSION;
  artifactId: string;
  inputRunId: string;
  createdAt: string;
  request: AdvancedDiagnosticRequest;
  result: AdvancedDiagnosticResult;
}
