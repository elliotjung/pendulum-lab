import type { ExperimentStateV1 } from '../../contracts/experiment';

export const OGY_ALGORITHM_VERSION = 'native-ogy-henon/v1';
export const OGY_MAX_STEPS = 3000;
export const OGY_LIMITATIONS = [
  '독립 Hénon 사상의 기준 실험입니다. 현재 선택한 진자의 운동방정식이나 제어기를 바꾸지 않습니다.',
  '실수 saddle 고정점 근방의 선형 OGY 제어입니다. 유한 반복의 capture 판정은 전역 안정성·장기 안정성 증명이 아닙니다.',
  'capture=false이면 조기 이탈할 수 있습니다. 이때 후반 최대 편차 0을 수렴으로 해석하면 안 됩니다.',
  '원 실험은 출처 맥락으로만 보존합니다. Hénon 상태·a·b·제어량과 반복 수는 무차원입니다.'
] as const;

export interface OgySettings {
  readonly a: number;
  readonly b: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly region: number;
  readonly maxDelta: number;
  readonly steps: number;
}
export const defaultOgySettings = (): OgySettings => ({
  a: 1.4,
  b: 0.3,
  offsetX: 0.01,
  offsetY: 0,
  region: 0.05,
  maxDelta: 0.05,
  steps: 1024
});
export interface OgyRequest {
  readonly id: string;
  readonly source: ExperimentStateV1;
  readonly settings: OgySettings;
}
export interface OgySummary {
  readonly captured: boolean;
  readonly settledDeviation: number;
  readonly maxControl: number;
}
/** iteration, x, y, applied delta-a, Euclidean distance to the target. */
export type OgyRow = readonly [number, number, number, number, number];
export interface OgyArtifact {
  readonly schema: 'pendulum-ogy-artifact/v1';
  readonly algorithmVersion: typeof OGY_ALGORITHM_VERSION;
  readonly createdAt: string;
  readonly request: OgyRequest;
  readonly benchmark: 'independent-henon-map';
  readonly nativeExports: readonly string[];
  readonly fixedPoint: readonly number[];
  readonly residual: number;
  readonly unstableEigenvalue: number;
  readonly stableEigenvalue: number;
  readonly parameterSensitivity: readonly [number, number];
  readonly controlled: OgySummary;
  readonly uncontrolled: OgySummary;
  readonly controlledRows: readonly OgyRow[];
  readonly uncontrolledRows: readonly OgyRow[];
  readonly limitations: readonly string[];
}
export type OgyWorkerMessage =
  | { readonly id: string; readonly type: 'progress'; readonly value: number; readonly message: string }
  | { readonly id: string; readonly type: 'result'; readonly artifact: OgyArtifact }
  | { readonly id: string; readonly type: 'error'; readonly message: string };
