/**
 * Persistence: localStorage schema + sanitizers, IndexedDB mirror/hydrate, workspace import/export.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import type { IntegratorId, RuntimeSnapshot, SystemType } from '../../types/domain';
import { StateStore } from '../../state/StateStore';
import { downloadJson } from '../../export/manifest';
import { integratorRegistry } from '../../physics/integrators';
import { migrateFromLocalStorageV2, ResearchDb, validateResearchDbArchive, type ResearchDbArchive } from '../../research/researchDb';
import {
  ParameterStudyPlan,
  ParameterStudyPoint,
  ResearchBatchCheckpoint,
  ResearchBatchStatus,
  ResearchComparisonRow,
  ResearchExperiment,
  ResearchLayoutPreferences,
  ResearchMetrics,
  ResearchRunLogEntry,
  ResearchRunType,
  ResearchStoragePayload,
  ResearchWorkbenchState,
  ResearchWorkspaceProfile,
  StudyPointResults,
  currentSnapshot,
  defaultResearchLayoutPreferences,
  defaultResearchProjectProfile,
  defaultResearchSessionProfile,
  defaultResearchWorkspaceProfile,
  researchUid,
  state,
  toast
} from './shared';
import { DesignStudyState, applySnapshotControls, designStudy, logResearchRun, persistDesignStudy, renderResearchWorkbench, setDesignStudy, studyEstimate } from './research-workbench';
import { loadFigureCaptionOverrides, saveFigureCaptionOverride } from './figure-export';
import { MAX_RESEARCH_SESSIONS, sanitizeResearchProject, sanitizeResearchSession, sanitizeResearchSessions } from './research-session-storage';
import { $ } from './shared';
import {
  cleanupResearchDbByAge as runResearchDbCleanup,
  previewResearchDbCleanup as runResearchDbCleanupPreview,
  type ResearchStorageCleanupController
} from './storage-cleanup';

export { researchCleanupCutoff } from './storage-cleanup';


export const RESEARCH_STORAGE_KEY = 'pendulum-lab/research-workbench/v1';
export const RESEARCH_STORAGE_SCHEMA_VERSION = 'pendulum-research-workbench/v4';
export const MAX_RESEARCH_WORKSPACES = 24;
export const MAX_RESEARCH_EXPERIMENTS = 60;
export const MAX_RESEARCH_RUN_LOG = 120;
export const MAX_RESEARCH_COMPARISON_ROWS = 80;
export const MAX_RESEARCH_STUDY_POINTS = 128;
export const RESEARCH_RUN_TYPES = new Set<ResearchRunType>(['experiment', 'validation', 'parameter-study', 'comparison', 'export', 'probe', 'workspace']);
export const RESEARCH_STUDY_STRATEGIES = new Set<ParameterStudyPlan['strategy']>(['grid', 'random', 'symmetric', 'latin-hypercube', 'edge-focus', 'sobol', 'chebyshev']);
export const RESEARCH_SYSTEM_TYPES = new Set<SystemType>(['double', 'triple']);
export const RESEARCH_BATCH_STATUSES = new Set<ResearchBatchStatus>(['running', 'cancelled', 'complete', 'failed']);

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function optionalFinite(value: unknown): number | null {
  return finiteNumber(value) ? Number(value) : null;
}

export function clippedText(value: unknown, fallback: string, maxLength = 220): string {
  const text = typeof value === 'string' ? value.trim() : fallback;
  return (text || fallback).slice(0, maxLength);
}

export function isoText(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value !== 'string') return fallback;
  return Number.isNaN(Date.parse(value)) ? fallback : value;
}

export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (!finiteNumber(value)) return fallback;
  return Math.max(min, Math.min(max, Number(value)));
}

export function sanitizeStringList(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

export function sanitizeRuntimeSnapshot(value: unknown): RuntimeSnapshot | null {
  const validation = StateStore.validate(value);
  return validation.ok && validation.value ? validation.value : null;
}

export function sanitizeResearchMetrics(value: unknown): ResearchMetrics {
  const v = isPlainObject(value) ? value : {};
  return {
    drift: optionalFinite(v.drift),
    lambdaMax: optionalFinite(v.lambdaMax),
    fps: optionalFinite(v.fps),
    physicsMsPerFrame: optionalFinite(v.physicsMsPerFrame),
    poincarePoints: Math.round(clampNumber(v.poincarePoints, 0, 0, 1_000_000)),
    qualityScore: Math.round(clampNumber(v.qualityScore, 0, 0, 100)),
    validationStatus: clippedText(v.validationStatus, 'unknown', 80)
  };
}

export function sanitizeResearchExperiment(value: unknown): ResearchExperiment | null {
  if (!isPlainObject(value)) return null;
  const snapshot = sanitizeRuntimeSnapshot(value.snapshot);
  if (!snapshot) return null;
  const now = new Date().toISOString();
  const experiment: ResearchExperiment = {
    id: clippedText(value.id, researchUid('experiment'), 80),
    name: clippedText(value.name, 'Recovered experiment', 120),
    createdAt: isoText(value.createdAt, now),
    updatedAt: isoText(value.updatedAt, now),
    notes: clippedText(value.notes, '', 2_000),
    tags: sanitizeStringList(value.tags),
    snapshot,
    metrics: sanitizeResearchMetrics(value.metrics)
  };
  if (value.favorite === true) experiment.favorite = true;
  if (isPlainObject(value.citation)) {
    experiment.citation = {
      doi: clippedText(value.citation.doi, '', 120),
      reference: clippedText(value.citation.reference, '', 400)
    };
  }
  return experiment;
}

export function sanitizeResearchRunLogEntry(value: unknown): ResearchRunLogEntry | null {
  if (!isPlainObject(value)) return null;
  const type = RESEARCH_RUN_TYPES.has(value.type as ResearchRunType) ? value.type as ResearchRunType : null;
  const method = typeof value.method === 'string' && value.method in integratorRegistry ? value.method as IntegratorId : null;
  const system = RESEARCH_SYSTEM_TYPES.has(value.system as SystemType) ? value.system as SystemType : null;
  if (!type || !method || !system) return null;
  const entry: ResearchRunLogEntry = {
    id: clippedText(value.id, researchUid('run'), 80),
    type,
    label: clippedText(value.label, 'Recovered run', 140),
    timestamp: isoText(value.timestamp),
    experimentId: typeof value.experimentId === 'string' ? value.experimentId : null,
    snapshotHash: clippedText(value.snapshotHash, 'unknown', 120),
    method,
    system,
    metrics: sanitizeResearchMetrics(value.metrics),
    summary: clippedText(value.summary, '', 1_000)
  };
  const dt = optionalFinite(value.dt);
  const damping = optionalFinite(value.damping);
  if (dt !== null) entry.dt = dt;
  if (damping !== null) entry.damping = damping;
  if (typeof value.artifact === 'string') entry.artifact = clippedText(value.artifact, '', 180);
  return entry;
}

export function sanitizeStudyPointResults(value: unknown): StudyPointResults | undefined {
  if (!isPlainObject(value)) return undefined;
  if (!finiteNumber(value.lambdaMax) || !finiteNumber(value.lambdaBlockStdError) || !finiteNumber(value.rqaDeterminism) || !finiteNumber(value.rqaDivergence) || !finiteNumber(value.ftle)) return undefined;
  const results: StudyPointResults = {
    lambdaMax: Number(value.lambdaMax),
    lambdaBlockStdError: Number(value.lambdaBlockStdError),
    rqaDeterminism: Number(value.rqaDeterminism),
    rqaDivergence: Number(value.rqaDivergence),
    ftle: Number(value.ftle),
    completedAt: isoText(value.completedAt)
  };
  if (finiteNumber(value.durationMs)) results.durationMs = Math.max(0, Math.round(value.durationMs));
  return results;
}

export function sanitizeStudyPoint(value: unknown): ParameterStudyPoint | null {
  if (!isPlainObject(value)) return null;
  const snapshot = sanitizeRuntimeSnapshot(value.snapshot);
  if (!snapshot) return null;
  const patch: Record<string, number | string> = {};
  if (isPlainObject(value.patch)) {
    for (const [key, patchValue] of Object.entries(value.patch)) {
      if (finiteNumber(patchValue) || typeof patchValue === 'string') patch[key.slice(0, 64)] = patchValue;
    }
  }
  const point: ParameterStudyPoint = {
    id: clippedText(value.id, researchUid('point'), 80),
    label: clippedText(value.label, 'Recovered point', 140),
    patch,
    snapshot,
    estimate: clippedText(value.estimate, studyEstimate(snapshot), 180)
  };
  const attempts = clampNumber(value.attempts, 0, 0, 50);
  if (attempts > 0) point.attempts = Math.round(attempts);
  const results = sanitizeStudyPointResults(value.results);
  if (results) point.results = results;
  if (typeof value.error === 'string') point.error = clippedText(value.error, '', 400);
  return point;
}

export function sanitizeParameterStudyPlan(value: unknown): ParameterStudyPlan | null {
  if (!isPlainObject(value)) return null;
  const strategy = RESEARCH_STUDY_STRATEGIES.has(value.strategy as ParameterStudyPlan['strategy']) ? value.strategy as ParameterStudyPlan['strategy'] : 'grid';
  const values = Array.isArray(value.values)
    ? value.values.filter(finiteNumber).map(Number).slice(0, MAX_RESEARCH_STUDY_POINTS)
    : [];
  const experiments = Array.isArray(value.experiments)
    ? value.experiments.map(sanitizeStudyPoint).filter((point): point is ParameterStudyPoint => Boolean(point)).slice(0, MAX_RESEARCH_STUDY_POINTS)
    : [];
  if (experiments.length === 0) return null;
  return {
    id: clippedText(value.id, researchUid('study'), 80),
    generatedAt: isoText(value.generatedAt),
    variable: clippedText(value.variable, 'theta1', 80),
    strategy,
    min: clampNumber(value.min, values[0] ?? 0, -1e8, 1e8),
    max: clampNumber(value.max, values.at(-1) ?? values[0] ?? 0, -1e8, 1e8),
    count: experiments.length,
    values: values.length ? values.slice(0, experiments.length) : experiments.map((_, index) => index),
    experiments
  };
}

export function sanitizeBatchCheckpoint(value: unknown): ResearchBatchCheckpoint | null {
  if (!isPlainObject(value)) return null;
  const status = RESEARCH_BATCH_STATUSES.has(value.status as ResearchBatchStatus) ? value.status as ResearchBatchStatus : null;
  if (!status) return null;
  return {
    id: clippedText(value.id, researchUid('batch'), 80),
    planId: clippedText(value.planId, '', 80),
    planHash: clippedText(value.planHash, '', 120),
    status,
    startedAt: isoText(value.startedAt),
    updatedAt: isoText(value.updatedAt),
    completed: Math.round(clampNumber(value.completed, 0, 0, MAX_RESEARCH_STUDY_POINTS)),
    failed: Math.round(clampNumber(value.failed, 0, 0, MAX_RESEARCH_STUDY_POINTS)),
    pending: Math.round(clampNumber(value.pending, 0, 0, MAX_RESEARCH_STUDY_POINTS)),
    nextIndex: Math.round(clampNumber(value.nextIndex, 0, 0, MAX_RESEARCH_STUDY_POINTS)),
    total: Math.round(clampNumber(value.total, 0, 0, MAX_RESEARCH_STUDY_POINTS)),
    timeoutMs: Math.round(clampNumber(value.timeoutMs, 45_000, 1_000, 600_000)),
    message: clippedText(value.message, '', 400)
  };
}

export function sanitizeComparisonRow(value: unknown): ResearchComparisonRow | null {
  if (!isPlainObject(value)) return null;
  const method = typeof value.method === 'string' && value.method in integratorRegistry ? value.method as IntegratorId : null;
  const system = RESEARCH_SYSTEM_TYPES.has(value.system as SystemType) ? value.system as SystemType : null;
  if (!method || !system) return null;
  return {
    id: clippedText(value.id, researchUid('comparison'), 80),
    label: clippedText(value.label, 'Recovered row', 140),
    source: clippedText(value.source, 'unknown', 80),
    timestamp: isoText(value.timestamp),
    method,
    system,
    dt: clampNumber(value.dt, 0.003, 1e-8, 1),
    damping: clampNumber(value.damping, 0, 0, 100),
    drift: optionalFinite(value.drift),
    lambdaMax: optionalFinite(value.lambdaMax),
    fps: optionalFinite(value.fps),
    score: Math.round(clampNumber(value.score, 0, 0, 100)),
    hash: clippedText(value.hash, 'unknown', 120)
  };
}

export function sanitizeWorkspaceProfile(value: unknown): ResearchWorkspaceProfile {
  const fallback = defaultResearchWorkspaceProfile();
  if (!isPlainObject(value)) return fallback;
  const createdAt = isoText(value.createdAt, fallback.createdAt);
  return {
    id: clippedText(value.id, fallback.id, 100),
    name: clippedText(value.name, fallback.name, 140),
    objective: clippedText(value.objective, fallback.objective, 1_200),
    flagshipId: clippedText(value.flagshipId, fallback.flagshipId, 100),
    createdAt,
    updatedAt: isoText(value.updatedAt, createdAt)
  };
}

export function sanitizeLayoutPreferences(value: unknown): ResearchLayoutPreferences {
  const fallback = defaultResearchLayoutPreferences();
  if (!isPlainObject(value)) return fallback;
  const density = value.density === 'compact' ? 'compact' : value.density === 'comfortable' ? 'comfortable' : fallback.density;
  return {
    density,
    lastTab: clippedText(value.lastTab, fallback.lastTab, 80),
    panelCollapsed: value.panelCollapsed === true
  };
}

export function sanitizeWorkspaceList(value: unknown, active: ResearchWorkspaceProfile): ResearchWorkspaceProfile[] {
  const raw = Array.isArray(value) ? value : [];
  const byId = new Map<string, ResearchWorkspaceProfile>();
  byId.set(active.id, active);
  for (const item of raw) {
    const workspace = sanitizeWorkspaceProfile(item);
    byId.set(workspace.id, workspace.id === active.id ? { ...workspace, ...active } : workspace);
    if (byId.size >= MAX_RESEARCH_WORKSPACES) break;
  }
  if (!byId.has(active.id)) byId.set(active.id, active);
  return Array.from(byId.values()).slice(0, MAX_RESEARCH_WORKSPACES);
}

export function normalizeResearchStorage(value: unknown): { research: ResearchWorkbenchState; migrations: string[]; droppedEntries: number } {
  const fallbackWorkspace = defaultResearchWorkspaceProfile();
  const fallbackProject = defaultResearchProjectProfile(fallbackWorkspace.createdAt);
  const fallbackSession = defaultResearchSessionProfile(fallbackProject.id, fallbackWorkspace.createdAt);
  const fallback: ResearchWorkbenchState = {
    project: fallbackProject,
    sessions: [fallbackSession],
    workspace: fallbackWorkspace,
    workspaces: [fallbackWorkspace],
    layout: defaultResearchLayoutPreferences(),
    experiments: [],
    selectedExperimentId: '',
    runLog: [],
    parameterStudy: null,
    batchCheckpoint: null,
    comparisonRows: []
  };
  if (!isPlainObject(value)) return { research: fallback, migrations: [], droppedEntries: 0 };
  const source = isPlainObject(value.research) ? value.research : value;
  const schema = typeof value.schemaVersion === 'string' ? value.schemaVersion : 'legacy';
  const migrations = schema === RESEARCH_STORAGE_SCHEMA_VERSION ? [] : [`${schema} -> ${RESEARCH_STORAGE_SCHEMA_VERSION}`];
  const rawExperiments = Array.isArray(source.experiments) ? source.experiments : [];
  const rawSessions = Array.isArray(source.sessions) ? source.sessions : [];
  const rawWorkspaces = Array.isArray(source.workspaces) ? source.workspaces : [];
  const rawRunLog = Array.isArray(source.runLog) ? source.runLog : [];
  const rawComparisonRows = Array.isArray(source.comparisonRows) ? source.comparisonRows : [];
  const workspace = sanitizeWorkspaceProfile(source.workspace);
  const activeSession = sanitizeResearchSession(source.session ?? rawSessions[0], 'project-certified-chaotic-dynamics');
  const project = sanitizeResearchProject(source.project, activeSession.id);
  const sessions = sanitizeResearchSessions(rawSessions, project.id, { ...activeSession, projectId: project.id });
  if (!sessions.some((session) => session.id === project.activeSessionId)) project.activeSessionId = activeSession.id;
  if (!project.sessionIds.includes(project.activeSessionId)) project.sessionIds = [project.activeSessionId, ...project.sessionIds].slice(0, MAX_RESEARCH_SESSIONS);
  const workspaces = sanitizeWorkspaceList(rawWorkspaces, workspace);
  const layout = sanitizeLayoutPreferences(source.layout);
  const experiments = rawExperiments.map(sanitizeResearchExperiment).filter((entry): entry is ResearchExperiment => Boolean(entry)).slice(0, MAX_RESEARCH_EXPERIMENTS);
  const runLog = rawRunLog.map(sanitizeResearchRunLogEntry).filter((entry): entry is ResearchRunLogEntry => Boolean(entry)).slice(0, MAX_RESEARCH_RUN_LOG);
  const comparisonRows = rawComparisonRows.map(sanitizeComparisonRow).filter((entry): entry is ResearchComparisonRow => Boolean(entry)).slice(0, MAX_RESEARCH_COMPARISON_ROWS);
  const parameterStudy = sanitizeParameterStudyPlan(source.parameterStudy);
  const batchCheckpoint = sanitizeBatchCheckpoint(source.batchCheckpoint);
  const selectedExperimentId = typeof source.selectedExperimentId === 'string' && experiments.some((experiment) => experiment.id === source.selectedExperimentId)
    ? source.selectedExperimentId
    : experiments[0]?.id ?? '';
  const studyDrops = isPlainObject(source.parameterStudy) && Array.isArray(source.parameterStudy.experiments) && parameterStudy
    ? Math.max(0, source.parameterStudy.experiments.length - parameterStudy.experiments.length)
    : 0;
  const droppedEntries = Math.max(0, rawExperiments.length - experiments.length)
    + Math.max(0, rawSessions.length - Math.min(rawSessions.length, sessions.length))
    + Math.max(0, rawWorkspaces.length - Math.min(rawWorkspaces.length, workspaces.length))
    + Math.max(0, rawRunLog.length - runLog.length)
    + Math.max(0, rawComparisonRows.length - comparisonRows.length)
    + studyDrops;
  return { research: { project, sessions, workspace, workspaces, layout, experiments, selectedExperimentId, runLog, parameterStudy, batchCheckpoint, comparisonRows }, migrations, droppedEntries };
}

export function loadResearchState(): void {
  try {
    const raw = window.localStorage?.getItem(RESEARCH_STORAGE_KEY);
    if (raw) {
      const { research, migrations, droppedEntries } = normalizeResearchStorage(JSON.parse(raw));
      state.research = research;
      if (migrations.length || droppedEntries > 0) {
        state.auditLog.unshift(`research storage normalized: ${migrations.join(', ') || 'current schema'}; dropped ${droppedEntries} invalid entr${droppedEntries === 1 ? 'y' : 'ies'}`);
        persistResearchState();
      }
    }
  } catch (error) {
    state.auditLog.unshift(`research storage ignored: ${error instanceof Error ? error.message : String(error)}`);
  }
  // Runs even when localStorage is empty: the IndexedDB archive is the
  // long-term store and recovers the workbench after localStorage loss.
  hydrateResearchDb();
}

export function persistResearchState(): void {
  try {
    const payload: ResearchStoragePayload = {
      schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      migrations: [],
      droppedEntries: 0,
      ...state.research
    };
    window.localStorage?.setItem(RESEARCH_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    state.lastFault = `Research storage failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  mirrorResearchStateToDb();
}

// --- IndexedDB long-term research store -----------------------------------
// localStorage stays the synchronous resume cache; the IndexedDB ResearchDb is
// the long-term archive (experiments, run log, studies + results, figures,
// bundles) with quota headroom far beyond the ~5 MB localStorage limit.

export let researchDbSingleton: ResearchDb | null = null;

export function researchDbInstance(): ResearchDb {
  if (!researchDbSingleton) researchDbSingleton = new ResearchDb();
  return researchDbSingleton;
}

export let researchDbMirrorTimer = 0;

/** Debounced async mirror of the workbench state into IndexedDB. */
export function mirrorResearchStateToDb(): void {
  const db = researchDbInstance();
  if (!db.available()) return;
  window.clearTimeout(researchDbMirrorTimer);
  researchDbMirrorTimer = window.setTimeout(() => {
    void (async () => {
      try {
        await db.putMany('experiments', state.research.experiments.map((experiment) => ({ id: experiment.id, payload: experiment })));
        await db.putMany('runLog', state.research.runLog.map((entry) => ({ id: entry.id, payload: entry })));
        const study = state.research.parameterStudy;
        if (study) {
          await db.put('parameterStudies', study.id, study);
          const results = study.experiments
            .filter((point) => point.results)
            .map((point) => ({ id: `${study.id}:${point.id}`, payload: { studyId: study.id, pointId: point.id, patch: point.patch, results: point.results } }));
          if (results.length > 0) await db.putMany('studyResults', results);
        }
        await db.put('settings', 'workbench-state', {
          project: state.research.project,
          sessions: state.research.sessions,
          workspace: state.research.workspace,
          workspaces: state.research.workspaces,
          layout: state.research.layout,
          selectedExperimentId: state.research.selectedExperimentId,
          batchCheckpoint: state.research.batchCheckpoint,
          comparisonRows: state.research.comparisonRows
        });
        renderResearchStoragePanel();
      } catch (error) {
        state.auditLog.unshift(`research db mirror failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  }, 400);
}

/**
 * Async hydration: run the one-time localStorage v2 -> IndexedDB migration and,
 * when localStorage came up empty but the archive still has experiments,
 * recover them (sanitized through the same validators as every other source).
 */
export function hydrateResearchDb(): void {
  const db = researchDbInstance();
  if (!db.available()) return;
  void (async () => {
    try {
      await db.open();
      const raw = window.localStorage?.getItem(RESEARCH_STORAGE_KEY) ?? null;
      const migration = await migrateFromLocalStorageV2(db, raw);
      if (migration.migrated) {
        state.auditLog.unshift(`research db: ${migration.reason} (${migration.entries} entries)`);
      }
      if (state.research.experiments.length === 0) {
        const stored = await db.getAll('experiments');
        const revived = stored
          .map((record) => sanitizeResearchExperiment(record.payload))
          .filter((experiment): experiment is ResearchExperiment => Boolean(experiment))
          .slice(0, MAX_RESEARCH_EXPERIMENTS);
        if (revived.length > 0) {
          state.research.experiments = revived;
          state.research.selectedExperimentId = revived[0]?.id ?? '';
          state.auditLog.unshift(`research db: recovered ${revived.length} experiment(s) from IndexedDB`);
          persistResearchState();
          renderResearchWorkbench();
        }
      }
      renderResearchStoragePanel();
    } catch (error) {
      state.auditLog.unshift(`research db hydrate failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}

export function renderResearchStoragePanel(): void {
  const summary = $('rwStorageSummary');
  if (!summary) return;
  const db = researchDbInstance();
  if (!db.available()) {
    summary.textContent = 'IndexedDB unavailable in this browser; localStorage fallback active.';
    return;
  }
  void (async () => {
    try {
      const counts = await db.counts();
      const quota = await db.estimateQuota();
      const quotaText = quota
        ? `${(quota.usageBytes / 1024 / 1024).toFixed(1)} / ${(quota.quotaBytes / 1024 / 1024).toFixed(0)} MiB (${(quota.usageFraction * 100).toFixed(1)}%)`
        : 'quota API unavailable';
      summary.textContent = `IndexedDB: ${counts.experiments} experiments, ${counts.runLog} runs, ${counts.parameterStudies} studies, ${counts.studyResults} results, ${counts.figures} figures, ${counts.bundles} bundles. Quota ${quotaText}. Recoveries: ${db.recoveries}.`;
    } catch (error) {
      summary.textContent = `IndexedDB status unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
  })();
}

function storageCleanupController(): ResearchStorageCleanupController {
  const db = researchDbInstance();
  return {
    countOlderThan: (cutoff) => db.countOlderThan(cutoff),
    deleteOlderThan: (cutoff) => db.deleteOlderThan(cutoff),
    afterDelete: (cutoff, total, days) => {
      const cutoffMs = Date.parse(cutoff);
      state.research.experiments = state.research.experiments.filter((item) => !Number.isFinite(Date.parse(item.updatedAt)) || Date.parse(item.updatedAt) >= cutoffMs);
      state.research.runLog = state.research.runLog.filter((item) => !Number.isFinite(Date.parse(item.timestamp)) || Date.parse(item.timestamp) >= cutoffMs);
      if (!state.research.experiments.some((item) => item.id === state.research.selectedExperimentId)) state.research.selectedExperimentId = state.research.experiments[0]?.id ?? '';
      persistResearchState();
      logResearchRun('workspace', 'IndexedDB age cleanup', `Deleted ${total} records older than ${days} days.`);
    },
    refresh: renderResearchStoragePanel,
    toast
  };
}

export function previewResearchDbCleanup(): void { runResearchDbCleanupPreview(storageCleanupController()); }
export function cleanupResearchDbByAge(): void { runResearchDbCleanup(storageCleanupController()); }

export function exportResearchDbArchive(): void {
  void (async () => {
    try {
      const archive = await researchDbInstance().exportArchive();
      downloadJson('pendulum_research_db_archive.json', archive);
      logResearchRun('export', 'Research DB archive export', `Full IndexedDB archive (${Object.values(archive.stores).reduce((sum, records) => sum + records.length, 0)} records).`, 'pendulum_research_db_archive.json');
      toast('Research DB archive exported');
    } catch (error) {
      toast(`Archive export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}

export function importResearchDbArchive(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const parsed = JSON.parse(await file.text()) as ResearchDbArchive;
        const validation = validateResearchDbArchive(parsed);
        if (!validation.ok) {
          toast(`Archive rejected: ${validation.problems[0] ?? 'invalid'}`);
          return;
        }
        const { imported } = await researchDbInstance().importArchive(parsed, 'merge');
        toast(`Imported ${imported} records into IndexedDB`);
        hydrateResearchDb();
      } catch (error) {
        toast(`Archive import failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };
  input.click();
}

/** Full workspace export: research state + design study + captions + live snapshot. */
export function exportWorkspaceJson(): void {
  const payload = {
    schemaVersion: 'pendulum-workspace/v1',
    savedAt: new Date().toISOString(),
    research: {
      schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      migrations: [],
      droppedEntries: 0,
      ...state.research
    },
    designStudy,
    figureCaptions: loadFigureCaptionOverrides(),
    snapshot: currentSnapshot()
  };
  downloadJson('pendulum_workspace.json', payload);
  logResearchRun('export', 'Workspace export', 'Full workspace: research state, design study, figure captions, live snapshot.', 'pendulum_workspace.json');
  toast('Workspace saved');
}

/** Restore a workspace file: every section passes through the same sanitizers as storage. */
export function importWorkspaceJson(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    void (async () => {
      try {
        const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
        if (parsed.schemaVersion !== 'pendulum-workspace/v1') {
          toast('Not a pendulum workspace file');
          return;
        }
        const { research, droppedEntries } = normalizeResearchStorage(parsed.research);
        state.research = research;
        const rawDesign = parsed.designStudy as DesignStudyState | null | undefined;
        if (rawDesign && rawDesign.schemaVersion === 'pendulum-design-study/v1' && Array.isArray(rawDesign.variables) && Array.isArray(rawDesign.points)) {
          setDesignStudy({ ...rawDesign, status: rawDesign.status === 'running' ? 'idle' : rawDesign.status });
          persistDesignStudy();
        }
        if (isPlainObject(parsed.figureCaptions)) {
          for (const [id, caption] of Object.entries(parsed.figureCaptions)) {
            if (typeof caption === 'string') saveFigureCaptionOverride(id, caption);
          }
        }
        const snapshot = sanitizeRuntimeSnapshot(parsed.snapshot);
        if (snapshot) applySnapshotControls(snapshot);
        persistResearchState();
        renderResearchWorkbench();
        logResearchRun('experiment', 'Workspace restored', `${state.research.experiments.length} experiments, ${droppedEntries} entries dropped during sanitisation.`);
        toast('Workspace restored');
      } catch (error) {
        toast(`Workspace restore failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    })();
  };
  input.click();
}

export function clearResearchDb(): void {
  void (async () => {
    try {
      const db = researchDbInstance();
      await db.destroy();
      researchDbSingleton = null;
      toast('IndexedDB research store cleared');
      renderResearchStoragePanel();
    } catch (error) {
      toast(`Clear failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}
