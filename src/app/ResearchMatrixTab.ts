import type { IntegratorId } from '../types/domain';
import { downloadJson } from '../export/manifest';
import {
  EXPANSION_MODEL_DEFINITIONS,
  EXPANSION_PRESETS,
  configFromPreset,
  expansionModelDefinition,
  type ExpansionModelId,
  type ExpansionResearchMatrixResult,
  type ExpansionSuiteConfig
} from '../physics/expandedModels';
import { TabController } from './TabController';
import { runExpansionWorkerJob } from './expansionWorkerClient';
import { formatMatrixValue, ResearchMatrixRenderer } from './researchMatrixRendering';
import { ensureResearchMatrixUi } from './researchMatrixUi';

const METHOD_OPTIONS: readonly IntegratorId[] = ['rk4', 'dopri5', 'leapfrog', 'symplectic', 'euler'];

/** Owns Matrix configuration and worker orchestration; rendering lives separately. */
export class ResearchMatrixTab extends TabController {
  private latest: ExpansionResearchMatrixResult | null = null;
  private readonly renderer = new ResearchMatrixRenderer(this.dom);

  protected bind(): void {
    ensureResearchMatrixUi();
    this.populateControls();
    this.syncDefaults();
    this.dom.onChange('matrixPreset', () => this.applyPreset());
    this.dom.onChange('matrixModel', () => this.syncDefaults());
    this.dom.onInput('matrixGrid', () => this.syncLabels());
    this.dom.onInput('matrixHorizon', () => this.syncLabels());
    this.dom.onInput('matrixDt', () => this.syncLabels());
    this.dom.onInput('matrixParam', () => this.syncLabels());
    this.dom.onClick('matrixRun', () => void this.runExclusive(() => this.run(), 'matrixStatus'), { takeOver: true });
    this.dom.onClick('matrixExport', () => this.exportLatest(), { takeOver: true });
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
        const text = document.createElement('span');
        text.textContent = method;
        label.append(check, text);
        methods.append(label);
      }
    }
  }

  private applyPreset(): void {
    const presetId = this.dom.str('matrixPreset', EXPANSION_PRESETS[0]?.id ?? 'driven-chaos');
    this.applyConfig(configFromPreset(presetId));
    this.dom.setText('matrixStatus', 'preset loaded');
  }

  private applyConfig(config: ExpansionSuiteConfig): void {
    const definition = expansionModelDefinition(config.model);
    this.dom.setValue('matrixModel', config.model);
    this.dom.setValue('matrixDt', config.dt ?? definition.defaultDt);
    this.dom.setValue('matrixHorizon', config.horizon ?? definition.defaultHorizon);
    this.dom.setValue(
      'matrixParam',
      config.parameterOverrides?.[definition.sweep.parameter] ??
        definition.defaultParameters[definition.sweep.parameter] ??
        0
    );
    this.syncLabels();
  }

  private syncDefaults(): void {
    const definition = expansionModelDefinition(this.currentModel());
    const param = this.dom.el<HTMLInputElement>('matrixParam');
    if (param) {
      param.min = String(definition.sweep.min);
      param.max = String(definition.sweep.max);
      param.step = String(Math.max(0.001, Math.abs(definition.sweep.max - definition.sweep.min) / 100));
      param.value = String(
        definition.defaultParameters[definition.sweep.parameter] ?? (definition.sweep.min + definition.sweep.max) / 2
      );
    }
    this.dom.setValue('matrixDt', definition.defaultDt);
    this.dom.setValue('matrixHorizon', Math.min(definition.defaultHorizon, 18));
    this.dom.setText('matrixSummary', `${definition.label}: ${definition.family}`);
    this.syncLabels();
  }

  private syncLabels(): void {
    const definition = expansionModelDefinition(this.currentModel());
    this.dom.setText('matrixParamLabel', definition.sweep.label);
    this.dom.setText('matrixDtV', formatMatrixValue(this.dom.num('matrixDt', definition.defaultDt), 4));
    this.dom.setText(
      'matrixHorizonV',
      `${formatMatrixValue(this.dom.num('matrixHorizon', definition.defaultHorizon), 1)}s`
    );
    this.dom.setText('matrixParamV', formatMatrixValue(this.dom.num('matrixParam', 0), 3));
    this.dom.setText('matrixGridV', String(Math.round(this.dom.num('matrixGrid', 8))));
  }

  private currentModel(): ExpansionModelId {
    const value = this.dom.str('matrixModel', 'driven');
    return EXPANSION_MODEL_DEFINITIONS.some((item) => item.id === value) ? (value as ExpansionModelId) : 'driven';
  }

  private selectedMethods(): IntegratorId[] {
    const selected = this.dom
      .all<HTMLInputElement>('input[data-matrix-method]:checked')
      .map((item) => item.value as IntegratorId);
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
      parameterOverrides: {
        [definition.sweep.parameter]: this.dom.num(
          'matrixParam',
          definition.defaultParameters[definition.sweep.parameter] ?? 0
        )
      },
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
    this.renderer.render(this.latest);
    this.dom.setText(
      'matrixStatus',
      `done in ${formatMatrixValue(outcome.elapsedMs, 1)} ms${outcome.worker ? ' (worker)' : ''}`
    );
  }

  private exportLatest(): void {
    if (!this.latest) {
      this.dom.setText('matrixStatus', 'nothing to export');
      return;
    }
    downloadJson(`pendulum_research_matrix_${this.latest.manifest.hash}.json`, this.latest);
  }
}
