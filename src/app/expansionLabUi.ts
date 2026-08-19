/**
 * Expansion Lab's static DOM surface.  Keeping this separate from the
 * controller means the experiment lifecycle can be tested and evolved without
 * also carrying hundreds of lines of element construction.
 */
interface ElementOptions {
  id?: string;
  className?: string;
  text?: string;
  role?: string;
  title?: string;
  ariaLabel?: string;
  attrs?: Record<string, string>;
}

export function expansionElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.id) node.id = options.id;
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.role) node.setAttribute('role', options.role);
  if (options.title) node.title = options.title;
  if (options.ariaLabel) node.setAttribute('aria-label', options.ariaLabel);
  for (const [key, value] of Object.entries(options.attrs ?? {})) node.setAttribute(key, value);
  for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

export function expansionTextCell(text: string, tag: 'td' | 'th' = 'td'): HTMLTableCellElement {
  const cell = document.createElement(tag);
  cell.textContent = text;
  return cell;
}

function button(id: string, text: string, className?: string): HTMLButtonElement {
  const element = expansionElement('button', { id, text, ...(className ? { className } : {}) });
  element.type = 'button';
  return element;
}

function input(id: string, attrs: Record<string, string>): HTMLInputElement {
  return expansionElement('input', { id, attrs });
}

function statePill(label: string, id: string, value: string): HTMLElement {
  return expansionElement(
    'span',
    {},
    expansionElement('b', { text: label }),
    expansionElement('em', { id, text: value })
  );
}

function canvasFigure(id: string, width: number, height: number, caption: string): HTMLElement {
  return expansionElement(
    'figure',
    {},
    expansionElement('canvas', { id, attrs: { width: String(width), height: String(height) } }),
    expansionElement('figcaption', { text: caption })
  );
}

function detailsSection(icon: string, label: string, ...children: Node[]): HTMLDetailsElement {
  const details = expansionElement('details', { className: 'acc' });
  details.open = true;
  details.append(
    expansionElement(
      'summary',
      {},
      expansionElement('span', { className: 'acc-icon', text: icon }),
      expansionElement('span', { className: 'acc-label', text: label }),
      expansionElement('span', { className: 'acc-arrow', text: '›' })
    ),
    expansionElement('div', { className: 'acc-body' }, ...children)
  );
  return details;
}

function controlRow(label: string, control: Node, valueId?: string, labelId?: string): HTMLElement {
  const rowLabel = expansionElement('label', { text: label, ...(labelId ? { id: labelId } : {}) });
  const row = expansionElement('div', { className: 'row' }, rowLabel, control);
  if (valueId) row.append(expansionElement('span', { id: valueId, className: 'val', text: '-' }));
  return row;
}

function ensureRailTab(): void {
  if (document.querySelector('.tab[data-tab="expansion"]')) return;
  const rail = document.getElementById('rail-panel-analysis');
  if (!rail) return;
  const tab = document.createElement('button');
  tab.className = 'tab';
  tab.type = 'button';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'false');
  tab.setAttribute('aria-label', 'Expansion Lab');
  tab.title = 'Expansion Lab';
  tab.dataset.tab = 'expansion';
  tab.dataset.tip = 'Expansion Lab';
  const icon = document.createElement('span');
  icon.className = 'tab-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = 'Ex';
  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = 'Expand';
  tab.append(icon, label);
  const density = rail.querySelector('.tab[data-tab="density"]');
  density?.after(tab);
  if (!density) rail.append(tab);
}

function ensurePanel(): void {
  if (document.getElementById('tab-expansion')) return;
  const panel = expansionElement('div', {
    id: 'tab-expansion',
    className: 'tabpanel expansion-lab-tab',
    role: 'tabpanel'
  });
  const stateGrid = expansionElement(
    'div',
    { className: 'exp-state-grid' },
    statePill('Worker', 'expWorkerMode', 'idle'),
    statePill('Hash', 'expHash', '-'),
    statePill('Best', 'expBest', '-')
  );
  const topLine = expansionElement(
    'div',
    { className: 'exp-topline' },
    expansionElement(
      'div',
      {},
      expansionElement('h2', { text: 'Expansion Lab' }),
      expansionElement('div', { id: 'expModelSummary', className: 'exp-sub' })
    ),
    stateGrid
  );
  const canvasGrid = expansionElement(
    'div',
    { className: 'exp-canvas-grid' },
    canvasFigure('expReplayCanvas', 520, 320, 'Replay snapshot'),
    canvasFigure('expHeatmapCanvas', 360, 320, 'Phase heatmap'),
    canvasFigure('expGhostCanvas', 360, 220, 'Ghost divergence'),
    canvasFigure('expBifCanvas', 520, 220, 'Bifurcation preview')
  );
  const tableBody = expansionElement('tbody', { id: 'expMethodTable' });
  const emptyRow = document.createElement('tr');
  const emptyCell = expansionTextCell('Run an experiment.');
  emptyCell.colSpan = 6;
  emptyRow.append(emptyCell);
  tableBody.append(emptyRow);
  const table = expansionElement(
    'table',
    { className: 'exp-table', ariaLabel: 'Integrator comparison' },
    expansionElement(
      'thead',
      {},
      expansionElement(
        'tr',
        {},
        expansionTextCell('Method', 'th'),
        expansionTextCell('Stable', 'th'),
        expansionTextCell('Energy drift', 'th'),
        expansionTextCell('Ref divergence', 'th'),
        expansionTextCell('Steps/ms', 'th'),
        expansionTextCell('State max', 'th')
      )
    ),
    tableBody
  );
  const shell = expansionElement(
    'section',
    { className: 'exp-shell' },
    topLine,
    canvasGrid,
    expansionElement('div', { id: 'expLyapReadout', className: 'exp-lyap', role: 'status' }),
    expansionElement('div', { className: 'exp-table-wrap' }, table),
    expansionElement('div', { id: 'expModelDoc', className: 'exp-doc' }),
    expansionElement('div', { id: 'expBatchResults', className: 'exp-batch' }),
    expansionElement('div', { id: 'expHistory', className: 'exp-history' })
  );
  const left = expansionElement('div', { className: 'left-col' }, shell);
  const sticky = expansionElement(
    'div',
    { className: 'ctrl-sticky' },
    expansionElement('div', { className: 'ctrl-sticky-title', text: 'Expansion Controls' }),
    expansionElement(
      'div',
      { className: 'btnrow' },
      button('expRun', 'Run', 'primary'),
      button('expSave', 'Save'),
      button('expExport', 'Export'),
      button('expShare', 'Share'),
      button('expReport', 'Report'),
      button('expGolden', 'Golden'),
      button('expBatch', 'Batch')
    ),
    expansionElement('div', { id: 'expStatus', className: 'exp-status', text: 'ready' })
  );
  const controls = expansionElement(
    'aside',
    { className: 'controls exp-controls' },
    sticky,
    detailsSection(
      'M',
      'Model',
      controlRow('Preset', expansionElement('select', { id: 'expPreset' })),
      controlRow('Model', expansionElement('select', { id: 'expModel' })),
      controlRow('dt', input('expDt', { type: 'number', min: '0.001', max: '0.05', step: '0.001' }), 'expDtV'),
      controlRow('Horizon', input('expHorizon', { type: 'number', min: '2', max: '60', step: '1' }), 'expHorizonV'),
      controlRow(
        'Parameter',
        input('expSweepValue', { type: 'number', step: '0.01' }),
        'expSweepValueV',
        'expSweepLabel'
      )
    ),
    detailsSection('∫', 'Integrators', expansionElement('div', { id: 'expMethodGrid', className: 'exp-method-grid' })),
    detailsSection(
      'V',
      'Visual Analysis',
      controlRow('QR spectrum', input('expIncludeLyap', { type: 'checkbox' })),
      controlRow(
        'Ghost eps',
        input('expGhost', { type: 'number', min: '0.000001', max: '0.01', step: '0.00001', value: '0.00001' }),
        'expGhostV'
      ),
      controlRow(
        'Bif cols',
        input('expBifColumns', { type: 'number', min: '4', max: '32', step: '1', value: '12' }),
        'expBifColumnsV'
      ),
      button('expClearHistory', 'Clear History')
    )
  );
  panel.append(expansionElement('div', { className: 'layout' }, left, controls));
  (document.getElementById('tab-density') ?? document.querySelector('.tabpanel:last-of-type'))?.after(panel);
}

/** Idempotently mount the Expansion Lab rail entry and panel. */
export function ensureExpansionLabUi(): void {
  ensureRailTab();
  ensurePanel();
}
