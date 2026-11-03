import type { ExperimentStateV1 } from '../contracts/experiment';
import type { DiagnosticSeries } from '../adapters/analysis/core/contracts';
import type { ZipEntryInput } from '../../research/zipBundle';

export const RESEARCH_PROJECT_SCHEMA = 'pendulum-research-project/v1' as const;
export const RESEARCH_PACKAGE_SCHEMA = 'pendulum-research-package/v1' as const;
export const PROJECT_LIMITS = Object.freeze({
  manifestBytes: 2 * 1024 * 1024,
  fileBytes: 24 * 1024 * 1024,
  archiveBytes: 64 * 1024 * 1024,
  files: 512,
  sessions: 64,
  runs: 512,
  artifacts: 384,
  notebook: 128,
  figures: 64
});
export type ResearchArtifactKind =
  | 'configuration'
  | 'series'
  | 'core'
  | 'advanced'
  | 'stability'
  | 'batch'
  | 'inverse'
  | 'data-driven'
  | 'observation'
  | 'legacy'
  | 'attachment';
export interface ResearchSession {
  id: string;
  title: string;
  createdAt: string;
}
export interface ResearchRun {
  id: string;
  sessionId: string;
  label: string;
  createdAt: string;
  experiment?: ExperimentStateV1;
  status: 'completed' | 'partial' | 'failed';
  artifactIds: string[];
  note: string;
}
export interface ResearchArtifact {
  id: string;
  runId: string;
  kind: ResearchArtifactKind;
  schema: string;
  filename: string;
  path: string;
  mediaType: string;
  bytes: number;
  sha256: string;
  status: 'present' | 'missing';
  parentIds: string[];
  note: string;
  nativeId?: string;
  nativeInputRunId?: string;
}
export interface ResearchNarrative {
  id: string;
  title: string;
  text: string;
  artifactIds: string[];
}
export interface ResearchFigure {
  id: string;
  title: string;
  caption: string;
  runId: string;
  sourceArtifactId: string;
  /** -1 selects the recorded time/iteration axis. All other columns are zero based. */
  xColumn: number;
  yColumn: number;
  theme: 'light' | 'dark' | 'print' | 'colorblind';
}
export interface ResearchCitation {
  id: string;
  text: string;
  url: string;
}
export interface ResearchProject {
  schema: typeof RESEARCH_PROJECT_SCHEMA;
  id: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  software: { name: string; version: string };
  sessions: ResearchSession[];
  runs: ResearchRun[];
  artifacts: ResearchArtifact[];
  notebook: ResearchNarrative[];
  figures: ResearchFigure[];
  citations: ResearchCitation[];
  warnings: string[];
}
/** Original artifact bytes, separate from the bounded, portable project manifest. */
export interface ResearchProjectBundle {
  project: ResearchProject;
  files: ZipEntryInput[];
}
export interface ResearchSeriesDocument {
  schema: 'pendulum-project-series/v1';
  experiment: ExperimentStateV1;
  series: DiagnosticSeries;
}
export interface CreateResearchProjectOptions {
  title: string;
  description?: string;
  id?: string;
  createdAt?: string;
}
export interface CaptureResearchRunOptions {
  experiment: ExperimentStateV1;
  label: string;
  sessionId: string;
  series?: DiagnosticSeries;
  status?: ResearchRun['status'];
  id?: string;
  createdAt?: string;
}
export interface AddResearchArtifactOptions {
  runId: string;
  filename: string;
  data: Uint8Array;
  kind?: ResearchArtifactKind;
  mediaType?: string;
  parentIds?: string[];
  note?: string;
}
