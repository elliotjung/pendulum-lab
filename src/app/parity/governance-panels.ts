import { downloadJson } from '../../export/manifest';
import { integratorRegistry } from '../../physics/integrators';
import {
  $,
  append,
  button,
  card,
  detailsCard,
  html,
  kvGrid,
  state
} from './shared';
import {
  captureCheckpoint,
  runAPlusAudit,
  runCanonicalQa,
  runContractChecks,
  toggleFloatingDiag,
  useCanonicalMethod
} from './runtime-diagnostics';
import { exportAPlusReport, exportManifest } from './governance-feature';

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
