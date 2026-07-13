import { downloadJson } from '../export/manifest';
import {
  EXPANSION_PRESETS,
  GOLDEN_EXPANSION_PRESET_IDS,
  type GoldenCenterMethodResult,
  type GoldenCenterResult
} from '../physics/expandedModels';
import { TabController } from './TabController';
import { runExpansionWorkerJob } from './expansionWorkerClient';

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

export class GoldenCenterTab extends TabController {
  private latest: GoldenCenterResult | null = null;

  protected bind(): void {
    this.ensureUi();
    this.populatePresetList();
    this.dom.onClick(
      'goldenRun',
      () => {
        void this.runExclusive(() => this.run(), 'goldenStatus');
      },
      { takeOver: true }
    );
    this.dom.onClick('goldenExport', () => this.exportLatest(), { takeOver: true });
    this.dom.onClick('goldenSelectAll', () => this.setAll(true), { takeOver: true });
    this.dom.onClick('goldenSelectCore', () => this.setCore(), { takeOver: true });
  }

  private ensureUi(): void {
    this.ensureRailTab();
    this.ensurePanel();
  }

  private ensureRailTab(): void {
    if (document.querySelector('.tab[data-tab="golden"]')) return;
    const rail = document.getElementById('rail-panel-check');
    if (!rail) return;
    const tab = document.createElement('button');
    tab.className = 'tab';
    tab.type = 'button';
    tab.dataset.tab = 'golden';
    tab.dataset.tip = 'Golden Center';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.setAttribute('aria-label', 'Golden Center');
    tab.title = 'Golden Center';
    tab.append(
      el('span', { className: 'tab-icon', text: 'Gd' }),
      el('span', { className: 'tab-label', text: 'Golden' })
    );
    const validate = rail.querySelector('.tab[data-tab="validate"]');
    validate?.after(tab);
    if (!validate) rail.append(tab);
  }

  private ensurePanel(): void {
    if (document.getElementById('tab-golden')) return;
    const tableBody = el('tbody', { id: 'goldenResultsBody' });
    const table = el(
      'table',
      { className: 'matrix-table golden-table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          cell('Preset', 'th'),
          cell('Method', 'th'),
          cell('Pass', 'th'),
          cell('Drift', 'th'),
          cell('Runtime', 'th'),
          cell('Regression', 'th'),
          cell('Score', 'th'),
          cell('Threshold', 'th')
        )
      ),
      tableBody
    );
    const panel = el(
      'div',
      { id: 'tab-golden', className: 'tabpanel golden-center-tab', role: 'tabpanel' },
      el(
        'div',
        { className: 'layout' },
        el(
          'div',
          { className: 'left-col' },
          el(
            'section',
            { className: 'matrix-shell' },
            el(
              'div',
              { className: 'matrix-topline' },
              el(
                'div',
                {},
                el('h2', { text: 'Golden Center' }),
                el('div', {
                  id: 'goldenSummary',
                  className: 'matrix-sub',
                  text: 'Integrator pass/fail, drift threshold, runtime threshold, and regression signature comparison.'
                })
              ),
              el(
                'div',
                { className: 'matrix-state-grid' },
                this.pill('Hash', 'goldenHash', '-'),
                this.pill('Pass', 'goldenPass', '-'),
                this.pill('Median', 'goldenMedian', '-')
              )
            ),
            el('div', { id: 'goldenPresetCards', className: 'golden-preset-cards' }),
            el('div', { className: 'matrix-table-wrap' }, table)
          )
        ),
        el(
          'aside',
          { className: 'controls matrix-controls' },
          el(
            'div',
            { className: 'ctrl-sticky' },
            el('div', { className: 'ctrl-sticky-title', text: 'Golden Controls' }),
            el('div', { className: 'btnrow' }, button('goldenRun', 'Run', 'primary'), button('goldenExport', 'Export')),
            el('div', { id: 'goldenStatus', className: 'exp-status', text: 'ready' })
          ),
          el(
            'details',
            { className: 'acc' },
            el(
              'summary',
              {},
              el('span', { className: 'acc-icon', text: 'G' }),
              el('span', { className: 'acc-label', text: 'Golden presets' }),
              el('span', { className: 'acc-arrow', text: '>' })
            ),
            el(
              'div',
              { className: 'acc-body' },
              el('div', { className: 'btnrow' }, button('goldenSelectCore', 'Core'), button('goldenSelectAll', 'All')),
              el('div', { id: 'goldenPresetList', className: 'golden-preset-list' })
            )
          )
        )
      )
    );
    panel.querySelector<HTMLDetailsElement>('details')!.open = true;
    (document.getElementById('tab-validate') ?? document.querySelector('.tabpanel:last-of-type'))?.after(panel);
  }

  private pill(label: string, id: string, value: string): HTMLElement {
    return el('span', {}, el('b', { text: label }), el('em', { id, text: value }));
  }

  private populatePresetList(): void {
    const list = this.dom.el('goldenPresetList');
    if (!list || list.childElementCount > 0) return;
    for (const preset of EXPANSION_PRESETS) {
      const label = document.createElement('label');
      label.className = 'exp-check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = preset.id;
      input.checked = (GOLDEN_EXPANSION_PRESET_IDS as readonly string[]).includes(preset.id);
      input.dataset.goldenPreset = preset.id;
      label.append(input, el('span', { text: preset.label }));
      list.append(label);
    }
  }

  private selectedPresetIds(): string[] {
    const selected = this.dom.all<HTMLInputElement>('input[data-golden-preset]:checked').map((item) => item.value);
    return selected.length > 0 ? selected : [...GOLDEN_EXPANSION_PRESET_IDS];
  }

  private setAll(value: boolean): void {
    this.dom.all<HTMLInputElement>('input[data-golden-preset]').forEach((input) => {
      input.checked = value;
    });
    this.dom.setText('goldenStatus', value ? 'all presets selected' : 'presets cleared');
  }

  private setCore(): void {
    const core = new Set<string>(GOLDEN_EXPANSION_PRESET_IDS);
    this.dom.all<HTMLInputElement>('input[data-golden-preset]').forEach((input) => {
      input.checked = core.has(input.value);
    });
    this.dom.setText('goldenStatus', 'core presets selected');
  }

  private async run(): Promise<void> {
    this.dom.setText('goldenStatus', 'running golden center…');
    const outcome = await runExpansionWorkerJob({ kind: 'golden', presetIds: this.selectedPresetIds() }, 60_000);
    if (outcome.result.kind !== 'golden') throw new Error('expansion worker returned an unexpected job result');
    this.latest = outcome.result.result;
    this.render(this.latest);
    this.dom.setText('goldenStatus', `done in ${fmt(outcome.elapsedMs, 1)} ms${outcome.worker ? ' (worker)' : ''}`);
  }

  private exportLatest(): void {
    if (!this.latest) {
      this.dom.setText('goldenStatus', 'nothing to export');
      return;
    }
    downloadJson(`pendulum_golden_center_${this.latest.manifest.hash}.json`, this.latest);
  }

  private render(result: GoldenCenterResult): void {
    this.dom.setText('goldenHash', result.manifest.hash);
    this.dom.setText('goldenPass', `${result.summary.passed}/${result.summary.totalMethods}`);
    this.dom.setText('goldenMedian', `${fmt(result.summary.medianRuntimeMs, 1)} ms`);
    this.dom.setText(
      'goldenSummary',
      `${result.summary.passed} passed, ${result.summary.failed} failed across ${result.presets.length} preset(s).`
    );
    this.renderPresetCards(result);
    this.renderTable(result.presets.flatMap((preset) => preset.methods));
  }

  private renderPresetCards(result: GoldenCenterResult): void {
    const box = this.dom.el('goldenPresetCards');
    if (!box) return;
    box.replaceChildren();
    for (const preset of result.presets) {
      const passed = preset.methods.filter((row) => row.pass).length;
      box.append(
        el(
          'div',
          { className: preset.pass ? 'golden-card pass' : 'golden-card fail' },
          el('strong', { text: preset.label }),
          el('span', { text: `${passed}/${preset.methods.length} methods` }),
          el('em', { text: preset.pass ? 'all thresholds passed' : 'review thresholds' })
        )
      );
    }
  }

  private renderTable(rows: readonly GoldenCenterMethodResult[]): void {
    const body = this.dom.el<HTMLTableSectionElement>('goldenResultsBody');
    if (!body) return;
    body.replaceChildren();
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.className = row.pass ? 'good' : 'bad';
      tr.append(
        cell(row.presetLabel),
        cell(row.method),
        cell(row.pass ? 'PASS' : 'FAIL'),
        cell(`${row.driftPass ? 'ok' : 'miss'} ${fmt(row.energyDrift, 3)}`),
        cell(`${row.runtimePass ? 'ok' : 'miss'} ${fmt(row.runtimeMs, 1)} ms`),
        cell(
          `${row.regressionPass ? 'ok' : 'miss'} ${row.regressionHash} / ${row.expectedRegressionHash ?? 'untracked'}`
        ),
        cell(fmt(row.stabilityScore, 1)),
        cell(row.threshold)
      );
      body.append(tr);
    }
  }
}
