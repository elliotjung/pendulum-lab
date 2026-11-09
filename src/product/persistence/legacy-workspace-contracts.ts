import type { ExperimentStateV1 } from '../contracts/experiment';
import type { ResearchProjectBundle } from '../provenance/contracts';
import type { JsonValue } from './safe-data';

export const LEGACY_WORKSPACE_SCHEMA = 'pendulum-legacy-workspace-migration/v1' as const;
export const LEGACY_WORKSPACE_DATABASE = 'pendulum-lab-product-legacy-migrations-v1';
export interface LegacyWorkspaceOptions {
  readonly sourceId: string;
  readonly durationSeconds: number;
  readonly importedAt?: string;
  readonly kind?: 'workspace' | 'research-db';
}
export type LegacyWorkspaceRecordKind =
  | 'project'
  | 'session'
  | 'workspace'
  | 'experiment'
  | 'run-log'
  | 'plan'
  | 'point'
  | 'metrics'
  | 'image'
  | 'archive'
  | 'settings'
  | 'external-reference'
  | 'unknown';
export interface LegacyWorkspaceRecord {
  readonly id: string;
  readonly sourcePath: string;
  readonly sourceId: string | null;
  readonly kind: LegacyWorkspaceRecordKind;
  readonly title: string;
  readonly payload: JsonValue;
  readonly sourceMetadata: JsonValue;
  readonly parentId: string | null;
  readonly links: readonly string[];
  readonly canonical: ExperimentStateV1 | null;
  readonly status: 'mapped' | 'unresolved';
  readonly issues: readonly string[];
  readonly asset: {
    readonly filename: string;
    readonly mediaType: string;
    readonly bytes: number;
    readonly sha256: string;
  } | null;
}
export interface LegacyWorkspaceMapping {
  readonly recordId: string;
  readonly partId: string;
  readonly sessionId: string;
  readonly runId: string;
  readonly artifactIds: readonly string[];
}
export interface LegacyWorkspacePreview {
  readonly schema: typeof LEGACY_WORKSPACE_SCHEMA;
  readonly id: string;
  readonly sourceKind: 'workspace' | 'research-db';
  readonly sourceSchema: string;
  readonly sourceBytes: number;
  readonly sourceSha256: string;
  readonly importedAt: string;
  readonly options: LegacyWorkspaceOptions;
  readonly records: readonly LegacyWorkspaceRecord[];
  readonly parts: readonly ResearchProjectBundle[];
  readonly mappings: readonly LegacyWorkspaceMapping[];
  readonly warnings: readonly string[];
}
export interface LegacyWorkspaceAdoption {
  readonly preview: LegacyWorkspacePreview;
  readonly source: Uint8Array;
}
export interface LegacyWorkspaceArchiveIndex {
  readonly id: string;
  readonly sourceKind: 'workspace' | 'research-db';
  readonly sourceBytes: number;
  readonly sourceSha256: string;
  readonly importedAt: string;
  readonly records: number;
  readonly parts: number;
}
export function workspaceAbort(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException('변환을 취소했습니다. 원본과 현재 프로젝트는 그대로입니다.', 'AbortError');
}
