/** Static rail/panel markup for the Research Matrix analysis tab. */
interface ElementOptions {
  id?: string;
  className?: string;
  text?: string;
  role?: string;
  attrs?: Record<string, string>;
}

export function matrixElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.id) node.id = options.id;
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.role) node.setAttribute('role', options.role);
  for (const [key, value] of Object.entries(options.attrs ?? {})) node.setAttribute(key, value);
  for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

export function matrixCell(text: string, tag: 'td' | 'th' = 'td'): HTMLTableCellElement {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function button(id: string, text: string, className?: string): HTMLButtonElement {
  const node = matrixElement('button', { id, text, ...(className ? { className } : {}) });
  node.type = 'button';
  return node;
}

function input(id: string, attrs: Record<string, string>): HTMLInputElement {
  return matrixElement('input', { id, attrs });
}

function pill(label: string, id: string, value: string): HTMLElement {
  return matrixElement('span', {}, matrixElement('b', { text: label }), matrixElement('em', { id, text: value }));
}

function figure(id: string, width: number, height: number, caption: string): HTMLElement {
  return matrixElement(
    'figure',
    {},
    matrixElement('canvas', { id, attrs: { width: String(width), height: String(height) } }),
    matrixElement('figcaption', { text: caption })
  );
}

function details(label: string, ...children: Node[]): HTMLDetailsElement {
  const element = matrixElement('details', { className: 'acc' });
  element.open = true;
  element.append(
    matrixElement(
      'summary',
      {},
      matrixElement('span', { className: 'acc-icon', text: label.slice(0, 1) }),
      matrixElement('span', { className: 'acc-label', text: label }),
      matrixElement('span', { className: 'acc-arrow', text: '>' })
    ),
    matrixElement('div', { className: 'acc-body' }, ...children)
  );
  return element;
}

function row(label: string, control: Node, valueId?: string, labelId?: string): HTMLElement {
  const labelNode = matrixElement('label', { text: label, ...(labelId ? { id: labelId } : {}) });
  const container = matrixElement('div', { className: 'row' }, labelNode, control);
  if (valueId) container.append(matrixElement('span', { id: valueId, className: 'val', text: '-' }));
  return container;
}

function ensureRailTab(): void {
  if (document.querySelector('.tab[data-tab="matrix"]')) return;
  const rail = document.getElementById('rail-panel-analysis');
  if (!rail) return;
  const tab = document.createElement('button');
  tab.className = 'tab';
  tab.type = 'button';
  tab.dataset.tab = 'matrix';
  tab.dataset.tip = 'Research Matrix';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', 'false');
  tab.setAttribute('aria-label', 'Research Matrix');
  tab.title = 'Research Matrix';
  tab.append(
    matrixElement('span', { className: 'tab-icon', text: 'Mx' }),
    matrixElement('span', { className: 'tab-label', text: 'Matrix' })
  );
  const expansion = rail.querySelector('.tab[data-tab="expansion"]');
  expansion?.after(tab);
  if (!expansion) rail.append(tab);
}

function ensurePanel(): void {
  if (document.getElementById('tab-matrix')) return;
  const tableBody = matrixElement('tbody', { id: 'matrixComparisonBody' });
  const table = matrixElement(
    'table',
    { className: 'matrix-table' },
    matrixElement(
      'thead',
      {},
      matrixElement(
        'tr',
        {},
        matrixCell('Run', 'th'),
        matrixCell('Kind', 'th'),
        matrixCell('Method', 'th'),
        matrixCell('Hash', 'th'),
        matrixCell('Score', 'th'),
        matrixCell('Drift', 'th'),
        matrixCell('Runtime', 'th'),
        matrixCell('Mini', 'th')
      )
    ),
    tableBody
  );
  const panel = matrixElement(
    'div',
    { id: 'tab-matrix', className: 'tabpanel research-matrix-tab', role: 'tabpanel' },
    matrixElement(
      'div',
      { className: 'layout' },
      matrixElement(
        'div',
        { className: 'left-col' },
        matrixElement(
          'section',
          { className: 'matrix-shell' },
          matrixElement(
            'div',
            { className: 'matrix-topline' },
            matrixElement(
              'div',
              {},
              matrixElement('h2', { text: 'Research Matrix' }),
              matrixElement('div', {
                id: 'matrixSummary',
                className: 'matrix-sub',
                text: 'Compare experiments, scan 2D parameter planes, and inspect chaos diagnostics.'
              })
            ),
            matrixElement(
              'div',
              { className: 'matrix-state-grid' },
              pill('Hash', 'matrixHash', '-'),
              pill('Stable', 'matrixStable', '-'),
              pill('Lyap', 'matrixLyap', '-')
            )
          ),
          matrixElement(
            'div',
            { className: 'matrix-visual-grid' },
            figure('matrixSweepCanvas', 520, 300, '2D stability heatmap with contour lines'),
            figure('matrixPoincareCanvas', 360, 300, 'Poincare section'),
            figure('matrixLyapCanvas', 360, 220, 'Variational/QR Lyapunov timeline (λ₁, λ₂)'),
            figure('matrixBasinCanvas', 360, 220, 'Basin of attraction'),
            figure('matrixEnergyCanvas', 520, 220, 'Energy landscape and separatrix overlay')
          ),
          matrixElement('div', { id: 'matrixMetrics', className: 'matrix-metrics' }),
          matrixElement('div', { className: 'matrix-table-wrap' }, table)
        )
      ),
      matrixElement(
        'aside',
        { className: 'controls matrix-controls' },
        matrixElement(
          'div',
          { className: 'ctrl-sticky' },
          matrixElement('div', { className: 'ctrl-sticky-title', text: 'Research Matrix Controls' }),
          matrixElement(
            'div',
            { className: 'btnrow' },
            button('matrixRun', 'Run', 'primary'),
            button('matrixExport', 'Export')
          ),
          matrixElement('div', { id: 'matrixStatus', className: 'exp-status', text: 'ready' })
        ),
        details(
          'Model',
          row('Preset', matrixElement('select', { id: 'matrixPreset' })),
          row('Model', matrixElement('select', { id: 'matrixModel' })),
          row('dt', input('matrixDt', { type: 'number', min: '0.001', max: '0.05', step: '0.001' }), 'matrixDtV'),
          row('Horizon', input('matrixHorizon', { type: 'number', min: '2', max: '40', step: '1' }), 'matrixHorizonV'),
          row('Parameter', input('matrixParam', { type: 'number', step: '0.01' }), 'matrixParamV', 'matrixParamLabel')
        ),
        details('Methods', matrixElement('div', { id: 'matrixMethodGrid', className: 'exp-method-grid' })),
        details(
          'Sweep',
          row(
            'Grid',
            input('matrixGrid', { type: 'number', min: '4', max: '12', step: '1', value: '8' }),
            'matrixGridV'
          )
        )
      )
    )
  );
  (document.getElementById('tab-expansion') ?? document.querySelector('.tabpanel:last-of-type'))?.after(panel);
}

/** Idempotently mount the Matrix rail entry and its analysis panel. */
export function ensureResearchMatrixUi(): void {
  ensureRailTab();
  ensurePanel();
}
