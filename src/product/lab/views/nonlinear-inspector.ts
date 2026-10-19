import { element } from '../../app/dom';
import { createButton, createSection } from '../../design-system/primitives';
import { createQuantity, type QuantityControl } from '../../design-system/quantity';
import type { CanonicalUnit } from '../../contracts/quantities';
import {
  nonlinearParameterFields,
  nonlinearStateFields,
  nonlinearPresets,
  nonlinearPresetConfig,
  nonlinearWarnings,
  validateNonlinearConfig,
  type NonlinearConfig
} from '../../adapters/physics/nonlinear';
import type { NonlinearModel } from './nonlinear-model';
import { nonlinearIsNormalized } from './nonlinear-storage';

export function applyNonlinearDraft(
  current: NonlinearConfig,
  values: Readonly<Record<string, number>>,
  historyKind: 'constant' | 'linear' = 'constant'
): NonlinearConfig {
  const parameters = Object.fromEntries(Object.keys(current.parameters).map((key) => [key, values[key]!]));
  const initialState = current.initialState.map((_, i) => values[`state-${i}`]!);
  const history =
    current.systemId === 'system:pyragas'
      ? { kind: historyKind, state: [values['history-theta']!, values['history-omega']!] }
      : undefined;
  const unchangedHistory =
    !history ||
    (history.kind === current.history?.kind && history.state.every((value, i) => value === current.history?.state[i]));
  const retainTape =
    unchangedHistory &&
    initialState.every((value, i) => value === current.initialState[i]) &&
    Object.entries(parameters).every(([key, value]) => value === current.parameters[key]);
  const { delayState: previousTape, ...base } = current;
  const candidate: NonlinearConfig = {
    ...base,
    parameters,
    initialState,
    step: values.step!,
    duration: values.duration!,
    sampleEvery: values.sampleEvery!,
    ...(history ? { history } : {}),
    ...(retainTape && previousTape ? { delayState: previousTape } : {})
  };
  const checked = validateNonlinearConfig(candidate);
  if (!checked.ok) throw new Error(checked.issues.map((item) => item.message).join(' '));
  return checked.value;
}

export function createNonlinearInspector(document: Document, model: NonlinearModel, onChange: () => void) {
  const initial = model.state.config,
    id = initial.systemId,
    normalized = nonlinearIsNormalized(id);
  const section = createSection(document, {
    id: 'nonlinear-inspector',
    title: '실험 조건',
    description: '조건은 한 번에 적용합니다. 입력 중에는 실행을 멈추며 마지막 유효한 설정을 보존합니다.'
  });
  const notice = element(document, 'p', 'lab-muted'),
    error = element(document, 'p', 'ds-field__error'),
    warning = element(document, 'p', 'lab-preview-note'),
    tapeNotice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  tapeNotice.id = 'nonlinear-history-preserved';
  const controls = new Map<string, QuantityControl>();
  let syncing = false,
    dirty = false;
  function edited() {
    if (syncing) return;
    dirty = true;
    model.setValid(false);
    notice.textContent = '편집 중입니다. 조건 적용 또는 편집 취소를 선택하세요.';
  }
  function fields(title: string, text: string) {
    const region = element(document, 'fieldset', 'nonlinear-panel'),
      grid = element(document, 'div', 'nonlinear-fields');
    region.append(element(document, 'legend', '', title), element(document, 'p', 'lab-muted', text), grid);
    section.body.append(region);
    return grid;
  }
  function add(
    host: HTMLElement,
    key: string,
    label: string,
    unit: CanonicalUnit,
    min: number,
    max: number,
    value: number,
    meaning: string
  ) {
    const control = createQuantity(document, {
      id: `nonlinear-${key}`,
      label,
      symbol: key,
      unit,
      min,
      max,
      defaultValue: value,
      onChange: edited,
      meaning
    });
    controls.set(key, control);
    host.append(control.element);
  }
  function selector(
    host: HTMLElement,
    key: string,
    title: string,
    entries: readonly (readonly [string, string])[],
    onChange = edited
  ) {
    const wrap = element(document, 'div', 'ds-field'),
      label = element(document, 'label', 'ds-field__label', title),
      control = element(document, 'select', 'ds-field__control');
    label.htmlFor = `nonlinear-${key}`;
    control.id = label.htmlFor;
    for (const [value, text] of entries) {
      const option = element(document, 'option', '', text);
      option.value = value;
      control.append(option);
    }
    control.addEventListener('change', onChange);
    wrap.append(label, control);
    host.append(wrap);
    return control;
  }
  const presets = fields('모델별 예제', '현재 편집을 취소하고 선택한 예제의 조건과 초기 이력을 적용합니다.');
  const presetDescription = element(document, 'p', 'lab-muted');
  const preset = selector(
    presets,
    'preset',
    '예제 선택',
    nonlinearPresets(id).map((entry) => [entry.id, entry.label]),
    () => {
      presetDescription.textContent = nonlinearPresets(id).find((entry) => entry.id === preset.value)!.description;
    }
  );
  presetDescription.textContent = nonlinearPresets(id)[0]!.description;
  presets.append(
    presetDescription,
    createButton(document, {
      label: '예제 적용',
      variant: 'secondary',
      onClick() {
        model.configure(nonlinearPresetConfig(id, preset.value));
        sync();
        onChange();
        notice.textContent = '선택한 모델 예제를 적용했습니다.';
      }
    })
  );
  const plant = fields(
    '모델 계수',
    normalized
      ? '정규화한 계수와 변수입니다. 단위 1은 정규화 눈금이며 물리 SI 단위로 환산한 값이 아닙니다.'
      : 'SI 단위와 rad를 사용합니다. 각주파수는 rad/s입니다.'
  );
  for (const field of nonlinearParameterFields(id))
    add(
      plant,
      field.key,
      `${field.label} · ${field.unit}`,
      field.canonicalUnit,
      field.min,
      field.max,
      initial.parameters[field.key]!,
      field.unit === '정규화'
        ? '정규화 계수입니다. 선택한 모델 식의 정의를 따릅니다.'
        : `모델 식에 사용하는 ${field.unit} 값입니다.`
    );
  const native = fields(
    '초기조건',
    '구동 위상과 시작 시간을 포함해 저장합니다. 새 조건을 적용하면 이 상태에서 시작합니다.'
  );
  nonlinearStateFields(id).forEach((field, i) =>
    add(
      native,
      `state-${i}`,
      `${field.label} · ${field.unit}`,
      field.canonicalUnit,
      field.min,
      field.max,
      initial.initialState[i]!,
      `${field.key}의 초기값입니다.`
    )
  );
  let historyKind: HTMLSelectElement | undefined;
  if (id === 'system:pyragas') {
    const history = fields(
      '지연 이력 초기화',
      '상수: 과거 θ와 ω를 고정합니다. 선형: θ(t)=θh+ωh·t, ω(t)=ωh (t<0). 현재 초기조건과 다른 과거 이력도 허용하며 경계 불연속의 수렴을 확인하세요. 계수·초기조건·이력을 바꾸면 저장된 승인 꼬리를 새 과거 이력으로 초기화합니다.'
    );
    historyKind = selector(history, 'history-kind', '과거 이력 종류', [
      ['constant', '상수 이력'],
      ['linear', '선형 이력']
    ]);
    add(
      history,
      'history-theta',
      '과거 각도 θh',
      'rad',
      -100,
      100,
      initial.history?.state[0] ?? initial.initialState[0]!,
      't=0에 외삽한 과거 각도입니다.'
    );
    add(
      history,
      'history-omega',
      '과거 각속도 ωh',
      'rad/s',
      -100,
      100,
      initial.history?.state[1] ?? initial.initialState[1]!,
      '선형 이력의 기울기이며 상수 이력에서도 과거 각속도를 보존합니다.'
    );
    history.append(tapeNotice);
  }
  const runtime = fields(
    '실행 조건',
    normalized
      ? '시간의 s 표기는 공통 저장 스키마의 눈금입니다. 이 모델에서는 정규화 시간 τ이며 실제 초가 아닙니다.'
      : '고정 시간 간격을 줄여 수렴을 확인하세요. Pyragas는 지연≥시간 간격과 이력 크기 제한을 따릅니다.'
  );
  add(
    runtime,
    'duration',
    normalized ? '정규화 관찰 길이' : '관찰 시간',
    normalized ? '1' : 's',
    0.000001,
    300,
    initial.duration,
    '관찰할 미래 구간입니다.'
  );
  add(
    runtime,
    'step',
    normalized ? '정규화 시간 간격' : '시간 간격',
    normalized ? '1' : 's',
    0.000001,
    0.05,
    initial.step,
    '고정 적분 간격입니다.'
  );
  add(
    runtime,
    'sampleEvery',
    '기록 간격 (단계 수)',
    '1',
    1,
    100000,
    initial.sampleEvery ?? 1,
    '기록은 최대 2,001개 표본으로 추가 축약합니다.'
  );
  const origin = element(document, 'p', 'lab-muted');
  origin.id = 'nonlinear-origin';
  runtime.append(origin);
  runtime.append(
    element(
      document,
      'p',
      'lab-muted',
      initial.integratorId === 'internal'
        ? id === 'system:friction'
          ? '적분법: 정지 마찰 complementarity · 암시적 Euler 단계.'
          : id === 'system:pyragas'
            ? '적분법: method-of-steps RK4 · 승인 이력 선형 보간.'
            : '적분법: 내부 RK4 궤적과 별도 Floquet monodromy 평가.'
        : '적분기: 기존 엔진의 고정 간격 RK4.'
    )
  );
  const apply = createButton(document, {
    label: '조건 적용',
    onClick() {
      const values: Record<string, number> = {};
      let valid = true;
      for (const [key, control] of controls) {
        const parsed = control.read();
        if (parsed.ok) values[key] = parsed.quantity.value;
        else valid = false;
      }
      if (!valid) return;
      try {
        const hadTape = Boolean(model.state.config.delayState);
        model.configure(
          applyNonlinearDraft(model.state.config, values, historyKind?.value as 'constant' | 'linear' | undefined)
        );
        sync();
        onChange();
        notice.textContent =
          hadTape && !model.state.config.delayState
            ? '조건을 적용했습니다. 변경한 조건에 맞춰 승인 꼬리를 새 과거 이력으로 초기화했습니다.'
            : '조건을 적용했습니다. 초기조건부터 실행할 수 있습니다.';
      } catch (cause) {
        error.hidden = false;
        error.textContent = `${cause instanceof Error ? cause.message : '조건을 확인하세요.'} 마지막 유효한 설정을 보존했습니다.`;
        model.setValid(false);
      }
    }
  });
  const undo = createButton(document, {
    label: '편집 취소',
    variant: 'secondary',
    onClick() {
      sync();
      model.setValid(true);
      notice.textContent = '마지막 유효한 설정을 다시 표시합니다.';
    }
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(apply, undo);
  section.body.append(actions, error, notice, warning);
  function sync() {
    syncing = true;
    dirty = false;
    const config = model.state.config;
    const values: Record<string, number> = {
      ...config.parameters,
      duration: config.duration,
      step: config.step,
      sampleEvery: config.sampleEvery ?? 1
    };
    config.initialState.forEach((value, i) => {
      values[`state-${i}`] = value;
    });
    values['history-theta'] = config.history?.state[0] ?? config.initialState[0]!;
    values['history-omega'] = config.history?.state[1] ?? config.initialState[1]!;
    for (const [key, control] of controls) control.setValue(values[key]!);
    if (historyKind) historyKind.value = config.history?.kind ?? 'constant';
    origin.textContent = `관찰 시작 시각 ${config.startTime ?? 0} ${normalized ? '(정규화 시간)' : 's'}. 구동의 절대 시계를 포함해 저장합니다.`;
    tapeNotice.textContent = config.delayState
      ? `${config.delayState.times.length}개 승인 이력점을 보존했습니다. 시간 범위 ${config.delayState.times[0]}–0 s. 실행·저장·JSON 복원에서 같은 꼬리를 사용합니다.`
      : '승인된 지연 꼬리는 아직 없습니다. 선택한 과거 이력에서 시작합니다.';
    error.hidden = true;
    error.textContent = '';
    syncing = false;
    update();
  }
  function update() {
    const state = model.state,
      busy = state.status === 'running' || state.busy;
    for (const control of section.element.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
      'input,select,button'
    ))
      control.disabled = busy;
    undo.disabled = busy || !dirty;
    warning.textContent = nonlinearWarnings(state.config).join(' ');
  }
  sync();
  return { element: section.element, sync, update };
}
