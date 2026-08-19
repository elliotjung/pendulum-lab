/** Focused diagnostics responsibility extracted from runtime-diagnostics.ts. */
/**
 * Diagnostics: validation surfaces, probes, audits, runtime panels, floating diag.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */

import { $ } from './shared';
import { downloadJson } from '../../export/manifest';
import { runAllValidationChecks } from '../../validation/validationSuite';

import {
  LEGACY_VALIDATION_IDS,
  append,
  button,
  currentSnapshot,
  detailsCard,
  downloadText,
  html,
  kvGrid,
  record,
  row,
  state
} from './shared';

import { recoverSimulation } from './governance-ui';

import { runLegacyValidationSurface, runDriftSmoke, restoreLastCheckpoint } from './runtime-diagnostics';

export function installValidationExtensions(): void {
  const validateLeft = document.querySelector('#tab-validate .left-col > div');
  if (validateLeft && !$('patchValidationBox')) {
    const box = html('section', { id: 'patchValidationBox', className: 'ri-panel' });
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button('runPatchValidation', 'Run added tests', () => runLegacyValidationSurface(), 'primary'),
      button('exportPatchLog', 'Export patch log', () => exportPatchLog())
    );
    append(
      box,
      html('div', { className: 'ri-title', text: 'Preservation patch validation' }),
      actions,
      html('div', {
        id: 'patchValidationResults',
        className: 'patch-changelog rg-log',
        text: 'No added tests run yet.'
      })
    );
    validateLeft.append(box);
  }
  if (validateLeft && !$('plxDriftTests')) {
    const box = html('section', { id: 'plxDriftTests' });
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button('plxDrift10', 'Energy Drift 10s', () => runDriftSmoke(10)),
      button('plxDrift60', 'Energy Drift 60s', () => runDriftSmoke(60)),
      button('plxDriftExt', 'Energy Drift Extended', () => runDriftSmoke(120))
    );
    append(
      box,
      actions,
      html('div', { id: 'plxDriftResults', className: 'plx-log', text: 'No long-run drift test has been run.' })
    );
    validateLeft.append(box);
  }
  const validateControls = document.querySelector('#tab-validate .controls');
  if (validateControls && !$('rgv8Commercial')) {
    validateControls.append(
      detailsCard(
        'Commercial Readiness',
        kvGrid('rgv8CommercialGrid', [
          ['policy', 'Research evidence policy'],
          ['privacy', 'local-only'],
          ['export reproducibility', 'manifest + hash']
        ]),
        'rgv8Commercial'
      )
    );
  }
  const validateNoteAnchor = $('validateResults');
  if (validateNoteAnchor?.parentElement && !$('rgv8ValidateNote')) {
    const note = html('div', {
      id: 'rgv8ValidateNote',
      className: 'honesty-note',
      text: 'Validation includes independent RHS, energy derivative, replay, damping downgrade, worker fallback, and Poincare settings checks.'
    });
    validateNoteAnchor.parentElement.insertBefore(note, validateNoteAnchor);
  }
  if ($('stats') && !$('modeStat')) {
    $('stats')?.append(
      row('mode', '-', 'info'),
      row('conservation', '-', 'info'),
      row('method class', '-', 'info'),
      row('method note', '-', 'info'),
      row('RKF45 dt / err', '-', 'info'),
      row('Lyapunov reliability', '-', 'info')
    );
    $('stats')
      ?.children.item(($('stats')?.children.length ?? 0) - 6)
      ?.querySelector('.sval')
      ?.setAttribute('id', 'modeStat');
    $('stats')
      ?.children.item(($('stats')?.children.length ?? 0) - 5)
      ?.querySelector('.sval')
      ?.setAttribute('id', 'conservationStat');
    $('stats')
      ?.children.item(($('stats')?.children.length ?? 0) - 4)
      ?.querySelector('.sval')
      ?.setAttribute('id', 'methodClassStat');
    $('stats')
      ?.children.item(($('stats')?.children.length ?? 0) - 3)
      ?.querySelector('.sval')
      ?.setAttribute('id', 'methodNoteStat');
    $('stats')
      ?.children.item(($('stats')?.children.length ?? 0) - 2)
      ?.querySelector('.sval')
      ?.setAttribute('id', 'rkfDetailStat');
    $('stats')
      ?.children.item(($('stats')?.children.length ?? 0) - 1)
      ?.querySelector('.sval')
      ?.setAttribute('id', 'lyapReliabilityStat');
  }
}

export function installErrorPanel(): void {
  if ($('riErrorPanel')) return;
  const panel = html('div', {
    id: 'riErrorPanel',
    className: 'rgv8-overlay',
    role: 'dialog',
    ariaLabel: 'Runtime fault report'
  });
  const box = html('div', { className: 'rgv8-modal' });
  append(
    box,
    html('h2', { text: 'Runtime Fault' }),
    html('div', { id: 'riErrorSummary', className: 'honesty-note bad', text: 'No fault active.' }),
    html('pre', { id: 'riErrorContext', className: 'rg-log', text: 'No context.' }),
    button('riExportCrash', 'Export Crash Dump', () => exportFaultReport('manual'), 'primary'),
    button('riRestoreSnapshot', 'Restore Snapshot', () => restoreLastCheckpoint()),
    button('riResetAfterCrash', 'Reset After Crash', () => recoverSimulation()),
    button('riDismissError', 'Dismiss', () => panel.classList.remove('show'))
  );
  panel.append(box);
  document.body.append(panel);
  const faultPanel = html('div', { id: 'rgv7FaultPanel', className: 'rgv7-fault' });
  append(faultPanel, html('pre', { id: 'rgv7FaultText', text: 'No fault active.' }));
  document.body.append(faultPanel);
}

export function exportValidationJson(): void {
  const results = state.lastValidation ?? runAllValidationChecks().value ?? [];
  downloadJson('pendulum_validation_legacy_ids_v10_ts.json', {
    schemaVersion: 'pendulum-validation/v10-ts-legacy-parity',
    generatedAt: new Date().toISOString(),
    legacyIds: LEGACY_VALIDATION_IDS,
    results
  });
}

export function exportFaultReport(reason: string): void {
  const report = {
    schemaVersion: 'pendulum-fault/v10-ts',
    generatedAt: new Date().toISOString(),
    reason,
    lastFault: state.lastFault,
    snapshot: currentSnapshot(),
    checkpoints: state.checkpoints.length
  };
  downloadJson('pendulum_fault_report_v10_ts.json', report);
  record('exported fault report');
}

export function exportPatchLog(): void {
  downloadText(
    'pendulum_patch_log_v10_ts.md',
    ['# Pendulum Lab Patch Log', '', ...state.auditLog.map((line) => `- ${line}`)].join('\n'),
    'text/markdown;charset=utf-8'
  );
}
