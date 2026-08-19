/** Focused governance responsibility extracted from governance-ui.ts. */
/**
 * Governance surfaces: extra tabs, palettes, onboarding, feature badge/audit UI, stable modes.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import { $ } from './shared';
import type { RunMode } from '../../types/domain';

import { downloadJson } from '../../export/manifest';

import { append, button, card, currentSnapshot, html, kvGrid } from './shared';
import {
  exportFaultReport,
  exportValidationJson,
  runAPlusAudit,
  runLegacyValidationSurface
} from './runtime-diagnostics';

import { showCommandPalette } from './command-palette';
import { trustSection, type TrustSection } from '../trustDrawer';

import { metric, selectRow } from './governance-elements';
import { createControlSearch, filterControls } from './control-search';
import { showStableHelp } from './stable-help';
import {
  showOnboarding,
  exportFeatureReport,
  exportManifest,
  applyStableDefaults,
  applyAccuracyMode,
  applyPerformanceMode,
  recoverSimulation,
  setMode
} from './governance-ui';

export function mountTrustCard(section: TrustSection, node: HTMLElement, fallback: () => void): void {
  const host = trustSection(section);
  if (host) host.append(node);
  else fallback();
}

export function installStablePanel(): void {
  if ($('stableIntuitivePanel')) return;
  const panel = html('section', { id: 'stableIntuitivePanel', className: 'si-panel' });
  const top = html('div', { className: 'si-top' });
  const titleBlock = html('div');
  append(
    titleBlock,
    html('div', { className: 'si-title', text: 'Simulation Assistance' }),
    html('div', {
      className: 'si-desc',
      text: 'Runtime assistance. Auto-actions are disabled in Research and Benchmark modes.'
    })
  );
  const status = html('div', { className: 'si-status' });
  append(
    status,
    metric('siFps', 'FPS'),
    metric('siPhys', 'Sim Cost'),
    metric('siDrift', 'Energy Drift'),
    metric('siRecoveries', 'Recoveries', '0')
  );
  const actions = html('div', { className: 'si-actions' });
  const autoLabel = html('label', { className: 'si-toggle', text: ' Auto-stabilize' });
  const auto = html('input', { id: 'siAutoAssist' });
  auto.type = 'checkbox';
  auto.checked = true;
  autoLabel.prepend(auto);
  append(
    actions,
    button('siStableDefaults', 'Stable Defaults', () => applyStableDefaults(), 'primary'),
    button('siAccuracyMode', 'Accuracy Mode', () => applyAccuracyMode()),
    button('siPerfMode', 'Performance Mode', () => applyPerformanceMode()),
    button('siRecoverBtn', 'Recover', () => recoverSimulation(), 'danger'),
    button('siHelpBtn', 'Help', () => showStableHelp()),
    autoLabel
  );
  append(top, titleBlock, status, actions);
  const guide = html('div', { className: 'si-guide' });
  append(
    guide,
    html('div', { id: 'siAdvice', className: 'si-note', text: 'Status: initializing' }),
    createControlSearch()
  );
  append(panel, top, guide);
  mountTrustCard('performance', panel, () => {
    const anchor = document.querySelector('.diag-row') ?? document.querySelector('header');
    if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    else document.body.prepend(panel);
  });
  filterControls('');
}

export function installResearchStatusCards(): void {
  const controls = document.querySelector('#tab-lab .controls');
  if (!controls) return;
  // Every status/governance card lives in the Trust & Diagnostics drawer;
  // the Lab column keeps only the simulation controls. Internal generation
  // ids (v10/rgv7/rgv8/sfv9) stay for tooling, but user-facing labels don't
  // carry version archaeology.
  if (!$('v10StatusCard')) {
    const cardNode = html('section', { id: 'v10StatusCard', className: 'v10-card' });
    const title = html('div', { className: 'v10-title', text: 'Research Control' });
    title.append(html('span', { id: 'v10ConfidenceBadge', className: 'v10-badge', text: 'pending' }));
    const modeRow = html('div', { className: 'row' });
    const modeSelect = html('select', { id: 'v10RunMode' });
    for (const mode of ['demo', 'education', 'research', 'benchmark'] as const)
      modeSelect.append(html('option', { value: mode, text: mode }));
    modeSelect.addEventListener('change', () => setMode(modeSelect.value as RunMode));
    append(modeRow, html('label', { text: 'Mode' }), modeSelect);
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button('v10RunValidation', 'Run validation suite', () => runLegacyValidationSurface(), 'primary'),
      button('v10ExportManifest', 'Research Export', () => exportManifest('pendulum_manifest_v10_ts.json')),
      button('v10ExportSession', 'Session Export', () =>
        downloadJson('pendulum_session_v10_ts.json', currentSnapshot())
      ),
      button('v10ExportValidation', 'Validation JSON', () => exportValidationJson())
    );
    append(
      cardNode,
      title,
      modeRow,
      html('div', { id: 'v10MethodCard', className: 'v10-method', text: 'Method metadata pending.' }),
      html('div', { id: 'v10WarningBox', className: 'v10-warnings' }),
      actions
    );
    mountTrustCard('validation', cardNode, () => controls.insertBefore(cardNode, controls.querySelector('.acc')));
  }
  if (!$('riScientificStatusPanel')) {
    const panel = html('section', { id: 'riScientificStatusPanel', className: 'ri-panel' });
    const title = html('div', { className: 'ri-title', text: 'Scientific Status ' });
    title.append(html('span', { id: 'riStatusMini', className: 'ri-chip info', text: 'live' }));
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button('riRunValidation', 'Run governance validation', () => runLegacyValidationSurface(), 'primary'),
      button('riExportManifest', 'Export manifest', () => exportManifest('pendulum_manifest_ri_ts.json')),
      button('riExportCrash2', 'Crash dump', () => exportFaultReport('manual'))
    );
    append(panel, title, html('div', { id: 'riStatusGrid', className: 'ri-grid' }), actions);
    mountTrustCard('validation', panel, () => controls.insertBefore(panel, controls.querySelector('.acc')));
  }
  if (!$('rgv7ControlCard')) {
    const panel = html('section', { id: 'rgv7ControlCard', className: 'rgv7-card ri-panel' });
    const modeRow = html('div', { className: 'row' });
    const modeSelect = html('select', { id: 'rgv7ModeSelect' });
    for (const mode of ['research', 'education', 'demo'] as const)
      modeSelect.append(html('option', { value: mode, text: `${mode} mode` }));
    modeSelect.addEventListener('change', () => setMode(modeSelect.value as RunMode));
    append(modeRow, html('label', { text: 'Mode' }), modeSelect);
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button('rgv7RunTestsShadow', 'Run validation', () => runLegacyValidationSurface(), 'primary'),
      button('rgv7ShowCommandsShadow', 'Commands', () => showCommandPalette())
    );
    append(
      panel,
      html('div', { className: 'ri-title', text: 'Research governance' }),
      modeRow,
      html('div', {
        id: 'rgv7ValidityLine',
        className: 'rgv7-note honesty-note',
        text: 'Initializing validity status.'
      }),
      html('div', { id: 'rgv7RuntimeGrid', className: 'stats' }),
      actions
    );
    mountTrustCard('provenance', panel, () => controls.insertBefore(panel, controls.querySelector('.acc')));
  }
  if (!$('rgv8GovCard')) {
    const panel = html('section', { id: 'rgv8GovCard', className: 'rgv8-card' });
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button('rgv8Validate', 'Run validation', () => runLegacyValidationSurface(), 'primary'),
      button('rgv8Manifest', 'Export manifest', () => exportManifest('pendulum_manifest_v8_ts.json')),
      button('rgv8Fault', 'Export Fault Report', () => exportFaultReport('manual')),
      button('rgv8Onboard', 'Onboarding', () => showOnboarding())
    );
    append(
      panel,
      html('h3', { text: 'Governance exports' }),
      html('div', { id: 'rgv8RuntimePanel', className: 'stats' }),
      actions
    );
    mountTrustCard('provenance', panel, () => controls.insertBefore(panel, controls.querySelector('.acc')));
  }
  if (!$('sfv9Panel')) {
    const panel = html('section', { id: 'sfv9Panel', className: 'sfv9-card' });
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button(
        'sfv9AuditRunShadow',
        'Run Platform Audit',
        () => {
          runAPlusAudit(true);
        },
        'primary'
      ),
      button('sfv9ExportShadow', 'Export audit report', () => exportFeatureReport())
    );
    append(
      panel,
      html('h3', { text: 'Platform audit' }),
      html('div', { id: 'sfv9Summary', className: 'stats' }),
      actions,
      html('pre', { id: 'sfv9AuditLog', className: 'rg-log', text: 'Audit not run yet.' })
    );
    mountTrustCard('provenance', panel, () => controls.append(panel));
  }
  installPlxCards(controls);
  installCanonicalDiag(controls);
}

export function installPlxCards(controls: Element): void {
  if (!$('plxModeCard')) {
    const body = html('div');
    const select = html('select', { id: 'plxRunMode', className: 'plx-select' });
    for (const mode of ['demo', 'scientific', 'education', 'research'] as const) {
      const opt = html('option', { value: mode === 'scientific' ? 'research' : mode, text: `${mode} mode` });
      select.append(opt);
    }
    select.addEventListener('change', () => setMode(select.value as RunMode));
    append(body, select, html('div', { id: 'plxModeNote', className: 'plx-note' }));
    const node = card('Run Mode', body, 'plxModeCard', 'plx-card');
    mountTrustCard('provenance', node, () => controls.append(node));
  }
  if (!$('plxPhysicsSummary')) {
    const node = card(
      'Current Physics Summary',
      html('div', { id: 'plxPhysicsSummary', className: 'plx-grid' }),
      'plxPhysicsCard',
      'plx-card'
    );
    mountTrustCard('health', node, () => controls.append(node));
  }
  if (!$('plxBadges')) {
    const node = card(
      'Validation Badges',
      html('div', { id: 'plxBadges', className: 'plx-badge-row' }),
      'plxBadgesCard',
      'plx-card'
    );
    mountTrustCard('validation', node, () => controls.append(node));
  }
  if (!$('plxRuntimeSummary')) {
    const body = html('div');
    append(
      body,
      html('div', { id: 'plxRuntimeSummary', className: 'plx-grid' }),
      html('div', { id: 'plxErrorLog', className: 'plx-log', text: 'no runtime errors' })
    );
    const node = card('Runtime / Error Log', body, 'plxRuntimeCard', 'plx-card');
    mountTrustCard('faults', node, () => controls.append(node));
  }
  if (!$('plxAuditLog')) {
    const node = card(
      'Auto-Stabilization Audit',
      html('div', { id: 'plxAuditLog', className: 'plx-log', text: 'no automatic mutations recorded' }),
      'plxAuditCard',
      'plx-card'
    );
    mountTrustCard('faults', node, () => controls.append(node));
  }
  if (!$('plxMethodCaps')) {
    const node = card(
      'Method Capabilities',
      html('div', { id: 'plxMethodCaps', className: 'plx-grid' }),
      'plxMethodCapsCard',
      'plx-card'
    );
    mountTrustCard('health', node, () => controls.append(node));
  }
}

export function installCanonicalDiag(controls: Element): void {
  if ($('canonicalDiag')) return;
  const diag = html('section', { id: 'canonicalDiag', className: 'v10-card' });
  append(
    diag,
    html('div', { className: 'v10-title', text: 'Canonical Diagnostics' }),
    kvGrid('canonicalDiagGrid', [
      ['canonical residual', '-', 'info'],
      ['symplectic defect', '-', 'info'],
      ['RKF45 accepted/rejected', '-', 'info']
    ])
  );
  const grid = diag.querySelector('#canonicalDiagGrid');
  if (grid) {
    grid.children.item(0)?.querySelector('.sval')?.setAttribute('id', 'canonResidualStat');
    grid.children.item(1)?.querySelector('.sval')?.setAttribute('id', 'symplDefectStat');
    grid.children.item(2)?.querySelector('.sval')?.setAttribute('id', 'rkfStat');
  }
  mountTrustCard('health', diag, () => controls.append(diag));
}

export function installLabLeftPanels(): void {
  const left = document.querySelector('#tab-lab .left-col');
  if (!left) return;
  if (!$('riAnalysisControls')) {
    // Plot configuration stays with the plots it controls, but folded into a
    // collapsed accordion so the default Lab view is just canvas + plots.
    const panel = html('details', { id: 'riAnalysisControls', className: 'acc ri-panel' });
    const summary = html('summary');
    append(
      summary,
      html('span', { className: 'acc-icon', text: '⚙' }),
      html('span', { className: 'acc-label', text: 'Plot configuration' }),
      html('span', { className: 'acc-arrow', text: '›' })
    );
    panel.append(summary);
    const body = html('div', { className: 'acc-body' });
    const grid = html('div', { className: 'ri-grid' });
    append(
      grid,
      selectRow('riPoincVar', 'section var', ['theta1', 'theta2', 'omega1', 'omega2']),
      selectRow('riPoincDir', 'direction', ['positive', 'negative', 'both']),
      selectRow('riPoincAxes', 'axes', ['theta2-omega2', 'theta1-omega1']),
      selectRow('riFFTSignal', 'FFT signal', ['theta1', 'theta2', 'omega1']),
      selectRow('riFFTWindow', 'FFT window', ['hann', 'rect', 'blackman']),
      selectRow('riFFTScale', 'FFT scale', ['log', 'linear'])
    );
    append(
      body,
      grid,
      html('div', {
        id: 'riPlotStamp',
        className: 'honesty-note',
        text: 'Plots use bounded buffers and exported settings.'
      }),
      button('riClearPoinc', 'Clear Poincare', () => $('clearPoincBtn')?.click())
    );
    panel.append(body);
    left.append(panel);
  }
  if (!$('rgv7ValidationCard')) {
    const panel = html('section', { id: 'rgv7ValidationCard', className: 'ri-panel' });
    append(
      panel,
      html('div', { className: 'ri-title', text: 'Research Validation' }),
      html('div', { id: 'rgv7ValidationResults', className: 'rg-log', text: 'No governance validation run yet.' })
    );
    mountTrustCard('validation', panel, () => left.append(panel));
  }
  if (!$('rgv8Honesty')) {
    const panel = html('section', { id: 'rgv8Honesty', className: 'rgv8-card' });
    append(
      panel,
      html('h3', { text: 'Model caveats' }),
      html('div', {
        className: 'honesty-note warn',
        text: 'Triple mode and theta/omega pseudo-symplectic methods are labelled experimental or approximate.'
      })
    );
    mountTrustCard('health', panel, () => left.append(panel));
  }
}
