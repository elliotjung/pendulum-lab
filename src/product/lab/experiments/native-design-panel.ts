import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { ContractResult } from '../../contracts/validation';
import {
  defaultNativeDesignSettings,
  generateNativeDesign,
  refineNativeDesign,
  type NativeDesignSettings,
  type NativeDesignRefinement
} from './native-design';
import {
  createNativeDesignQueue,
  parseNativeDesignQueue,
  serializeNativeDesignQueue,
  type NativeDesignQueue,
  type NativeDesignSnapshot
} from './native-design-queue';
import { createLegacyRunListPanel } from './legacy-run-list-panel';
import type { EvaluatedPoint } from '../../../research/experimentDesign';

export interface NativeDesignPanelOptions {
  experiment(): ContractResult<ExperimentStateV1>;
  canRun(): boolean;
}
/** Native multi-variable design and independent studyPoint diagnostics. Never calls generic summary statistics λ. */
export function createNativeDesignPanel(document: Document, options: NativeDesignPanelOptions) {
  const root = element(document, 'details', 'ds-section');
  root.classList.add('native-design');
  root.style.minWidth = '0';
  root.style.maxWidth = '100%';
  root.append(element(document, 'summary', 'ds-section__heading', 'native 다변수 설계·λ refinement'));
  const body = element(document, 'div', 'ds-section__body');
  body.style.minWidth = '0';
  root.append(body);
  body.append(
    element(
      document,
      'p',
      'lab-muted',
      '기존 generateDesign의 Sobol·LHS·grid와 adaptive·경계·불확실도 재표본을 실행합니다. 자동 평가는 독립 native studyPoint(λ·block SE·RQA·FTLE)입니다. 주 궤적 적분기·duration과 별개인 아래 분석 설정을 사용하며, Lyapunov dt는 기존 정책대로 각 조건의 min(0.01, dt)입니다. 실효 요청 전체를 결과에 표시합니다. γ=0 이중·복합·삼중 조건만 자동 평가하며 감쇠를 임의로 제거하지 않습니다. 점≤256, 누적 작업≤64000000, 파일≤16MiB, 점당45초. 취소·가져오기 후 중단점만 처음부터 재개합니다.'
    )
  );
  const field = (label: string, value: string, multiline = false) => {
    const wrapper = element(document, 'label', 'ds-field');
    wrapper.append(element(document, 'span', 'ds-field__label', label));
    const control = multiline
      ? element(document, 'textarea', 'ds-field__control')
      : element(document, 'input', 'ds-field__control');
    control.value = value;
    control.setAttribute('aria-label', label);
    control.style.minWidth = '0';
    control.style.maxWidth = '100%';
    if (control instanceof HTMLTextAreaElement) {
      control.rows = 5;
      control.style.width = '100%';
    }
    wrapper.append(control);
    body.append(wrapper);
    return control;
  };
  const defaults = defaultNativeDesignSettings();
  const variables = field('native 설계 변수 JSON', JSON.stringify(defaults.variables), true);
  const settings = field(
    'native 생성·예산·독립 분석 설정 JSON',
    JSON.stringify({ ...defaults, variables: undefined }, null, 2),
    true
  );
  const evaluations = field('외부 λ·SE 평가점 JSON (values, lambdaMax, lambdaStdError)', '[]', true);
  const evidenceSource = field('외부 λ·SE 실제 출처', '');
  const maxNew = field('refinement 최대 추가 점 수', '4');
  const threshold = field('불확실도 상대 SE 임계값', '2');
  const status = element(document, 'p', 'lab-muted');
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const progress = element(document, 'progress', '');
  progress.max = 1;
  progress.value = 0;
  progress.setAttribute('aria-label', 'native 설계 진행률');
  const output = element(document, 'pre', '');
  output.style.whiteSpace = 'pre-wrap';
  output.style.overflowWrap = 'anywhere';
  output.style.maxHeight = '28rem';
  output.style.overflow = 'auto';
  const conditions = element(document, 'div', '');
  conditions.style.minWidth = '0';
  let queue: NativeDesignQueue | undefined,
    state: NativeDesignSnapshot | undefined,
    unsubscribe: (() => void) | undefined,
    disposed = false,
    revision = 0;
  let conditionPanel: ReturnType<typeof createLegacyRunListPanel> | undefined;
  const urls = new Set<string>(),
    timers = new Set<ReturnType<typeof setTimeout>>();
  const showError = (cause: unknown) => {
    error.hidden = false;
    error.textContent = cause instanceof Error ? cause.message : String(cause);
  };
  const act = (work: () => void) => {
    try {
      error.hidden = true;
      work();
    } catch (cause) {
      showError(cause);
    }
  };
  const buttons = element(document, 'div', 'lab-actions');
  function replace(next: NativeDesignQueue) {
    unsubscribe?.();
    queue?.dispose();
    conditionPanel?.dispose();
    conditionPanel = undefined;
    conditions.replaceChildren();
    queue = next;
    unsubscribe = queue.subscribe((value) => {
      root.dataset.designStatus = value.status;
      state = value;
      const done = value.runs.filter((run) => run.status === 'completed').length;
      status.textContent = `${value.status} · ${done}/${value.runs.length} 완료 · ${value.usesWorkers ? 'native Worker' : 'Worker 미실행/대체'} · 누적 ${value.workConsumed}/64000000 작업 · ${Math.round(value.elapsedMs)}ms${value.stopReason ? ` · ${value.stopReason}` : ''}`;
      progress.value = value.runs.length
        ? value.runs.reduce((sum, run) => sum + (run.status === 'completed' ? 1 : run.progress), 0) / value.runs.length
        : 0;
      output.textContent = JSON.stringify(
        {
          source: value.plan.source,
          effectiveEvaluation: value.plan.settings.evaluation,
          estimatedWork: value.plan.estimatedWork,
          points: value.plan.points.map((point, index) => ({
            id: point.id,
            origin: point.origin,
            replicate: point.replicate,
            values: point.values,
            canonicalCondition: point.experiment,
            nativeRequest: point.request,
            unsupported: point.unsupported,
            run: value.runs[index]
          }))
        },
        null,
        2
      );
      generate.disabled = value.status === 'running';
      start.disabled = value.status === 'running' || !options.canRun();
      cancel.disabled = value.status !== 'running';
      retry.disabled = value.status === 'running';
      for (const button of refineButtons) button.disabled = value.status === 'running';
      file.disabled = value.status === 'running';
    });
  }
  const generate = createButton(document, {
    label: '현재 원본에서 native 설계 생성',
    onClick: () =>
      act(() => {
        if (state?.status === 'running') throw new Error('실행을 취소한 뒤 새 설계를 생성하세요.');
        const source = options.experiment();
        if (!source.ok) throw new Error(source.issues.map((i) => i.message).join(' '));
        const input = { ...JSON.parse(settings.value), variables: JSON.parse(variables.value) } as NativeDesignSettings;
        replace(createNativeDesignQueue(generateNativeDesign(source.value, input)));
      })
  });
  const start = createButton(document, {
    label: 'native λ·RQA·FTLE 실행·재개',
    onClick: () =>
      act(() => {
        if (!queue || !options.canRun()) throw new Error('실행 가능한 실험에서 먼저 설계를 생성하세요.');
        queue.start();
      })
  });
  start.disabled = true;
  const cancel = createButton(document, {
    label: 'native 설계 실행 취소',
    variant: 'secondary',
    onClick: () => queue?.cancel()
  });
  cancel.disabled = true;
  const retry = createButton(document, {
    label: '실패점 재시도 준비',
    variant: 'secondary',
    onClick: () => queue?.retryFailed()
  });
  const refineButtons = (['adaptive', 'boundary', 'uncertainty'] as const).map((kind) =>
    createButton(document, {
      label: `native ${kind} refinement 추가`,
      variant: 'secondary',
      onClick: () =>
        act(() => {
          if (!state || state.status === 'running') throw new Error('완료 또는 취소된 설계가 필요합니다.');
          const completed = state.runs.flatMap((run, index): EvaluatedPoint[] =>
            run.result
              ? [
                  {
                    values: state!.plan.points[index]!.values,
                    lambdaMax: run.result.lambdaMax,
                    lambdaStdError: run.result.lambdaBlockStdError
                  }
                ]
              : []
          );
          const external = JSON.parse(evaluations.value) as EvaluatedPoint[];
          if (!Array.isArray(external)) throw new Error('외부 평가점 배열이 필요합니다.');
          const record: NativeDesignRefinement = {
            kind,
            maxNew: Number(maxNew.value),
            relativeThreshold: Number(threshold.value),
            evidenceSource: external.length ? evidenceSource.value.trim() : `native-studyPoint:${state.plan.id}`,
            evaluated: external.length ? external : completed
          };
          if (!record.evaluated.length)
            throw new Error('실제 native 완료점 또는 출처를 명시한 외부 λ·SE가 필요합니다.');
          const plan = refineNativeDesign(state.plan, record);
          const newState: NativeDesignSnapshot = {
            ...state,
            plan,
            status: 'ready',
            stopReason: null,
            runs: [
              ...state.runs,
              ...plan.points.slice(state.runs.length).map((point) => ({
                id: point.id,
                status: point.unsupported ? ('unsupported' as const) : ('pending' as const),
                attempts: 0,
                failures: 0,
                progress: 0,
                ...(point.unsupported ? { error: point.unsupported } : {})
              }))
            ]
          };
          replace(createNativeDesignQueue(newState));
        })
    })
  );
  const download = createButton(document, {
    label: 'native 설계 입력·전체 결과·재개 JSON 저장',
    variant: 'secondary',
    onClick: () =>
      act(() => {
        if (!queue) throw new Error('저장할 설계가 없습니다.');
        const snapshot = queue.snapshot(),
          url = URL.createObjectURL(new Blob([serializeNativeDesignQueue(snapshot)], { type: 'application/json' }));
        urls.add(url);
        const anchor = element(document, 'a', '');
        anchor.href = url;
        anchor.download = `${snapshot.plan.id}.json`;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        const timer = setTimeout(() => {
          URL.revokeObjectURL(url);
          urls.delete(url);
          timers.delete(timer);
        }, 1000);
        timers.add(timer);
      })
  });
  const file = element(document, 'input', 'ds-field__control');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.setAttribute('aria-label', 'native 설계 재개 JSON 가져오기');
  file.addEventListener('change', () => {
    const chosen = file.files?.[0],
      token = ++revision;
    if (!chosen || state?.status === 'running') return;
    void (async () => {
      try {
        if (chosen.size > 16 * 1024 * 1024) throw new Error('파일은 최대16MiB입니다.');
        const value = parseNativeDesignQueue(await chosen.text());
        if (disposed || token !== revision) return;
        replace(createNativeDesignQueue(value));
        error.hidden = true;
      } catch (cause) {
        if (!disposed && token === revision) showError(cause);
      } finally {
        file.value = '';
      }
    })();
  });
  const generic = createButton(document, {
    label: '설계의 정확한 조건을 일반 요약 큐로 열기',
    variant: 'secondary',
    onClick: () =>
      act(() => {
        if (!state) throw new Error('먼저 설계를 생성하세요.');
        conditionPanel?.dispose();
        conditionPanel = createLegacyRunListPanel(
          document,
          state.plan.points.map((point) => ({
            sourceId: `${state!.plan.id}:${point.id}`,
            experiment: point.experiment
          }))
        );
        conditions.replaceChildren(
          element(
            document,
            'p',
            'lab-muted',
            '아래는 원래 적분기·감쇠·시간의 일반 표본 요약입니다. λ·RQA·FTLE와 다른 결과이며 자동 refinement 평가점으로 사용하지 않습니다.'
          ),
          conditionPanel.element
        );
      })
  });
  buttons.append(generate, start, cancel, retry, ...refineButtons, download, generic);
  body.append(buttons, file, status, error, progress, output, conditions);
  return {
    element: root,
    dispose() {
      disposed = true;
      revision += 1;
      unsubscribe?.();
      queue?.dispose();
      conditionPanel?.dispose();
      timers.forEach(clearTimeout);
      urls.forEach((url) => URL.revokeObjectURL(url));
    }
  };
}
