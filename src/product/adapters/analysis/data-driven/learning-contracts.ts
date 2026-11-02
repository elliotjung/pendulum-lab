export const LEARNING_VERSION = 'data-driven-learning-v1';
export const LEARNING_METHODS = ['sindy', 'dmd', 'havok', 'reservoir', 'hamiltonian'] as const;
export type LearningMethod = (typeof LEARNING_METHODS)[number];
export interface LearningData {
  times: number[];
  values: number[][];
  labels: string[];
  units: string[];
  axisUnit: string;
  provenance: Record<string, unknown>;
}
export interface LearningSettings {
  method: LearningMethod;
  selection: number[];
  sliceStart: number;
  sliceEnd: number;
  splitIndex: number;
  preprocessing: 'none' | 'standardize';
  seed: string;
  polynomialDegree: number;
  includeTrig: boolean;
  threshold: number;
  ridge: number;
  delays: number;
  rank: number;
  reservoirSize: number;
  washout: number;
  rolloutSteps: number;
}
export interface LearningPreprocessing {
  kind: 'none' | 'standardize';
  mean: number[];
  scale: number[];
}
export interface LearningModel {
  schema: 'pendulum-learning-model/v1';
  algorithmVersion: typeof LEARNING_VERSION;
  method: LearningMethod;
  dimension: number;
  selection: number[];
  labels: string[];
  units: string[];
  preprocessing: LearningPreprocessing;
  trainingIdentity: string;
  settings: LearningSettings;
  payload: unknown;
}
export interface LearningOutput {
  model: LearningModel;
  metrics: Record<string, number>;
  columns: string[];
  units: string[];
  rows: number[][];
  warnings: string[];
  details: string[];
}
export function learningDefaults(data: LearningData, method: LearningMethod = 'sindy'): LearningSettings {
  return {
    method,
    selection: method === 'havok' ? [0] : data.labels.map((_, i) => i).slice(0, 4),
    sliceStart: 0,
    sliceEnd: data.values.length,
    splitIndex: Math.floor(data.values.length * 0.7),
    preprocessing: 'none',
    seed: 'learning-1',
    polynomialDegree: method === 'hamiltonian' ? 4 : 2,
    includeTrig: false,
    threshold: 0.05,
    ridge: 1e-8,
    delays: 12,
    rank: 2,
    reservoirSize: 16,
    washout: 12,
    rolloutSteps: Math.max(1, Math.min(32, data.values.length - Math.floor(data.values.length * 0.7) - 1))
  };
}
