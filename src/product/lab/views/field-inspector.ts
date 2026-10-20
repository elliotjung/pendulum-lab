import { element } from '../../app/dom';
import { createButton, createSection } from '../../design-system/primitives';
import { createQuantity, type QuantityControl } from '../../design-system/quantity';
import { parseContractJson } from '../../persistence/json';
import {
  fieldIsDiagnostic,
  fieldParameterFields,
  fieldWarnings,
  resizeFieldConfig,
  validateFieldConfig,
  MAX_FIELD_POINTS,
  MAX_FIELD_MEMBERS,
  type FieldConfig
} from '../../adapters/physics/field';
import type { FieldModel } from './field-model';

export function applyFieldDraft(
  current: FieldConfig,
  values: Readonly<Record<string, number>>,
  text: string,
  boundary: FieldConfig['grid']['boundary'],
  seed: string
): FieldConfig {
  const parsed = parseContractJson(text);
  if (
    !parsed.ok ||
    !Array.isArray(parsed.value) ||
    !parsed.value.every((value) => typeof value === 'number' && Number.isFinite(value))
  )
    throw new Error('초기조건은 유한 숫자의 JSON 배열이어야 합니다.');
  const parameters = Object.fromEntries(Object.keys(current.parameters).map((key) => [key, values[key]!]));
  const unchangedMesh =
      values.points === current.grid.points &&
      values.length === current.grid.length &&
      boundary === current.grid.boundary,
    unchangedState =
      parsed.value.length === current.initialState.length &&
      parsed.value.every((value, i) => value === current.initialState[i]),
    { previousField: previous, ...base } = current,
    candidate: FieldConfig = {
      ...base,
      parameters,
      initialState: parsed.value as number[],
      grid: {
        points: values.points!,
        length:
          current.systemId === 'system:sine-gordon'
            ? values.length!
            : current.systemId === 'system:langevin'
              ? 1
              : values.points! - 1,
        boundary
      },
      seed: { ...current.seed, value: seed },
      ensemble: { members: values.members! },
      step: values.step!,
      duration: values.duration!,
      sampleEvery: values.sampleEvery!,
      ...(unchangedMesh && unchangedState && values.step === current.step && previous
        ? { previousField: previous }
        : {})
    };
  const checked = validateFieldConfig(candidate);
  if (!checked.ok) throw new Error(checked.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' '));
  return checked.value;
}
export function createFieldInspector(document: Document, model: FieldModel, onChange: () => void) {
  const initial = model.state.config,
    id = initial.systemId,
    diagnostic = fieldIsDiagnostic(id),
    stochastic = id === 'system:langevin';
  const section = createSection(document, {
    id: 'field-inspector',
    title: '실험 조건',
    description:
      '조건을 한 번에 적용합니다. 입력 중에는 실행을 멈추며 마지막 유효한 설정을 보존합니다. 모든 수치는 정규화 값입니다.'
  });
  const notice = element(document, 'p', 'lab-muted'),
    error = element(document, 'p', 'ds-field__error'),
    warning = element(document, 'p', 'lab-preview-note');
  notice.setAttribute('role', 'status');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const controls = new Map<string, QuantityControl>();
  let syncing = false,
    dirty = false;
  function edited() {
    if (!syncing) {
      dirty = true;
      model.setValid(false);
      notice.textContent = '편집 중입니다. 조건 적용 또는 편집 취소를 선택하세요.';
    }
  }
  function group(title: string, description: string) {
    const box = element(document, 'fieldset', 'field-panel'),
      grid = element(document, 'div', 'field-fields');
    box.append(element(document, 'legend', '', title), element(document, 'p', 'lab-muted', description), grid);
    section.body.append(box);
    return grid;
  }
  function add(
    host: HTMLElement,
    key: string,
    label: string,
    min: number,
    max: number,
    value: number,
    meaning: string
  ) {
    const control = createQuantity(document, {
      id: `field-${key}`,
      label,
      symbol: key,
      unit: '1',
      min,
      max,
      defaultValue: value,
      meaning,
      onChange: edited
    });
    controls.set(key, control);
    host.append(control.element);
  }
  const plant = group('모델 계수', '정규화한 식의 계수입니다. 단위 1은 정규화 눈금이며 SI 환산값이 아닙니다.');
  for (const field of fieldParameterFields(id))
    add(
      plant,
      field.key,
      field.label,
      field.min,
      field.max,
      initial.parameters[field.key]!,
      '선택한 native 모델의 계수입니다.'
    );
  if (!Object.keys(initial.parameters).length)
    plant.append(element(document, 'p', 'lab-muted', 'sine-Gordon은 c=1, 기판 진동수=1로 정규화합니다.'));
  const mesh = group(
    '경계와 격자',
    '격자를 바꾸면 초기조건 배열의 길이도 함께 맞춰야 합니다. 격자 예제 적용은 입력한 격자에 맞는 native 초기조건을 만듭니다.'
  );
  const minPoints = stochastic ? 1 : id === 'system:frenkel-kontorova' ? 5 : id === 'system:sine-gordon' ? 3 : 2;
  add(
    mesh,
    'points',
    '격자점 수 (정수)',
    minPoints,
    stochastic ? 1 : MAX_FIELD_POINTS,
    initial.grid.points,
    '이산 공간 해상도입니다. Langevin은 한 진자입니다.'
  );
  add(
    mesh,
    'length',
    id === 'system:sine-gordon' ? '공간 길이 L (정규화)' : '표시 좌표 길이 (격자에서 계산)',
    0.01,
    1000,
    initial.grid.length,
    id === 'system:sine-gordon'
      ? '고정 경계 dx=L/(N−1), 주기 경계 dx=L/N입니다.'
      : 'Langevin은 1, 나머지는 N−1입니다. native 계산의 별도 물성이 아닙니다.'
  );
  const boundaryLabel = element(document, 'label', 'ds-field__label', '경계 조건'),
    boundary = element(document, 'select', 'ds-field__control');
  boundary.id = 'field-boundary';
  boundaryLabel.htmlFor = boundary.id;
  const boundaries = id === 'system:sine-gordon' ? ['fixed', 'periodic'] : [initial.grid.boundary];
  boundaries.forEach((value) => {
    const option = element(document, 'option', '', value === 'fixed' ? '고정 경계' : '주기 경계');
    option.value = value;
    boundary.append(option);
  });
  boundary.addEventListener('change', edited);
  mesh.append(boundaryLabel, boundary);
  const meshExample = createButton(document, {
    label: '격자 예제 적용',
    variant: 'secondary',
    onClick() {
      const points = controls.get('points')!.read(),
        length = controls.get('length')!.read();
      if (!points.ok || !length.ok) return;
      try {
        const next = resizeFieldConfig(
          {
            ...model.state.config,
            grid: {
              ...model.state.config.grid,
              length: length.quantity.value,
              boundary: boundary.value as FieldConfig['grid']['boundary']
            }
          },
          points.quantity.value
        );
        model.configure(next);
        sync();
        onChange();
        notice.textContent = '격자와 native 초기조건 예제를 적용했습니다. 다른 미적용 편집은 취소했습니다.';
      } catch (cause) {
        fail(cause);
      }
    }
  });
  if (!diagnostic && !stochastic) mesh.append(meshExample);
  const seeds = group(
    'Seed와 앙상블',
    '같은 seed·설정·엔진 버전에서 재현합니다. member의 stable ID가 독립 난수열을 소유합니다. 시간 간격을 바꾸면 동일 Brownian path를 보장하지 않습니다.'
  );
  const seedLabel = element(document, 'label', 'ds-field__label', 'Seed 문자열 (1–128자)'),
    seed = element(document, 'input', 'ds-field__control');
  seed.id = 'field-seed';
  seedLabel.htmlFor = seed.id;
  seed.maxLength = 128;
  seed.addEventListener('input', edited);
  seeds.append(seedLabel, seed);
  add(
    seeds,
    'members',
    '앙상블 member 수 (정수)',
    stochastic ? 2 : 1,
    stochastic ? MAX_FIELD_MEMBERS : 1,
    initial.ensemble.members,
    stochastic
      ? '같은 초기조건과 독립 member seed를 사용합니다.'
      : '결정론적 모델은 한 실행만 사용합니다. seed는 재현 메타데이터입니다.'
  );
  const native = group(
    '초기조건',
    stochastic
      ? '[θ, ω]의 정규화 초기값입니다. 모든 member가 여기에서 시작합니다.'
      : diagnostic
        ? '진단은 매개변수로 계산합니다. 초기조건 배열은 비어 있어야 합니다.'
        : id === 'system:sine-gordon'
          ? '[u₀…uₙ₋₁, 초기 rate₀…rateₙ₋₁] 순서입니다. 고정 경계는 끝 값을 유지합니다.'
          : '[q₀…qₙ₋₁, p₀…pₙ₋₁] 순서입니다. 양 끝 벽의 변위는 0입니다.'
  );
  const stateLabel = element(document, 'label', 'ds-field__label', '초기조건 JSON 배열'),
    state = element(document, 'textarea', 'ds-field__control field-profile-input');
  state.id = 'field-initialState';
  stateLabel.htmlFor = state.id;
  state.maxLength = 32000;
  state.addEventListener('input', edited);
  native.append(stateLabel, state);
  const runtime = group(
    '실행 조건',
    diagnostic
      ? '정적 진단입니다. 시간 진화 제어와 horizon은 사용하지 않습니다.'
      : '고정 시간 간격이며 관찰 길이는 시간 간격의 정수배여야 합니다. 시간·공간 세분화로 수렴을 확인하세요.'
  );
  add(runtime, 'step', '시간 간격 Δτ (정규화)', 0.00001, 0.05, initial.step, 'native 고정 간격입니다.');
  add(runtime, 'duration', '관찰 길이 (정규화)', 0.00001, 300, initial.duration, '현재 시작 시각 이후의 구간입니다.');
  add(
    runtime,
    'sampleEvery',
    '기록 간격 (단계 수, 정수)',
    1,
    100000,
    initial.sampleEvery ?? 1,
    '메모리 제한에 따라 간격이 추가 확대될 수 있습니다. 모든 미기록 단계는 CSV에 포함되지 않습니다.'
  );
  const origin = element(document, 'p', 'lab-muted');
  runtime.append(origin);
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
        model.configure(
          applyFieldDraft(
            model.state.config,
            values,
            state.value,
            boundary.value as FieldConfig['grid']['boundary'],
            seed.value
          )
        );
        sync();
        onChange();
        notice.textContent = '조건을 적용했습니다. 초기조건부터 다시 실행할 수 있습니다.';
      } catch (cause) {
        fail(cause);
      }
    }
  });
  const undo = createButton(document, {
    label: '편집 취소',
    variant: 'secondary',
    onClick() {
      sync();
      model.setValid(true);
      notice.textContent = '마지막 유효한 설정을 표시합니다.';
    }
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(apply, undo);
  section.body.append(actions, error, notice, warning);
  function fail(cause: unknown) {
    error.hidden = false;
    error.textContent = `${cause instanceof Error ? cause.message : '조건을 확인하세요.'} 마지막 유효한 설정을 보존했습니다.`;
    model.setValid(false);
  }
  function sync() {
    syncing = true;
    dirty = false;
    const config = model.state.config;
    const values: Record<string, number> = {
      ...config.parameters,
      points: config.grid.points,
      length: config.grid.length,
      step: config.step,
      duration: config.duration,
      sampleEvery: config.sampleEvery ?? 1,
      members: config.ensemble.members
    };
    for (const [key, control] of controls) control.setValue(values[key]!);
    boundary.value = config.grid.boundary;
    seed.value = config.seed.value;
    state.value = JSON.stringify(config.initialState);
    origin.textContent = `시작 τ=${config.startTime ?? 0} · ${config.previousField?.length ? '저장한 이전 leapfrog 시간층을 보존합니다. 초기조건·격자·Δτ 변경 시 새로 초기화합니다.' : '저장한 이전 시간층이 없습니다.'}`;
    error.hidden = true;
    syncing = false;
    update();
  }
  function update() {
    const busy = model.state.status === 'running' || model.state.busy;
    for (const control of section.element.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
      'input,select,button,textarea'
    ))
      control.disabled = busy;
    undo.disabled = busy || !dirty;
    state.disabled = busy || diagnostic;
    controls.get('length')!.input.disabled = busy || id !== 'system:sine-gordon';
    if (diagnostic) for (const key of ['step', 'duration', 'sampleEvery']) controls.get(key)!.input.disabled = true;
    warning.textContent = fieldWarnings(model.state.config).join(' ');
  }
  sync();
  return { element: section.element, sync, update };
}
