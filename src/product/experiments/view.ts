import { element, link } from '../app/dom';
import { createButton, createProgress } from '../design-system/primitives';
import { createQuantity, type QuantityControl } from '../design-system/quantity';
import { PLANAR_FIELDS, type PlanarConfig } from '../adapters/physics/planar';
import { createScene } from '../lab/views/core-plots';
import type { LearnUnit } from '../learn/schema';
import { createFocusRuntime, type FocusRuntime, type FocusSnapshot } from './runtime';
import { focusLabHref, loadFocusConfig, saveFocusConfig } from './transfer';
import { renderFocusResults } from './plots';

interface Session {
  runtime: FocusRuntime;
  writable: boolean;
  warning: string;
  selectedTerms: Set<string>;
}
const sessions = new WeakMap<Document, Map<string, Session>>();
const labels = {
  idle: '실험 준비 완료',
  running: '실험 계산 중',
  completed: '실험 완료',
  cancelled: '실험 취소됨',
  error: '실험 오류'
};
const fieldValues = (config: PlanarConfig): Record<string, number> => ({
  ...config.parameters,
  gamma: config.gamma,
  theta1: config.initialState[0],
  theta2: config.initialState[1],
  omega1: config.initialState[2],
  omega2: config.initialState[3],
  duration: config.duration,
  step: config.step
});

/** Unit-scoped models retain bounded results across route changes; reload restores restart settings only. */
export function createFocusView(document: Document, unit: LearnUnit) {
  let cache = sessions.get(document);
  if (!cache) {
    cache = new Map();
    sessions.set(document, cache);
  }
  const key = `${unit.courseId}/${unit.id}/v${unit.contentVersion}`;
  let session = cache.get(key);
  if (!session) {
    let config: PlanarConfig | undefined;
    let warning = '';
    let writable = true;
    try {
      config = loadFocusConfig(document.defaultView!.sessionStorage, unit) ?? undefined;
    } catch {
      writable = false;
      warning =
        '저장된 전용 실험을 복원하지 못했습니다. 원본을 보존하고 기본 설정을 표시합니다. 이번 연습은 저장되지 않습니다.';
    }
    let runtime: FocusRuntime;
    try {
      runtime = createFocusRuntime(unit.focusExperiment, config ? { config } : {});
    } catch (cause) {
      if (!config) throw cause;
      runtime = createFocusRuntime(unit.focusExperiment);
      writable = false;
      warning =
        '저장된 설정이 단원의 고정 조건과 다릅니다. 원본을 보존하고 기본 설정을 표시합니다. 이번 연습은 저장되지 않습니다.';
    }
    session = { runtime, writable, warning, selectedTerms: new Set(['gravity', 'velocity', 'damping']) };
    cache.set(key, session);
  }
  const current = session;
  const runtime = current.runtime;
  const root = element(document, 'div', 'focus-experiment');
  const disposers: (() => void)[] = [];
  root.append(
    element(document, 'h2', '', '직접 확인하는 전용 실험'),
    element(
      document,
      'p',
      '',
      '예측하고 조건을 바꾼 뒤 실행해 보세요. 현재 설정을 실험실에서 이어 갈 수 있습니다. 새로고침은 초기조건을 복원하고, 뒤로가기는 이 화면의 계산 결과도 유지합니다.'
    )
  );
  const guide = element(document, 'ol', 'focus-guide');
  for (const text of unit.focusExperiment.guidance) guide.append(element(document, 'li', '', text.ko));
  root.append(guide);
  const controls = element(document, 'div', 'focus-controls');
  const fields = new Map<string, QuantityControl>();
  const initial = fieldValues(runtime.getSnapshot().config);
  const preset = new Map(unit.focusExperiment.defaultPreset.fields.map((field) => [field.id, field.value]));
  let valid = true;
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const storage = element(document, 'p', 'focus-storage-status');
  storage.setAttribute('role', 'status');
  const save = () => {
    if (!current.writable) return;
    try {
      saveFocusConfig(document.defaultView!.sessionStorage, unit, runtime.getSnapshot().config);
    } catch {
      current.writable = false;
      current.warning =
        '전용 실험 설정을 저장하지 못했습니다. 이 화면에서는 연습할 수 있지만 새로고침하면 변경이 복원되지 않을 수 있습니다.';
    }
  };
  function edit() {
    valid = true;
    const values: Record<string, number> = {};
    for (const [id, control] of fields) {
      const parsed = control.read();
      if (!parsed.ok) valid = false;
      else values[id] = parsed.quantity.value;
    }
    error.hidden = true;
    if (valid) {
      const result = runtime.setFields(values);
      if (!result.ok) {
        valid = false;
        error.hidden = false;
        error.textContent = result.issues.map((item) => item.message).join(' ');
      } else save();
    }
    update(runtime.getSnapshot(), true);
  }
  for (const id of unit.focusExperiment.exposedFields) {
    const field = PLANAR_FIELDS.find((item) => item.id === id)!;
    const control = createQuantity(document, {
      ...field,
      id: `focus-${id}`,
      symbol: id,
      defaultValue: preset.get(id)!,
      value: initial[id]!,
      meaning: '이 단원의 초기조건입니다. 값을 바꾸면 계산을 처음부터 시작합니다.',
      onChange: edit
    });
    fields.set(id, control);
    controls.append(control.element);
  }
  const fixed = element(document, 'details', 'learn-prerequisite');
  fixed.append(element(document, 'summary', '', '고정 조건과 단위 확인'));
  const fixedList = element(document, 'ul', '');
  for (const field of unit.focusExperiment.defaultPreset.fields.filter(
    (item) => !unit.focusExperiment.exposedFields.includes(item.id)
  ))
    fixedList.append(element(document, 'li', '', `${field.id} = ${field.value} ${field.unit}`));
  fixed.append(
    fixedList,
    element(
      document,
      'p',
      '',
      `적분기: ${unit.focusExperiment.defaultPreset.integratorId.replace('integrator:', '')}. 각도는 아래 수직선 기준 절대각입니다. 최대 20초·20,000 단계, 결과 표시는 최대 801개 표본입니다.`
    )
  );
  const status = element(document, 'p', 'focus-status');
  status.setAttribute('role', 'status');
  const actions = element(document, 'div', 'focus-actions');
  const start = createButton(document, {
    label: '실험 실행',
    onClick: () => {
      save();
      runtime.run();
    }
  });
  const cancel = createButton(document, { label: '실험 취소', variant: 'secondary', onClick: () => runtime.cancel() });
  const restart = createButton(document, {
    label: '실험 처음으로',
    variant: 'secondary',
    onClick: () => runtime.restart()
  });
  actions.append(start, cancel, restart);
  const time = element(document, 'output', 'focus-time');
  time.id = 'focus-time';
  time.setAttribute('aria-label', '전용 실험의 현재 물리 시간');
  time.setAttribute('aria-live', 'off');
  const progress = createProgress(document, { id: 'focus-progress', label: '전용 실험 진행', max: 100, value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  root.append(controls, fixed, status, error, actions, time, progress.element, storage);
  const scene = createScene(document);
  root.append(scene.element);
  const results = element(document, 'div', '');
  results.dataset.focusResults = '';
  root.append(results);
  if (unit.focusExperiment.kind === 'lagrange') {
    const selected = current.selectedTerms;
    const panel = element(document, 'fieldset', 'focus-derivation');
    panel.append(element(document, 'legend', '', '가속도에 연결할 항 선택'));
    const output = element(document, 'output', '');
    output.setAttribute('aria-live', 'off');
    output.setAttribute('aria-label', '선택한 유도 항의 순간 가속도 기여');
    const draw = () => {
      const a = runtime.getSnapshot().diagnostics.acceleration;
      const pairs = Array.from(selected, (key) => a[key as 'gravity' | 'velocity' | 'damping']);
      output.value = `선택한 항의 가속도 기여 합 (rad/s²): ${[0, 1].map((i) => pairs.reduce((sum, pair) => sum + pair[i]!, 0).toFixed(5)).join(', ')}`;
    };
    for (const [key, label] of [
      ['gravity', '중력항'],
      ['velocity', '속도 결합항'],
      ['damping', '감쇠항']
    ]) {
      const item = element(document, 'label', 'learn-option');
      const input = element(document, 'input', '');
      input.type = 'checkbox';
      input.checked = selected.has(key!);
      input.addEventListener('change', () => {
        if (input.checked) selected.add(key!);
        else selected.delete(key!);
        draw();
      });
      item.append(input, element(document, 'span', '', label));
      panel.append(item);
    }
    panel.append(
      output,
      element(
        document,
        'p',
        '',
        '같은 상태에서 M의 역행렬을 거친 각 항의 가속도 기여를 골라 봅니다. 운동은 항상 전체 방정식으로 계산합니다.'
      )
    );
    disposers.push(runtime.subscribe(draw));
    draw();
    root.append(panel);
  }
  const tasks = element(document, 'section', 'focus-tasks');
  tasks.append(element(document, 'h3', '', '예측 → 실행 → 관찰 → 설명'));
  for (const task of unit.focusExperiment.tasks) {
    const item = element(document, 'article', 'focus-task');
    item.dataset.focusObservation = task.id;
    item.append(element(document, 'p', '', task.prediction.ko), element(document, 'p', '', task.action.ko));
    const expected = element(document, 'details', 'learn-prerequisite');
    expected.append(
      element(document, 'summary', '', '예상 관찰과 해석 펼치기'),
      element(document, 'p', '', task.expected.ko),
      element(document, 'p', '', task.explanation.ko)
    );
    item.append(expected);
    tasks.append(item);
  }
  root.append(tasks);
  const transfer = createButton(document, {
    label: '실험실에서 계속',
    onClick: () => {
      if (!valid || runtime.getSnapshot().status === 'running') return;
      try {
        save();
        document.defaultView!.location.hash = focusLabHref(unit, runtime.getSnapshot().config);
      } catch (cause) {
        error.hidden = false;
        error.textContent = cause instanceof Error ? cause.message : '설정 전달에 실패했습니다.';
      }
    }
  });
  root.append(
    transfer,
    element(document, 'p', '', unit.labTransfer.description.ko),
    link(document, '실험실 라이브러리', '#/lab')
  );
  let lastDraw = -Infinity;
  function update(snapshot: FocusSnapshot, force = false) {
    root.dataset.focusStatus = snapshot.status;
    const label = valid ? labels[snapshot.status] : '입력한 조건을 수정하세요.';
    if (status.textContent !== label) status.textContent = label;
    if (snapshot.error) {
      error.hidden = false;
      error.textContent = snapshot.error;
    } else if (valid) {
      error.hidden = true;
      error.textContent = '';
    }
    const busy = snapshot.status === 'running';
    start.disabled = busy || !valid;
    cancel.disabled = !busy;
    transfer.disabled = busy || !valid;
    for (const control of fields.values()) control.input.disabled = busy;
    time.value = `t = ${snapshot.sample.time.toFixed(4)} s`;
    time.dataset.time = String(snapshot.sample.time);
    progress.setValue(snapshot.progress * 100, `${(snapshot.progress * 100).toFixed(1)}%`);
    storage.textContent = current.warning || '설정은 이 탭의 세션에 보관됩니다. 학습 진도와 별도로 저장합니다.';
    scene.update(snapshot.sample, snapshot.config);
    const now = performance.now();
    if (force || !busy || now - lastDraw > 150) {
      results.replaceChildren(renderFocusResults(document, unit.focusExperiment, snapshot));
      lastDraw = now;
    }
  }
  const unsubscribe = runtime.subscribe((snapshot) => update(snapshot));
  update(runtime.getSnapshot(), true);
  return {
    element: root,
    dispose() {
      unsubscribe();
      disposers.forEach((dispose) => dispose());
      runtime.cancel();
    }
  };
}
