import { AudioSonifier } from '../../../app/AudioSonifier';
import { element } from '../../app/dom';
import { createButton, createInput, createProgress } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { ContractResult } from '../../contracts/validation';
import { AUDIO_MAX_VOLUME, createAudioController, type AudioSample } from './audio';
import { defaultOgySettings, OGY_LIMITATIONS, type OgyArtifact, type OgySettings } from './contracts';
import { createOgyJob, type OgyJob } from './ogy-client';
import { OGY_SETTING_RANGES, validateOgyRequest } from './request';
import { ogyArtifactCsv, serializeOgyArtifact } from './export';

const fieldLabels: Record<keyof OgySettings, string> = {
  a: 'Hénon a · 명목 제어 매개변수 (1)',
  b: 'Hénon b · 결합 계수 (1)',
  offsetX: '고정점에서 첫 좌표 섭동 (1)',
  offsetY: '고정점에서 둘째 좌표 섭동 (1)',
  region: 'OGY 선형 제어 반경 (1)',
  maxDelta: '매 반복 최대 |δa| (1)',
  steps: 'OGY 최대 반복 수 (1)'
};

export function createCompatibilityToolsPanel(
  document: Document,
  getCanonicalState: () => ContractResult<ExperimentStateV1>,
  container: HTMLElement
) {
  const body = element(document, 'div', 'compatibility-tools-body');
  const audioSection = element(document, 'section', 'ds-section');
  audioSection.setAttribute('aria-labelledby', 'compatibility-audio-heading');
  const audioHeading = element(document, 'h3', '', '진자 운동 소리화');
  audioHeading.id = 'compatibility-audio-heading';
  const audioStatus = element(
    document,
    'p',
    'lab-muted',
    '소리는 꺼져 있습니다. 직접 활성화하면 실행 중 각속도를 소리로 표현합니다.'
  );
  audioStatus.setAttribute('role', 'status');
  const audio = createAudioController(() => new AudioSonifier());
  let lastSample: AudioSample = { running: false, omega1: 0, omega2: 0 };
  let disposed = false;
  const activate = createButton(document, {
    label: '소리 활성화',
    onClick() {
      if (disposed) return;
      if (audio.requested) return silence();
      const view = document.defaultView as (Window & { AudioContext?: unknown; webkitAudioContext?: unknown }) | null;
      if (!view?.AudioContext && !view?.webkitAudioContext) {
        audioStatus.textContent =
          '이 브라우저에서 Web Audio를 사용할 수 없습니다. 수치 결과는 그대로 확인할 수 있습니다.';
        return;
      }
      try {
        audio.activate();
        audio.update(lastSample);
        activate.textContent = '소리 끄기';
        activate.setAttribute('aria-pressed', 'true');
        audioStatus.textContent =
          '소리 활성화를 요청했습니다. 실행 중에만 재생하며 브라우저 권한과 출력 장치에 따라 소리가 나지 않을 수 있습니다.';
      } catch {
        silence();
        audioStatus.textContent = '소리를 시작하지 못했습니다. 브라우저 오디오 권한을 확인하고 다시 시도하세요.';
      }
    }
  });
  activate.setAttribute('aria-pressed', 'false');
  function silence() {
    audio.silence();
    activate.textContent = '소리 활성화';
    activate.setAttribute('aria-pressed', 'false');
    audioStatus.textContent = '소리를 중지했습니다. 다시 들으려면 직접 활성화하세요.';
  }
  const observableLabel = element(document, 'label', 'ds-field__label', '소리로 표현할 관측량');
  const observable = element(document, 'select', 'ds-field__control');
  observable.id = 'compatibility-audio-observable';
  observableLabel.htmlFor = observable.id;
  for (const [value, label] of [
    ['both', '두 각속도 ω₁·ω₂ (rad/s)'],
    ['omega1', '첫 각속도 ω₁ (rad/s)'],
    ['omega2', '둘째 각속도 ω₂ (rad/s)']
  ]) {
    const option = element(document, 'option', '', label);
    option.value = value!;
    observable.append(option);
  }
  observable.addEventListener('change', () => audio.setObservable(observable.value));
  const volume = createInput(document, {
    id: 'compatibility-audio-volume',
    label: '소리 크기 · master gain (1)',
    type: 'number',
    value: '0.04',
    help: `기본 0.04, 범위 0–${AUDIO_MAX_VOLUME}. 낮은 값부터 조절하세요.`,
    onInput(value) {
      try {
        if (value.trim() === '') throw new Error('소리 크기를 입력하세요.');
        audio.setVolume(Number(value));
        volume.setError('');
        activate.disabled = false;
      } catch {
        audio.silence();
        activate.textContent = '소리 활성화';
        activate.setAttribute('aria-pressed', 'false');
        activate.disabled = true;
        volume.setError(`0–${AUDIO_MAX_VOLUME} 범위의 유한한 소리 크기가 필요합니다.`);
      }
    }
  });
  volume.input.min = '0';
  volume.input.max = String(AUDIO_MAX_VOLUME);
  volume.input.step = '0.01';
  audioSection.append(
    audioHeading,
    element(
      document,
      'p',
      'lab-muted',
      '기존 AudioSonifier의 |ω| 기반 pitch·gain을 사용합니다. 소리의 높이는 물리 진동 주파수 측정값이 아니며, paused·오류·화면 숨김·경로 이동 시 소리를 중지합니다.'
    ),
    observableLabel,
    observable,
    volume.element,
    activate,
    audioStatus
  );

  const ogySection = element(document, 'section', 'ds-section');
  ogySection.setAttribute('aria-labelledby', 'compatibility-ogy-heading');
  const ogyHeading = element(document, 'h3', '', 'OGY 제어 · 독립 Hénon 기준 실험');
  ogyHeading.id = 'compatibility-ogy-heading';
  const limits = element(document, 'ul', 'lab-muted');
  for (const text of OGY_LIMITATIONS) limits.append(element(document, 'li', '', text));
  const fields = new Map<keyof OgySettings, ReturnType<typeof createInput>>();
  const settingsGrid = element(document, 'div', 'lab-inspector-fields');
  const defaults = defaultOgySettings();
  for (const key of Object.keys(defaults) as (keyof OgySettings)[]) {
    const bounds = OGY_SETTING_RANGES[key];
    const field = createInput(document, {
      id: `compatibility-ogy-${key}`,
      label: fieldLabels[key],
      type: 'number',
      value: String(defaults[key]),
      help: `범위 ${bounds[0]}–${bounds[1]}${key === 'steps' ? ' 정수' : ''}.`,
      onInput: () => invalidate()
    });
    field.input.min = String(bounds[0]);
    field.input.max = String(bounds[1]);
    field.input.step = key === 'steps' ? '1' : 'any';
    fields.set(key, field);
    settingsGrid.append(field.element);
  }
  const result = element(document, 'div', 'compatibility-ogy-result');
  const notice = element(
    document,
    'p',
    'lab-muted',
    '같은 초기조건·반복 예산으로 제어군과 무제어 대조군을 계산합니다.'
  );
  notice.setAttribute('role', 'status');
  const progress = createProgress(document, {
    id: 'compatibility-ogy-progress',
    label: 'OGY 계산 진행',
    max: 1,
    value: 0
  });
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  let artifact: OgyArtifact | undefined;
  let job: OgyJob | undefined;
  let generation = 0;
  let sequence = 0;
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const run = createButton(document, { label: 'OGY 제어·대조군 계산', onClick: () => void calculate() });
  const cancel = createButton(document, {
    label: 'OGY 계산 취소',
    variant: 'secondary',
    disabled: true,
    onClick: () => invalidate()
  });
  const json = createButton(document, {
    label: 'OGY 설정·결과 JSON',
    variant: 'secondary',
    disabled: true,
    onClick: () => exportResult('json')
  });
  const csv = createButton(document, {
    label: 'OGY 비교 기록 CSV',
    variant: 'secondary',
    disabled: true,
    onClick: () => exportResult('csv')
  });
  function invalidate() {
    generation++;
    job?.cancel();
    job = undefined;
    artifact = undefined;
    result.replaceChildren();
    json.disabled = csv.disabled = true;
    run.disabled = false;
    cancel.disabled = true;
    container.dataset.compatibilityOgyStatus = 'empty';
    error.hidden = true;
    progress.setValue(0, '설정을 확인한 뒤 계산하세요.');
    notice.textContent = '조건이 바뀌었거나 계산을 취소했습니다. 부분 결과는 내보내지 않습니다.';
  }
  async function calculate() {
    if (disposed) return;
    invalidate();
    const pending = generation;
    try {
      const canonical = getCanonicalState();
      if (!canonical.ok) throw new Error('현재 실험 조건을 먼저 확인하세요. 원 실험 설정은 유지했습니다.');
      const settings = Object.fromEntries(
        [...fields].map(([key, field]) => [key, field.input.value.trim() === '' ? NaN : field.input.valueAsNumber])
      );
      const request = validateOgyRequest({ id: `ogy-${++sequence}`, source: canonical.value, settings });
      run.disabled = true;
      cancel.disabled = false;
      container.dataset.compatibilityOgyStatus = 'running';
      notice.textContent = '독립 기준 실험을 worker에서 계산합니다. 현재 진자를 제어하지 않습니다.';
      job = createOgyJob(request, (value, message) => {
        if (!disposed && generation === pending) progress.setValue(value, message);
      });
      const completed = await job.result;
      if (disposed || generation !== pending) return;
      artifact = completed;
      job = undefined;
      json.disabled = csv.disabled = false;
      container.dataset.compatibilityOgyStatus = 'completed';
      progress.setValue(1, 'OGY 제어·대조군 계산 완료');
      notice.textContent = `출처 맥락: ${completed.request.source.systemId}. ${completed.algorithmVersion} · ${completed.createdAt}.`;
      const table = element(document, 'table', 'lab-data-table');
      const caption = element(document, 'caption', '', '유한 반복 OGY 비교 · 편차와 δa는 무차원');
      const head = element(document, 'tr', '');
      for (const label of ['집단', 'capture', '실제 반복 수', '후반 최대 편차', '최대 |δa|']) {
        const th = element(document, 'th', '', label);
        th.scope = 'col';
        head.append(th);
      }
      table.append(caption, head);
      for (const [name, summary, rows] of [
        ['제어군', completed.controlled, completed.controlledRows],
        ['무제어 대조군', completed.uncontrolled, completed.uncontrolledRows]
      ] as const) {
        const row = element(document, 'tr', '');
        for (const text of [
          name,
          String(summary.captured),
          String(rows.length - 1),
          summary.captured ? summary.settledDeviation.toExponential(6) : '조기 이탈 · 수렴 판정 안 함',
          summary.maxControl.toExponential(6)
        ])
          row.append(element(document, 'td', '', text));
        table.append(row);
      }
      result.append(
        element(
          document,
          'p',
          '',
          `고정점 [${completed.fixedPoint.join(', ')}] · 잔차 ${completed.residual.toExponential(3)} · λu=${completed.unstableEigenvalue.toFixed(6)}, λs=${completed.stableEigenvalue.toFixed(6)}`
        ),
        table,
        element(
          document,
          'p',
          'lab-muted',
          'JSON은 원 실험·모든 설정·native 함수·한계·전체 반복 기록을 포함합니다. CSV는 두 집단의 수치 기록이며 원 실험 metadata는 JSON에서 확인하세요.'
        )
      );
    } catch (cause) {
      if (disposed || generation !== pending) return;
      artifact = undefined;
      job = undefined;
      container.dataset.compatibilityOgyStatus = 'error';
      error.textContent = cause instanceof Error ? cause.message : 'OGY 계산에 실패했습니다.';
      error.hidden = false;
      notice.textContent = '결과를 적용하거나 저장하지 않았습니다. 조건을 수정하고 다시 시도하세요.';
    } finally {
      if (!disposed && generation === pending) {
        run.disabled = false;
        cancel.disabled = true;
      }
    }
  }
  function exportResult(kind: 'json' | 'csv') {
    if (!artifact || disposed) return;
    try {
      const text = kind === 'json' ? serializeOgyArtifact(artifact) : ogyArtifactCsv(artifact);
      const url = URL.createObjectURL(
        new Blob([text], { type: kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8' })
      );
      urls.add(url);
      const anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = `pendulum-ogy-${artifact.request.id}.${kind}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.delete(url);
        timers.delete(timer);
      }, 1000);
      timers.add(timer);
    } catch {
      error.textContent = 'OGY 결과를 내보내지 못했습니다. 계산 기록을 유지하고 다시 시도하세요.';
      error.hidden = false;
    }
  }
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(run, cancel, json, csv);
  ogySection.append(ogyHeading, limits, settingsGrid, actions, progress.element, notice, error, result);
  body.append(audioSection, ogySection);
  container.append(body);
  function onVisibility() {
    if (document.hidden) silence();
  }
  document.addEventListener('visibilitychange', onVisibility);
  return {
    updateAudio(sample: AudioSample) {
      if (disposed) return;
      lastSample = { ...sample, running: sample.running && !document.hidden };
      audio.update(lastSample);
    },
    invalidate() {
      invalidate();
      silence();
    },
    suspend() {
      invalidate();
      silence();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      job?.cancel();
      job = undefined;
      artifact = undefined;
      audio.dispose();
      document.removeEventListener('visibilitychange', onVisibility);
      for (const timer of timers) clearTimeout(timer);
      for (const url of urls) URL.revokeObjectURL(url);
      timers.clear();
      urls.clear();
    }
  };
}
