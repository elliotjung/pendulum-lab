import '../../../../css/product/diagnostics.css';
import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { AnalysisState, ExperimentStateV1 } from '../../contracts/experiment';
import type { ContractResult } from '../../contracts/validation';
import { createAdvancedDiagnostics } from './advanced-diagnostics';
import { createStability } from './stability';
import { createExperimentWorkflow } from '../experiments/view';
import { createResearchWorkflow } from '../research/view';
import { createDataDrivenWorkflow } from '../data-driven/view';
import { createResearchProjectWorkflow } from '../projects/view';

export interface DiagnosticsOptions {
  experiment(): ContractResult<ExperimentStateV1>;
  samples(): readonly unknown[];
  canRun(): boolean;
  /** A workspace may preserve valid diagnostic edits in its canonical restart state. */
  saveDiagnostic?(entry: AnalysisState): void;
}

/** Opening the dock loads analysis and family providers; ordinary Lab routes stay lazy. */
export function createDiagnostics(document: Document, options: DiagnosticsOptions) {
  const wrapper = element(document, 'div', 'lab-diagnostics');
  const advanced = createAdvancedDiagnostics(document, options);
  const stability = createStability(document, options);
  const experiments = createExperimentWorkflow(document, options);
  const research = createResearchWorkflow(document, options);
  const dataDriven = createDataDrivenWorkflow(document, options);
  const projects = createResearchProjectWorkflow(document, options);
  const container = element(document, 'details', 'lab-details core-diagnostics');
  container.id = 'core-diagnostics';
  container.dataset.coreDiagnosticStatus = 'empty';
  container.append(element(document, 'summary', '', '핵심 카오스 진단'));
  let panel: ReturnType<typeof import('./diagnostics-panel').createDiagnosticsPanel> | undefined;
  let pending = false;
  let disposed = false;
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const retry = createButton(document, {
    label: '핵심 진단 도구 다시 불러오기',
    variant: 'secondary',
    onClick: () => {
      void load();
    }
  });
  retry.hidden = true;
  container.append(notice, retry);
  async function load() {
    if (disposed || pending || panel) return;
    pending = true;
    retry.hidden = true;
    notice.textContent = '핵심 진단 도구를 불러옵니다.';
    try {
      const module = await import('./diagnostics-panel');
      if (disposed) return;
      panel = module.createDiagnosticsPanel(document, options, container);
      panel.refresh();
      panel.update();
      notice.remove();
      retry.remove();
    } catch {
      if (disposed) return;
      panel?.dispose();
      panel = undefined;
      container.querySelector('.core-diagnostics-body')?.remove();
      notice.textContent =
        '핵심 진단 도구를 불러오지 못했습니다. 연결을 확인하고 다시 불러오세요. 현재 실험은 보존했습니다.';
      retry.hidden = false;
      container.append(notice, retry);
      container.dataset.coreDiagnosticStatus = 'error';
    } finally {
      pending = false;
    }
  }
  container.addEventListener('toggle', () => {
    if (container.open) void load();
  });
  wrapper.append(
    container,
    advanced.element,
    stability.element,
    research.element,
    dataDriven.element,
    projects.element
  );
  return {
    element: wrapper,
    experiments: experiments.element,
    update() {
      panel?.update();
      advanced.update();
      stability.update();
      experiments.update();
      research.update();
      dataDriven.update();
      projects.update();
    },
    dispose() {
      disposed = true;
      panel?.dispose();
      advanced.dispose();
      stability.dispose();
      experiments.dispose();
      research.dispose();
      dataDriven.dispose();
      projects.dispose();
    }
  };
}
