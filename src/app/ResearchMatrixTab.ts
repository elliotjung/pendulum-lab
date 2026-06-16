import type { IntegratorId } from '../types/domain';
import { downloadJson } from '../export/manifest';
import {
  EXPANSION_MODEL_DEFINITIONS,
  EXPANSION_PRESETS,
  configFromPreset,
  expansionModelDefinition,
  type ExpansionEnergyCell,
  type ExpansionMatrixCell,
  type ExpansionModelId,
  type ExpansionPoint,
  type ExpansionResearchMatrixResult,
  type ExpansionSuiteConfig,
  type ResearchComparisonRun
} from '../physics/expandedModels';
import { TabController } from './TabController';
import { runExpansionWorkerJob } from './expansionWorkerClient';

const METHOD_OPTIONS: readonly IntegratorId[] = ['rk4', 'dopri5', 'leapfrog', 'symplectic', 'euler'];

interface ElementOptions {
  id?: string;
  className?: string;
  text?: string;
  role?: string;
  attrs?: Record<string, string>;
}

function el<K extends keyof HTMLElementTagNameMap>(
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

function button(id: string, text: string, className?: string): HTMLButtonElement {
  const node = el('button', { id, text, ...(className ? { className } : {}) });
  node.type = 'button';
  return node;
}

function input(id: string, attrs: Record<string, string>): HTMLInputElement {
  return el('input', { id, attrs });
}

function cell(text: string, tag: 'td' | 'th' = 'td'): HTMLTableCellElement {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function fmt(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1e4 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)) return value.toExponential(2);
  return value.toFixed(digits);
}

function canvas2d(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  return canvas?.getContext('2d') ?? null;
}

export class ResearchMatrixTab extends TabController {
  private latest: ExpansionResearchMatrixResult | null = null;

  protected bind(): void {
    this.ensureUi();
    this.populateControls();
    this.syncDefaults();
    this.dom.onChange('matrixPreset', () => this.applyPreset());
    this.dom.onChange('matrixModel', () => this.syncDefaults());
    this.dom.onInput('matrixGrid', () => this.syncLabels());
    this.dom.onInput('matrixHorizon', () => this.syncLabels());
    this.dom.onInput('matrixDt', () => this.syncLabels());
    this.dom.onInput('matrixParam', () => this.syncLabels());
    this.dom.onClick('matrixRun', () => {
      void this.runExclusive(() => this.run(), 'matrixStatus');
    }, { takeOver: true });
    this.dom.onClick('matrixExport', () => this.exportLatest(), { takeOver: true });
  }

  private ensureUi(): void {
    this.ensureRailTab();
    this.ensurePanel();
  }

  private ensureRailTab(): void {
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
    tab.append(el('span', { className: 'tab-icon', text: 'Mx' }), el('span', { className: 'tab-label', text: 'Matrix' }));
    const expansion = rail.querySelector('.tab[data-tab="expansion"]');
    expansion?.after(tab);
    if (!expansion) rail.append(tab);
  }

  private ensurePanel(): void {
    if (document.getElementById('tab-matrix')) return;
    const tableBody = el('tbody', { id: 'matrixComparisonBody' });
    const table = el('table', { className: 'matrix-table' },
      el('thead', {},
        el('tr', {},
          cell('Run', 'th'),
          cell('Kind', 'th'),
          cell('Method', 'th'),
          cell('Hash', 'th'),
          cell('Score', 'th'),
          cell('Drift', 'th'),
          cell('Runtime', 'th'),
          cell('Mini', 'th')
        )
      ),
      tableBody
    );
    const panel = el('div', { id: 'tab-matrix', className: 'tabpanel research-matrix-tab', role: 'tabpanel' },
      el('div', { className: 'layout' },
        el('div', { className: 'left-col' },
          el('section', { className: 'matrix-shell' },
            el('div', { className: 'matrix-topline' },
              el('div', {}, el('h2', { text: 'Research Matrix' }), el('div', { id: 'matrixSummary', className: 'matrix-sub', text: 'Compare experiments, scan 2D parameter planes, and inspect chaos diagnostics.' })),
              el('div', { className: 'matrix-state-grid' },
                this.pill('Hash', 'matrixHash', '-'),
                this.pill('Stable', 'matrixStable', '-'),
                this.pill('Lyap', 'matrixLyap', '-')
              )
            ),
            el('div', { className: 'matrix-visual-grid' },
              this.figure('matrixSweepCanvas', 520, 300, '2D stability heatmap with contour lines'),
              this.figure('matrixPoincareCanvas', 360, 300, 'Poincare section'),
              this.figure('matrixLyapCanvas', 360, 220, 'Variational/QR Lyapunov timeline (λ₁, λ₂)'),
              this.figure('matrixBasinCanvas', 360, 220, 'Basin of attraction'),
              this.figure('matrixEnergyCanvas', 520, 220, 'Energy landscape and separatrix overlay')
            ),
            el('div', { id: 'matrixMetrics', className: 'matrix-metrics' }),
            el('div', { className: 'matrix-table-wrap' }, table)
          )
        ),
        el('aside', { className: 'controls matrix-controls' },
          el('div', { className: 'ctrl-sticky' },
            el('div', { className: 'ctrl-sticky-title', text: 'Research Matrix Controls' }),
            el('div', { className: 'btnrow' }, button('matrixRun', 'Run', 'primary'), button('matrixExport', 'Export')),
            el('div', { id: 'matrixStatus', className: 'exp-status', text: 'ready' })
          ),
          this.details('Model',
            this.row('Preset', el('select', { id: 'matrixPreset' })),
            this.row('Model', el('select', { id: 'matrixModel' })),
            this.row('dt', input('matrixDt', { type: 'number', min: '0.001', max: '0.05', step: '0.001' }), 'matrixDtV'),
            this.row('Horizon', input('matrixHorizon', { type: 'number', min: '2', max: '40', step: '1' }), 'matrixHorizonV'),
            this.row('Parameter', input('matrixParam', { type: 'number', step: '0.01' }), 'matrixParamV', 'matrixParamLabel')
          ),
          this.details('Methods', el('div', { id: 'matrixMethodGrid', className: 'exp-method-grid' })),
          this.details('Sweep', this.row('Grid', input('matrixGrid', { type: 'number', min: '4', max: '12', step: '1', value: '8' }), 'matrixGridV'))
        )
      )
    );
    (document.getElementById('tab-expansion') ?? document.querySelector('.tabpanel:last-of-type'))?.after(panel);
  }

  private pill(label: string, id: string, value: string): HTMLElement {
    return el('span', {}, el('b', { text: label }), el('em', { id, text: value }));
  }

  private figure(id: string, width: number, height: number, caption: string): HTMLElement {
    return el('figure', {}, el('canvas', { id, attrs: { width: String(width), height: String(height) } }), el('figcaption', { text: caption }));
  }

  private details(label: string, ...children: Node[]): HTMLDetailsElement {
    const details = el('details', { className: 'acc' });
    details.open = true;
    details.append(el('summary', {}, el('span', { className: 'acc-icon', text: label.slice(0, 1) }), el('span', { className: 'acc-label', text: label }), el('span', { className: 'acc-arrow', text: '>' })),
      el('div', { className: 'acc-body' }, ...children));
    return details;
  }

  private row(label: string, control: Node, valueId?: string, labelId?: string): HTMLElement {
    const labelNode = el('label', { text: label, ...(labelId ? { id: labelId } : {}) });
    const row = el('div', { className: 'row' }, labelNode, control);
    if (valueId) row.append(el('span', { id: valueId, className: 'val', text: '-' }));
    return row;
  }

  private populateControls(): void {
    const preset = this.dom.el<HTMLSelectElement>('matrixPreset');
    if (preset && preset.options.length === 0) {
      for (const item of EXPANSION_PRESETS) preset.append(new Option(item.label, item.id));
    }
    const model = this.dom.el<HTMLSelectElement>('matrixModel');
    if (model && model.options.length === 0) {
      for (const item of EXPANSION_MODEL_DEFINITIONS) model.append(new Option(item.label, item.id));
    }
    const methods = this.dom.el('matrixMethodGrid');
    if (methods && methods.childElementCount === 0) {
      for (const method of METHOD_OPTIONS) {
        const label = document.createElement('label');
        label.className = 'exp-check';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.value = method;
        check.checked = method !== 'euler';
        check.dataset.matrixMethod = method;
        label.append(check, el('span', { text: method }));
        methods.append(label);
      }
    }
  }

  private applyPreset(): void {
    const config = configFromPreset(this.dom.str('matrixPreset', EXPANSION_PRESETS[0]?.id ?? 'driven-chaos'));
    this.applyConfig(config);
    this.dom.setText('matrixStatus', 'preset loaded');
  }

  private applyConfig(config: ExpansionSuiteConfig): void {
    const definition = expansionModelDefinition(config.model);
    this.dom.setValue('matrixModel', config.model);
    this.dom.setValue('matrixDt', config.dt ?? definition.defaultDt);
    this.dom.setValue('matrixHorizon', config.horizon ?? definition.defaultHorizon);
    this.dom.setValue('matrixParam', config.parameterOverrides?.[definition.sweep.parameter] ?? definition.defaultParameters[definition.sweep.parameter] ?? 0);
    this.syncLabels();
  }

  private syncDefaults(): void {
    const model = this.currentModel();
    const definition = expansionModelDefinition(model);
    const param = this.dom.el<HTMLInputElement>('matrixParam');
    if (param) {
      param.min = String(definition.sweep.min);
      param.max = String(definition.sweep.max);
      param.step = String(Math.max(0.001, Math.abs(definition.sweep.max - definition.sweep.min) / 100));
      param.value = String(definition.defaultParameters[definition.sweep.parameter] ?? (definition.sweep.min + definition.sweep.max) / 2);
    }
    this.dom.setValue('matrixDt', definition.defaultDt);
    this.dom.setValue('matrixHorizon', Math.min(definition.defaultHorizon, 18));
    this.dom.setText('matrixSummary', `${definition.label}: ${definition.family}`);
    this.syncLabels();
  }

  private syncLabels(): void {
    const definition = expansionModelDefinition(this.currentModel());
    this.dom.setText('matrixParamLabel', definition.sweep.label);
    this.dom.setText('matrixDtV', fmt(this.dom.num('matrixDt', definition.defaultDt), 4));
    this.dom.setText('matrixHorizonV', `${fmt(this.dom.num('matrixHorizon', definition.defaultHorizon), 1)}s`);
    this.dom.setText('matrixParamV', fmt(this.dom.num('matrixParam', 0), 3));
    this.dom.setText('matrixGridV', String(Math.round(this.dom.num('matrixGrid', 8))));
  }

  private currentModel(): ExpansionModelId {
    const value = this.dom.str('matrixModel', 'driven');
    return EXPANSION_MODEL_DEFINITIONS.some((item) => item.id === value) ? value as ExpansionModelId : 'driven';
  }

  private selectedMethods(): IntegratorId[] {
    const selected = this.dom.all<HTMLInputElement>('input[data-matrix-method]:checked').map((item) => item.value as IntegratorId);
    return selected.length > 0 ? selected : ['rk4'];
  }

  private config(): ExpansionSuiteConfig {
    const model = this.currentModel();
    const definition = expansionModelDefinition(model);
    return {
      model,
      methods: this.selectedMethods(),
      dt: this.dom.num('matrixDt', definition.defaultDt),
      horizon: this.dom.num('matrixHorizon', definition.defaultHorizon),
      parameterOverrides: { [definition.sweep.parameter]: this.dom.num('matrixParam', definition.defaultParameters[definition.sweep.parameter] ?? 0) },
      ghostEpsilon: 1e-5,
      sampleLimit: 160,
      bifurcationColumns: 8
    };
  }

  private async run(): Promise<void> {
    this.dom.setText('matrixStatus', 'running research matrix…');
    const outcome = await runExpansionWorkerJob(
      { kind: 'matrix', config: this.config(), gridSize: Math.round(this.dom.num('matrixGrid', 8)) },
      60_000
    );
    if (outcome.result.kind !== 'matrix') throw new Error('expansion worker returned an unexpected job result');
    this.latest = outcome.result.result;
    this.render(this.latest);
    this.dom.setText('matrixStatus', `done in ${fmt(outcome.elapsedMs, 1)} ms${outcome.worker ? ' (worker)' : ''}`);
  }

  private exportLatest(): void {
    if (!this.latest) {
      this.dom.setText('matrixStatus', 'nothing to export');
      return;
    }
    downloadJson(`pendulum_research_matrix_${this.latest.manifest.hash}.json`, this.latest);
  }

  private render(result: ExpansionResearchMatrixResult): void {
    this.dom.setText('matrixHash', result.manifest.hash);
    this.dom.setText('matrixStable', `${result.summary.stableComparisons}/${result.comparison.length}`);
    this.dom.setText('matrixLyap', fmt(result.summary.maxLyapunovEstimate, 3));
    this.dom.setText('matrixSummary', `${result.base.modelLabel}: ${result.summary.bestComparison}, sweep stable ${(result.summary.sweepStableRatio * 100).toFixed(0)}%`);
    this.renderMetrics(result);
    this.renderComparison(result.comparison);
    this.drawSweep(result.sweep2d.cells, result.sweep2d.size, 'matrixSweepCanvas', result.sweep2d.xAxis.label, result.sweep2d.yAxis.label);
    this.drawPoincare(result.diagnostics.poincare);
    this.drawLyapunov(result.diagnostics.lyapunovTimeline);
    this.drawBasin(result.diagnostics.basin.cells, result.diagnostics.basin.size);
    this.drawEnergy(
      result.diagnostics.energyLandscape.cells,
      result.diagnostics.energyLandscape.size,
      result.diagnostics.energyLandscape.note
    );
  }

  private renderMetrics(result: ExpansionResearchMatrixResult): void {
    const box = this.dom.el('matrixMetrics');
    if (!box) return;
    box.replaceChildren();
    const spectrum = result.diagnostics.lyapunovSpectrum;
    if (spectrum.length > 0) {
      const consistency = result.diagnostics.lyapunovConsistency;
      const verdict = consistency.symplectic ? 'symplectic ✓' : 'pairing ✗';
      box.append(el('div', { className: 'matrix-metric matrix-metric-wide' },
        el('strong', { text: 'Lyapunov spectrum (variational/QR)' }),
        el('span', { text: `λ = [ ${spectrum.map((value) => fmt(value, 3)).join(',  ')} ]` }),
        el('em', { text: `Σλ = ${fmt(spectrum.reduce((a, b) => a + b, 0), 4)} · D_KY = ${fmt(result.diagnostics.kaplanYorkeDimension, 3)} · ${verdict} (pair err ${fmt(consistency.pairingError, 4)})` })
      ));
    }
    for (const metric of result.physicalMetrics) {
      box.append(el('div', { className: 'matrix-metric' },
        el('strong', { text: metric.label }),
        el('span', { text: `${fmt(metric.value, 4)} ${metric.unit}` }),
        el('em', { text: metric.note })
      ));
    }
  }

  private renderComparison(rows: readonly ResearchComparisonRun[]): void {
    const body = this.dom.el<HTMLTableSectionElement>('matrixComparisonBody');
    if (!body) return;
    body.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.className = row.stable ? 'good' : 'bad';
      const sparkCell = document.createElement('td');
      const spark = el('canvas', { className: 'matrix-spark', attrs: { width: '96', height: '28' } });
      sparkCell.append(spark);
      tr.append(
        cell(row.label),
        cell(row.kind),
        cell(row.method),
        cell(row.hash),
        cell(fmt(row.stabilityScore, 1)),
        cell(fmt(row.energyDrift, 3)),
        cell(`${fmt(row.runtimeMs, 1)} ms`),
        sparkCell
      );
      body.append(tr);
      this.drawSpark(spark, row.miniGraph, row.stable);
    }
  }

  private clear(canvas: HTMLCanvasElement, fill = '#05080d'): CanvasRenderingContext2D | null {
    const ctx = canvas2d(canvas);
    if (!ctx) return null;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    return ctx;
  }

  private drawSpark(canvas: HTMLCanvasElement, values: readonly number[], stable: boolean): void {
    const ctx = this.clear(canvas, 'transparent');
    if (!ctx || values.length < 2) return;
    ctx.strokeStyle = stable ? '#34e88a' : '#ff4565';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = (index / (values.length - 1)) * canvas.width;
      const y = canvas.height - value * canvas.height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  private drawSweep(cells: readonly ExpansionMatrixCell[], size: number, canvasId: string, xLabel: string, yLabel: string): void {
    const canvas = this.dom.el<HTMLCanvasElement>(canvasId);
    if (!canvas) return;
    const ctx = this.clear(canvas);
    if (!ctx) return;
    const max = Math.max(1, ...cells.map((item) => item.score));
    const cw = canvas.width / size;
    const ch = canvas.height / size;
    cells.forEach((item, index) => {
      const xi = index % size;
      const yi = Math.floor(index / size);
      const t = Math.max(0, Math.min(1, item.score / max));
      ctx.fillStyle = item.stable ? `rgb(${Math.round(20 + 20 * t)},${Math.round(70 + 170 * t)},${Math.round(90 + 80 * (1 - t))})` : '#451827';
      ctx.fillRect(xi * cw, canvas.height - (yi + 1) * ch, cw + 1, ch + 1);
    });
    ctx.strokeStyle = 'rgba(255,255,255,.32)';
    ctx.lineWidth = 1;
    for (const level of [0.35, 0.55, 0.75]) {
      ctx.beginPath();
      for (let xi = 0; xi < size; xi += 1) {
        const column = Array.from({ length: size }, (_, yi) => cells[yi * size + xi]?.score ?? 0);
        let yi = column.findIndex((score) => score / max >= level);
        if (yi < 0) yi = size - 1;
        const x = (xi + 0.5) * cw;
        const y = canvas.height - (yi + 0.5) * ch;
        if (xi === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    this.drawCanvasLegend(ctx, canvas, `${xLabel} x ${yLabel}`, 'score/stability');
  }

  private drawPoincare(points: readonly ExpansionPoint[]): void {
    const canvas = this.dom.el<HTMLCanvasElement>('matrixPoincareCanvas');
    if (!canvas) return;
    const ctx = this.clear(canvas);
    if (!ctx) return;
    const yMax = Math.max(2, ...points.map((point) => Math.abs(point.y)));
    ctx.fillStyle = '#18d4f8';
    for (const point of points) {
      const x = ((point.x + Math.PI) / (Math.PI * 2)) * canvas.width;
      const y = canvas.height - ((point.y + yMax) / (2 * yMax)) * canvas.height;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  private drawLyapunov(points: readonly { time: number; leading: number; secondary: number }[]): void {
    const canvas = this.dom.el<HTMLCanvasElement>('matrixLyapCanvas');
    if (!canvas) return;
    const ctx = this.clear(canvas);
    if (!ctx || points.length < 2) return;
    const all = points.flatMap((point) => [point.leading, point.secondary]);
    const min = Math.min(...all, -1e-6);
    const max = Math.max(...all, 1e-6);
    const draw = (field: 'leading' | 'secondary', color: string): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = (index / (points.length - 1)) * canvas.width;
        const y = canvas.height - ((point[field] - min) / (max - min || 1)) * canvas.height;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    draw('leading', '#ff7a2c');
    draw('secondary', '#18d4f8');
  }

  private drawBasin(cells: readonly { basin: number; stable: boolean }[], size: number): void {
    const canvas = this.dom.el<HTMLCanvasElement>('matrixBasinCanvas');
    if (!canvas) return;
    const ctx = this.clear(canvas);
    if (!ctx) return;
    const colors = ['#18d4f8', '#ff7a2c', '#34e88a', '#ff4565'];
    const cw = canvas.width / size;
    const ch = canvas.height / size;
    cells.forEach((cellItem, index) => {
      const xi = index % size;
      const yi = Math.floor(index / size);
      ctx.fillStyle = cellItem.stable ? colors[cellItem.basin] ?? '#6b7686' : '#34121b';
      ctx.fillRect(xi * cw, canvas.height - (yi + 1) * ch, cw + 1, ch + 1);
    });
  }

  private drawEnergy(cells: readonly ExpansionEnergyCell[], size: number, note: string): void {
    const canvas = this.dom.el<HTMLCanvasElement>('matrixEnergyCanvas');
    if (!canvas) return;
    const ctx = this.clear(canvas);
    if (!ctx) return;
    const finite = cells.map((item) => item.energy).filter(Number.isFinite);
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const cw = canvas.width / size;
    const ch = canvas.height / size;
    cells.forEach((item, index) => {
      const xi = index % size;
      const yi = Math.floor(index / size);
      const t = (item.energy - min) / (max - min || 1);
      ctx.fillStyle = `rgb(${Math.round(12 + 190 * t)},${Math.round(30 + 105 * (1 - t))},${Math.round(70 + 80 * t)})`;
      ctx.fillRect(xi * cw, canvas.height - (yi + 1) * ch, cw + 1, ch + 1);
      if (item.separatrix) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(xi * cw + cw * 0.35, canvas.height - (yi + 1) * ch + ch * 0.35, Math.max(1, cw * 0.3), Math.max(1, ch * 0.3));
      }
    });
    this.drawCanvasLegend(ctx, canvas, 'phase energy shell', note);
  }

  private drawCanvasLegend(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, title: string, detail: string): void {
    ctx.save();
    ctx.fillStyle = 'rgba(5,8,13,.78)';
    ctx.fillRect(8, 8, Math.min(canvas.width - 16, 300), 38);
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.strokeRect(8.5, 8.5, Math.min(canvas.width - 16, 300), 38);
    ctx.fillStyle = '#dbe8ff';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(title, 16, 23);
    ctx.fillStyle = '#9fb3c8';
    ctx.fillText(detail.slice(0, 54), 16, 39);
    ctx.restore();
  }
}
