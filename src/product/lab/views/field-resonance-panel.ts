import { element } from '../../app/dom';
import { createButton, createInput, createProgress, createSection } from '../../design-system/primitives';
import {
  createFieldResonanceClient,
  type FieldResonanceWorkerFactory
} from '../../adapters/physics/field-resonance-client';
import {
  FIELD_RESONANCE_DEFAULTS,
  fieldResonanceFields,
  validateFieldResonanceSettings,
  serializeFieldResonanceArtifact,
  type FieldResonanceResult
} from '../../adapters/physics/field-resonance';

export function createFieldResonancePanel(document: Document, factory?: FieldResonanceWorkerFactory) {
  const section = createSection(document, {
    id: 'field-stochastic-resonance',
    title: '확률 공명 · 독립 사차 이중 우물',
    headingLevel: 3
  });
  section.body.append(
    element(
      document,
      'p',
      'lab-muted',
      '위의 관성 진자와 독립적인 native 과감쇠 사차 이중 우물의 Itô 모델 dx=(x−x³+A cos Ωτ)dτ+σdW입니다. 모든 값은 정규화 값이며 σ 격자마다 응답 진폭·파워·우물 점유·전이를 측정합니다. 유한 표본의 최대를 보편적인 최적 잡음으로 단정하지 마세요.'
    )
  );
  const form = element(document, 'div', 'lab-inspector-grid');
  const controls = fieldResonanceFields.map((field) => {
    const control = createInput(document, {
      id: `field-resonance-${field.key}`,
      label: field.label,
      type: 'number',
      value: String(FIELD_RESONANCE_DEFAULTS[field.key]),
      help: `${field.min}–${field.max}${'integer' in field ? ' 정수' : ''} (정규화)`
    });
    control.input.min = String(field.min);
    control.input.max = String(field.max);
    control.input.step = 'integer' in field ? '1' : 'any';
    form.append(control.element);
    return { ...control, field };
  });
  const error = element(document, 'p', 'ds-field__error');
  error.hidden = true;
  error.setAttribute('role', 'alert');
  const status = element(document, 'p', 'lab-muted', '설정을 확인한 뒤 계산하세요. 이전 진자 run을 변경하지 않습니다.');
  status.setAttribute('role', 'status');
  const progress = createProgress(document, {
    id: 'field-resonance-progress',
    label: '확률 공명 진행',
    max: 100,
    value: 0
  });
  const output = element(document, 'pre', 'lab-data-output');
  output.tabIndex = 0;
  output.setAttribute('role', 'region');
  output.setAttribute('aria-label', '확률 공명 수치 결과');
  const figure = element(document, 'div', 'core-plot-frame');
  let client: ReturnType<typeof createFieldResonanceClient> | undefined,
    last: FieldResonanceResult | undefined,
    disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>(),
    urls = new Set<string>();
  function busy(value: boolean) {
    controls.forEach((control) => {
      control.input.disabled = value;
    });
    calculate.disabled = value;
    cancel.disabled = !value;
  }
  const calculate = createButton(document, {
    label: '확률 공명 곡선 계산',
    variant: 'secondary',
    onClick() {
      if (client || disposed) return;
      const values = Object.fromEntries(
        controls.map((control) => [control.field.key, control.input.value.trim() ? Number(control.input.value) : NaN])
      );
      const checked = validateFieldResonanceSettings(values);
      if (!checked.ok) {
        error.textContent = checked.issues.map((entry) => entry.message).join(' ');
        error.hidden = false;
        return;
      }
      error.hidden = true;
      busy(true);
      progress.setValue(0, '0%');
      status.textContent = '확률 공명 native worker 계산 중';
      client = createFieldResonanceClient(
        checked.value,
        (event) => {
          if (disposed) return;
          if (event.type === 'error') {
            client = undefined;
            busy(false);
            error.hidden = false;
            error.textContent = `${event.message} 마지막 완료 결과를 유지합니다.`;
            status.textContent = '확률 공명 계산 오류';
            return;
          }
          if (event.type === 'ready' || event.type === 'progress') {
            progress.setValue((event.completed / event.total) * 100, `${event.completed}/${event.total} native 응답`);
            if (event.done && event.result) {
              last = event.result;
              client = undefined;
              busy(false);
              download.disabled = false;
              status.textContent = '확률 공명 곡선 계산 완료 · 독립 native 진단';
              output.textContent = [
                'σ | 응답 진폭 | 구동 주파수 파워 | 오른쪽 우물 비율 | 평균 전이 수',
                ...last.rows.map((row) =>
                  [row.sigma, row.responseAmplitude, row.signalPower, row.rightWellFraction, row.transitions]
                    .map((v) => v.toPrecision(9))
                    .join(' | ')
                ),
                ...last.warnings
              ].join('\n');
              figure.replaceChildren(resonancePlot(document, last));
            }
          }
        },
        factory
      );
    }
  });
  const cancel = createButton(document, {
    label: '확률 공명 계산 취소',
    variant: 'secondary',
    disabled: true,
    onClick() {
      client?.dispose();
      client = undefined;
      busy(false);
      status.textContent = '확률 공명 계산 취소됨 · 마지막 완료 결과를 유지합니다.';
    }
  });
  const download = createButton(document, {
    label: '확률 공명 JSON 다운로드',
    variant: 'secondary',
    disabled: true,
    onClick() {
      if (!last) return;
      const url = URL.createObjectURL(new Blob([serializeFieldResonanceArtifact(last)], { type: 'application/json' }));
      urls.add(url);
      const anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = 'pendulum-stochastic-resonance.json';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
        timers.delete(timer);
      }, 1000);
      timers.add(timer);
    }
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(calculate, cancel, download);
  section.body.append(form, actions, progress.element, status, error, figure, output);
  return {
    element: section.element,
    dispose() {
      disposed = true;
      client?.dispose();
      client = undefined;
      timers.forEach(clearTimeout);
      timers.clear();
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    }
  };
}
function resonancePlot(document: Document, result: FieldResonanceResult): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 420 210');
  svg.setAttribute('width', '100%');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    '정규화 잡음 σ에 따른 native 확률 공명 응답 진폭. 정확한 값과 표본 한계는 아래 수치 결과에 표시합니다.'
  );
  const xmax = result.settings.sigmaMax,
    xmin = result.settings.sigmaMin,
    ymax = Math.max(1e-12, ...result.rows.map((row) => row.responseAmplitude));
  const path = document.createElementNS(ns, 'polyline');
  path.setAttribute(
    'points',
    result.rows
      .map((row) => `${45 + (350 * (row.sigma - xmin)) / (xmax - xmin)},${175 - (150 * row.responseAmplitude) / ymax}`)
      .join(' ')
  );
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  svg.append(path);
  for (const [x, y, value] of [
    [45, 196, `σ ${xmin}`],
    [330, 196, `σ ${xmax}`],
    [10, 18, `응답 ${ymax.toPrecision(4)}`]
  ] as const) {
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('fill', 'currentColor');
    text.textContent = value;
    svg.append(text);
  }
  return svg;
}
