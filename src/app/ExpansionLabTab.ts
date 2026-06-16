import type { IntegratorId } from '../types/domain';
import { downloadJson } from '../export/manifest';
import {
  DEFAULT_EXPANSION_METHODS,
  EXPANSION_MODEL_DEFINITIONS,
  EXPANSION_PRESETS,
  buildExpansionReport,
  configFromPreset,
  expansionModelDefinition,
  parseExpansionShareHash,
  runExpansionBatch,
  runGoldenExpansionChecks,
  type BatchExperimentResult,
  type ExpansionBifurcationColumn,
  type ExpansionGhostFrame,
  type ExpansionHeatmap,
  type ExpansionLyapunovProfile,
  type ExpansionMethodResult,
  type ExpansionModelId,
  type ExpansionPoint,
  type ExpansionPreset,
  type ExpansionSuiteConfig,
  type ExpansionSuiteResult,
  type GoldenExperimentResult
} from '../physics/expandedModels';
import { TabController } from './TabController';
import { runExpansionWorkerJob } from './expansionWorkerClient';

const HISTORY_KEY = 'pendulum-lab/expansion-history';
const METHOD_CHOICES: readonly { id: IntegratorId; label: string }[] = [
  { id: 'rk4', label: 'RK4' },
  { id: 'dopri5', label: 'Adaptive DP5' },
  { id: 'rkf45', label: 'Adaptive RKF45' },
  { id: 'leapfrog', label: 'Verlet / Leapfrog' },
  { id: 'symplectic', label: 'Euler-Cromer' },
  { id: 'yoshida4', label: 'Yoshida4' },
  { id: 'euler', label: 'Euler' }
];

interface ExpansionHistoryEntry {
  hash: string;
  model: ExpansionModelId;
  modelLabel: string;
  bestMethod: IntegratorId;
  bestScore: number;
  dt: number;
  horizon: number;
  createdAt: string;
}

function fmt(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1e4 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)) return value.toExponential(2);
  return value.toFixed(digits);
}

function textCell(text: string, tag: 'td' | 'th' = 'td'): HTMLTableCellElement {
  const cell = document.createElement(tag);
  cell.textContent = text;
  return cell;
}

function canvasContext(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  return canvas?.getContext('2d') ?? null;
}

interface ElementOptions {
  id?: string;
  className?: string;
  text?: string;
  role?: string;
  title?: string;
  ariaLabel?: string;
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
  if (options.title) node.title = options.title;
  if (options.ariaLabel) node.setAttribute('aria-label', options.ariaLabel);
  for (const [key, value] of Object.entries(options.attrs ?? {})) node.setAttribute(key, value);
  for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

function buttonEl(id: string, text: string, className?: string): HTMLButtonElement {
  const button = el('button', { id, text, ...(className ? { className } : {}) });
  button.type = 'button';
  return button;
}

function inputEl(id: string, attrs: Record<string, string>): HTMLInputElement {
  return el('input', { id, attrs });
}

export class ExpansionLabTab extends TabController {
  private latest: ExpansionSuiteResult | null = null;

  protected bind(): void {
    this.ensureUi();
    this.populateModels();
    this.populatePresets();
    this.populateMethods();
    this.syncDefaults();
    this.restoreFromHash();
    this.renderHistory();
    this.dom.onChange('expModel', () => this.syncDefaults());
    this.dom.onChange('expPreset', () => this.applyPresetSelection());
    this.dom.onInput('expDt', () => this.syncNumberLabels());
    this.dom.onInput('expHorizon', () => this.syncNumberLabels());
    this.dom.onInput('expSweepValue', () => this.syncNumberLabels());
    this.dom.onInput('expGhost', () => this.syncNumberLabels());
    this.dom.onInput('expBifColumns', () => this.syncNumberLabels());
    this.dom.onClick('expRun', () => {
      void this.runExclusive(() => this.runSuite(), 'expStatus');
    }, { takeOver: true });
    this.dom.onClick('expSave', () => this.saveLatest(), { takeOver: true });
    this.dom.onClick('expExport', () => this.exportLatest(), { takeOver: true });
    this.dom.onClick('expShare', () => this.shareLatest(), { takeOver: true });
    this.dom.onClick('expReport', () => this.exportReport(), { takeOver: true });
    this.dom.onClick('expGolden', () => this.runGoldenChecks(), { takeOver: true });
    this.dom.onClick('expBatch', () => this.runBatchQueue(), { takeOver: true });
    this.dom.onClick('expClearHistory', () => this.clearHistory(), { takeOver: true });
  }

  private ensureUi(): void {
    this.ensureRailTab();
    this.ensurePanel();
  }

  private ensureRailTab(): void {
    if (document.querySelector('.tab[data-tab="expansion"]')) return;
    const rail = document.getElementById('rail-panel-analysis');
    if (!rail) return;
    const button = document.createElement('button');
    button.className = 'tab';
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', 'false');
    button.setAttribute('aria-label', 'Expansion Lab');
    button.title = 'Expansion Lab';
    button.dataset.tab = 'expansion';
    button.dataset.tip = 'Expansion Lab';
    const icon = document.createElement('span');
    icon.className = 'tab-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'Ex';
    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = 'Expand';
    button.append(icon, label);
    const density = rail.querySelector('.tab[data-tab="density"]');
    density?.after(button);
    if (!density) rail.append(button);
  }

  private ensurePanel(): void {
    if (document.getElementById('tab-expansion')) return;
    const panel = el('div', { id: 'tab-expansion', className: 'tabpanel expansion-lab-tab', role: 'tabpanel' });
    const stateGrid = el('div', { className: 'exp-state-grid' },
      this.statePill('Worker', 'expWorkerMode', 'idle'),
      this.statePill('Hash', 'expHash', '-'),
      this.statePill('Best', 'expBest', '-')
    );
    const topLine = el('div', { className: 'exp-topline' },
      el('div', {}, el('h2', { text: 'Expansion Lab' }), el('div', { id: 'expModelSummary', className: 'exp-sub' })),
      stateGrid
    );
    const canvasGrid = el('div', { className: 'exp-canvas-grid' },
      this.canvasFigure('expReplayCanvas', 520, 320, 'Replay snapshot'),
      this.canvasFigure('expHeatmapCanvas', 360, 320, 'Phase heatmap'),
      this.canvasFigure('expGhostCanvas', 360, 220, 'Ghost divergence'),
      this.canvasFigure('expBifCanvas', 520, 220, 'Bifurcation preview')
    );
    const tableBody = el('tbody', { id: 'expMethodTable' });
    const emptyRow = document.createElement('tr');
    const emptyCell = textCell('Run an experiment.');
    emptyCell.colSpan = 6;
    emptyRow.append(emptyCell);
    tableBody.append(emptyRow);
    const table = el('table', { className: 'exp-table', ariaLabel: 'Integrator comparison' },
      el('thead', {},
        el('tr', {},
          textCell('Method', 'th'),
          textCell('Stable', 'th'),
          textCell('Energy drift', 'th'),
          textCell('Ref divergence', 'th'),
          textCell('Steps/ms', 'th'),
          textCell('State max', 'th')
        )
      ),
      tableBody
    );
    const shell = el('section', { className: 'exp-shell' },
      topLine,
      canvasGrid,
      el('div', { id: 'expLyapReadout', className: 'exp-lyap', role: 'status' }),
      el('div', { className: 'exp-table-wrap' }, table),
      el('div', { id: 'expModelDoc', className: 'exp-doc' }),
      el('div', { id: 'expBatchResults', className: 'exp-batch' }),
      el('div', { id: 'expHistory', className: 'exp-history' })
    );
    const left = el('div', { className: 'left-col' }, shell);
    const sticky = el('div', { className: 'ctrl-sticky' },
      el('div', { className: 'ctrl-sticky-title', text: 'Expansion Controls' }),
      el('div', { className: 'btnrow' },
        buttonEl('expRun', 'Run', 'primary'),
        buttonEl('expSave', 'Save'),
        buttonEl('expExport', 'Export'),
        buttonEl('expShare', 'Share'),
        buttonEl('expReport', 'Report'),
        buttonEl('expGolden', 'Golden'),
        buttonEl('expBatch', 'Batch')
      ),
      el('div', { id: 'expStatus', className: 'exp-status', text: 'ready' })
    );
    const controls = el('aside', { className: 'controls exp-controls' },
      sticky,
      this.detailsSection('M', 'Model',
        this.controlRow('Preset', el('select', { id: 'expPreset' })),
        this.controlRow('Model', el('select', { id: 'expModel' })),
        this.controlRow('dt', inputEl('expDt', { type: 'number', min: '0.001', max: '0.05', step: '0.001' }), 'expDtV'),
        this.controlRow('Horizon', inputEl('expHorizon', { type: 'number', min: '2', max: '60', step: '1' }), 'expHorizonV'),
        this.controlRow('Parameter', inputEl('expSweepValue', { type: 'number', step: '0.01' }), 'expSweepValueV', 'expSweepLabel')
      ),
      this.detailsSection('∫', 'Integrators', el('div', { id: 'expMethodGrid', className: 'exp-method-grid' })),
      this.detailsSection('V', 'Visual Analysis',
        this.controlRow('QR spectrum', inputEl('expIncludeLyap', { type: 'checkbox' })),
        this.controlRow('Ghost eps', inputEl('expGhost', { type: 'number', min: '0.000001', max: '0.01', step: '0.00001', value: '0.00001' }), 'expGhostV'),
        this.controlRow('Bif cols', inputEl('expBifColumns', { type: 'number', min: '4', max: '32', step: '1', value: '12' }), 'expBifColumnsV'),
        buttonEl('expClearHistory', 'Clear History')
      )
    );
    panel.append(el('div', { className: 'layout' }, left, controls));
    (document.getElementById('tab-density') ?? document.querySelector('.tabpanel:last-of-type'))?.after(panel);
  }

  private statePill(label: string, id: string, value: string): HTMLElement {
    return el('span', {}, el('b', { text: label }), el('em', { id, text: value }));
  }

  private canvasFigure(id: string, width: number, height: number, caption: string): HTMLElement {
    const canvas = el('canvas', { id, attrs: { width: String(width), height: String(height) } });
    return el('figure', {}, canvas, el('figcaption', { text: caption }));
  }

  private detailsSection(icon: string, label: string, ...children: Node[]): HTMLDetailsElement {
    const details = el('details', { className: 'acc' });
    details.open = true;
    details.append(
      el('summary', {},
        el('span', { className: 'acc-icon', text: icon }),
        el('span', { className: 'acc-label', text: label }),
        el('span', { className: 'acc-arrow', text: '›' })
      ),
      el('div', { className: 'acc-body' }, ...children)
    );
    return details;
  }

  private controlRow(label: string, control: Node, valueId?: string, labelId?: string): HTMLElement {
    const rowLabel = el('label', { text: label, ...(labelId ? { id: labelId } : {}) });
    const row = el('div', { className: 'row' }, rowLabel, control);
    if (valueId) row.append(el('span', { id: valueId, className: 'val', text: '-' }));
    return row;
  }

  private populateModels(): void {
    const select = this.dom.el<HTMLSelectElement>('expModel');
    if (!select || select.options.length > 0) return;
    for (const model of EXPANSION_MODEL_DEFINITIONS) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.label;
      select.append(option);
    }
  }

  private populatePresets(): void {
    const select = this.dom.el<HTMLSelectElement>('expPreset');
    if (!select || select.options.length > 0) return;
    for (const preset of EXPANSION_PRESETS) {
      const option = document.createElement('option');
      option.value = preset.id;
      option.textContent = preset.label;
      select.append(option);
    }
  }

  private populateMethods(): void {
    const grid = this.dom.el('expMethodGrid');
    if (!grid || grid.childElementCount > 0) return;
    for (const method of METHOD_CHOICES) {
      const label = document.createElement('label');
      label.className = 'exp-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = method.id;
      input.checked = DEFAULT_EXPANSION_METHODS.includes(method.id);
      input.dataset.expMethod = method.id;
      const span = document.createElement('span');
      span.textContent = method.label;
      label.append(input, span);
      grid.append(label);
    }
  }

  private syncDefaults(): void {
    const model = this.currentModel();
    const definition = expansionModelDefinition(model);
    this.dom.setValue('expDt', definition.defaultDt);
    this.dom.setValue('expHorizon', definition.defaultHorizon);
    const sweepInput = this.dom.el<HTMLInputElement>('expSweepValue');
    if (sweepInput) {
      const value = definition.defaultParameters[definition.sweep.parameter] ?? (definition.sweep.min + definition.sweep.max) / 2;
      sweepInput.min = String(definition.sweep.min);
      sweepInput.max = String(definition.sweep.max);
      sweepInput.step = String(Math.max(0.001, Math.abs(definition.sweep.max - definition.sweep.min) / 100));
      sweepInput.value = String(value);
    }
    this.dom.setText('expSweepLabel', definition.sweep.label);
    this.dom.setText('expModelSummary', `${definition.family} · dim ${definition.dimension} · ${definition.conservative ? 'conservative shell' : 'driven/dissipative energy flow'}`);
    this.renderModelDoc(definition);
    this.syncNumberLabels();
  }

  private renderModelDoc(definition = expansionModelDefinition(this.currentModel())): void {
    const box = this.dom.el('expModelDoc');
    if (!box) return;
    box.replaceChildren(
      el('div', { className: 'exp-doc-title', text: `${definition.label} model contract` }),
      el('p', { text: definition.equation }),
      el('p', { text: definition.energyNote }),
      el('p', { text: definition.caveat })
    );
  }

  private applyPresetSelection(): void {
    const id = this.dom.str('expPreset', EXPANSION_PRESETS[0]?.id ?? '');
    const preset = EXPANSION_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    this.applyConfig(configFromPreset(preset.id), preset);
    this.dom.setText('expStatus', `preset loaded: ${preset.label}`);
  }

  private applyConfig(config: ExpansionSuiteConfig, preset?: ExpansionPreset): void {
    const definition = expansionModelDefinition(config.model);
    this.dom.setValue('expModel', config.model);
    if (preset) this.dom.setValue('expPreset', preset.id);
    this.dom.setValue('expDt', config.dt ?? definition.defaultDt);
    this.dom.setValue('expHorizon', config.horizon ?? definition.defaultHorizon);
    const sweepValue = config.parameterOverrides?.[definition.sweep.parameter] ?? definition.defaultParameters[definition.sweep.parameter] ?? 0;
    this.dom.setValue('expSweepValue', sweepValue);
    if (config.ghostEpsilon !== undefined) this.dom.setValue('expGhost', config.ghostEpsilon);
    if (config.bifurcationColumns !== undefined) this.dom.setValue('expBifColumns', config.bifurcationColumns);
    if (config.methods) {
      const selected = new Set(config.methods);
      this.dom.all<HTMLInputElement>('input[data-exp-method]').forEach((input) => {
        input.checked = selected.has(input.value as IntegratorId);
      });
    }
    this.renderModelDoc(definition);
    this.syncNumberLabels();
  }

  private restoreFromHash(): void {
    const restored = parseExpansionShareHash(location.hash);
    if (!restored) return;
    this.applyConfig(restored);
    this.dom.setText('expStatus', 'share hash restored');
  }

  private syncNumberLabels(): void {
    this.dom.setText('expDtV', fmt(this.dom.num('expDt', 0), 4));
    this.dom.setText('expHorizonV', `${fmt(this.dom.num('expHorizon', 0), 1)}s`);
    this.dom.setText('expSweepValueV', fmt(this.dom.num('expSweepValue', 0), 3));
    this.dom.setText('expGhostV', this.dom.num('expGhost', 1e-5).toExponential(1));
    this.dom.setText('expBifColumnsV', String(Math.round(this.dom.num('expBifColumns', 12))));
  }

  private currentModel(): ExpansionModelId {
    const raw = this.dom.str('expModel', 'driven');
    return EXPANSION_MODEL_DEFINITIONS.some((model) => model.id === raw) ? raw as ExpansionModelId : 'driven';
  }

  private selectedMethods(): IntegratorId[] {
    const selected = this.dom.all<HTMLInputElement>('input[data-exp-method]:checked').map((input) => input.value as IntegratorId);
    return selected.length > 0 ? selected : [...DEFAULT_EXPANSION_METHODS];
  }

  private config(): ExpansionSuiteConfig {
    const model = this.currentModel();
    const definition = expansionModelDefinition(model);
    return {
      model,
      methods: this.selectedMethods(),
      parameterOverrides: { [definition.sweep.parameter]: this.dom.num('expSweepValue', definition.defaultParameters[definition.sweep.parameter] ?? 0) },
      dt: this.dom.num('expDt', definition.defaultDt),
      horizon: this.dom.num('expHorizon', definition.defaultHorizon),
      ghostEpsilon: this.dom.num('expGhost', 1e-5),
      bifurcationColumns: Math.round(this.dom.num('expBifColumns', 12)),
      sampleLimit: 260
    };
  }

  private async runSuite(): Promise<void> {
    const config = this.config();
    this.dom.setText('expStatus', 'queued');
    this.dom.setText('expWorkerMode', 'starting');
    const { result, worker, elapsedMs, fallbackReason } = await this.runJob(config);
    this.latest = result;
    this.dom.setText('expStatus', `done in ${fmt(elapsedMs, 1)} ms${fallbackReason ? ` (${fallbackReason})` : ''}`);
    this.dom.setText('expWorkerMode', worker ? 'worker' : 'fallback');
    this.remember(result);
    this.renderResult(result);
  }

  private async runJob(config: ExpansionSuiteConfig): Promise<{ result: ExpansionSuiteResult; worker: boolean; elapsedMs: number; fallbackReason?: string }> {
    const outcome = await runExpansionWorkerJob({ kind: 'suite', config, includeLyapunov: this.dom.bool('expIncludeLyap') });
    if (outcome.result.kind !== 'suite') throw new Error('expansion worker returned an unexpected job result');
    return {
      result: outcome.result.result,
      worker: outcome.worker,
      elapsedMs: outcome.elapsedMs,
      ...(outcome.fallbackReason ? { fallbackReason: outcome.fallbackReason } : {})
    };
  }

  private renderResult(result: ExpansionSuiteResult): void {
    this.dom.setText('expHash', result.manifest.hash);
    this.dom.setText('expBest', `${result.summary.bestMethod} · ${fmt(result.summary.bestScore, 1)}`);
    this.renderTable(result.rows);
    this.renderLyapunov(result.lyapunov);
    this.drawReplay(result.replay);
    this.drawHeatmap(result.phaseHeatmap);
    this.drawGhost(result.ghost);
    this.drawBifurcation(result.bifurcation);
    this.renderHistory();
  }

  private renderLyapunov(profile: ExpansionLyapunovProfile | undefined): void {
    const box = this.dom.el('expLyapReadout');
    if (!box) return;
    if (!profile) {
      box.replaceChildren();
      return;
    }
    const spectrum = profile.spectrum.map((value) => fmt(value, 3)).join(',  ');
    const leadingSe = profile.blockStdError[0] ?? 0;
    const consistency = profile.consistency;
    const verdict = consistency.symplectic ? 'symplectic ✓' : 'pairing ✗';
    box.replaceChildren(
      el('div', { className: 'exp-doc-title', text: 'Lyapunov spectrum — variational equation + Gram–Schmidt (QR)' }),
      el('p', { className: 'exp-lyap-spectrum', text: `λ = [ ${spectrum} ]` }),
      el('p', {},
        el('strong', { text: `λ₁ = ${fmt(profile.leadingExponent, 4)} ± ${fmt(leadingSe, 4)}` }),
        document.createTextNode(`   ·   Σλ = ${fmt(profile.sum, 4)}   ·   D_KY = ${fmt(profile.kaplanYorkeDimension, 3)}   ·   `),
        el('span', {
          className: consistency.symplectic ? 'exp-lyap-ok' : 'exp-lyap-warn',
          text: `${verdict} (pair err ${fmt(consistency.pairingError, 4)})`
        })
      ),
      el('p', { className: 'exp-sub', text: `${profile.spectrum.length} finite-time exponents (± block-bootstrap SE), every direction reorthonormalized every ${profile.settings.renormEvery} steps, ${profile.settings.jacobian} Jacobian — the research-grade estimate the single-perturbation ghost divergence above only approximates for λ₁.` })
    );
  }

  private renderTable(rows: readonly ExpansionMethodResult[]): void {
    const body = this.dom.el<HTMLTableSectionElement>('expMethodTable');
    if (!body) return;
    body.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.className = row.stable ? 'good' : 'bad';
      tr.append(
        textCell(row.method),
        textCell(row.stable ? 'yes' : 'no'),
        textCell(fmt(row.energyDrift, 3)),
        textCell(fmt(row.referenceDivergence, 3)),
        textCell(fmt(row.stepsPerMs, 1)),
        textCell(fmt(row.maxAbsState, 2))
      );
      body.append(tr);
    }
  }

  private drawReplay(replay: readonly ExpansionPoint[][]): void {
    const canvas = this.dom.el<HTMLCanvasElement>('expReplayCanvas');
    const ctx = canvasContext(canvas);
    if (!canvas || !ctx) return;
    this.clearCanvas(ctx, canvas);
    if (replay.length === 0) return;
    const points = replay.flat();
    const bounds = this.bounds(points, 0.35);
    const map = (point: ExpansionPoint): ExpansionPoint => ({
      x: ((point.x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * canvas.width,
      y: canvas.height - ((point.y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * canvas.height
    });
    const stride = Math.max(1, Math.floor(replay.length / 72));
    for (let i = 0; i < replay.length; i += stride) {
      const chain = replay[i] ?? [];
      const alpha = 0.12 + 0.72 * (i / replay.length);
      ctx.strokeStyle = `rgba(24,212,248,${alpha.toFixed(3)})`;
      ctx.fillStyle = `rgba(255,122,44,${Math.min(0.95, alpha + 0.08).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      const pivot = map({ x: 0, y: 0 });
      ctx.moveTo(pivot.x, pivot.y);
      for (const point of chain) {
        const p = map(point);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      const tip = chain[chain.length - 1];
      if (tip) {
        const p = map(tip);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawHeatmap(heatmap: ExpansionHeatmap): void {
    const canvas = this.dom.el<HTMLCanvasElement>('expHeatmapCanvas');
    const ctx = canvasContext(canvas);
    if (!canvas || !ctx) return;
    this.clearCanvas(ctx, canvas);
    const cw = canvas.width / heatmap.bins;
    const ch = canvas.height / heatmap.bins;
    for (let y = 0; y < heatmap.bins; y += 1) {
      for (let x = 0; x < heatmap.bins; x += 1) {
        const count = heatmap.counts[y]?.[x] ?? 0;
        const t = heatmap.maxCount > 0 ? Math.log1p(count) / Math.log1p(heatmap.maxCount) : 0;
        ctx.fillStyle = `rgb(${Math.round(14 + 230 * t)},${Math.round(24 + 120 * t)},${Math.round(54 + 30 * (1 - t))})`;
        ctx.fillRect(x * cw, canvas.height - (y + 1) * ch, cw + 1, ch + 1);
      }
    }
  }

  private drawGhost(frames: readonly ExpansionGhostFrame[]): void {
    const canvas = this.dom.el<HTMLCanvasElement>('expGhostCanvas');
    const ctx = canvasContext(canvas);
    if (!canvas || !ctx) return;
    this.clearCanvas(ctx, canvas);
    if (frames.length < 2) return;
    const max = Math.max(1e-12, ...frames.map((frame) => frame.divergence));
    ctx.strokeStyle = 'rgba(255,122,44,.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    frames.forEach((frame, index) => {
      const x = (index / (frames.length - 1)) * canvas.width;
      const y = canvas.height - (Math.log10(frame.divergence + 1e-12) / Math.log10(max + 1e-12)) * (canvas.height - 16) - 8;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    const last = frames[frames.length - 1]!;
    this.drawTinyChain(ctx, last.base, canvas.width - 76, 28, '#18d4f8');
    this.drawTinyChain(ctx, last.ghost, canvas.width - 38, 28, '#ff7a2c');
  }

  private drawBifurcation(columns: readonly ExpansionBifurcationColumn[]): void {
    const canvas = this.dom.el<HTMLCanvasElement>('expBifCanvas');
    const ctx = canvasContext(canvas);
    if (!canvas || !ctx) return;
    this.clearCanvas(ctx, canvas);
    if (columns.length === 0) return;
    const allValues = columns.flatMap((column) => column.values);
    const yMin = Math.min(-Math.PI, ...allValues);
    const yMax = Math.max(Math.PI, ...allValues);
    columns.forEach((column, index) => {
      const x = (index / Math.max(1, columns.length - 1)) * canvas.width;
      ctx.fillStyle = 'rgba(24,212,248,.72)';
      for (const value of column.values) {
        const y = canvas.height - ((value - yMin) / (yMax - yMin || 1)) * canvas.height;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
    });
  }

  private clearCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
  }

  private drawTinyChain(ctx: CanvasRenderingContext2D, points: readonly ExpansionPoint[], x: number, y: number, color: string): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (const point of points) ctx.lineTo(point.x * 18, -point.y * 18);
    ctx.stroke();
    const tip = points[points.length - 1];
    if (tip) {
      ctx.beginPath();
      ctx.arc(tip.x * 18, -tip.y * 18, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private bounds(points: readonly ExpansionPoint[], pad = 0.1): { xMin: number; xMax: number; yMin: number; yMax: number } {
    let xMin = -1;
    let xMax = 1;
    let yMin = -1;
    let yMax = 1;
    if (points.length > 0) {
      xMin = Math.min(...points.map((p) => p.x));
      xMax = Math.max(...points.map((p) => p.x));
      yMin = Math.min(...points.map((p) => p.y));
      yMax = Math.max(...points.map((p) => p.y));
    }
    const span = Math.max(xMax - xMin, yMax - yMin, 1e-6);
    const cx = (xMin + xMax) / 2;
    const cy = (yMin + yMax) / 2;
    const half = span * (0.5 + pad);
    return { xMin: cx - half, xMax: cx + half, yMin: cy - half, yMax: cy + half };
  }

  private readHistory(): ExpansionHistoryEntry[] {
    try {
      const parsed = JSON.parse(window.localStorage?.getItem(HISTORY_KEY) ?? '[]') as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((entry): entry is ExpansionHistoryEntry =>
        typeof entry === 'object' && entry !== null && typeof (entry as { hash?: unknown }).hash === 'string'
      );
    } catch {
      return [];
    }
  }

  private writeHistory(entries: readonly ExpansionHistoryEntry[]): void {
    try {
      window.localStorage?.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 24)));
    } catch {
      /* localStorage is optional; export still works */
    }
  }

  private remember(result: ExpansionSuiteResult): void {
    const entry: ExpansionHistoryEntry = {
      hash: result.manifest.hash,
      model: result.model,
      modelLabel: result.modelLabel,
      bestMethod: result.summary.bestMethod,
      bestScore: result.summary.bestScore,
      dt: result.dt,
      horizon: result.horizon,
      createdAt: result.generatedAt
    };
    const next = [entry, ...this.readHistory().filter((item) => item.hash !== entry.hash)];
    this.writeHistory(next);
  }

  private renderHistory(): void {
    const box = this.dom.el('expHistory');
    if (!box) return;
    const history = this.readHistory();
    if (history.length === 0) {
      box.textContent = 'No expansion experiments saved yet.';
      return;
    }
    box.replaceChildren();
    for (const entry of history.slice(0, 8)) {
      const row = document.createElement('div');
      row.className = 'exp-history-row';
      row.textContent = `${entry.hash} · ${entry.modelLabel} · best ${entry.bestMethod} (${fmt(entry.bestScore, 1)}) · ${entry.horizon}s`;
      box.append(row);
    }
  }

  private saveLatest(): void {
    if (!this.latest) {
      this.dom.setText('expStatus', 'nothing to save');
      return;
    }
    this.remember(this.latest);
    this.renderHistory();
    this.dom.setText('expStatus', `saved ${this.latest.manifest.hash}`);
  }

  private exportLatest(): void {
    if (!this.latest) {
      this.dom.setText('expStatus', 'nothing to export');
      return;
    }
    downloadJson(`pendulum_expansion_${this.latest.manifest.hash}.json`, this.latest);
  }

  private exportReport(): void {
    if (!this.latest) {
      this.dom.setText('expStatus', 'run before report');
      return;
    }
    const blob = new Blob([buildExpansionReport(this.latest)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pendulum_expansion_report_${this.latest.manifest.hash}.md`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.dom.setText('expStatus', 'report exported');
  }

  private runGoldenChecks(): void {
    const checks = runGoldenExpansionChecks();
    this.renderBatchLike('Golden checks', checks.map((check) => ({
      label: check.label,
      status: check.ok ? 'ok' : 'fail',
      detail: `${check.hash} · best ${check.bestMethod} · shell ${fmt(check.energyShellSpan, 3)} · ${check.reason}`
    })));
    this.dom.setText('expStatus', checks.every((check) => check.ok) ? 'golden checks passed' : 'golden checks need review');
  }

  private runBatchQueue(): void {
    this.dom.setText('expStatus', 'batch running');
    const batch = runExpansionBatch();
    this.renderBatchResults(batch);
    this.dom.setText('expStatus', `batch complete: ${batch.length} presets`);
  }

  private renderBatchResults(batch: readonly BatchExperimentResult[]): void {
    this.renderBatchLike('Batch queue', batch.map((item) => ({
      label: item.label,
      status: item.result.summary.bestMethod,
      detail: `${item.result.manifest.hash} · score ${fmt(item.result.summary.bestScore, 1)} · stable ${item.result.summary.stableMethods}/${item.result.rows.length}`
    })));
  }

  private renderBatchLike(title: string, rows: readonly { label: string; status: string; detail: string }[]): void {
    const box = this.dom.el('expBatchResults');
    if (!box) return;
    box.replaceChildren(el('div', { className: 'exp-doc-title', text: title }));
    for (const row of rows) {
      box.append(el('div', { className: 'exp-batch-row' },
        el('strong', { text: row.label }),
        el('span', { text: row.status }),
        el('em', { text: row.detail })
      ));
    }
  }

  private shareLatest(): void {
    if (!this.latest) {
      this.dom.setText('expStatus', 'nothing to share');
      return;
    }
    const url = `${location.origin}${location.pathname}${this.latest.manifest.shareHash}`;
    history.replaceState(null, '', this.latest.manifest.shareHash);
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    this.dom.setText('expStatus', 'share hash applied');
  }

  private clearHistory(): void {
    this.writeHistory([]);
    this.renderHistory();
    this.dom.setText('expStatus', 'history cleared');
  }
}
