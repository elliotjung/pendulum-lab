import type { LearningData, LearningSettings } from './learning-contracts';
import type { EigenOperator, EigenSettings } from './eigen-contracts';

export const DATA_DRIVEN_VERSION = 'data-driven-krylov-v1';
export const DATA_DRIVEN_LIMITS = Object.freeze({ bytes: 16 * 1024 * 1024, nodes: 500_000, array: 32768 });
export interface DataDrivenOutput {
  model: unknown;
  metrics: Record<string, number>;
  columns: string[];
  units: string[];
  rows: number[][];
  warnings: string[];
  details: string[];
}
export interface DataDrivenRequest {
  schema: 'pendulum-data-driven-request/v1';
  id: string;
  mode: 'train' | 'evaluate';
  input:
    | { kind: 'learning'; data: LearningData; settings: LearningSettings }
    | { kind: 'eigen'; operator: EigenOperator; settings: EigenSettings };
  model?: unknown;
  parentId?: string;
}
export interface DataDrivenResult {
  schema: 'pendulum-data-driven-result/v1';
  algorithmVersion: typeof DATA_DRIVEN_VERSION;
  id: string;
  inputId: string;
  request: DataDrivenRequest;
  output: DataDrivenOutput;
}
export type DataDrivenProgress = (event: { fraction: number | null; work: number }) => void;
export type DataDrivenEvent =
  | { type: 'progress'; id: string; fraction: number | null; work: number }
  | { type: 'result'; id: string; result: DataDrivenResult }
  | { type: 'error'; id: string; message: string }
  | { type: 'cancelled'; id: string };
