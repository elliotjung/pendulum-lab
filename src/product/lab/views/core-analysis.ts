import { element } from '../../app/dom';
import { createButton, createInput, createProgress, createSection } from '../../design-system/primitives';
import { createPlanarAnalysisJob, type PlanarAnalysisJob } from '../../adapters/analysis/client';
import {
  defaultPlanarAnalysisSettings,
  fromPlanarAnalysisState,
  toPlanarAnalysisState,
  validatePlanarAnalysisSettings,
  type PlanarAnalysisKind,
  type PlanarAnalysisSettings
} from '../../adapters/analysis/settings';
import type { PlanarAnalysisResult } from '../../adapters/analysis/planar';
import type { CoreModel } from './core-model';
import { createPlot, trajectoryPlot } from './core-plots';

type Kind = 'state-time' | 'energy' | 'phase' | PlanarAnalysisKind;
const names: Record<Kind, string> = {
  'state-time': '상태 / 시간',
  energy: '에너지',
  phase: '위상공간',
  poincare: 'Poincaré 단면',
  lyapunov: '최대 Lyapunov'
};
export function createCoreAnalysis(document: Document, model: CoreModel) {
  const section = createSection(document, {
    id: 'core-analysis',
    title: '분석',
    description: '상태·에너지·위상은 기록된 궤적을 사용합니다. Poincaré·Lyapunov는 현재 초기조건으로 별도 계산합니다.'
  });
  let kind: Kind = 'state-time',
    job: PlanarAnalysisJob | undefined,
    counter = 0,
    valid = true,
    settings: PlanarAnalysisSettings | undefined;
  let status = 'empty';
  let result: PlanarAnalysisResult | undefined;
  let lastCount = -1;
  let lastSamples = model.state.samples;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const label = element(document, 'label', 'ds-field__label', '분석 도구');
  label.htmlFor = 'core-analysis-kind';
  const select = element(document, 'select', 'ds-field__control');
  select.id = 'core-analysis-kind';
  for (const [id, name] of Object.entries(names)) {
    const option = element(document, 'option', '', name);
    option.value = id;
    select.append(option);
  }
  const fields = element(document, 'div', 'lab-fieldset');
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const output = element(document, 'div', 'core-analysis-result');
  const progress = createProgress(document, { id: 'lab-analysis-progress', label: '분석 진행', value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const run = createButton(document, { label: '분석 계산', onClick: compute });
  const cancel = createButton(document, {
    label: '분석 취소',
    variant: 'secondary',
    disabled: true,
    onClick() {
      job?.cancel();
    }
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(run, cancel);
  section.body.append(label, select, fields, actions, progress.element, notice, error, output);

  function setStatus(value: string, message: string) {
    status = value;
    section.element.dataset.analysisStatus = value;
    notice.textContent = message;
    update();
    notify();
  }
  function invalidate() {
    job?.dispose();
    job = undefined;
    counter++;
    result = undefined;
    output.replaceChildren();
    lastCount = -1;
    progress.setValue(0);
    setStatus('empty', '조건이 바뀌었습니다. 분석을 다시 계산하세요.');
  }
  function persist() {
    if (kind !== 'poincare' && kind !== 'lyapunov') return;
    try {
      validatePlanarAnalysisSettings(kind, settings, model.state.config);
      valid = true;
      error.hidden = true;
      error.textContent = '';
      const entry = toPlanarAnalysisState(kind, settings!);
      model.setAnalyses([...(model.state.config.analyses ?? []).filter((item) => item.id !== entry.id), entry]);
    } catch (cause) {
      valid = false;
      error.hidden = false;
      error.textContent = cause instanceof Error ? cause.message : '분석 설정을 확인하세요.';
    }
    update();
    notify();
  }
  function renderFields() {
    fields.replaceChildren();
    valid = true;
    error.hidden = true;
    error.textContent = '';
    if (kind !== 'poincare' && kind !== 'lyapunov') {
      settings = undefined;
      return;
    }
    const saved = model.state.config.analyses?.find(
      (item) =>
        item.id === `analysis:${kind}` &&
        !['core-diagnostics-v1', 'advanced-diagnostics-v1'].includes(item.algorithmVersion)
    );
    try {
      settings = saved
        ? fromPlanarAnalysisState(saved, model.state.config)
        : defaultPlanarAnalysisSettings(kind, model.state.config);
    } catch (cause) {
      settings = undefined;
      valid = false;
      error.hidden = false;
      error.textContent = `저장된 분석 설정을 지원하지 않습니다. ${cause instanceof Error ? cause.message : ''}`;
      const original = element(document, 'details', 'lab-details');
      original.append(
        element(document, 'summary', '', '지원하지 않는 원본 분석 설정 보기'),
        element(document, 'pre', 'core-result-json', JSON.stringify(saved, null, 2))
      );
      const replace = createButton(document, {
        label: '이 분석을 기본 설정으로 교체',
        variant: 'secondary',
        onClick() {
          if (kind !== 'poincare' && kind !== 'lyapunov') return;
          settings = defaultPlanarAnalysisSettings(kind, model.state.config);
          persist();
          if (!valid) return;
          renderFields();
          update();
          notify();
          fields.querySelector<HTMLInputElement>('input')?.focus();
        }
      });
      fields.append(original, replace);
      return;
    }
    const labels: Record<string, string> = {
      duration: '분석 기간 (s)',
      sectionIndex: '단면 좌표 (0=θ₁, 1=θ₂)',
      sectionValue: '단면 각도 (rad)',
      transientCrossings: '제외할 교차 수',
      maxPoints: '최대 단면 점 수',
      transient: '과도 구간 (s)',
      renormEvery: '재규격화 간격 (step)',
      seed: '교란 seed'
    };
    const hints: Record<string, string> = {
      duration: `범위 ${model.state.config.step}–300 s. 총 계산량 최대 100,000 step.`,
      sectionIndex: '0은 첫 번째 각도, 1은 두 번째 각도입니다.',
      sectionValue: '범위 −100π–100π rad. 감기지 않은 절대각에서 교차를 찾습니다.',
      transientCrossings: '초기 교차 0–2,000개를 결과에서 제외합니다.',
      maxPoints: '보존할 교차점 1–2,000개. 상한에 도달하면 종료합니다.',
      transient: '측정 전에 버릴 초기 적분 기간 0–300 s.',
      renormEvery: '1–10,000 step의 정수이며 측정 step 수 이하여야 합니다.',
      seed: '초기 미소 교란 방향을 재현하는 정수 0–4,294,967,295.'
    };
    fields.append(
      element(
        document,
        'p',
        'lab-muted',
        kind === 'poincare'
          ? '기존 RK4 사건 검출기로 별도 적분합니다. 애니메이션 적분기와 다를 수 있습니다. 근 찾기 비용이 달라 완료 비율 대신 실제 운동방정식 평가 횟수를 표시합니다.'
          : '현재 적분기로 두 궤적의 유한시간 성장률을 측정합니다. 양수 하나만으로 카오스를 확정하지 마세요. 기간·간격에 대한 수렴을 확인하세요.'
      )
    );
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'direction') {
        const label = element(document, 'label', 'ds-field__label', '단면 방향');
        label.htmlFor = 'core-section-direction';
        const control = element(document, 'select', 'ds-field__control');
        control.id = 'core-section-direction';
        for (const [id, name] of [
          ['rising', '증가 방향'],
          ['falling', '감소 방향'],
          ['both', '양방향']
        ]) {
          const option = element(document, 'option', '', name);
          option.value = id!;
          control.append(option);
        }
        control.value = String(value);
        control.addEventListener('change', () => {
          invalidate();
          settings = { ...settings!, direction: control.value } as PlanarAnalysisSettings;
          persist();
        });
        fields.append(label, control);
      } else {
        const control = createInput(document, {
          id: `core-analysis-${key}`,
          label: labels[key] ?? key,
          help: hints[key] ?? '',
          value: String(value),
          required: true,
          onInput(text) {
            invalidate();
            const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) ? Number(text) : NaN;
            settings = { ...settings!, [key]: numeric };
            control.setError(Number.isFinite(numeric) ? '' : '유한한 숫자를 입력하세요.');
            persist();
          }
        });
        control.input.inputMode = 'decimal';
        fields.append(control.element);
      }
    }
    // Selecting an analysis is already a reproducible configuration choice,
    // even when the user saves before running its default settings.
    persist();
  }
  function showResult(value: PlanarAnalysisResult) {
    output.replaceChildren();
    if (value.kind === 'poincare') {
      const p = value.data.points;
      const index = value.settings.sectionIndex === 0 ? 1 : 0;
      output.append(
        element(
          document,
          'p',
          '',
          `단면 교차 ${p.length}개 · RK4 · 근 잔차 최댓값 ${value.data.rootResiduals.length ? Math.max(...value.data.rootResiduals).toExponential(3) : '없음'}`
        ),
        createPlot(
          document,
          'Poincaré 단면',
          `θ${index + 1} (rad)`,
          `ω${index + 1} (rad/s)`,
          [{ label: '단면 교차', color: '#075985', points: p.map((point) => [point[index]!, point[index + 2]!]) }],
          true
        )
      );
    } else {
      const data = value.data;
      output.append(
        element(
          document,
          'p',
          'core-lyapunov-value',
          `λmax = ${data.lambdaMax.toPrecision(6)} s⁻¹ · 표준오차 ${data.stdError.toPrecision(3)} · block SE ${data.blockStdError.toPrecision(3)} · 95% CI [${data.ci95.map((n) => n.toPrecision(4)).join(', ')}]`
        ),
        createPlot(document, '최대 Lyapunov 수렴', '재규격화 횟수', 'λ (s⁻¹)', [
          { label: '유한시간 추정치', color: '#075985', points: data.convergence.map((y, i) => [i + 1, y]) }
        ])
      );
    }
    for (const warning of value.warnings) output.append(element(document, 'p', 'lab-muted', warning));
    const details = element(document, 'details', 'lab-details');
    details.append(
      element(document, 'summary', '', '분석 결과 수치와 설정 보기'),
      element(document, 'pre', 'core-result-json', JSON.stringify(value, null, 2))
    );
    output.append(details);
  }
  function compute() {
    if (!valid || !model.state.valid || model.state.status === 'running') return;
    if (kind !== 'poincare' && kind !== 'lyapunov') {
      output.replaceChildren(trajectoryPlot(document, model.state.samples, kind));
      setStatus('completed', `기록된 표본 ${model.state.samples.length}개를 표시했습니다.`);
      return;
    }
    persist();
    if (!valid) return;
    invalidate();
    error.hidden = true;
    setStatus('running', '별도 분석을 계산 중입니다. 언제든 취소할 수 있습니다.');
    progress.setValue(null);
    const id = `planar-${++counter}`;
    job = createPlanarAnalysisJob({ id, kind, config: model.state.config, settings: settings! }, (event) => {
      if (id !== `planar-${counter}`) return;
      if (event.type === 'progress') {
        progress.setValue(event.fraction === null ? null : event.fraction * 100, `운동방정식 평가 ${event.work}회`);
        return;
      }
      job = undefined;
      if (event.type === 'result') {
        result = event.result;
        showResult(result);
        progress.setValue(100);
        setStatus('completed', '분석을 완료했습니다. 해석상의 한계를 함께 확인하세요.');
      } else if (event.type === 'cancelled') {
        progress.setValue(0);
        setStatus('cancelled', '분석을 취소했습니다. 부분 결과를 확정하지 않았습니다.');
      } else {
        progress.setValue(0, '분석 실패');
        error.hidden = false;
        error.textContent = event.message;
        setStatus('error', '분석에 실패했습니다. 설정을 확인하고 다시 실행하세요.');
      }
    });
  }
  select.addEventListener('change', () => {
    invalidate();
    kind = select.value as Kind;
    error.hidden = true;
    renderFields();
    lastCount = -1;
    update();
  });
  function update() {
    if ((kind === 'poincare' || kind === 'lyapunov') && settings) {
      try {
        validatePlanarAnalysisSettings(kind, settings, model.state.config);
        if (!valid) {
          error.hidden = true;
          error.textContent = '';
        }
        valid = true;
      } catch (cause) {
        valid = false;
        error.hidden = false;
        error.textContent = cause instanceof Error ? cause.message : '분석 설정을 확인하세요.';
      }
    }
    run.disabled = !valid || !model.state.valid || status === 'running' || model.state.status === 'running';
    cancel.disabled = status !== 'running';
    // Keep the invalid draft visible until corrected or explicitly replaced.
    select.disabled = status === 'running' || !valid;
    for (const input of fields.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select'))
      input.disabled = status === 'running';
    if (
      kind !== 'poincare' &&
      kind !== 'lyapunov' &&
      (lastCount !== model.state.samples.length || lastSamples !== model.state.samples)
    ) {
      lastCount = model.state.samples.length;
      lastSamples = model.state.samples;
      output.replaceChildren(trajectoryPlot(document, model.state.samples, kind));
    }
  }
  function sync() {
    invalidate();
    const saved = [...(model.state.config.analyses ?? [])]
      .reverse()
      .find(
        (item) =>
          (item.id === 'analysis:poincare' || item.id === 'analysis:lyapunov') &&
          !['core-diagnostics-v1', 'advanced-diagnostics-v1'].includes(item.algorithmVersion)
      );
    kind =
      saved?.id === 'analysis:poincare' ? 'poincare' : saved?.id === 'analysis:lyapunov' ? 'lyapunov' : 'state-time';
    select.value = kind;
    renderFields();
    update();
    notify();
  }
  renderFields();
  setStatus('empty', '실행 후 기록된 궤적을 표시합니다.');
  return {
    element: section.element,
    update,
    invalidate,
    sync,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get valid() {
      return valid;
    },
    get busy() {
      return status === 'running';
    },
    dispose() {
      counter++;
      job?.dispose();
      listeners.clear();
    }
  };
}
