/** Focused research-storage responsibility extracted from storage-sync.ts. */
/**
 * Persistence: localStorage schema + sanitizers, IndexedDB mirror/hydrate, workspace import/export.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */

import { downloadJson } from '../../export/manifest';

import {
  ResearchDbPreviewLimitError,
  validateResearchDbArchive,
  type ResearchDbArchive
} from '../../research/researchDb';
import { renderResearchDbRecovery } from './research-db-recovery-ui';
import { $, currentSnapshot, installStyle, state, toast } from './shared';
import { designStudy, logResearchRun } from './research-workbench';
import { loadFigureCaptionOverrides } from './figure-export';

import {
  cleanupResearchDbByAge as runResearchDbCleanup,
  previewResearchDbCleanup as runResearchDbCleanupPreview,
  type ResearchStorageCleanupController
} from './storage-cleanup';
import {
  RESEARCH_STORAGE_SCHEMA_VERSION,
  hydrateResearchDb,
  persistResearchState,
  researchDbInstance,
  resetResearchDbInstance
} from './storage-sync';
import {
  buildResearchDbImportPreview,
  formatResearchDbImportPreview,
  formatStorageImportDiagnostic,
  readStorageImportFile,
  storageImportFailure,
  validateWorkspaceImportDocument,
  type ResearchDbImportPreview,
  type StorageImportDiagnostic
} from './storage-import-guards';
import { workspaceImportRuntimeAdapter } from './workspace-import-runtime';
import {
  runWorkspaceImportTransaction,
  stageWorkspaceImport,
  type WorkspaceImportDiagnostic,
  type WorkspaceImportTransactionResult
} from './workspace-import-transaction';

interface ImportDialogAction {
  value: 'merge' | 'replace' | 'restore';
  label: string;
  primary?: boolean;
}

let workspaceImportInFlight = false;

function reportStorageImportDiagnostic(value: StorageImportDiagnostic): void {
  // Deliberately omit file name and payload content from the diagnostic log.
  console.warn('Pendulum storage import rejected', {
    code: value.code,
    kind: value.kind,
    ...(value.byteLength === undefined ? {} : { byteLength: value.byteLength })
  });
  toast(formatStorageImportDiagnostic(value));
}

function reportWorkspaceTransactionDiagnostic(
  result: WorkspaceImportTransactionResult | { status: 'rejected'; diagnostics: WorkspaceImportDiagnostic[] }
): void {
  const diagnostic = result.diagnostics.at(-1);
  if (!diagnostic) return;
  const detail = { status: result.status, codes: result.diagnostics.map((entry) => entry.code) };
  if (result.status !== 'committed') console.warn('Pendulum workspace import did not commit', detail);
  window.dispatchEvent(new CustomEvent('pendulum-lab:workspace-import-result', { detail }));
  toast(`[${diagnostic.code}] ${diagnostic.message}`, diagnostic.severity === 'critical' ? 8_000 : 5_200);
}

function installImportPreviewStyle(): void {
  installStyle(
    'research-import-preview-style',
    `
.research-import-preview{width:min(700px,calc(100vw - 28px));max-height:min(720px,calc(100dvh - 28px));padding:0;border:1px solid var(--workbench-border-strong,rgba(205,214,245,.18));border-radius:12px;background:var(--workbench-elevated,#151a28);color:var(--workbench-text,#f1f3f8);box-shadow:0 28px 80px rgba(0,0,0,.52)}
.research-import-preview::backdrop{background:rgba(4,6,10,.76);backdrop-filter:blur(5px)}
.research-import-preview-head{padding:18px 20px 10px}.research-import-preview-head h2{margin:0;font:650 16px/1.25 var(--font-sans,system-ui)}
.research-import-preview-copy{margin:0 20px 4px;padding:12px;max-height:min(52dvh,440px);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid var(--workbench-border,rgba(205,214,245,.10));border-radius:8px;background:var(--workbench-raised,#0b0e17);color:var(--workbench-text-secondary,#a8b0c2);font:11px/1.55 var(--font-mono,monospace)}
.research-import-preview-note{margin:10px 20px;color:var(--workbench-text-muted,#8d96aa);font:11px/1.45 var(--font-sans,system-ui)}
.research-import-preview-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:12px 20px 18px}.research-import-preview-actions button{min-height:38px}
@media(max-width:520px){.research-import-preview{width:calc(100vw - 16px);max-height:calc(100dvh - 16px)}.research-import-preview-head{padding:16px 14px 9px}.research-import-preview-copy{margin-inline:14px}.research-import-preview-note{margin-inline:14px}.research-import-preview-actions{padding:10px 14px 14px}.research-import-preview-actions button{flex:1 1 120px}}
@media(forced-colors:active){.research-import-preview{background:Canvas;color:CanvasText;border-color:CanvasText;box-shadow:none}.research-import-preview-copy{background:Canvas;color:CanvasText;border-color:CanvasText}}
`
  );
}

async function requestImportAction(
  titleText: string,
  previewText: string,
  actions: ImportDialogAction[]
): Promise<ImportDialogAction['value'] | null> {
  installImportPreviewStyle();
  const dialog = document.createElement('dialog');
  if (typeof HTMLDialogElement === 'undefined' || typeof dialog.showModal !== 'function') {
    const safeAction = actions[0];
    if (!safeAction) return null;
    return window.confirm(`${previewText}\n\nContinue with ${safeAction.label}?`) ? safeAction.value : null;
  }
  dialog.className = 'research-import-preview';
  dialog.setAttribute('aria-labelledby', 'researchImportPreviewTitle');
  const header = document.createElement('header');
  header.className = 'research-import-preview-head';
  const title = document.createElement('h2');
  title.id = 'researchImportPreviewTitle';
  title.textContent = titleText;
  header.append(title);
  const copy = document.createElement('pre');
  copy.className = 'research-import-preview-copy';
  copy.textContent = previewText;
  const note = document.createElement('p');
  note.className = 'research-import-preview-note';
  note.textContent = 'Nothing changes until you choose an import mode. Cancel keeps all current data.';
  const actionRow = document.createElement('div');
  actionRow.className = 'research-import-preview-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => dialog.close('cancel'));
  actionRow.append(cancel);
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    if (action.primary) button.className = 'primary';
    button.addEventListener('click', () => dialog.close(action.value));
    actionRow.append(button);
  }
  dialog.append(header, copy, note, actionRow);
  document.body.append(dialog);
  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => {
        const selected = actions.find((action) => action.value === dialog.returnValue)?.value ?? null;
        dialog.remove();
        resolve(selected);
      },
      { once: true }
    );
    try {
      dialog.showModal();
      cancel.focus();
    } catch {
      const safeAction = actions[0];
      dialog.remove();
      resolve(
        safeAction && window.confirm(`${previewText}\n\nContinue with ${safeAction.label}?`) ? safeAction.value : null
      );
    }
  });
}

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
        const read = await readStorageImportFile<ResearchDbArchive>(file, 'research-db');
        if (!read.ok) {
          reportStorageImportDiagnostic(read.diagnostic);
          return;
        }
        const validation = validateResearchDbArchive(read.value);
        if (!validation.ok) {
          const failure = storageImportFailure(
            'research-db',
            'IMPORT_SCHEMA_INVALID',
            `Research DB archive schema rejected: ${validation.problems[0] ?? 'invalid archive'}.`,
            'Re-export from a current Pendulum Lab version; no database records were changed.',
            read.stats.byteLength
          );
          if (!failure.ok) reportStorageImportDiagnostic(failure.diagnostic);
          return;
        }
        const db = researchDbInstance();
        let preview: ResearchDbImportPreview;
        try {
          preview = await buildResearchDbImportPreview(read.value, db);
        } catch (error) {
          const exceededPreviewLimit = error instanceof ResearchDbPreviewLimitError;
          const failure = storageImportFailure(
            'research-db',
            'IMPORT_PREVIEW_FAILED',
            `Could not inspect the current database: ${error instanceof Error ? error.message : String(error)}`,
            exceededPreviewLimit
              ? 'Reduce existing records with the storage cleanup controls, export a backup, then retry. No records were changed.'
              : 'Retry after storage access is available. No records were changed.',
            read.stats.byteLength
          );
          if (!failure.ok) reportStorageImportDiagnostic(failure.diagnostic);
          return;
        }
        const mode = await requestImportAction(
          'Review Research DB import',
          formatResearchDbImportPreview(preview, read.stats.byteLength),
          [
            { value: 'merge', label: 'Merge safely', primary: true },
            { value: 'replace', label: 'Replace database' }
          ]
        );
        if (mode !== 'merge' && mode !== 'replace') {
          toast('[IMPORT_CANCELLED] Research DB import cancelled; no records changed.');
          return;
        }
        const { imported } = await db.importArchive(read.value, mode);
        toast(`Imported ${imported} records into IndexedDB (${mode})`);
        hydrateResearchDb();
      } catch (error) {
        const failure = storageImportFailure(
          'research-db',
          'IMPORT_APPLY_FAILED',
          `Research DB import failed: ${error instanceof Error ? error.message : String(error)}`,
          'The atomic transaction was rolled back. Check browser storage quota and retry.'
        );
        if (!failure.ok) reportStorageImportDiagnostic(failure.diagnostic);
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
        const read = await readStorageImportFile<Record<string, unknown>>(file, 'workspace');
        if (!read.ok) {
          reportStorageImportDiagnostic(read.diagnostic);
          return;
        }
        const workspaceProblems = validateWorkspaceImportDocument(read.value);
        if (workspaceProblems.length > 0) {
          const failure = storageImportFailure(
            'workspace',
            'IMPORT_SCHEMA_INVALID',
            `Workspace schema rejected: ${workspaceProblems[0]}.`,
            'Choose a complete pendulum_workspace.json exported by the current application; nothing was restored.',
            read.stats.byteLength
          );
          if (!failure.ok) reportStorageImportDiagnostic(failure.diagnostic);
          return;
        }
        const staged = stageWorkspaceImport(read.value);
        if (!staged.ok) {
          reportWorkspaceTransactionDiagnostic({ status: 'rejected', diagnostics: [staged.diagnostic] });
          return;
        }
        const workspace = staged.value;
        const preview = [
          `Workspace restore preview (${(read.stats.byteLength / 1024).toFixed(1)} KiB)`,
          `Research state will be replaced: ${state.research.experiments.length} → ${workspace.research.experiments.length} experiments; ${state.research.runLog.length} → ${workspace.research.runLog.length} run-log entries.`,
          `${workspace.droppedResearchEntries} invalid or over-limit research entries were removed during staging.`,
          workspace.restoreDesignStudy
            ? `Design study will be restored (${workspace.designStudy?.points.length ?? 0} points).`
            : 'No design study replacement is present; the current design study will remain unchanged.',
          workspace.mergeFigureCaptions
            ? `${Object.keys(workspace.figureCaptionPatch).length} known figure caption override(s) will be merged${workspace.ignoredFigureCaptionIds.length ? `; ${workspace.ignoredFigureCaptionIds.length} unknown future caption id(s) will be ignored` : ''}.`
            : 'No figure caption replacement is present; current overrides will remain unchanged.',
          workspace.restoreSnapshot
            ? 'Live simulator controls will be replaced by the imported snapshot.'
            : 'No live snapshot replacement is present; current simulator state will remain unchanged.',
          'Before any mutation, all affected local, IndexedDB, workbench, design, caption, control, and simulator state will be backed up. Any failed apply or verification triggers a verified rollback.'
        ].join('\n');
        const action = await requestImportAction('Review workspace restore', preview, [
          { value: 'restore', label: 'Restore workspace', primary: true }
        ]);
        if (action !== 'restore') {
          toast('[IMPORT_CANCELLED] Workspace restore cancelled; current workspace kept.');
          return;
        }
        if (workspaceImportInFlight) {
          reportWorkspaceTransactionDiagnostic({
            status: 'rejected',
            diagnostics: [
              {
                code: 'WORKSPACE_IMPORT_BUSY',
                phase: 'backup',
                severity: 'warning',
                message: 'Another workspace restore is already in progress; this file was not applied.'
              }
            ]
          });
          return;
        }
        workspaceImportInFlight = true;
        try {
          const result = await runWorkspaceImportTransaction(workspace, workspaceImportRuntimeAdapter());
          reportWorkspaceTransactionDiagnostic(result);
        } finally {
          workspaceImportInFlight = false;
        }
      } catch (error) {
        const failure = storageImportFailure(
          'workspace',
          'IMPORT_APPLY_FAILED',
          `Workspace restore failed: ${error instanceof Error ? error.message : String(error)}`,
          'The import did not reach the transactional apply boundary. Retry with a fresh workspace export.'
        );
        if (!failure.ok) reportStorageImportDiagnostic(failure.diagnostic);
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
