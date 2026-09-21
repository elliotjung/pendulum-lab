import { element } from '../../app/dom';
import { createButton, createSection } from '../../design-system/primitives';
import { createQuantity, type QuantityControl, type QuantityOptions } from '../../design-system/quantity';
import {
  constraintWarnings,
  defaultConstraintConfig,
  MIN_SPRING_RADIUS,
  validateConstraintConfig,
  type ConstraintConfig
} from '../../adapters/physics/constraint';
import { constraintPresets } from '../../adapters/physics/constraint-presets';
import type { ConstraintModel } from './constraint-model';

type Field = Omit<QuantityOptions, 'onChange' | 'defaultValue'> & {
  readonly source: 'parameter' | 'initial' | 'runtime';
  readonly index?: number;
};

export function createConstraintInspector(document: Document, model: ConstraintModel, onChange: () => void) {
  const spring = model.state.config.systemId === 'system:spring';
  const double = model.state.config.systemId === 'system:double-string';
  const defaults = defaultConstraintConfig(model.state.config.systemId);
  const section = createSection(document, {
    id: 'constraint-inspector',
    title: '실험 조건',
    description: '물성과 초기조건을 편집하면 처음부터 다시 실행합니다. θ는 아래 수직선 기준 절대각입니다.'
  });
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const errors = element(document, 'p', 'ds-field__error');
  errors.setAttribute('role', 'alert');
  errors.hidden = true;
  const fields = element(document, 'div', 'constraint-fields');
  const runtime = element(document, 'div', 'constraint-fields');
  const controls = new Map<string, QuantityControl>();
  let syncing = false;
  function select(id: string, title: string, choices: readonly (readonly [string, string])[]) {
    const wrap = element(document, 'div', 'ds-field');
    const label = element(document, 'label', 'ds-field__label', title);
    label.htmlFor = id;
    const control = element(document, 'select', 'ds-field__control');
    control.id = id;
    choices.forEach(([value, text]) => {
      const option = element(document, 'option', '', text);
      option.value = value;
      control.append(option);
    });
    wrap.append(label, control);
    return { wrap, control };
  }
  const definitions: Field[] = [];
  function field(
    id: string,
    label: string,
    symbol: string,
    unit: Field['unit'],
    min: number,
    max: number,
    meaning: string,
    source: Field['source'] = 'parameter',
    index?: number
  ) {
    definitions.push({ id, label, symbol, unit, min, max, meaning, source, ...(index === undefined ? {} : { index }) });
  }
  if (double) {
    field('m1', '안쪽 질량', 'm₁', 'kg', 0.001, 1000, '고정점에 연결된 첫 질점의 질량입니다.');
    field('m2', '바깥쪽 질량', 'm₂', 'kg', 0.001, 1000, '두 번째 질점의 질량입니다.');
    field('l1', '안쪽 줄 길이', 'l₁', 'm', 0.001, 1000, '첫 줄의 최대 길이입니다.');
    field('l2', '바깥쪽 줄 길이', 'l₂', 'm', 0.001, 1000, '두 번째 줄의 최대 길이입니다.');
  } else {
    field('mass', '질량', 'm', 'kg', 0.001, 1000, '질점의 질량입니다. 장력은 N, 에너지는 J로 표시합니다.');
    if (spring) {
      field('stiffness', '용수철 상수', 'k', 'N/m', 0, 100000, 'Hooke 법칙의 힘 상수입니다.');
      field('restLength', '자연 길이', 'ℓ₀', 'm', 0.001, 1000, '탄성력이 0인 길이입니다.');
    } else field('length', '줄 길이', 'ℓ', 'm', 0.001, 1000, '늘어나지 않는 줄의 최대 길이입니다.');
  }
  field('g', '중력 가속도', 'g', 'm/s^2', double ? 0.001 : 0, 1000, '아래 방향의 중력 가속도입니다.');
  if (!spring)
    field(
      'damping',
      double ? '기존 엔진 감쇠 계수' : '감쇠율',
      'γ',
      double ? '1' : 's^-1',
      0,
      1000,
      double
        ? '팽팽한 모드의 힌지 토크와 느슨한 모드의 선형 감쇠에 다르게 쓰는 기존 엔진 계수입니다. 단일 SI 마찰 계수가 아니며 정량 에너지 비교에는 0을 사용하세요.'
        : '줄의 운동과 자유 비행에 적용되는 선형 감쇠율입니다.'
    );
  if (spring) {
    field(
      'r',
      '시작 길이',
      'r₀',
      'm',
      MIN_SPRING_RADIUS * 2,
      10000,
      '고정점과 질점 사이 거리입니다. 0은 좌표 특이점입니다.',
      'initial',
      0
    );
    field('theta', '시작 각도', 'θ₀', 'rad', -10000, 10000, '아래 수직선 기준 각도입니다.', 'initial', 1);
    field('rDot', '시작 반지름 속도', 'ṙ₀', 'm/s', -1e4, 1e4, '양수이면 용수철 길이가 증가합니다.', 'initial', 2);
    field('omega', '시작 각속도', 'ω₀', 'rad/s', -1e4, 1e4, '각도의 시간 변화율입니다.', 'initial', 3);
  } else if (double) {
    for (const [id, label, symbol, index] of [
      ['theta1', '안쪽 시작 각도', 'θ₁', 0],
      ['theta2', '바깥쪽 시작 각도', 'θ₂', 1],
      ['omega1', '안쪽 시작 각속도', 'ω₁', 2],
      ['omega2', '바깥쪽 시작 각속도', 'ω₂', 3]
    ] as const)
      field(
        id,
        label,
        symbol,
        index < 2 ? 'rad' : 'rad/s',
        -10000,
        10000,
        '시작 시 장력 부호에 따라 팽팽함 또는 느슨함을 자동 결정합니다.',
        'initial',
        index
      );
  } else {
    field(
      'theta',
      '시작 각도',
      'θ₀',
      'rad',
      -10000,
      10000,
      '시작 장력이 음수이면 시작 시각에 줄을 이완합니다.',
      'initial',
      0
    );
    field('omega', '시작 각속도', 'ω₀', 'rad/s', -1e4, 1e4, '시작 장력과 속도를 함께 결정합니다.', 'initial', 1);
  }
  field('duration', '관찰 시간', 't', 's', 1e-6, 300, '초기조건부터 계산할 시간입니다.', 'runtime');
  field(
    'step',
    '시간 간격',
    'Δt',
    's',
    1e-6,
    0.05,
    spring
      ? '적분 간격입니다. 강한 용수철에서는 간격을 줄이세요.'
      : '줄 엔진은 최대 0.002 s 부분 단계로 나누고 사건 시각을 보정합니다.',
    'runtime'
  );
  field(
    'sampleEvery',
    '기록 간격 (단계 수)',
    'stride',
    '1',
    1,
    100000,
    '큰 실행에서는 표본 수를 추가로 제한합니다. 사건 목록은 각 단계에서 별도로 수집합니다.',
    'runtime'
  );
  const integrator = select('constraint-integrator', '적분기', [
    ['integrator:rk4', 'RK4'],
    ['integrator:rk2', 'RK2'],
    ['integrator:euler', 'Euler']
  ]);
  function apply(next: ConstraintConfig) {
    const checked = validateConstraintConfig(next);
    errors.hidden = checked.ok;
    errors.textContent = checked.ok ? '' : checked.issues.map((issue) => issue.message).join(' ');
    if (!checked.ok) {
      model.setValid(false);
      return false;
    }
    model.configure(checked.value);
    onChange();
    return true;
  }
  function edit() {
    if (syncing) return;
    const values: Record<string, number> = {};
    let valid = true;
    controls.forEach((control, key) => {
      const read = control.read();
      if (read.ok) values[key] = read.quantity.value;
      else valid = false;
    });
    if (!valid) {
      model.setValid(false);
      return;
    }
    const current = model.state.config;
    const parameters = { ...current.parameters };
    const initialState = [...current.initialState];
    for (const entry of definitions) {
      if (entry.source === 'parameter') parameters[entry.id] = values[entry.id]!;
      else if (entry.source === 'initial') initialState[entry.index!] = values[entry.id]!;
    }
    apply({
      ...current,
      parameters,
      initialState,
      duration: values.duration!,
      step: values.step!,
      sampleEvery: values.sampleEvery!,
      integratorId: spring ? (integrator.control.value as ConstraintConfig['integratorId']) : 'internal'
    });
  }
  const valueOf = (config: ConstraintConfig, entry: Field) =>
    entry.source === 'parameter'
      ? config.parameters[entry.id]!
      : entry.source === 'initial'
        ? config.initialState[entry.index!]!
        : entry.id === 'sampleEvery'
          ? (config.sampleEvery ?? 1)
          : entry.id === 'step'
            ? config.step
            : config.duration;
  for (const entry of definitions) {
    const control = createQuantity(document, {
      ...entry,
      id: `constraint-${entry.id}`,
      defaultValue: valueOf(defaults, entry),
      onChange: edit
    });
    controls.set(entry.id, control);
    (entry.source === 'runtime' ? runtime : fields).append(control.element);
  }
  integrator.control.addEventListener('change', edit);
  const presets = constraintPresets(model.state.config.systemId);
  const preset = select(
    'constraint-preset',
    spring ? '탄성 운동 프리셋' : '사건 기반 초기화 프리셋',
    presets.map((entry) => [entry.id, entry.label])
  );
  const applyPreset = createButton(document, {
    label: '프리셋 적용',
    variant: 'secondary',
    onClick() {
      const entry = presets.find((item) => item.id === preset.control.value);
      if (entry && apply(entry.config)) {
        sync();
        notice.textContent = '프리셋을 초기조건으로 적용했습니다. 초기 장력과 사건 목록을 확인하세요.';
      }
    }
  });
  const warning = element(document, 'p', 'lab-preview-note');
  section.body.append(preset.wrap, applyPreset, fields, element(document, 'h3', '', '실행과 기록'), runtime);
  if (spring) section.body.append(integrator.wrap);
  else
    section.body.append(
      element(
        document,
        'p',
        'lab-muted',
        double
          ? '사건 처리 적분기를 사용합니다. 이중 줄의 비행·재포획은 근사 모델입니다. 포획 손실은 엔진의 기록값이며, 모드 전환과 위치 보정에 따른 에너지 변화까지 설명하지 않습니다.'
          : '사건 처리 적분기를 사용합니다. 음의 장력은 줄을 이완하고, 재포획은 반지름 속도를 제거해 에너지를 잃습니다.'
      )
    );
  section.body.append(errors, notice, warning);
  function sync() {
    syncing = true;
    for (const entry of definitions) controls.get(entry.id)!.setValue(valueOf(model.state.config, entry));
    if (spring) integrator.control.value = model.state.config.integratorId;
    errors.hidden = true;
    errors.textContent = '';
    syncing = false;
    update();
  }
  function update() {
    const state = model.state;
    const busy = state.status === 'running' || state.busy;
    section.element
      .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input,select,button')
      .forEach((control) => {
        control.disabled = busy;
      });
    warning.textContent = constraintWarnings(state.config).join(' ');
    warning.hidden = !warning.textContent;
  }
  sync();
  return { element: section.element, sync, update };
}
