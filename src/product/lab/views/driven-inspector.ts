import { element } from '../../app/dom';
import { createButton, createSection } from '../../design-system/primitives';
import { createQuantity, type QuantityControl } from '../../design-system/quantity';
import type { CanonicalUnit } from '../../contracts/quantities';
import {
  defaultDrivenConfig,
  drivenHasForcing,
  drivenSupportsController,
  drivenWarnings,
  validateDrivenConfig,
  type DrivenConfig
} from '../../adapters/physics/driven';
import type { DrivenModel } from './driven-model';
import { drivenInputUnit, drivenStateFields } from './driven-storage';

export function applyDrivenDraft(
  current: DrivenConfig,
  values: Readonly<Record<string, number>>,
  waveform: NonNullable<DrivenConfig['forcing']>['waveform'],
  enabled: boolean,
  integratorId: DrivenConfig['integratorId']
): DrivenConfig {
  const parameters = Object.fromEntries(Object.keys(current.parameters).map((key) => [key, values[key]!]));
  const initialState = current.initialState.map((_, i) => values[`state-${i}`]!);
  const candidate = {
    ...current,
    parameters,
    initialState,
    step: values.step!,
    duration: values.duration!,
    sampleEvery: values.sampleEvery!,
    integratorId,
    ...(current.forcing
      ? { forcing: { waveform, amplitude: values.amplitude!, frequency: values.frequency!, phase: values.phase! } }
      : {}),
    ...(drivenSupportsController(current.systemId)
      ? {
          controller: {
            enabled,
            kp: values.kp!,
            kd: values.kd!,
            kx: current.systemId === 'system:cartpole' ? values.kx! : 0,
            kv: current.systemId === 'system:cartpole' ? values.kv! : 0,
            reference: values.reference!,
            maxOutput: values.maxOutput!
          }
        }
      : {})
  };
  const checked = validateDrivenConfig(candidate);
  if (!checked.ok) throw new Error(checked.issues.map((i) => i.message).join(' '));
  return checked.value;
}

export function createDrivenInspector(document: Document, model: DrivenModel, onChange: () => void) {
  const initial = model.state.config,
    id = initial.systemId;
  const controllerInitial = initial.controller ?? defaultDrivenConfig(id).controller;
  const section = createSection(document, {
    id: 'driven-inspector',
    title: '실험 조건',
    description: '플랜트와 구동·제어 설정을 따로 편집한 뒤 조건 적용을 선택하세요. 적용하면 초기조건부터 시작합니다.'
  });
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const warning = element(document, 'p', 'lab-preview-note');
  const controls = new Map<string, QuantityControl>();
  let syncing = false,
    dirty = false;
  const edited = () => {
    if (syncing) return;
    dirty = true;
    model.setValid(false);
    notice.textContent = '편집 중입니다. 조건 적용 또는 편집 취소를 선택하세요.';
  };
  function fields(title: string, description: string) {
    const region = element(document, 'fieldset', 'driven-panel');
    region.append(element(document, 'legend', '', title), element(document, 'p', 'lab-muted', description));
    const grid = element(document, 'div', 'driven-fields');
    region.append(grid);
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
    meaning = 'SI 값입니다.'
  ) {
    const control = createQuantity(document, {
      id: `driven-${key}`,
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
  const plant = fields('플랜트', '물리 계의 길이·중력·감쇠·결합을 설정합니다. 구동과 제어는 별도 패널에 있습니다.');
  const meta: Record<string, [string, CanonicalUnit, number, number]> = {
    g: ['중력 가속도', 'm/s^2', 0, 1000],
    length: ['길이', 'm', 0.001, 1000],
    damping: ['감쇠', 's^-1', 0, 1000],
    coupling: ['결합 계수', 's^-2', 0, 1000],
    cartMass: ['수레 질량', 'kg', 0.001, 1000],
    poleMass: ['막대 질량', 'kg', 0.001, 1000],
    friction: ['수레 마찰', 'N*s/m', 0, 1000],
    force: ['일정 외력', 'N', -1000, 1000]
  };
  for (const [key, value] of Object.entries(initial.parameters)) {
    const m = meta[key];
    if (!m) throw new Error(`Unknown driven plant field ${key}`);
    add(plant, key, ...m, value);
  }
  const native = fields(
    '초기조건',
    '각도·각속도는 SI 단위입니다. 진행 위상 ψ와 구동 위상 오프셋 φ₀는 서로 다른 값이며 함께 저장합니다.'
  );
  drivenStateFields(id).forEach(([key, label, unit], i) =>
    add(
      native,
      `state-${i}`,
      label,
      unit as CanonicalUnit,
      -10000,
      10000,
      initial.initialState[i]!,
      `${key}의 초기값입니다.`
    )
  );
  function selector(host: HTMLElement, key: string, labelText: string, values: readonly (readonly [string, string])[]) {
    const wrap = element(document, 'div', 'ds-field'),
      label = element(document, 'label', 'ds-field__label', labelText),
      control = element(document, 'select', 'ds-field__control');
    label.htmlFor = `driven-${key}`;
    control.id = label.htmlFor;
    values.forEach(([value, text]) => {
      const o = element(document, 'option', '', text);
      o.value = value;
      control.append(o);
    });
    control.addEventListener('change', edited);
    wrap.append(label, control);
    host.append(wrap);
    return control;
  }
  let waveform: HTMLSelectElement | undefined, enabled: HTMLInputElement | undefined;
  if (drivenHasForcing(id) && initial.forcing) {
    const forcing = fields(
      '구동 신호',
      'sine: sin(ψ+φ₀), square: sign(sin), triangle: 2·asin(sin)/π. cart-pole은 ψ=Ωt이며 나머지는 저장된 진행 위상을 적분합니다. Ω는 각주파수 rad/s입니다. 기본 φ₀=π/2는 기존 cos 구동과 같습니다.'
    );
    waveform = selector(forcing, 'waveform', '파형', [
      ['sine', '정현파 · sine'],
      ['square', '사각파 · square'],
      ['triangle', '삼각파 · triangle']
    ]);
    const unit = id === 'system:driven' ? 'rad/s^2' : id === 'system:cartpole' ? 'N' : '1';
    add(forcing, 'amplitude', '구동 진폭', unit, 0, id === 'system:parametric' ? 1 : 1000, initial.forcing.amplitude);
    add(
      forcing,
      'frequency',
      '구동 각주파수 Ω',
      'rad/s',
      0,
      1000,
      initial.forcing.frequency,
      '시간 주기 T=2π/Ω입니다.'
    );
    add(forcing, 'phase', '구동 위상 오프셋 φ₀', 'rad', -10000, 10000, initial.forcing.phase);
  }
  if (drivenSupportsController(id) && controllerInitial) {
    const controller = fields(
      '제어기',
      id === 'system:cartpole'
        ? '수레 위치 기준값 xref를 사용합니다. 수직 위 각도 목표는 0 rad입니다. u=kp·θ+kd·ω+kx·(x−xref)+kv·v (N), 이후 출력 포화를 적용합니다.'
        : 'u=kp·(θref−θ)−kd·ω (rad/s²). 출력은 ±최대 출력으로 포화됩니다. 선형 피드백의 안정화는 초기조건과 이득에 따라 달라집니다.'
    );
    const toggle = element(document, 'label', 'ds-field__label', '제어기 사용');
    enabled = element(document, 'input', '');
    enabled.type = 'checkbox';
    enabled.id = 'driven-controller-enabled';
    enabled.addEventListener('change', edited);
    toggle.htmlFor = enabled.id;
    controller.append(toggle, enabled);
    const gainMeaning =
      id === 'system:cartpole'
        ? '제어식의 출력 단위는 N입니다. kp:N/rad, kd:N·s/rad, kx:N/m, kv:N·s/m.'
        : '제어식의 출력 단위는 rad/s²입니다. kp:s⁻², kd:s⁻¹.';
    const gainUnits: Record<string, CanonicalUnit> =
      id === 'system:cartpole' ? { kp: 'N/rad', kd: 'N*s/rad', kx: 'N/m', kv: 'N*s/m' } : { kp: 's^-2', kd: 's^-1' };
    for (const key of ['kp', 'kd', ...(id === 'system:cartpole' ? ['kx', 'kv'] : [])])
      add(
        controller,
        key,
        `피드백 이득 ${key}`,
        gainUnits[key]!,
        0,
        10000,
        controllerInitial[key as 'kp' | 'kd' | 'kx' | 'kv'],
        gainMeaning
      );
    add(
      controller,
      'reference',
      id === 'system:cartpole' ? '수레 위치 기준값' : '각도 기준값',
      id === 'system:cartpole' ? 'm' : 'rad',
      id === 'system:cartpole' ? -100 : -0.25,
      id === 'system:cartpole' ? 100 : 0.25,
      controllerInitial.reference
    );
    add(
      controller,
      'maxOutput',
      '최대 출력',
      id === 'system:cartpole' ? 'N' : 'rad/s^2',
      0.001,
      1000,
      controllerInitial.maxOutput,
      `제어기 출력만 ±최대 출력 (${drivenInputUnit(id)}) 범위입니다.${id === 'system:cartpole' ? ' 총 힘은 일정 외력+구동+제어 출력입니다.' : ''}`
    );
  }
  const runtime = fields(
    '공통 실행 조건',
    '시간 간격을 줄여 결과 수렴을 확인하세요. 사각파 모서리에서는 고차 적분기의 수렴 차수가 낮아질 수 있습니다.'
  );
  add(runtime, 'duration', '관찰 시간', 's', 1e-6, 300, initial.duration);
  add(runtime, 'step', '시간 간격', 's', 1e-6, 0.05, initial.step);
  add(
    runtime,
    'sampleEvery',
    '기록 간격 (단계 수)',
    '1',
    1,
    100000,
    initial.sampleEvery ?? 1,
    '최대 2,001개 표본으로 추가 축약합니다.'
  );
  const integrator = selector(runtime, 'integrator', '적분기', [
    ['integrator:rk4', 'RK4'],
    ['integrator:rk2', 'RK2'],
    ['integrator:euler', 'Euler']
  ]);
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
          applyDrivenDraft(
            model.state.config,
            values,
            (waveform?.value ?? 'sine') as NonNullable<DrivenConfig['forcing']>['waveform'],
            enabled?.checked ?? false,
            integrator.value as DrivenConfig['integratorId']
          )
        );
        sync();
        onChange();
        notice.textContent = '조건을 적용했습니다. 초기조건부터 실행할 수 있습니다.';
      } catch (cause) {
        error.hidden = false;
        error.textContent = `${cause instanceof Error ? cause.message : '조건을 확인하세요.'} 마지막 유효한 설정은 보존했습니다.`;
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
  const defaults = createButton(document, {
    label: '기본 예제 복원',
    variant: 'secondary',
    onClick() {
      model.configure(defaultDrivenConfig(id));
      sync();
      onChange();
      notice.textContent = '기본 구동·제어 예제를 복원했습니다.';
    }
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(apply, undo, defaults);
  section.body.append(actions, error, notice, warning);
  function sync() {
    syncing = true;
    dirty = false;
    const c = model.state.config,
      v: Record<string, number> = {
        ...c.parameters,
        duration: c.duration,
        step: c.step,
        sampleEvery: c.sampleEvery ?? 1
      };
    for (const [key, value] of Object.entries({ ...c.forcing, ...(c.controller ?? controllerInitial) }))
      if (typeof value === 'number') v[key] = value;
    c.initialState.forEach((value, i) => {
      v[`state-${i}`] = value;
    });
    for (const [key, control] of controls) control.setValue(v[key]!);
    if (waveform) waveform.value = c.forcing!.waveform;
    if (enabled) enabled.checked = c.controller?.enabled ?? false;
    integrator.value = c.integratorId;
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
    warning.textContent = drivenWarnings(state.config).join(' ');
  }
  sync();
  return { element: section.element, update, sync };
}
