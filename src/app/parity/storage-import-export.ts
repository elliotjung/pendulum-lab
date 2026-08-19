/** Focused research-storage responsibility extracted from storage-sync.ts. */
/**
 * Persistence: localStorage schema + sanitizers, IndexedDB mirror/hydrate, workspace import/export.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */

import { $ } from './shared';
import { downloadJson } from '../../export/manifest';

import { validateResearchDbArchive, type ResearchDbArchive } from '../../research/researchDb';
import { renderResearchDbRecovery } from './research-db-recovery-ui';
import { isPlainObject } from './research-storage-validation';
import { currentSnapshot, state, toast } from './shared';
import {
  DesignStudyState,
  applySnapshotControls,
  designStudy,
  logResearchRun,
  persistDesignStudy,
  renderResearchWorkbench,
  setDesignStudy
} from './research-workbench';
import { loadFigureCaptionOverrides, saveFigureCaptionOverride } from './figure-export';

import {
  cleanupResearchDbByAge as runResearchDbCleanup,
  previewResearchDbCleanup as runResearchDbCleanupPreview,
  type ResearchStorageCleanupController
} from './storage-cleanup';
import {
  RESEARCH_STORAGE_SCHEMA_VERSION,
  hydrateResearchDb,
  normalizeResearchStorage,
  persistResearchState,
  researchDbInstance,
  resetResearchDbInstance,
  sanitizeRuntimeSnapshot
} from './storage-sync';

export function renderResearchStoragePanel(): void {
  const summary = $('rwStorageSummary');
  if (!summary) return;
  const db = researchDbInstance();
  if (!db.available()) {
    summary.textContent = 'IndexedDB unavailable in this browser; localStorage fallback active.';
    return;
  }
  if (db.recoveryRequired()) {
    renderResearchDbRecovery({
      host: summary,
      db,
      onRecovered: hydrateResearchDb,
      notify: toast
    });
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
      state.research.experiments = state.research.experiments.filter(
        (item) => !Number.isFinite(Date.parse(item.updatedAt)) || Date.parse(item.updatedAt) >= cutoffMs
      );
      state.research.runLog = state.research.runLog.filter(
        (item) => !Number.isFinite(Date.parse(item.timestamp)) || Date.parse(item.timestamp) >= cutoffMs
      );
      if (!state.research.experiments.some((item) => item.id === state.research.selectedExperimentId))
        state.research.selectedExperimentId = state.research.experiments[0]?.id ?? '';
      persistResearchState();
      logResearchRun('workspace', 'IndexedDB age cleanup', `Deleted ${total} records older than ${days} days.`);
    },
    refresh: renderResearchStoragePanel,
    toast
  };
}

export function previewResearchDbCleanup(): void {
  runResearchDbCleanupPreview(storageCleanupController());
}
export function cleanupResearchDbByAge(): void {
  runResearchDbCleanup(storageCleanupController());
}

export function exportResearchDbArchive(): void {
  void (async () => {
    try {
      const archive = await researchDbInstance().exportArchive();
      downloadJson('pendulum_research_db_archive.json', archive);
      logResearchRun(
        'export',
        'Research DB archive export',
        `Full IndexedDB archive (${Object.values(archive.stores).reduce((sum, records) => sum + records.length, 0)} records).`,
        'pendulum_research_db_archive.json'
      );
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
  logResearchRun(
    'export',
    'Workspace export',
    'Full workspace: research state, design study, figure captions, live snapshot.',
    'pendulum_workspace.json'
  );
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
        if (
          rawDesign &&
          rawDesign.schemaVersion === 'pendulum-design-study/v1' &&
          Array.isArray(rawDesign.variables) &&
          Array.isArray(rawDesign.points)
        ) {
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
        logResearchRun(
          'experiment',
          'Workspace restored',
          `${state.research.experiments.length} experiments, ${droppedEntries} entries dropped during sanitisation.`
        );
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
      resetResearchDbInstance();
      toast('IndexedDB research store cleared');
      renderResearchStoragePanel();
    } catch (error) {
      toast(`Clear failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
}
