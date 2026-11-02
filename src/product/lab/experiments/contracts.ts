import type { ExperimentStateV1 } from '../../contracts/experiment';

export const BATCH_VERSION = 'batch-experiments-v1';
export const BATCH_LIMITS = Object.freeze({
  runs: 512,
  concurrency: 4,
  axes: 3,
  steps: 100_000,
  work: 4_000_000,
  dimension: 512,
  artifactBytes: 16 * 1024 * 1024
});
export const BATCH_KINDS = ['paired', 'grid', 'log', 'lhs', 'ensemble', 'integrators'] as const;
export type BatchKind = (typeof BATCH_KINDS)[number];
export interface BatchField {
  readonly group: 'parameters' | 'initialConditions';
  readonly key: string;
  readonly index?: number;
  readonly unit: string;
  readonly value: number;
}
export interface BatchAxis {
  readonly group: BatchField['group'];
  readonly key: string;
  readonly index?: number;
  readonly start: number;
  readonly end: number;
  readonly count: number;
}
export interface BatchBuilderSettings {
  readonly kind: BatchKind;
  readonly axes: readonly BatchAxis[];
  readonly count: number;
  readonly seed: string;
  readonly concurrency: number;
  readonly integratorIds: readonly string[];
}
export interface BatchAssignment {
  readonly field: string;
  readonly unit: string;
  readonly value: number | string;
}
export interface BatchRun {
  readonly id: string;
  readonly index: number;
  readonly experiment: ExperimentStateV1;
  readonly assignments: readonly BatchAssignment[];
}
export interface BatchPlan {
  readonly schema: 'pendulum-batch-plan/v1';
  readonly algorithmVersion: typeof BATCH_VERSION;
  readonly id: string;
  readonly sourceInputId: string;
  readonly source: ExperimentStateV1;
  readonly settings: BatchBuilderSettings;
  readonly runs: readonly BatchRun[];
  readonly estimatedWork: number;
  readonly warnings: readonly string[];
}
export interface BatchMetric {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly initial: number;
  readonly final: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly rms: number;
}
export interface BatchSummary {
  readonly steps: number;
  readonly sampleCount: number;
  readonly axisUnit: string;
  readonly axisStart: number;
  readonly axisEnd: number;
  readonly metrics: readonly BatchMetric[];
  readonly energy?: {
    readonly initial: number;
    readonly final: number;
    readonly change: number;
    readonly unit: string;
  };
  readonly warnings: readonly string[];
  readonly evaluation: boolean;
}
export interface BatchRunResult {
  readonly schema: 'pendulum-batch-run/v1';
  readonly algorithmVersion: typeof BATCH_VERSION;
  readonly runId: string;
  readonly batchId: string;
  readonly inputIndex: number;
  readonly summary: BatchSummary;
}
export type BatchRunStatus = 'pending' | 'running' | 'completed' | 'failed';
export interface BatchRunState {
  readonly id: string;
  readonly index: number;
  readonly status: BatchRunStatus;
  readonly attempts: number;
  readonly progress: number;
  readonly error?: string;
  readonly result?: BatchRunResult;
}
export interface BatchAggregateMetric {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly standardDeviation: number;
}
export interface BatchAggregate {
  readonly artifactId: string;
  readonly sourceInputId: string;
  readonly childRunIds: readonly string[];
  readonly completed: number;
  readonly failed: number;
  readonly pending: number;
  readonly metrics: readonly BatchAggregateMetric[];
  readonly pairedDifference?: readonly {
    readonly key: string;
    readonly label: string;
    readonly unit: string;
    readonly value: number;
  }[];
  readonly comparisons?: readonly {
    readonly referenceRunId: string;
    readonly runId: string;
    readonly metrics: readonly {
      readonly key: string;
      readonly label: string;
      readonly unit: string;
      readonly value: number;
    }[];
  }[];
  readonly warnings: readonly string[];
}
export type BatchStatus = 'ready' | 'running' | 'cancelled' | 'completed' | 'partial';
export interface BatchSnapshot {
  readonly schema: 'pendulum-batch/v1';
  readonly algorithmVersion: typeof BATCH_VERSION;
  readonly plan: BatchPlan;
  readonly status: BatchStatus;
  readonly progress: number;
  readonly runs: readonly BatchRunState[];
  readonly aggregate: BatchAggregate;
}
export type BatchWorkerEvent =
  | { type: 'progress'; id: string; fraction: number }
  | { type: 'result'; id: string; result: BatchRunResult }
  | { type: 'error'; id: string; message: string };
export interface BatchWorkerRequest {
  readonly batchId: string;
  readonly run: BatchRun;
}
export interface BatchJob {
  dispose(): void;
}
export type BatchExecutor = (request: BatchWorkerRequest, onEvent: (event: BatchWorkerEvent) => void) => BatchJob;
