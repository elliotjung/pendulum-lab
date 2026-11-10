import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import {
  fromCanonicalPlanar,
  toCanonicalPlanar,
  type PlanarConfig,
  type PlanarSample
} from '../../adapters/physics/planar';
import { serializeExperiment } from '../../persistence/serialization';
import { createScene } from './core-plots';

export const RUN_HISTORY_LIMIT = 4000;
export function historyRestart(config: PlanarConfig, sample: PlanarSample): PlanarConfig {
  const candidate = toCanonicalPlanar({ ...config, initialState: sample.state, startTime: sample.time });
  if (!candidate.ok) throw new Error(candidate.issues.map((i) => i.message).join(' '));
  const checked = fromCanonicalPlanar(candidate.value);
  if (!checked.ok) throw new Error(checked.issues.map((i) => i.message).join(' '));
  return checked.value;
}

/** Playback reads recorded native samples. Starting a new run is a separate explicit action. */
export function createRunHistory(
  document: Document,
  options: {
    config(): PlanarConfig;
    samples(): readonly PlanarSample[];
    pause(): void;
    restart(config: PlanarConfig): void;
  }
) {
  const container = element(document, 'details', 'lab-details');
  container.id = 'run-history';
  container.append(element(document, 'summary', '', '기록 · 되감기 · 재생'));
  const notice = element(
    document,
    'p',
    'lab-muted',
    '최근 4,000개 기록 표본을 보관합니다. 재생은 계산 상태를 바꾸지 않습니다. 기록에서 새 실험을 시작하면 solver buffer 없이 해당 상태에서 다시 적분합니다.'
  );
  const status = element(document, 'p', 'lab-muted');
  status.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const scene = createScene(document);
  const label = element(document, 'label', 'ds-field__label', '기록된 표본 위치');
  const cursor = element(document, 'input', 'ds-field__control');
  cursor.id = 'run-history-cursor';
  cursor.type = 'range';
  cursor.min = '0';
  cursor.max = '0';
  cursor.step = '1';
  cursor.value = '0';
  label.htmlFor = cursor.id;
  const values = element(document, 'output', '');
  values.id = 'run-history-state';
  values.setAttribute('aria-label', '기록된 시간과 상태');
  let records: PlanarSample[] = [];
  let source: PlanarConfig | undefined;
  let recording = false;
  let playing = false;
  let dropped = 0;
  let seen = -1;
  let index = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const urls = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  function stopPlayback() {
    clearTimeout(timer);
    playing = false;
  }
  function show() {
    const sample = records[index];
    cursor.max = String(Math.max(0, records.length - 1));
    cursor.value = String(index);
    cursor.disabled = !sample;
    previous.disabled = !sample || index === 0;
    next.disabled = !sample || index === records.length - 1;
    play.disabled = records.length < 2;
    restart.disabled = !sample || recording;
    download.disabled = !sample;
    begin.textContent = recording ? '기록 중지' : '새 기록 시작';
    play.textContent = playing ? '기록 재생 일시정지' : '기록 재생';
    status.textContent = `${recording ? '기록 중' : '기록 대기'} · 보존 ${records.length}개 · 제외 ${dropped}개`;
    if (sample && source) {
      scene.update(sample, source);
      values.value = `t=${sample.time} s · [${sample.state.join(', ')}] rad,rad,rad/s,rad/s`;
    } else values.value = '아직 기록이 없습니다.';
  }
  function append() {
    if (!recording || disposed) return;
    const current = options.config();
    if (
      !source ||
      JSON.stringify(current) !== JSON.stringify(source) ||
      (options.samples().at(-1)?.step ?? -1) < seen
    ) {
      recording = false;
      stopPlayback();
      show();
      return;
    }
    const incoming = options.samples().filter((s) => s.step > seen);
    for (const sample of incoming) {
      records.push(structuredClone(sample));
      seen = sample.step;
    }
    if (records.length > RUN_HISTORY_LIMIT) {
      const count = records.length - RUN_HISTORY_LIMIT;
      records.splice(0, count);
      dropped += count;
    }
    if (incoming.length) index = records.length - 1;
    show();
  }
  const begin = createButton(document, {
    label: '새 기록 시작',
    onClick() {
      stopPlayback();
      if (recording) {
        recording = false;
        show();
        return;
      }
      source = structuredClone(options.config());
      records = [];
      seen = (options.samples().at(-1)?.step ?? 0) - 1;
      index = 0;
      dropped = 0;
      recording = true;
      append();
    }
  });
  const previous = createButton(document, {
    label: '이전 기록 표본',
    variant: 'secondary',
    onClick() {
      stopPlayback();
      index = Math.max(0, index - 1);
      show();
    }
  });
  const next = createButton(document, {
    label: '다음 기록 표본',
    variant: 'secondary',
    onClick() {
      stopPlayback();
      index = Math.min(records.length - 1, index + 1);
      show();
    }
  });
  function tick() {
    if (disposed || !playing) return;
    if (index >= records.length - 1) {
      stopPlayback();
      show();
      return;
    }
    index++;
    show();
    timer = setTimeout(tick, 33);
  }
  const play = createButton(document, {
    label: '기록 재생',
    variant: 'secondary',
    onClick() {
      options.pause();
      recording = false;
      if (playing) stopPlayback();
      else {
        if (index >= records.length - 1) index = 0;
        playing = true;
        timer = setTimeout(tick, 33);
      }
      show();
    }
  });
  const restart = createButton(document, {
    label: '선택한 기록에서 새 실험 시작',
    variant: 'secondary',
    onClick() {
      const sample = records[index];
      if (!sample || !source) return;
      options.pause();
      stopPlayback();
      try {
        options.restart(historyRestart(source, sample));
        error.hidden = true;
      } catch (cause) {
        error.textContent = cause instanceof Error ? cause.message : '기록 복원 실패';
        error.hidden = false;
      }
      show();
    }
  });
  const download = createButton(document, {
    label: '기록 JSON 다운로드',
    variant: 'secondary',
    onClick() {
      if (!source) return;
      const canonical = toCanonicalPlanar(source);
      if (!canonical.ok) return;
      const validated = serializeExperiment(canonical.value);
      if (!validated.ok) return;
      const text = JSON.stringify(
        {
          schema: 'pendulum-recording/v1',
          experiment: JSON.parse(validated.value),
          retention: { limit: RUN_HISTORY_LIMIT, retained: records.length, dropped },
          samples: records
        },
        null,
        2
      );
      try {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        urls.add(url);
        const a = element(document, 'a', '');
        a.href = url;
        a.download = 'pendulum-recording.json';
        document.body.append(a);
        a.click();
        a.remove();
        const timer = setTimeout(() => {
          URL.revokeObjectURL(url);
          urls.delete(url);
          timers.delete(timer);
        }, 1000);
        timers.add(timer);
      } catch {
        error.textContent = '기록 파일을 내려받지 못했습니다. 기록은 화면에 보존했습니다.';
        error.hidden = false;
      }
    }
  });
  cursor.addEventListener('input', () => {
    options.pause();
    recording = false;
    stopPlayback();
    index = Math.max(0, Math.min(records.length - 1, Number(cursor.value)));
    show();
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(begin, previous, next, play, restart, download);
  container.append(notice, actions, label, cursor, values, status, error, scene.element);
  show();
  return {
    element: container,
    update: append,
    dispose() {
      disposed = true;
      recording = false;
      stopPlayback();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    }
  };
}
