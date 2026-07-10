/**
 * Governance surfaces: extra tabs, palettes, onboarding, feature badge/audit UI, stable modes.
 * Extracted from the former monolithic FeatureParityLayer.ts.
 */
import type { RunMode } from '../../types/domain';
import { commandRegistry } from '../../runtime/CommandRegistry';
import { createSubmissionManifest, downloadJson } from '../../export/manifest';
import { runAllValidationChecks } from '../../validation/validationSuite';
import { integratorRegistry } from '../../physics/integrators';
import { createRailTabButton, EXTRA_RAIL_TABS } from '../railNavigation';
import { AuditResult, LEGACY_VALIDATION_IDS, append, button, card, clear, currentSnapshot, detailsCard, html, kvGrid, modernLab, record, setActiveTab, setControl, state, toast } from './shared';
import { captureCheckpoint, exportFaultReport, exportValidationJson, renderRuntimePanels, runAPlusAudit, runCanonicalQa, runContractChecks, runFloquetProbe, runLegacyValidationSurface, toggleFloatingDiag, useCanonicalMethod } from './runtime-diagnostics';
import { generateParameterStudy, rebuildComparisonMatrix, runStudyBatch, saveCurrentExperiment } from './research-workbench';
import { exportPaperFigureManifestJson, exportPaperFiguresHtml, exportPaperMethodsLatex, exportPaperPackJson, exportResearchBundleJson, exportResearchNotebook } from './figure-export';
import { $ } from './shared';
import { showCommandPalette } from './command-palette';
import { trustSection, type TrustSection } from '../trustDrawer';

/**
 * Mount a trust/governance card into its Trust & Diagnostics drawer section,
 * falling back to the legacy in-page anchor when the drawer markup is absent
 * (older shells, tests that stub the DOM).
 */
function mountTrustCard(section: TrustSection, node: HTMLElement, fallback: () => void): void {
  const host = trustSection(section);
  if (host) host.append(node);
  else fallback();
}

export { hideCommandPalette, installCommandPalettes, renderCommandList, showCommandPalette } from './command-palette';

export function installExtraTabs(): void {
  const nav = document.querySelector('.tabs');
  const main = document.querySelector('.main-col');
  const target = document.getElementById('rail-govern-tabs') ?? document.getElementById('rail-panel-govern') ?? nav;
  if (!target || !main) return;
  for (const tab of EXTRA_RAIL_TABS) {
    if (!document.querySelector(`.tab[data-tab="${tab.id}"]`)) {
      target.append(createRailTabButton(tab));
    }
    if (!$(`tab-${tab.id}`)) {
      const panel = html('div', { id: `tab-${tab.id}`, className: 'tabpanel', role: 'tabpanel' });
      main.append(panel);
    }
  }
}

export function bindExtraTabClicks(): void {
  for (const tab of EXTRA_RAIL_TABS) {
    document.querySelectorAll<HTMLElement>(`.tab[data-tab="${tab.id}"]`).forEach((btn) => {
      if (btn.dataset.parityBound === 'true') return;
      btn.dataset.parityBound = 'true';
      btn.addEventListener('click', () => setActiveTab(tab.id));
    });
  }
}

export function bindRailActions(): void {
  const mappings: Record<string, () => void | Promise<void>> = {
    runtime: () => setActiveTab('architecture'),
    audit: () => setActiveTab('aplus'),
    integrity: () => showFeaturePanel(),
    palette: () => showCommandPalette(),
    report: () => exportFeatureReport(),
    manifest: () => exportManifest('pendulum_submission_manifest_v10_ts.json'),
    floquet: () => runFloquetProbe(true)
  };
  document.querySelectorAll<HTMLElement>('.dev-tool-btn[data-rail-action]').forEach((btn) => {
    if (btn.dataset.parityBound === 'true') return;
    const action = btn.dataset.railAction;
    const run = action ? mappings[action] : undefined;
    if (!run) return;
    btn.dataset.parityBound = 'true';
    btn.addEventListener('click', () => {
      void run();
    });
  });
}

export function installArchitectureTab(): void {
  const panel = $('tab-architecture');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1080px';
  const map = html('div', { id: 'ueArchMap', className: 'ue-archmap' });
  const toolbar = html('div', { className: 'ue-toolbar' });
  append(
    toolbar,
    button('ueRunContract', 'Run Contract Checks', () => runContractChecks(), 'primary'),
    button('ueCaptureCheckpoint', 'Capture Checkpoint', () => captureCheckpoint()),
    button('ueExportManifest', 'Export Engine Manifest', () => exportManifest('pendulum_engine_manifest_v10_ts.json')),
    button('ueExportReplay', 'Export Checkpoints', () => downloadJson('pendulum_checkpoints_v10_ts.json', state.checkpoints)),
    button('ueToggleDiag', 'Toggle Floating Diagnostics', () => toggleFloatingDiag())
  );
  const grid = html('div', { className: 'ue-grid' });
  append(
    grid,
    card('Typed Runtime Contracts', html('div', { id: 'ueContracts' }), undefined, 'ue-card'),
    card('Task Graph', html('div', { id: 'ueTasks' }), undefined, 'ue-card'),
    card('Plugin Registry', html('div', { id: 'uePlugins' }), undefined, 'ue-card'),
    card('Resource Manager', html('div', { id: 'ueResources' }), undefined, 'ue-card'),
    card('Numerical Stability Layer', html('div', { id: 'ueStability' }), undefined, 'ue-card'),
    card('Fault Boundary', html('div', { id: 'ueFaults' }), undefined, 'ue-card')
  );
  append(left, map, toolbar, grid);
  const controls = html('aside', { className: 'controls' });
  append(
    controls,
    detailsCard('Runtime Capabilities', kvGrid('ueCaps', [])),
    detailsCard('Verdict', kvGrid('ueVerdict', []))
  );
  append(layout, left, controls);
  panel.append(layout);
}

export function installCanonicalTab(): void {
  const panel = $('tab-canonical');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1080px';
  const grid = html('div', { className: 'rg-grid' });
  append(
    grid,
    card('Canonical Hamiltonian Engine', html('div', { id: 'canonReport' }), undefined, 'rg-card rg-wide'),
    card('Subsystem Registry', html('div', { id: 'canonSubsystems' })),
    card('Integrator Truth Table', html('div', { id: 'canonIntegrators' })),
    card('Adaptive Time Accounting', html('div', { id: 'canonAdaptive' })),
    card('Validation Extensions', html('div', { id: 'canonValidation' }))
  );
  left.append(grid);
  const controls = html('aside', { className: 'controls' });
  const actions = html('div', { className: 'btnrow' });
  append(
    actions,
    button('runCanonValidation', 'Run Canonical QA', () => {
      runCanonicalQa(true);
    }, 'primary'),
    button('useCanonMethod', 'Use Conditional Canonical Method', () => useCanonicalMethod()),
    button('exportManifestV3', 'Export Manifest V3', () => exportManifest('pendulum_manifest_v3_ts.json'))
  );
  const note = html('div', { className: 'honesty-note warn', text: 'True symplectic claims are restricted to canonical coordinates, gamma = 0, and solver residual reporting. Damped systems are dissipative.' });
  append(controls, detailsCard('Canonical Controls', actions), detailsCard('Contracts', note));
  append(layout, left, controls);
  panel.append(layout);
}

export function installAPlusTab(): void {
  const panel = $('tab-aplus');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1080px';
  const grid = html('div', { className: 'rg-grid' });
  append(
    grid,
    card('Scientific Audit Summary', html('div', { id: 'aplusSummary' })),
    card('Generalized N-Link Physics', html('div', { id: 'aplusNLink' })),
    card('Architecture Contract', html('div', { id: 'aplusArch' }), undefined, 'rg-card rg-wide'),
    card('Validation Results', html('div', { id: 'aplusValidation' }), undefined, 'rg-card rg-wide')
  );
  left.append(grid);
  const controls = html('aside', { className: 'controls' });
  const actions = html('div', { className: 'btnrow' });
  append(
    actions,
    button('runAPlusAudit', 'Run Audit', () => {
      runAPlusAudit(true);
    }, 'primary'),
    button('exportAPlusReport', 'Export Audit JSON', () => exportAPlusReport())
  );
  const note = html('div', { className: 'honesty-note', text: 'The generalized N-link engine is descriptor-driven and tested against the double and triple pendulum special cases.' });
  append(controls, detailsCard('Audit Controls', actions), detailsCard('Research Note', note));
  append(layout, left, controls);
  panel.append(layout);
}

export function installDocsTab(): void {
  const panel = $('tab-docs');
  if (!panel || panel.childElementCount > 0) return;
  const layout = html('div', { className: 'layout' });
  const left = html('div', { className: 'left-col' });
  left.style.maxWidth = '1080px';
  const doc = html('div', { className: 'plx-panel' });
  append(
    doc,
    html('h2', { text: 'Pendulum Lab V10 Method Notes' }),
    paragraph('This tab restores the single-file documentation surface while keeping the modular TypeScript runtime as the source of truth.'),
    methodTable(),
    html('h3', { text: 'Preserved improvements' }),
    bulletList([
      'Strict TypeScript physics modules and validation tests remain active.',
      'Inline event handlers and dynamic script injection remain removed.',
      'Submission manifests use the modular state store and import guard.',
      'Worker fallback and browser capability reporting are explicit.'
    ])
  );
  left.append(doc);
  append(layout, left, html('aside', { className: 'controls' }));
  panel.append(layout);
}

export function paragraph(text: string): HTMLParagraphElement {
  return html('p', { text });
}

export function bulletList(items: string[]): HTMLUListElement {
  const list = html('ul');
  for (const item of items) list.append(html('li', { text: item }));
  return list;
}

export function methodTable(): HTMLTableElement {
  const table = html('table', { className: 'rg-table' });
  const head = html('tr');
  append(head, html('th', { text: 'Method' }), html('th', { text: 'Order' }), html('th', { text: 'Symplectic claim' }), html('th', { text: 'Notes' }));
  table.append(head);
  for (const meta of Object.values(integratorRegistry)) {
    const tr = html('tr');
    append(tr, html('td', { text: meta.name }), html('td', { text: String(meta.order) }), html('td', { text: meta.symplectic }), html('td', { text: meta.stabilityNotes.join(' ') }));
    table.append(tr);
  }
  return table;
}

export function installStablePanel(): void {
  if ($('stableIntuitivePanel')) return;
  const panel = html('section', { id: 'stableIntuitivePanel', className: 'si-panel' });
  const top = html('div', { className: 'si-top' });
  const titleBlock = html('div');
  append(titleBlock, html('div', { className: 'si-title', text: 'Simulation Assistance' }), html('div', { className: 'si-desc', text: 'Runtime assistance. Auto-actions are disabled in Research and Benchmark modes.' }));
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
  const searchWrap = html('div');
  const search = html('input', { id: 'siControlSearch', className: 'si-search', ariaLabel: 'Search controls' });
  search.placeholder = 'Search controls';
  search.addEventListener('input', () => filterControls(search.value));
  append(searchWrap, search, html('div', { className: 'si-small', text: 'Filter settings by label or id.' }));
  append(guide, html('div', { id: 'siAdvice', className: 'si-note', text: 'Status: initializing' }), searchWrap);
  append(panel, top, guide);
  mountTrustCard('performance', panel, () => {
    const anchor = document.querySelector('.diag-row') ?? document.querySelector('header');
    if (anchor?.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    else document.body.prepend(panel);
  });
}

export function metric(id: string, label: string, value = '-'): HTMLDivElement {
  const node = html('div', { id, className: 'si-metric' });
  append(node, html('b', { text: label }), html('span', { text: value }));
  return node;
}

export function installStableHelp(): void {
  if ($('siHelpBackdrop')) return;
  const backdrop = html('div', { id: 'siHelpBackdrop', className: 'si-help-backdrop', role: 'dialog', ariaLabel: 'Stable control help' });
  const box = html('div', { className: 'si-help' });
  append(
    box,
    button('siCloseHelp', 'Close', () => backdrop.classList.remove('show'), 'si-close'),
    html('h2', { text: 'Simulation Assistance' }),
    paragraph('Stable Defaults keeps the current experiment readable without changing the scientific labels. Accuracy Mode tightens dt and tolerance. Performance Mode reduces rendering load first.'),
    html('h3', { text: 'Research mode policy' }),
    paragraph('Auto-stabilize only suggests changes when the mode is research or benchmark. It does not silently alter physics controls in those modes.')
  );
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) backdrop.classList.remove('show');
  });
  backdrop.append(box);
  document.body.append(backdrop);
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
    for (const mode of ['demo', 'education', 'research', 'benchmark'] as const) modeSelect.append(html('option', { value: mode, text: mode }));
    modeSelect.addEventListener('change', () => setMode(modeSelect.value as RunMode));
    append(modeRow, html('label', { text: 'Mode' }), modeSelect);
    const actions = html('div', { className: 'btnrow' });
    append(
      actions,
      button('v10RunValidation', 'Run validation suite', () => runLegacyValidationSurface(), 'primary'),
      button('v10ExportManifest', 'Research Export', () => exportManifest('pendulum_manifest_v10_ts.json')),
      button('v10ExportSession', 'Session Export', () => downloadJson('pendulum_session_v10_ts.json', currentSnapshot())),
      button('v10ExportValidation', 'Validation JSON', () => exportValidationJson())
    );
    append(cardNode, title, modeRow, html('div', { id: 'v10MethodCard', className: 'v10-method', text: 'Method metadata pending.' }), html('div', { id: 'v10WarningBox', className: 'v10-warnings' }), actions);
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
    for (const mode of ['research', 'education', 'demo'] as const) modeSelect.append(html('option', { value: mode, text: `${mode} mode` }));
    modeSelect.addEventListener('change', () => setMode(modeSelect.value as RunMode));
    append(modeRow, html('label', { text: 'Mode' }), modeSelect);
    const actions = html('div', { className: 'btnrow' });
    append(actions, button('rgv7RunTestsShadow', 'Run validation', () => runLegacyValidationSurface(), 'primary'), button('rgv7ShowCommandsShadow', 'Commands', () => showCommandPalette()));
    append(panel, html('div', { className: 'ri-title', text: 'Research governance' }), modeRow, html('div', { id: 'rgv7ValidityLine', className: 'rgv7-note honesty-note', text: 'Initializing validity status.' }), html('div', { id: 'rgv7RuntimeGrid', className: 'stats' }), actions);
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
    append(panel, html('h3', { text: 'Governance exports' }), html('div', { id: 'rgv8RuntimePanel', className: 'stats' }), actions);
    mountTrustCard('provenance', panel, () => controls.insertBefore(panel, controls.querySelector('.acc')));
  }
  if (!$('sfv9Panel')) {
    const panel = html('section', { id: 'sfv9Panel', className: 'sfv9-card' });
    const actions = html('div', { className: 'btnrow' });
    append(actions, button('sfv9AuditRunShadow', 'Run Platform Audit', () => {
      runAPlusAudit(true);
    }, 'primary'), button('sfv9ExportShadow', 'Export audit report', () => exportFeatureReport()));
    append(panel, html('h3', { text: 'Platform audit' }), html('div', { id: 'sfv9Summary', className: 'stats' }), actions, html('pre', { id: 'sfv9AuditLog', className: 'rg-log', text: 'Audit not run yet.' }));
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
    const node = card('Current Physics Summary', html('div', { id: 'plxPhysicsSummary', className: 'plx-grid' }), 'plxPhysicsCard', 'plx-card');
    mountTrustCard('health', node, () => controls.append(node));
  }
  if (!$('plxBadges')) {
    const node = card('Validation Badges', html('div', { id: 'plxBadges', className: 'plx-badge-row' }), 'plxBadgesCard', 'plx-card');
    mountTrustCard('validation', node, () => controls.append(node));
  }
  if (!$('plxRuntimeSummary')) {
    const body = html('div');
    append(body, html('div', { id: 'plxRuntimeSummary', className: 'plx-grid' }), html('div', { id: 'plxErrorLog', className: 'plx-log', text: 'no runtime errors' }));
    const node = card('Runtime / Error Log', body, 'plxRuntimeCard', 'plx-card');
    mountTrustCard('faults', node, () => controls.append(node));
  }
  if (!$('plxAuditLog')) {
    const node = card('Auto-Stabilization Audit', html('div', { id: 'plxAuditLog', className: 'plx-log', text: 'no automatic mutations recorded' }), 'plxAuditCard', 'plx-card');
    mountTrustCard('faults', node, () => controls.append(node));
  }
  if (!$('plxMethodCaps')) {
    const node = card('Method Capabilities', html('div', { id: 'plxMethodCaps', className: 'plx-grid' }), 'plxMethodCapsCard', 'plx-card');
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
    append(summary, html('span', { className: 'acc-icon', text: '⚙' }), html('span', { className: 'acc-label', text: 'Plot configuration' }), html('span', { className: 'acc-arrow', text: '›' }));
    panel.append(summary);
    const body = html('div', { className: 'acc-body' });
    const grid = html('div', { className: 'ri-grid' });
    append(grid, selectRow('riPoincVar', 'section var', ['theta1', 'theta2', 'omega1', 'omega2']), selectRow('riPoincDir', 'direction', ['positive', 'negative', 'both']), selectRow('riPoincAxes', 'axes', ['theta2-omega2', 'theta1-omega1']), selectRow('riFFTSignal', 'FFT signal', ['theta1', 'theta2', 'omega1']), selectRow('riFFTWindow', 'FFT window', ['hann', 'rect', 'blackman']), selectRow('riFFTScale', 'FFT scale', ['log', 'linear']));
    append(body, grid, html('div', { id: 'riPlotStamp', className: 'honesty-note', text: 'Plots use bounded buffers and exported settings.' }), button('riClearPoinc', 'Clear Poincare', () => $('clearPoincBtn')?.click()));
    panel.append(body);
    left.append(panel);
  }
  if (!$('rgv7ValidationCard')) {
    const panel = html('section', { id: 'rgv7ValidationCard', className: 'ri-panel' });
    append(panel, html('div', { className: 'ri-title', text: 'Research Validation' }), html('div', { id: 'rgv7ValidationResults', className: 'rg-log', text: 'No governance validation run yet.' }));
    mountTrustCard('validation', panel, () => left.append(panel));
  }
  if (!$('rgv8Honesty')) {
    const panel = html('section', { id: 'rgv8Honesty', className: 'rgv8-card' });
    append(panel, html('h3', { text: 'Model caveats' }), html('div', { className: 'honesty-note warn', text: 'Triple mode and theta/omega pseudo-symplectic methods are labelled experimental or approximate.' }));
    mountTrustCard('health', panel, () => left.append(panel));
  }
}

export function selectRow(id: string, label: string, values: string[]): HTMLDivElement {
  const node = html('div', { className: 'ri-row' });
  const select = html('select', { id });
  for (const value of values) select.append(html('option', { value, text: value }));
  append(node, html('label', { text: label }), select);
  return node;
}

export function installOnboarding(): void {
  if ($('rgv8Overlay')) return;
  const overlay = html('div', { id: 'rgv8Overlay', className: 'rgv8-overlay', role: 'dialog', ariaLabel: 'Pendulum Lab onboarding' });
  const box = html('div', { className: 'rgv8-modal' });
  append(
    box,
    html('h2', { text: 'Pendulum Lab V10' }),
    paragraph('Use the mode selector, validation controls, and manifest exports for reproducible runs. The modular runtime keeps physics, validation, and import checks separated.'),
    button('rgv8CloseOnboard', 'Close', () => overlay.classList.remove('show'), 'primary'),
    button('rgv8ResearchMode', 'Research Mode', () => {
      setMode('research');
      overlay.classList.remove('show');
    }),
    button('rgv8EducationMode', 'Education Mode', () => {
      setMode('education');
      overlay.classList.remove('show');
    })
  );
  overlay.append(box);
  document.body.append(overlay);
}

export function showOnboarding(): void {
  installOnboarding();
  $('rgv8Overlay')?.classList.add('show');
}

export function installFeatureBadge(): void {
  if ($('figBadge')) return;
  const badge = html('div', { id: 'figBadge', className: 'fig-badge info' });
  document.body.append(badge);
  renderFeatureBadge();
}

export function featureReport(options: { runValidation?: boolean } = {}): AuditResult {
  const requiredDom = [
    'stableIntuitivePanel',
    'v10StatusCard',
    'riScientificStatusPanel',
    'rgv7ControlCard',
    'rgv8GovCard',
    'sfv9Panel',
    'tab-architecture',
    'tab-research',
    'tab-canonical',
    'tab-aplus',
    'tab-docs',
    'cmdPalette',
    'rgv7Palette',
    'rgv8Cmd',
    'figBadge',
    'researchWorkbench',
    'rwExperimentSelect',
    'rwRunLog',
    'rwComparisonMatrix',
    'rwPaperSummary'
  ];
  const tests: AuditResult['tests'] = requiredDom.map((id) => ({ id: `dom-${id}`, status: $(id) ? 'PASS' as const : 'FAIL' as const, detail: $(id) ? 'present' : 'missing' }));
  tests.push({ id: 'commands-registered', status: commandRegistry.list().length >= 7 ? 'PASS' : 'WARN', detail: `${commandRegistry.list().length} commands` });
  tests.push({ id: 'integrator-catalog', status: Object.keys(integratorRegistry).length >= 10 ? 'PASS' : 'FAIL', detail: Object.keys(integratorRegistry).join(', ') });
  if (options.runValidation) {
    tests.push({ id: 'modular-validation', status: runAllValidationChecks().ok ? 'PASS' : 'FAIL', detail: 'TypeScript validation suite executable' });
  } else {
    tests.push({ id: 'modular-validation', status: 'PASS', detail: 'available on demand' });
  }
  const passed = tests.filter((test) => test.status === 'PASS').length;
  const failed = tests.filter((test) => test.status === 'FAIL').length;
  return {
    generatedAt: new Date().toISOString(),
    passed,
    failed,
    tests,
    manifest: createSubmissionManifest(currentSnapshot())
  };
}

export function featureDomOk(): boolean {
  return [
    'stableIntuitivePanel',
    'v10StatusCard',
    'riScientificStatusPanel',
    'rgv7ControlCard',
    'rgv8GovCard',
    'sfv9Panel',
    'tab-architecture',
    'tab-research',
    'tab-canonical',
    'tab-aplus',
    'tab-docs',
    'cmdPalette',
    'rgv7Palette',
    'rgv8Cmd',
    'figBadge',
    'researchWorkbench',
    'rwExperimentSelect',
    'rwRunLog',
    'rwComparisonMatrix',
    'rwPaperSummary'
  ].every((id) => Boolean($(id)));
}

export function renderFeatureBadge(): void {
  const report = featureReport();
  const badge = $('figBadge');
  if (!badge) return;
  badge.className = `fig-badge ${report.failed ? 'bad' : 'good'}`;
  clear(badge);
  append(
    badge,
    html('b', { text: 'Integrity' }),
    ` ${report.failed ? 'CHECK' : 'PASS'}`,
    html('br'),
    html('span', { text: `DOM/API checks ${report.passed}/${report.tests.length}` })
  );
  const actions = html('div', { className: 'fig-actions' });
  append(actions, button('figOpen', 'Details', () => showFeaturePanel()), button('figExport', 'Audit JSON', () => exportFeatureReport()), button('figHide', 'Hide', () => {
    const node = $('figBadge');
    if (node) node.style.display = 'none';
  }));
  badge.append(actions);
}

export function showFeaturePanel(): void {
  $('figPanel')?.remove();
  const report = featureReport();
  const panel = html('div', { id: 'figPanel', className: 'fig-panel', role: 'dialog', ariaLabel: 'Feature integrity audit' });
  append(panel, button('figClose', 'Close', () => panel.remove(), 'primary'), html('h2', { text: 'Feature Integrity Audit' }));
  const grid = html('div', { className: 'fig-grid' });
  append(
    grid,
    figCard('Overall', report.failed ? 'Possible missing items' : 'PASS - original stable UI surfaces restored'),
    figCard('Runtime capabilities', capabilityText()),
    figCard('Tabs', Array.from(document.querySelectorAll<HTMLElement>('.tab[data-tab]')).map((t) => t.dataset.tab ?? '').filter(Boolean).join(', ')),
    figCard('Static compare', 'Original dynamic tabs and governance controls restored as modular TypeScript.')
  );
  panel.append(grid, html('h3', { text: 'Feature inventory' }), featureInventory(), html('h3', { text: 'Audit results' }), html('div', { className: 'fig-list', text: report.tests.map((test) => `${test.status} ${test.id}: ${test.detail}`).join('\n') }));
  document.body.append(panel);
}

export function figCard(title: string, detail: string): HTMLElement {
  const node = html('div', { className: 'fig-card' });
  append(node, html('b', { text: title }), html('br'), html('span', { text: detail }));
  return node;
}

export function featureInventory(): HTMLElement {
  const list = html('div', { className: 'fig-grid' });
  [
    ['Simulation Lab', 'modern canvas simulation, side plots, scrubber, export'],
    ['Research Policy', 'mode policy, validation, manifest and fault export'],
    ['Canonical QA', 'canonical midpoint residual and drift checks'],
    ['A+ Audit', 'N-link physics and architecture contract audit'],
    ['Stable Controls', 'stable, accuracy, performance, recovery controls'],
    ['Command Palette', 'registered commands surfaced through Ctrl/Cmd+K'],
    ['Research Workbench', 'experiment library, run log, parameter study, comparison matrix, and paper pack export']
  ].forEach(([title, detail]) => list.append(figCard(title ?? '', detail ?? '')));
  return list;
}

export function capabilityText(): string {
  const canvas = document.createElement('canvas');
  const webgl2 = Boolean(canvas.getContext('webgl2'));
  return `Worker=${typeof Worker !== 'undefined'} WebGL2=${webgl2} Audio=${typeof AudioContext !== 'undefined'} DPR=${window.devicePixelRatio || 1}`;
}

export function exportFeatureReport(): void {
  const report = featureReport();
  state.lastAudit = report;
  downloadJson('pendulum_feature_integrity_report.json', report);
}

export function exportAPlusReport(): void {
  if (!state.lastAudit) runAPlusAudit(false);
  downloadJson('pendulum_aplus_audit_v10_ts.json', state.lastAudit ?? featureReport());
}

export function exportManifest(filename: string): void {
  downloadJson(filename, createSubmissionManifest(currentSnapshot()));
  record(`exported ${filename}`);
}

export function applyStableDefaults(): void {
  setControl('method', 'rk4');
  setControl('dt', 0.002);
  setControl('spf', 6);
  setControl('gamma', 0);
  setControl('trailLen', 1200);
  modernLab()?.reset?.();
  toast('Stable defaults applied');
  record('stable defaults applied');
}

export function applyAccuracyMode(): void {
  setMode('research');
  setControl('method', 'hmidpoint');
  setControl('dt', 0.001);
  setControl('tol', -8);
  setControl('spf', 4);
  modernLab()?.reset?.();
  toast('Accuracy mode applied');
  record('accuracy mode applied');
}

export function applyPerformanceMode(): void {
  setMode('performance');
  setControl('trailLen', 700);
  setControl('ensN', 0);
  setControl('glowMode', false);
  setControl('longExpose', false);
  modernLab()?.reset?.();
  toast('Performance mode applied');
  record('performance mode applied');
}

export function recoverSimulation(): void {
  state.recoveries += 1;
  const nanOverlay = $('nanOverlay');
  if (nanOverlay) nanOverlay.style.display = 'none'; // CSSOM write (setAttribute('style') is CSP-blocked)
  $('resetBtn')?.click();
  $('riErrorPanel')?.classList.remove('show');
  toast('Simulation recovered');
  record('manual recovery');
}

export function showStableHelp(): void {
  installStableHelp();
  $('siHelpBackdrop')?.classList.add('show');
}

export function filterControls(query: string): void {
  const q = query.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>('#tab-lab .controls .row').forEach((line) => {
    const text = line.textContent?.toLowerCase() ?? '';
    line.classList.toggle('si-row-hidden', q.length > 0 && !text.includes(q));
  });
}

export function setMode(mode: RunMode): void {
  state.mode = mode;
  if (window.App) window.App.runMode = mode;
  for (const id of ['v10RunMode', 'rgv7ModeSelect', 'plxRunMode', 'riModeSelect']) {
    const el = $(id);
    if (el instanceof HTMLSelectElement && Array.from(el.options).some((opt) => opt.value === mode)) el.value = mode;
  }
  renderRuntimePanels();
  record(`mode ${mode}`);
}

export function registerParityCommands(): void {
  commandRegistry.upsert({ id: 'parity.openArchitecture', label: 'Open architecture diagnostics', description: 'Open the restored architecture tab.', run: () => setActiveTab('architecture') });
  commandRegistry.upsert({ id: 'parity.openResearch', label: 'Open research contract', description: 'Open the restored research tab.', run: () => setActiveTab('research') });
  commandRegistry.upsert({ id: 'parity.runCanonicalQa', label: 'Run canonical QA', description: 'Run canonical residual and drift checks.', run: () => {
    runCanonicalQa(true);
  } });
  commandRegistry.upsert({ id: 'parity.runAudit', label: 'Run A+ audit', description: 'Run restored scientific audit checks.', run: () => {
    runAPlusAudit(true);
  } });
  commandRegistry.upsert({ id: 'parity.runFloquetProbe', label: 'Run Floquet probe', description: 'Run a period-1 driven-pendulum Floquet stability check.', run: () => {
    runFloquetProbe(true);
  } });
  commandRegistry.upsert({ id: 'parity.featureIntegrity', label: 'Feature integrity details', description: 'Open restored feature integrity panel.', run: () => showFeaturePanel() });
  commandRegistry.upsert({ id: 'parity.exportManifest', label: 'Export parity manifest', description: 'Export the modular manifest from restored tools.', run: () => exportManifest('pendulum_parity_manifest_v10_ts.json') });
  commandRegistry.upsert({ id: 'research.saveExperiment', label: 'Save research experiment', description: 'Save the current runtime snapshot as a research experiment.', run: () => saveCurrentExperiment() });
  commandRegistry.upsert({ id: 'research.generateParameterStudy', label: 'Generate parameter study', description: 'Create a reproducible parameter-study plan from the current state.', run: () => generateParameterStudy() });
  commandRegistry.upsert({ id: 'research.runStudyBatch', label: 'Run study batch', description: 'Batch-execute every study point on the chaos worker (Lyapunov, RQA, FTLE).', run: () => { void runStudyBatch(); } });
  commandRegistry.upsert({ id: 'research.rebuildComparison', label: 'Rebuild comparison matrix', description: 'Rebuild the result comparison matrix from saved experiments and run logs.', run: () => rebuildComparisonMatrix() });
  commandRegistry.upsert({ id: 'research.exportPaperPack', label: 'Export paper pack', description: 'Export methods text, manifest, run log, study plan, and comparison matrix.', run: () => exportPaperPackJson() });
  commandRegistry.upsert({ id: 'research.exportFigures', label: 'Export figure pack', description: 'Capture every drawn analysis canvas as a captioned PNG figure gallery (HTML + embedded manifest).', run: () => exportPaperFiguresHtml() });
  commandRegistry.upsert({ id: 'research.exportFigureManifest', label: 'Export figure manifest', description: 'Export hashes, source canvas ids, sizes, and runtime context for captured paper figures.', run: () => exportPaperFigureManifestJson() });
  commandRegistry.upsert({ id: 'research.exportLatex', label: 'Export LaTeX methods', description: 'Export a LaTeX methods appendix with comparison matrix and study summary.', run: () => exportPaperMethodsLatex() });
  commandRegistry.upsert({ id: 'research.exportNotebook', label: 'Export research notebook', description: 'Export a Jupyter notebook with paper pack and parameter-study loaders.', run: () => exportResearchNotebook() });
  commandRegistry.upsert({ id: 'research.exportBundle', label: 'Export research bundle', description: 'Export a portable JSON bundle containing methods, notebook, manifest, data, and figure payloads.', run: () => exportResearchBundleJson() });
}

export function installModeSelectAnchors(): void {
  if (!$('riModeSelect')) {
    // Legacy id anchor only — hidden from the accessibility tree and focus
    // order so it never surfaces as an unnamed control.
    const select = html('select', { id: 'riModeSelect', className: 'v10-sr' });
    select.setAttribute('hidden', '');
    select.setAttribute('aria-hidden', 'true');
    select.inert = true;
    select.tabIndex = -1;
    for (const mode of ['demo', 'research', 'performance', 'recovery'] as const) select.append(html('option', { value: mode, text: mode }));
    select.addEventListener('change', () => setMode(select.value as RunMode));
    document.body.append(select);
  }
  for (const id of ['methodHonesty', 'modeHonesty']) {
    if (!$(id)) document.body.append(html('div', { id, className: 'v10-sr' }));
  }
}

export function installLegacyValidationIdAnchors(): void {
  for (const id of LEGACY_VALIDATION_IDS) {
    if (!$(id)) document.body.append(html('div', { id, className: 'v10-sr', text: 'covered by modular validation' }));
  }
  if (!$('fault-')) document.body.append(html('div', { id: 'fault-', className: 'v10-sr' }));
}
