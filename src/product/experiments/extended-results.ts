import type { ExperimentStateV1 } from '../contracts/experiment';
import type { ExtendedFields } from './extended-config';
import type { BatchSnapshot } from '../lab/experiments/contracts';
import type { AdaptiveReplayArchiveV1 } from './adaptive-replay-archive';
export interface ExtendedMetric {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
}
export interface ExtendedTable {
  readonly id: string;
  readonly title: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly (number | string)[])[];
}
export interface ExtendedTrace {
  readonly time: number;
  readonly state: readonly number[];
  readonly energy: number;
  readonly positions: readonly { readonly x: number; readonly y: number; readonly z?: number }[];
  readonly tensions?: readonly number[];
  readonly phase?: string;
  readonly constraint?: number;
  readonly verticalMomentum?: number;
  readonly unitConstraint?: number;
  readonly tangentConstraint?: number;
  readonly poleProximity?: number;
}
export interface ExtendedCompanion {
  readonly id: string;
  readonly settings: Readonly<Record<string, number | string>>;
  readonly description: string;
}
export interface ExtendedResult {
  readonly schema: 'pendulum-learn-diagnostics/v1';
  readonly algorithmVersion: 'learn-extended-v1';
  readonly unitId: string;
  readonly canonical: ExperimentStateV1;
  readonly fields: ExtendedFields;
  readonly metrics: readonly ExtendedMetric[];
  readonly tables: readonly ExtendedTable[];
  readonly trace: readonly ExtendedTrace[];
  readonly warnings: readonly string[];
  readonly companions: readonly ExtendedCompanion[];
  readonly batch?: BatchSnapshot;
  readonly adaptiveArchive?: AdaptiveReplayArchiveV1;
}
export const extendedMetric = (id: string, label: string, value: number, unit: string): ExtendedMetric => {
  if (!Number.isFinite(value)) throw new Error(`${label}의 진단값이 유한하지 않습니다.`);
  return { id, label, value: value === 0 ? 0 : value, unit };
};
