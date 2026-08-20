/** Focused research-storage responsibility extracted from storage-sync.ts. */
/**
 * Persistence: localStorage schema + sanitizers, IndexedDB mirror/hydrate, workspace import/export.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */

import { migrateFromLocalStorageV2, ResearchDb, ResearchDbRecoveryRequiredError } from '../../research/researchDb';

import { ResearchExperiment, ResearchStoragePayload, state } from './shared';
import { renderResearchWorkbench } from './research-workbench';

import {
  RESEARCH_STORAGE_KEY,
  RESEARCH_STORAGE_SCHEMA_VERSION,
  MAX_RESEARCH_EXPERIMENTS,
  sanitizeResearchExperiment,
  normalizeResearchStorage,
  renderResearchStoragePanel
} from './storage-sync';

export function loadResearchState(): void {
  try {
    const raw = window.localStorage?.getItem(RESEARCH_STORAGE_KEY);
    if (raw) {
      const { research, migrations, droppedEntries } = normalizeResearchStorage(JSON.parse(raw));
      state.research = research;
      if (migrations.length || droppedEntries > 0) {
        state.auditLog.unshift(
          `research storage normalized: ${migrations.join(', ') || 'current schema'}; dropped ${droppedEntries} invalid entr${droppedEntries === 1 ? 'y' : 'ies'}`
        );
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
    writeResearchResumeCache();
  } catch (error) {
    state.lastFault = `Research storage failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  mirrorResearchStateToDb();
}

function writeResearchResumeCache(): void {
  const payload: ResearchStoragePayload = {
    schemaVersion: RESEARCH_STORAGE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    migrations: [],
    droppedEntries: 0,
    ...state.research
  };
  if (!window.localStorage) throw new Error('localStorage is unavailable');
  window.localStorage.setItem(RESEARCH_STORAGE_KEY, JSON.stringify(payload));
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

/** Reset the singleton only after an explicit destructive database operation. */
export function resetResearchDbInstance(): void {
  researchDbSingleton = null;
}

export let researchDbMirrorTimer = 0;

async function mirrorResearchStateToDbNow(): Promise<void> {
  const db = researchDbInstance();
  if (!db.available()) return;
  await db.putMany(
    'experiments',
    state.research.experiments.map((experiment) => ({ id: experiment.id, payload: experiment }))
  );
  await db.putMany(
    'runLog',
    state.research.runLog.map((entry) => ({ id: entry.id, payload: entry }))
  );
  const study = state.research.parameterStudy;
  if (study) {
    await db.put('parameterStudies', study.id, study);
    const results = study.experiments
      .filter((point) => point.results)
      .map((point) => ({
        id: `${study.id}:${point.id}`,
        payload: { studyId: study.id, pointId: point.id, patch: point.patch, results: point.results }
      }));
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
}

/** Durably flush both resume cache and IndexedDB before an approved app update. */
export async function flushResearchStateForUpdate(): Promise<void> {
  window.clearTimeout(researchDbMirrorTimer);
  researchDbMirrorTimer = 0;
  writeResearchResumeCache();
  await mirrorResearchStateToDbNow();
}

/** Debounced async mirror of the workbench state into IndexedDB. */
export function mirrorResearchStateToDb(): void {
  const db = researchDbInstance();
  if (!db.available()) return;
  window.clearTimeout(researchDbMirrorTimer);
  researchDbMirrorTimer = window.setTimeout(() => {
    void (async () => {
      try {
        await mirrorResearchStateToDbNow();
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
      if (error instanceof ResearchDbRecoveryRequiredError) renderResearchStoragePanel();
    }
  })();
}
