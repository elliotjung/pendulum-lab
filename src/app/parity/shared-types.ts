/**
 * Stable parity-layer contracts and default research-workbench state.
 *
 * Keeping data contracts separate from browser helpers makes them safe to use
 * from workers, storage migration, and focused unit tests.
 */
import type { IntegratorId, RuntimeSnapshot, SystemType } from '../../types/domain';
import { type ParameterStudyStrategy } from '../../research/researchSampling';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | '';

export interface ModernLabHandle {
  diagnostics?: () => {
    time: number;
    drift: number;
    poincarePoints: number;
    lambdaMax: number;
    fps: number;
    physicsMsPerFrame: number;
  };
  runtimeSnapshot?: () => RuntimeSnapshot;
  reset?: () => void;
}

export interface CanonicalQa {
  runs: number;
  pass: boolean;
  residual: number;
  iterations: number;
  drift: number;
  symplecticDefect: number;
  timestamp: string;
}

export interface AuditResult {
  generatedAt: string;
  passed: number;
  failed: number;
  tests: Array<{ id: string; status: 'PASS' | 'FAIL' | 'WARN'; detail: string }>;
  manifest: unknown;
}

export type ResearchRunType =
  'experiment' | 'validation' | 'parameter-study' | 'comparison' | 'export' | 'probe' | 'workspace';

export interface ResearchMetrics {
  drift: number | null;
  lambdaMax: number | null;
  fps: number | null;
  physicsMsPerFrame: number | null;
  poincarePoints: number;
  qualityScore: number;
  validationStatus: string;
}

export interface ResearchExperiment {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
  tags: string[];
  snapshot: RuntimeSnapshot;
  metrics: ResearchMetrics;
  favorite?: boolean;
  citation?: { doi: string; reference: string };
}

export interface ResearchRunLogEntry {
  id: string;
  type: ResearchRunType;
  label: string;
  timestamp: string;
  experimentId: string | null;
  snapshotHash: string;
  method: IntegratorId;
  system: SystemType;
  dt?: number;
  damping?: number;
  metrics: ResearchMetrics;
  summary: string;
  artifact?: string;
}

export interface StudyPointResults {
  lambdaMax: number;
  lambdaBlockStdError: number;
  rqaDeterminism: number;
  rqaDivergence: number;
  ftle: number;
  durationMs?: number;
  completedAt: string;
}

export interface ParameterStudyPoint {
  id: string;
  label: string;
  patch: Record<string, number | string>;
  snapshot: RuntimeSnapshot;
  estimate: string;
  attempts?: number;
  results?: StudyPointResults;
  error?: string;
}

export interface ParameterStudyPlan {
  id: string;
  generatedAt: string;
  variable: string;
  strategy: ParameterStudyStrategy;
  min: number;
  max: number;
  count: number;
  values: number[];
  experiments: ParameterStudyPoint[];
}

export type ResearchBatchStatus = 'running' | 'cancelled' | 'complete' | 'failed';

export interface ResearchBatchCheckpoint {
  id: string;
  planId: string;
  planHash: string;
  status: ResearchBatchStatus;
  startedAt: string;
  updatedAt: string;
  completed: number;
  failed: number;
  pending: number;
  nextIndex: number;
  total: number;
  timeoutMs: number;
  message: string;
}

export interface ResearchComparisonRow {
  id: string;
  label: string;
  source: string;
  timestamp: string;
  method: IntegratorId;
  system: SystemType;
  dt: number;
  damping: number;
  drift: number | null;
  lambdaMax: number | null;
  fps: number | null;
  score: number;
  hash: string;
}

export interface ResearchWorkspaceProfile {
  id: string;
  name: string;
  objective: string;
  flagshipId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchArtifactManifestEntry {
  id: string;
  label: string;
  path: string;
  kind: 'report' | 'figure' | 'dataset' | 'workspace' | 'export';
  createdAt: string;
  hash?: string;
}

export interface ResearchSessionProfile {
  id: string;
  projectId: string;
  name: string;
  objective: string;
  createdAt: string;
  updatedAt: string;
  pinnedRunIds: string[];
  artifactManifest: ResearchArtifactManifestEntry[];
  comparisonHistory: string[];
}

export interface ResearchProjectProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  activeSessionId: string;
  sessionIds: string[];
}

export interface ResearchLayoutPreferences {
  density: 'comfortable' | 'compact';
  lastTab: string;
  panelCollapsed: boolean;
}

export interface ResearchWorkbenchState {
  project: ResearchProjectProfile;
  sessions: ResearchSessionProfile[];
  workspace: ResearchWorkspaceProfile;
  workspaces: ResearchWorkspaceProfile[];
  layout: ResearchLayoutPreferences;
  experiments: ResearchExperiment[];
  selectedExperimentId: string;
  runLog: ResearchRunLogEntry[];
  parameterStudy: ParameterStudyPlan | null;
  batchCheckpoint: ResearchBatchCheckpoint | null;
  comparisonRows: ResearchComparisonRow[];
}

export interface ResearchStoragePayload extends ResearchWorkbenchState {
  schemaVersion: string;
  savedAt: string;
  migrations: string[];
  droppedEntries: number;
}

export function defaultResearchWorkspaceProfile(now = new Date().toISOString()): ResearchWorkspaceProfile {
  return {
    id: 'workspace-certified-chaotic-dynamics',
    name: 'Certified Chaotic Dynamics Workbench',
    objective:
      'Build a reviewer-ready flagship result around the Melnikov gap map, with every quoted number carrying provenance, uncertainty, validation, and caveats.',
    flagshipId: 'melnikov-gap-map',
    createdAt: now,
    updatedAt: now
  };
}

export function defaultResearchSessionProfile(
  projectId = 'project-certified-chaotic-dynamics',
  now = new Date().toISOString()
): ResearchSessionProfile {
  return {
    id: 'session-melnikov-gap-map',
    projectId,
    name: 'Melnikov Gap Map Certification',
    objective:
      'Accumulate runs, artifacts, and caveats for the flagship Melnikov threshold vs period-doubling gap map.',
    createdAt: now,
    updatedAt: now,
    pinnedRunIds: [],
    artifactManifest: [],
    comparisonHistory: []
  };
}

export function defaultResearchProjectProfile(now = new Date().toISOString()): ResearchProjectProfile {
  const session = defaultResearchSessionProfile('project-certified-chaotic-dynamics', now);
  return {
    id: 'project-certified-chaotic-dynamics',
    name: 'Certified Chaotic Dynamics Workbench',
    createdAt: now,
    updatedAt: now,
    activeSessionId: session.id,
    sessionIds: [session.id]
  };
}

export function defaultResearchLayoutPreferences(): ResearchLayoutPreferences {
  return {
    density: 'comfortable',
    lastTab: 'research',
    panelCollapsed: false
  };
}

export const LEGACY_VALIDATION_IDS = [
  'energy-drift-gamma0',
  'damping-sanity',
  'small-angle-reference',
  'dt-halving-convergence',
  'order-accuracy-estimate',
  'time-reversibility',
  'deterministic-replay-hash',
  'worker-main-consistency',
  'poincare-crossing-consistency',
  'lyapunov-transient-handling',
  'rk4-reference-comparison',
  'implicit-solver-residual',
  'localstorage-roundtrip',
  'url-share-roundtrip',
  'json-import-schema',
  'nan-fault-injection',
  'render-independence',
  'browser-capability-report',
  'event-listener-leak-smoke',
  'performance-budget-smoke'
] as const;

export const COMPAT_ANCHOR_IDS = [
  'single-file-platform-prelude-v9',
  'single-file-platform-architecture-v9',
  'pendulum-lab-v10-consolidation',
  'research-integrity-upgrade-v4',
  'research-governance-v7-script',
  'stable-intuitive-layer',
  'ple-tsconfig-strict',
  'ple-type-contracts',
  'pendulumRodFinal'
] as const;
