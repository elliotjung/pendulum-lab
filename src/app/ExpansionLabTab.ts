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
  type ExpansionModelId,
  type ExpansionPreset,
  type ExpansionSuiteConfig,
  type ExpansionSuiteResult
} from '../physics/expandedModels';
import { TabController } from './TabController';
import { runExpansionWorkerJob } from './expansionWorkerClient';
import { ExpansionLabHistory } from './expansionLabHistory';
import { formatExpansionValue, ExpansionLabRenderer } from './expansionLabRendering';
import { ensureExpansionLabUi } from './expansionLabUi';

const METHOD_CHOICES: readonly { id: IntegratorId; label: string }[] = [
  { id: 'rk4', label: 'RK4' },
  { id: 'dopri5', label: 'Adaptive DP5' },
  { id: 'rkf45', label: 'Adaptive RKF45' },
  { id: 'leapfrog', label: 'Verlet / Leapfrog' },
  { id: 'symplectic', label: 'Euler-Cromer' },
  { id: 'yoshida4', label: 'Yoshida4' },
  { id: 'euler', label: 'Euler' }
];

/**
 * Coordinates Expansion Lab controls, worker jobs, and exports.
 *
 * Static UI, canvas/table rendering, and local history are intentionally
 * delegated to cohesive modules; this class retains only experiment state and
 * user-intent orchestration.
 */
export class ExpansionLabTab extends TabController {
  private latest: ExpansionSuiteResult | null = null;
  private readonly renderer = new ExpansionLabRenderer(this.dom);
  private readonly historyStore = new ExpansionLabHistory(this.dom);

  protected bind(): void {
    ensureExpansionLabUi();
    this.populateModels();
    this.populatePresets();
    this.populateMethods();
    this.syncDefaults();
    this.restoreFromHash();
    this.historyStore.render();
    this.dom.onChange('expModel', () => this.syncDefaults());
    this.dom.onChange('expPreset', () => this.applyPresetSelection());
    this.dom.onInput('expDt', () => this.syncNumberLabels());
    this.dom.onInput('expHorizon', () => this.syncNumberLabels());
    this.dom.onInput('expSweepValue', () => this.syncNumberLabels());
    this.dom.onInput('expGhost', () => this.syncNumberLabels());
    this.dom.onInput('expBifColumns', () => this.syncNumberLabels());
    this.dom.onClick('expRun', () => void this.runExclusive(() => this.runSuite(), 'expStatus'), { takeOver: true });
    this.dom.onClick('expSave', () => this.saveLatest(), { takeOver: true });
    this.dom.onClick('expExport', () => this.exportLatest(), { takeOver: true });
    this.dom.onClick('expShare', () => this.shareLatest(), { takeOver: true });
    this.dom.onClick('expReport', () => this.exportReport(), { takeOver: true });
    this.dom.onClick('expGolden', () => this.runGoldenChecks(), { takeOver: true });
    this.dom.onClick('expBatch', () => this.runBatchQueue(), { takeOver: true });
    this.dom.onClick('expClearHistory', () => this.clearHistory(), { takeOver: true });
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
      const value =
        definition.defaultParameters[definition.sweep.parameter] ?? (definition.sweep.min + definition.sweep.max) / 2;
      sweepInput.min = String(definition.sweep.min);
      sweepInput.max = String(definition.sweep.max);
      sweepInput.step = String(Math.max(0.001, Math.abs(definition.sweep.max - definition.sweep.min) / 100));
      sweepInput.value = String(value);
    }
    this.dom.setText('expSweepLabel', definition.sweep.label);
    this.dom.setText(
      'expModelSummary',
      `${definition.family} · dim ${definition.dimension} · ${definition.conservative ? 'conservative shell' : 'driven/dissipative energy flow'}`
    );
    this.renderer.renderModelDoc(definition);
    this.syncNumberLabels();
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
    this.dom.setValue(
      'expSweepValue',
      config.parameterOverrides?.[definition.sweep.parameter] ??
        definition.defaultParameters[definition.sweep.parameter] ??
        0
    );
    if (config.ghostEpsilon !== undefined) this.dom.setValue('expGhost', config.ghostEpsilon);
    if (config.bifurcationColumns !== undefined) this.dom.setValue('expBifColumns', config.bifurcationColumns);
    if (config.methods) {
      const selected = new Set(config.methods);
      this.dom.all<HTMLInputElement>('input[data-exp-method]').forEach((input) => {
        input.checked = selected.has(input.value as IntegratorId);
      });
    }
    this.renderer.renderModelDoc(definition);
    this.syncNumberLabels();
  }

  private restoreFromHash(): void {
    const restored = parseExpansionShareHash(location.hash);
    if (!restored) return;
    this.applyConfig(restored);
    this.dom.setText('expStatus', 'share hash restored');
  }

  private syncNumberLabels(): void {
    this.dom.setText('expDtV', formatExpansionValue(this.dom.num('expDt', 0), 4));
    this.dom.setText('expHorizonV', `${formatExpansionValue(this.dom.num('expHorizon', 0), 1)}s`);
    this.dom.setText('expSweepValueV', formatExpansionValue(this.dom.num('expSweepValue', 0), 3));
    this.dom.setText('expGhostV', this.dom.num('expGhost', 1e-5).toExponential(1));
    this.dom.setText('expBifColumnsV', String(Math.round(this.dom.num('expBifColumns', 12))));
  }

  private currentModel(): ExpansionModelId {
    const raw = this.dom.str('expModel', 'driven');
    return EXPANSION_MODEL_DEFINITIONS.some((model) => model.id === raw) ? (raw as ExpansionModelId) : 'driven';
  }

  private selectedMethods(): IntegratorId[] {
    const selected = this.dom
      .all<HTMLInputElement>('input[data-exp-method]:checked')
      .map((input) => input.value as IntegratorId);
    return selected.length > 0 ? selected : [...DEFAULT_EXPANSION_METHODS];
  }

  private config(): ExpansionSuiteConfig {
    const model = this.currentModel();
    const definition = expansionModelDefinition(model);
    return {
      model,
      methods: this.selectedMethods(),
      parameterOverrides: {
        [definition.sweep.parameter]: this.dom.num(
          'expSweepValue',
          definition.defaultParameters[definition.sweep.parameter] ?? 0
        )
      },
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
    const outcome = await runExpansionWorkerJob({
      kind: 'suite',
      config,
      includeLyapunov: this.dom.bool('expIncludeLyap')
    });
    if (outcome.result.kind !== 'suite') throw new Error('expansion worker returned an unexpected job result');
    this.latest = outcome.result.result;
    this.dom.setText(
      'expStatus',
      `done in ${formatExpansionValue(outcome.elapsedMs, 1)} ms${outcome.fallbackReason ? ` (${outcome.fallbackReason})` : ''}`
    );
    this.dom.setText('expWorkerMode', outcome.worker ? 'worker' : 'fallback');
    this.historyStore.remember(this.latest);
    this.renderer.renderResult(this.latest);
    this.historyStore.render();
  }

  private saveLatest(): void {
    if (!this.latest) {
      this.dom.setText('expStatus', 'nothing to save');
      return;
    }
    this.historyStore.remember(this.latest);
    this.historyStore.render();
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
    this.renderer.renderBatchLike(
      'Golden checks',
      checks.map((check) => ({
        label: check.label,
        status: check.ok ? 'ok' : 'fail',
        detail: `${check.hash} · best ${check.bestMethod} · shell ${formatExpansionValue(check.energyShellSpan, 3)} · ${check.reason}`
      }))
    );
    this.dom.setText(
      'expStatus',
      checks.every((check) => check.ok) ? 'golden checks passed' : 'golden checks need review'
    );
  }

  private runBatchQueue(): void {
    this.dom.setText('expStatus', 'batch running');
    const batch = runExpansionBatch();
    this.renderBatchResults(batch);
    this.dom.setText('expStatus', `batch complete: ${batch.length} presets`);
  }

  private renderBatchResults(batch: readonly BatchExperimentResult[]): void {
    this.renderer.renderBatchLike(
      'Batch queue',
      batch.map((item) => ({
        label: item.label,
        status: item.result.summary.bestMethod,
        detail: `${item.result.manifest.hash} · score ${formatExpansionValue(item.result.summary.bestScore, 1)} · stable ${item.result.summary.stableMethods}/${item.result.rows.length}`
      }))
    );
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
    this.historyStore.clear();
    this.historyStore.render();
    this.dom.setText('expStatus', 'history cleared');
  }
}
