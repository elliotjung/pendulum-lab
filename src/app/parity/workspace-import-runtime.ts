import { snapshotControlValues } from '../../browser/savedRunImport';
import { commitLabControls } from '../controlCommit';
import {
  RESEARCH_DB_SCHEMA_VERSION,
  validateResearchDbArchive,
  type ResearchDbArchive,
  type ResearchDbRecord,
  type ResearchDbStoreName
} from '../../research/researchDb';
import type { RunMode, RuntimeSnapshot } from '../../types/domain';
import { FIGURE_CAPTIONS, FIGURE_CAPTION_OVERRIDE_KEY, loadFigureCaptionOverrides } from './paper-figure-capture';
import { studyBatch } from './research-batch-runner';
import {
  DESIGN_STORAGE_KEY,
  designBatch,
  designStudy,
  flushDesignStudyForUpdate,
  setDesignStudy
} from './research-workbench-design-study';
import type { DesignStudyState } from './research-design-types';
import { renderResearchWorkbench } from './research-workbench';
import { state } from './shared-state';
import { flushResearchStateForUpdate, researchDbInstance } from './storage-local-cache';
import { RESEARCH_STORAGE_KEY, RESEARCH_STORAGE_SCHEMA_VERSION } from './storage-schema';
import type { ResearchWorkbenchState } from './shared-types';
import {
  WorkspaceImportOperationError,
  type WorkspaceImportStage,
  type WorkspaceImportTransactionAdapter
} from './workspace-import-transaction';

const WORKSPACE_CONTROL_IDS = [
  'sysType',
  'method',
  'dt',
  'tol',
  'spf',
  'gamma',
  'seed',
  'm1',
  'm2',
  'm3',
  'l1',
  'l2',
  'l3',
  'g',
  'th1',
  'th2',
  'th3',
  'iw1',
  'iw2',
  'iw3'
] as const;

const MODE_CONTROL_IDS = ['v10RunMode', 'rgv7ModeSelect', 'plxRunMode', 'riModeSelect'] as const;

interface RestorableLab {
  runtimeSnapshot(): RuntimeSnapshot;
  restoreSnapshot(snapshot: RuntimeSnapshot): void;
  isRunning(): boolean;
  stop(): void;
}

interface LocalStorageImage {
  research: string | null;
  design: string | null;
  captions: string | null;
}

interface ControlImage {
  id: string;
  value: string;
  step: string | null;
  importStep: string | null;
  importStepBound: string | null;
  output: string | null;
}

interface WorkspaceRuntimeBackup {
  research: ResearchWorkbenchState;
  designStudy: DesignStudyState | null;
  captions: Record<string, string>;
  snapshot: RuntimeSnapshot;
  wasRunning: boolean;
  local: LocalStorageImage;
  controls: ControlImage[];
  database: ResearchDbArchive | null;
}

interface WorkspaceRuntimeTarget {
  research: ResearchWorkbenchState;
  designStudy: DesignStudyState | null;
  captions: Record<string, string>;
  snapshot: RuntimeSnapshot;
  restoreSnapshot: boolean;
  local: LocalStorageImage;
  database: ResearchDbArchive | null;
}

export interface WorkspaceImportRuntimePlan {
  backup: WorkspaceRuntimeBackup;
  target: WorkspaceRuntimeTarget;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function requireLocalStorage(): Storage {
  if (!window.localStorage) throw new Error('localStorage is unavailable');
  return window.localStorage;
}

function restorableLab(): RestorableLab {
  const candidate = (
    window as Window & {
      __modernLab?: Partial<RestorableLab>;
    }
  ).__modernLab;
  if (
    !candidate ||
    typeof candidate.runtimeSnapshot !== 'function' ||
    typeof candidate.restoreSnapshot !== 'function' ||
    typeof candidate.isRunning !== 'function' ||
    typeof candidate.stop !== 'function'
  ) {
    throw new WorkspaceImportOperationError(
      'WORKSPACE_IMPORT_RUNTIME_UNAVAILABLE',
      'The interactive Lab restore contract is not available.'
    );
  }
  return candidate as RestorableLab;
}

function runtimeSnapshot(lab: RestorableLab): RuntimeSnapshot {
  return { ...lab.runtimeSnapshot(), mode: state.mode };
}

function snapshotIdentity(snapshot: RuntimeSnapshot): string {
  return json({
    schemaVersion: snapshot.schemaVersion,
    systemType: snapshot.systemType,
    method: snapshot.method,
    mode: snapshot.mode,
    dt: snapshot.dt,
    tolerance: snapshot.tolerance,
    stepsPerFrame: snapshot.stepsPerFrame,
    damping: snapshot.damping,
    parameters: snapshot.parameters,
    state: snapshot.state,
    simTime: snapshot.simTime,
    seed: snapshot.seed,
    hash: snapshot.hash
  });
}

function captureControls(): ControlImage[] {
  return WORKSPACE_CONTROL_IDS.map((id) => {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      throw new WorkspaceImportOperationError(
        'WORKSPACE_IMPORT_RUNTIME_UNAVAILABLE',
        `Required Lab control #${id} is missing.`
      );
    }
    const output = document.getElementById(`${id}V`);
    return {
      id,
      value: element.value,
      step: element instanceof HTMLInputElement ? element.step : null,
      importStep: element instanceof HTMLInputElement ? (element.dataset.importStep ?? null) : null,
      importStepBound: element instanceof HTMLInputElement ? (element.dataset.importStepBound ?? null) : null,
      output: output?.textContent ?? null
    };
  });
}

function controlIdentity(): string {
  return json(captureControls());
}

function restoreControlImage(controls: readonly ControlImage[]): void {
  for (const saved of controls) {
    const element = document.getElementById(saved.id);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      throw new Error(`Required Lab control #${saved.id} disappeared during rollback`);
    }
    if (element instanceof HTMLInputElement && saved.step !== null) {
      element.step = saved.step;
      if (saved.importStep === null) delete element.dataset.importStep;
      else element.dataset.importStep = saved.importStep;
      if (saved.importStepBound === null) delete element.dataset.importStepBound;
      else element.dataset.importStepBound = saved.importStepBound;
    }
    element.value = saved.value;
    const output = document.getElementById(`${saved.id}V`);
    if (output && saved.output !== null) output.textContent = saved.output;
  }
}

function applyMode(mode: RunMode): void {
  state.mode = mode;
  if (window.App) window.App.runMode = mode;
  for (const id of MODE_CONTROL_IDS) {
    const element = document.getElementById(id);
    if (element instanceof HTMLSelectElement && Array.from(element.options).some((option) => option.value === mode)) {
      element.value = mode;
    }
  }
}

function applyLiveSnapshot(snapshot: RuntimeSnapshot): void {
  const writes: Array<{
    id: string;
    value: string;
    numeric: number | null;
    element: HTMLInputElement | HTMLSelectElement;
  }> = [];
  const problems: string[] = [];
  for (const [id, value] of snapshotControlValues(snapshot)) {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
      problems.push(`required Lab control #${id} is missing`);
      continue;
    }
    const text = String(value);
    if (element instanceof HTMLSelectElement && !Array.from(element.options).some((option) => option.value === text)) {
      problems.push(`Lab control #${id} has no option for ${text}`);
      continue;
    }
    const numeric = typeof value === 'number' ? value : null;
    if (
      element instanceof HTMLInputElement &&
      numeric !== null &&
      (element.type === 'range' || element.type === 'number')
    ) {
      const min = element.min === '' ? Number.NEGATIVE_INFINITY : Number(element.min);
      const max = element.max === '' ? Number.POSITIVE_INFINITY : Number(element.max);
      if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
        problems.push(`Lab control #${id} cannot represent ${numeric} within [${min}, ${max}]`);
        continue;
      }
    }
    writes.push({ id, value: text, numeric, element });
  }
  if (problems.length > 0) throw new Error(problems.join('; '));
  const previous = captureControls();
  try {
    for (const write of writes) {
      write.element.value = write.value;
      if (write.numeric !== null && write.element instanceof HTMLInputElement) {
        const projected = write.element.valueAsNumber;
        const step = write.element.step === '' || write.element.step === 'any' ? 0 : Number(write.element.step);
        const tolerance = write.element.type === 'range' && Number.isFinite(step) ? Math.max(1e-12, step / 2) : 1e-12;
        if (!Number.isFinite(projected) || Math.abs(projected - write.numeric) > tolerance) {
          throw new Error(`Lab control #${write.id} projected ${write.value} to ${write.element.value}`);
        }
      } else if (write.element.value !== write.value) {
        throw new Error(`Lab control #${write.id} rejected ${write.value}`);
      }
    }
    for (const write of writes) write.element.dispatchEvent(new Event('input', { bubbles: true }));
    applyMode(snapshot.mode);
    // All controls are already populated before this single semantic commit;
    // LabControls restores the exact (unrounded) runtime snapshot once.
    commitLabControls(
      'saved-run-import',
      writes.map((write) => write.id),
      snapshot
    );
  } catch (error) {
    restoreControlImage(previous);
    throw error;
  }
}

function rawStorageImage(storage: Storage): LocalStorageImage {
  return {
    research: storage.getItem(RESEARCH_STORAGE_KEY),
    design: storage.getItem(DESIGN_STORAGE_KEY),
    captions: storage.getItem(FIGURE_CAPTION_OVERRIDE_KEY)
  };
}

function writeRaw(storage: Storage, key: string, value: string | null): void {
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}

function writeStorageImage(storage: Storage, image: LocalStorageImage): void {
  writeRaw(storage, RESEARCH_STORAGE_KEY, image.research);
  writeRaw(storage, DESIGN_STORAGE_KEY, image.design);
  writeRaw(storage, FIGURE_CAPTION_OVERRIDE_KEY, image.captions);
}

function upsertRecord(
  archive: ResearchDbArchive,
  store: ResearchDbStoreName,
  id: string,
  payload: unknown,
  updatedAt: string
): void {
  const records = archive.stores[store];
  const next: ResearchDbRecord = { id, updatedAt, payload: clone(payload) };
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) records.push(next);
  else records[index] = next;
  records.sort((a, b) => a.id.localeCompare(b.id));
}

function buildTargetArchive(
  backup: ResearchDbArchive,
  stage: WorkspaceImportStage,
  design: DesignStudyState | null,
  updatedAt: string
): ResearchDbArchive {
  const target = clone(backup);
  target.schemaVersion = RESEARCH_DB_SCHEMA_VERSION;
  target.exportedAt = updatedAt;
  for (const experiment of stage.research.experiments)
    upsertRecord(target, 'experiments', experiment.id, experiment, updatedAt);
  for (const entry of stage.research.runLog) upsertRecord(target, 'runLog', entry.id, entry, updatedAt);
  const study = stage.research.parameterStudy;
  if (study) {
    upsertRecord(target, 'parameterStudies', study.id, study, updatedAt);
    for (const point of study.experiments) {
      if (!point.results) continue;
      upsertRecord(
        target,
        'studyResults',
        `${study.id}:${point.id}`,
        { studyId: study.id, pointId: point.id, patch: point.patch, results: point.results },
        updatedAt
      );
    }
  }
  if (stage.restoreDesignStudy && design) {
    upsertRecord(target, 'parameterStudies', `design:${design.id}`, design, updatedAt);
  }
  upsertRecord(
    target,
    'settings',
    'workbench-state',
    {
      project: stage.research.project,
      sessions: stage.research.sessions,
      workspace: stage.research.workspace,
      workspaces: stage.research.workspaces,
      layout: stage.research.layout,
      selectedExperimentId: stage.research.selectedExperimentId,
      batchCheckpoint: stage.research.batchCheckpoint,
      comparisonRows: stage.research.comparisonRows
    },
    updatedAt
  );
  return target;
}

function mergeCaptions(backup: Record<string, string>, patch: Record<string, string>): Record<string, string> {
  const target = { ...backup };
  for (const [id, caption] of Object.entries(patch)) {
    if (caption && caption !== FIGURE_CAPTIONS[id]) target[id] = caption;
    else delete target[id];
  }
  return target;
}

function buildTarget(
  stage: WorkspaceImportStage,
  backup: WorkspaceRuntimeBackup,
  updatedAt: string
): WorkspaceRuntimeTarget {
  const targetDesign = stage.restoreDesignStudy ? clone(stage.designStudy) : clone(backup.designStudy);
  const targetCaptions = stage.mergeFigureCaptions
    ? mergeCaptions(backup.captions, stage.figureCaptionPatch)
    : clone(backup.captions);
  const targetSnapshot = stage.restoreSnapshot && stage.snapshot ? clone(stage.snapshot) : clone(backup.snapshot);
  const researchPayload = {
    schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
    savedAt: updatedAt,
    migrations: [],
    droppedEntries: 0,
    ...stage.research
  };
  const local: LocalStorageImage = {
    research: json(researchPayload),
    design: stage.restoreDesignStudy ? json(targetDesign) : backup.local.design,
    captions: stage.mergeFigureCaptions ? json(targetCaptions) : backup.local.captions
  };
  const database = backup.database ? buildTargetArchive(backup.database, stage, targetDesign, updatedAt) : null;
  if (database) {
    const validation = validateResearchDbArchive(database);
    if (!validation.ok) throw new Error(`staged IndexedDB target is invalid: ${validation.problems.join('; ')}`);
  }
  return {
    research: clone(stage.research),
    designStudy: targetDesign,
    captions: targetCaptions,
    snapshot: targetSnapshot,
    restoreSnapshot: stage.restoreSnapshot,
    local,
    database
  };
}

async function captureRuntimePlan(stage: WorkspaceImportStage): Promise<WorkspaceImportRuntimePlan> {
  if (designBatch.running || studyBatch.running) {
    throw new WorkspaceImportOperationError(
      'WORKSPACE_IMPORT_BUSY',
      'A research batch is running; cancel or finish it before restoring a workspace.'
    );
  }
  const storage = requireLocalStorage();
  const lab = restorableLab();
  // Drain the existing debounced writers before taking the recovery image. A
  // later rollback therefore restores the latest visible work, not an older
  // cache that happened to precede the pending write.
  await flushResearchStateForUpdate();
  await flushDesignStudyForUpdate();
  const db = researchDbInstance();
  const database = db.available() ? await db.exportArchive() : null;
  if (database) {
    const validation = validateResearchDbArchive(database);
    if (!validation.ok)
      throw new Error(`current IndexedDB backup is not restorable: ${validation.problems.join('; ')}`);
  }
  const backup: WorkspaceRuntimeBackup = {
    research: clone(state.research),
    designStudy: clone(designStudy),
    captions: loadFigureCaptionOverrides(),
    snapshot: runtimeSnapshot(lab),
    wasRunning: lab.isRunning(),
    local: rawStorageImage(storage),
    controls: captureControls(),
    database
  };
  return { backup, target: buildTarget(stage, backup, new Date().toISOString()) };
}

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new Error(`${label} does not match the staged transaction image`);
}

async function applyRuntimePlan(stage: WorkspaceImportStage, plan: WorkspaceImportRuntimePlan): Promise<void> {
  const storage = requireLocalStorage();
  writeStorageImage(storage, plan.target.local);
  if (plan.target.database) await researchDbInstance().importArchive(plan.target.database, 'replace');
  state.research = clone(plan.target.research);
  setDesignStudy(clone(plan.target.designStudy));
  if (plan.target.restoreSnapshot) applyLiveSnapshot(plan.target.snapshot);
  renderResearchWorkbench();
}

async function verifyRuntimePlan(_stage: WorkspaceImportStage, plan: WorkspaceImportRuntimePlan): Promise<void> {
  const lab = restorableLab();
  // Capture the live state before the first await; a running simulation may
  // advance on a later animation frame, but the atomic restore point must be
  // exact at commit time.
  const liveSnapshot = runtimeSnapshot(lab);
  if (plan.target.restoreSnapshot)
    assertEqual(snapshotIdentity(liveSnapshot), snapshotIdentity(plan.target.snapshot), 'live simulator snapshot');
  assertEqual(json(state.research), json(plan.target.research), 'research state');
  assertEqual(json(designStudy), json(plan.target.designStudy), 'design study');
  assertEqual(json(loadFigureCaptionOverrides()), json(plan.target.captions), 'figure captions');
  assertEqual(json(rawStorageImage(requireLocalStorage())), json(plan.target.local), 'localStorage image');
  if (plan.target.database) {
    const stored = await researchDbInstance().exportArchive();
    assertEqual(json(stored.stores), json(plan.target.database.stores), 'IndexedDB image');
  }
}

async function rollbackRuntimePlan(plan: WorkspaceImportRuntimePlan): Promise<void> {
  const errors: unknown[] = [];
  try {
    writeStorageImage(requireLocalStorage(), plan.backup.local);
  } catch (error) {
    errors.push(error);
  }
  try {
    if (plan.backup.database) await researchDbInstance().importArchive(plan.backup.database, 'replace');
  } catch (error) {
    errors.push(error);
  }
  try {
    state.research = clone(plan.backup.research);
    setDesignStudy(clone(plan.backup.designStudy));
  } catch (error) {
    errors.push(error);
  }
  try {
    applyLiveSnapshot(plan.backup.snapshot);
    if (!plan.backup.wasRunning) restorableLab().stop();
    restoreControlImage(plan.backup.controls);
  } catch (error) {
    errors.push(error);
  }
  try {
    renderResearchWorkbench();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 0) {
    const summary = errors.map((error) => (error instanceof Error ? error.message : String(error))).join('; ');
    throw new AggregateError(errors, `one or more workspace rollback surfaces failed: ${summary}`);
  }
}

async function verifyRuntimeRollback(plan: WorkspaceImportRuntimePlan): Promise<void> {
  const lab = restorableLab();
  const liveSnapshot = runtimeSnapshot(lab);
  assertEqual(snapshotIdentity(liveSnapshot), snapshotIdentity(plan.backup.snapshot), 'rolled-back simulator snapshot');
  if (lab.isRunning() !== plan.backup.wasRunning) throw new Error('rolled-back simulator run state does not match');
  assertEqual(controlIdentity(), json(plan.backup.controls), 'rolled-back Lab controls');
  assertEqual(json(state.research), json(plan.backup.research), 'rolled-back research state');
  assertEqual(json(designStudy), json(plan.backup.designStudy), 'rolled-back design study');
  assertEqual(json(loadFigureCaptionOverrides()), json(plan.backup.captions), 'rolled-back figure captions');
  assertEqual(json(rawStorageImage(requireLocalStorage())), json(plan.backup.local), 'rolled-back localStorage image');
  if (plan.backup.database) {
    const stored = await researchDbInstance().exportArchive();
    assertEqual(json(stored.stores), json(plan.backup.database.stores), 'rolled-back IndexedDB image');
  }
}

/** Production adapter for the pure transaction state machine. */
export function workspaceImportRuntimeAdapter(): WorkspaceImportTransactionAdapter<WorkspaceImportRuntimePlan> {
  return {
    backup: captureRuntimePlan,
    apply: applyRuntimePlan,
    verify: verifyRuntimePlan,
    rollback: rollbackRuntimePlan,
    verifyRollback: verifyRuntimeRollback
  };
}
