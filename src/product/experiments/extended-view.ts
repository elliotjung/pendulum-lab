import { element, link } from '../app/dom';
import { createButton, createProgress } from '../design-system/primitives';
import { createQuantity, type QuantityControl } from '../design-system/quantity';
import type { LearnUnit } from '../learn/schema';
import { extendedFocusDeclaration } from './extended-definitions';
import { createExtendedRuntime, type ExtendedRuntime, type ExtendedSnapshot } from './extended-runtime';
import { loadExtendedFocusFields, saveExtendedFocusFields, extendedFocusLabHref } from './extended-transfer';
import { renderExtendedResults } from './extended-plots';
interface Session {
  readonly runtime: ExtendedRuntime;
  writable: boolean;
  warning: string;
}
const sessions = new WeakMap<Document, Map<string, Session>>();
const labels = {
  idle: '실험 준비 완료',
  running: '실험 계산 중',
  completed: '실험 완료',
  cancelled: '실험 취소됨',
  error: '실험 오류'
};
export function createExtendedFocusView(document: Document, unit: LearnUnit) {
  let cache = sessions.get(document);
  if (!cache) {
    cache = new Map();
    sessions.set(document, cache);
  }
  const key = `${unit.courseId}/${unit.id}/v${unit.contentVersion}`,
    declaration = extendedFocusDeclaration(unit.id);
  let session = cache.get(key);
  if (!session) {
    let fields: ReturnType<typeof loadExtendedFocusFields> | undefined;
    let writable = true,
      warning = '';
    try {
      fields = loadExtendedFocusFields(document.defaultView!.sessionStorage, unit);
    } catch {
      writable = false;
      warning =
        '저장된 전용 실험을 복원하지 못했습니다. 원본을 보존하고 기본 설정으로 연습합니다. 이번 연습은 저장되지 않습니다.';
    }
    session = { runtime: createExtendedRuntime(unit, fields ? { fields } : {}), writable, warning };
    cache.set(key, session);
  }
  const current = session,
    runtime = current.runtime,
    root = element(document, 'div', 'focus-experiment extended-focus-experiment');
  root.dataset.focusUnit = unit.id;
  root.append(
    element(document, 'h2', '', '직접 확인하는 전용 실험'),
    element(
      document,
      'p',
      '',
      '예측하고 조건을 바꿔 공용 엔진으로 실행하세요. 비교 계산의 별도 설정은 결과 JSON에 보존되며 실험실에는 표시된 baseline 초기조건·적분기·시간 설정을 전달합니다. 뒤로가기는 결과를 유지하고 새로고침은 재시작 설정을 복원합니다.'
    )
  );
  const guide = element(document, 'ol', 'focus-guide');
  for (const item of unit.focusExperiment.guidance) guide.append(element(document, 'li', '', item.ko));
  root.append(guide);
  const controls = element(document, 'div', 'focus-controls'),
    fields = new Map<string, QuantityControl>(),
    error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  let valid = true;
  const save = () => {
    if (!current.writable) return;
    try {
      saveExtendedFocusFields(document.defaultView!.sessionStorage, unit, runtime.getSnapshot().fields);
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
        error.textContent = result.issues.map((i) => i.message).join(' ');
      } else save();
    }
    update(runtime.getSnapshot());
  }
  for (const id of declaration.exposed) {
    const meta = declaration.fields.find((f) => f.id === id)!;
    const control = createQuantity(document, {
      id: `focus-${id}`,
      label: meta.label,
      symbol: id,
      unit: meta.unit,
      min: meta.min,
      max: meta.max,
      defaultValue: meta.value,
      value: runtime.getSnapshot().fields[id]!,
      meaning:
        id === 'tolerance'
          ? '비교 adaptive 계산의 성분별 SI 수치 허용치입니다. baseline Lab 설정과 별도로 단원과 JSON에 저장합니다.'
          : '이 단원의 설정입니다. 값을 바꾸면 계산을 초기조건부터 다시 시작합니다.',
      onChange: edit
    });
    fields.set(id, control);
    controls.append(control.element);
  }
  const fixed = element(document, 'details', 'learn-prerequisite');
  fixed.append(element(document, 'summary', '', '고정 조건과 단위 확인'));
  const fixedList = element(document, 'ul', '');
  for (const f of declaration.fields.filter((f) => !declaration.exposed.includes(f.id)))
    fixedList.append(element(document, 'li', '', `${f.id} = ${f.value} ${f.unit}`));
  fixed.append(
    fixedList,
    element(
      document,
      'p',
      '',
      `baseline 적분기: ${declaration.integratorId}. 내부 전용 stepper는 교체하지 않습니다. 전용 실험은 최대 20,000단계·801표본이며 계산 중 언제든 취소할 수 있습니다.`
    )
  );
  const status = element(document, 'p', 'focus-status');
  status.setAttribute('role', 'status');
  const storage = element(document, 'p', 'focus-storage-status');
  storage.setAttribute('role', 'status');
  const start = createButton(document, {
      label: '실험 실행',
      onClick() {
        save();
        runtime.run();
      }
    }),
    cancel = createButton(document, { label: '실험 취소', variant: 'secondary', onClick: () => runtime.cancel() }),
    restart = createButton(document, {
      label: '실험 처음으로',
      variant: 'secondary',
      onClick: () => runtime.restart()
    });
  const actions = element(document, 'div', 'focus-actions');
  actions.append(start, cancel, restart);
  const time = element(document, 'output', 'focus-time');
  time.id = 'focus-time';
  time.setAttribute('aria-label', '전용 실험의 현재 물리 시간');
  time.setAttribute('aria-live', 'off');
  const progress = createProgress(document, { id: 'focus-progress', label: '전용 실험 진행', max: 100, value: 0 });
  progress.element.querySelector('[role="status"]')?.removeAttribute('role');
  const results = element(document, 'div', '');
  results.dataset.focusResults = '';
  root.append(controls, fixed, status, error, actions, time, progress.element, storage, results);
  const tasks = element(document, 'section', 'focus-tasks');
  tasks.append(element(document, 'h3', '', '예측 → 실행 → 관찰 → 설명'));
  for (const task of unit.focusExperiment.tasks) {
    const item = element(document, 'article', 'focus-task');
    item.dataset.focusObservation = task.id;
    const expected = element(document, 'details', 'learn-prerequisite');
    expected.append(
      element(document, 'summary', '', '예상 관찰과 해석 펼치기'),
      element(document, 'p', '', task.expected.ko),
      element(document, 'p', '', task.explanation.ko)
    );
    item.append(element(document, 'p', '', task.prediction.ko), element(document, 'p', '', task.action.ko), expected);
    tasks.append(item);
  }
  root.append(tasks);
  const download = createButton(document, {
    label: '실험 결과 JSON 내보내기',
    variant: 'secondary',
    onClick() {
      const result = runtime.getSnapshot().result;
      if (!result) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })),
        anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = `learn-${unit.id}-diagnostics.json`;
      root.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  const transfer = createButton(document, {
    label: '실험실에서 계속',
    onClick() {
      if (!valid || runtime.getSnapshot().status === 'running') return;
      try {
        save();
        document.defaultView!.location.hash = extendedFocusLabHref(unit, runtime.getSnapshot().fields);
      } catch (cause) {
        error.hidden = false;
        error.textContent = cause instanceof Error ? cause.message : '설정 전달에 실패했습니다.';
      }
    }
  });
  root.append(
    download,
    transfer,
    element(document, 'p', '', unit.labTransfer.description.ko),
    link(document, '실험실 라이브러리', '#/lab')
  );
  function update(s: ExtendedSnapshot) {
    root.dataset.focusStatus = s.status;
    status.textContent = valid ? labels[s.status] : '입력한 조건을 수정하세요.';
    if (s.error) {
      error.hidden = false;
      error.textContent = s.error;
    } else if (valid) {
      error.hidden = true;
      error.textContent = '';
    }
    const busy = s.status === 'running';
    start.disabled = busy || !valid;
    cancel.disabled = !busy;
    transfer.disabled = busy || !valid;
    download.disabled = !s.result || busy;
    for (const c of fields.values()) c.input.disabled = busy;
    progress.setValue(s.progress * 100, `${(s.progress * 100).toFixed(1)}%`);
    const currentTime = s.result?.trace.at(-1)?.time ?? 0;
    time.value = `t = ${currentTime.toFixed(4)} s`;
    time.dataset.time = String(currentTime);
    storage.textContent = current.warning || '설정은 이 탭의 세션에 보관됩니다. 학습 진도와 기능 권한은 별개입니다.';
    if (s.result) results.replaceChildren(renderExtendedResults(document, s.result));
    else if (!busy)
      results.replaceChildren(
        element(
          document,
          'p',
          '',
          s.status === 'cancelled'
            ? '계산을 취소했습니다. 원래 설정에서 다시 실행할 수 있습니다.'
            : '아직 계산 결과가 없습니다. 예측한 뒤 실험을 실행하세요.'
        )
      );
  }
  const unsubscribe = runtime.subscribe(update);
  update(runtime.getSnapshot());
  return {
    element: root,
    dispose() {
      unsubscribe();
      runtime.cancel();
    }
  };
}
