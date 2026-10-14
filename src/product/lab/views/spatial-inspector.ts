import { element } from '../../app/dom';
import { createButton, createSection } from '../../design-system/primitives';
import { createQuantity, type QuantityControl } from '../../design-system/quantity';
import type { CanonicalUnit } from '../../contracts/quantities';
import {
  defaultSpatialConfig,
  spatialIsEmbedded,
  spatialWarnings,
  validateSpatialConfig,
  type SpatialConfig
} from '../../adapters/physics/spatial';
import type { SpatialModel } from './spatial-model';

/** Build and validate one atomic edit in native coordinates; the caller commits only a successful result. */
export function applySpatialDraft(
  current: SpatialConfig,
  n: number,
  selected: number,
  values: Readonly<Record<string, number>>,
  integratorId: SpatialConfig['integratorId']
): SpatialConfig {
  const oldN = current.parameters.masses.length;
  if (!Number.isInteger(selected) || selected < 0 || selected >= oldN)
    throw new RangeError('편집할 기존 링크를 선택하세요.');
  const template = defaultSpatialConfig(current.systemId, n);
  const embedded = spatialIsEmbedded(current.systemId),
    stride = embedded ? 3 : 2;
  const initialState = [...template.initialState];
  const masses = [...template.parameters.masses],
    lengths = [...template.parameters.lengths];
  for (let i = 0; i < Math.min(n, oldN); i++) {
    masses[i] = current.parameters.masses[i]!;
    lengths[i] = current.parameters.lengths[i]!;
    for (let j = 0; j < stride; j++) {
      initialState[stride * i + j] = current.initialState[stride * i + j]!;
      initialState[stride * n + stride * i + j] = current.initialState[stride * oldN + stride * i + j]!;
    }
  }
  // A removed link's draft must not replace a surviving link when reducing N.
  if (selected < n) {
    masses[selected] = values.mass!;
    lengths[selected] = values.length!;
    const position = embedded ? [values.ux!, values.uy!, values.uz!] : [values.theta!, values.phi!];
    const velocity = embedded ? [values.wx!, values.wy!, values.wz!] : [values.thetaDot!, values.phiDot!];
    position.forEach((value, j) => {
      initialState[stride * selected + j] = value;
    });
    velocity.forEach((value, j) => {
      initialState[stride * n + stride * selected + j] = value;
    });
  }
  const checked = validateSpatialConfig({
    ...current,
    parameters: { masses, lengths, g: values.g!, damping: values.damping! },
    initialState,
    step: values.step!,
    duration: values.duration!,
    sampleEvery: values.sampleEvery!,
    integratorId
  });
  if (!checked.ok) throw new Error(checked.issues.map((issue) => issue.message).join(' '));
  return checked.value;
}

export function createSpatialInspector(document: Document, model: SpatialModel, onChange: () => void) {
  const embedded = spatialIsEmbedded(model.state.config.systemId);
  const chain = model.state.config.systemId.endsWith('chain');
  const section = createSection(document, {
    id: 'spatial-inspector',
    title: '실험 조건',
    description: '조건을 편집한 뒤 적용하세요. 적용하면 초기조건부터 다시 시작합니다. 링크는 고정점부터 셉니다.'
  });
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const error = element(document, 'p', 'ds-field__error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const warning = element(document, 'p', 'lab-preview-note');
  let selected = 0,
    syncing = false,
    dirty = false;
  const controls = new Map<string, QuantityControl>();
  function select(id: string, labelText: string, values: readonly (readonly [string, string])[]) {
    const wrap = element(document, 'div', 'ds-field');
    const label = element(document, 'label', 'ds-field__label', labelText);
    label.htmlFor = id;
    const control = element(document, 'select', 'ds-field__control');
    control.id = id;
    for (const [value, text] of values) {
      const option = element(document, 'option', '', text);
      option.value = value;
      control.append(option);
    }
    wrap.append(label, control);
    return { wrap, control };
  }
  function edited() {
    if (syncing) return;
    dirty = true;
    model.setValid(false);
    notice.textContent = '편집 중입니다. 조건 적용 또는 편집 취소를 선택하세요.';
  }
  const selectedLink = select('spatial-selected-link', '편집할 링크', []);
  const count = select(
    'spatial-count',
    '링크 수 N',
    Array.from({ length: 16 }, (_, i) => [String(i + 1), String(i + 1)])
  );
  count.control.addEventListener('change', edited);
  selectedLink.control.addEventListener('change', () => {
    selected = Number(selectedLink.control.value);
    sync();
  });
  const fields = element(document, 'div', 'spatial-fields');
  const common = element(document, 'div', 'spatial-fields');
  const linkFields = [
    { id: 'mass', label: '질량', unit: 'kg', min: 0.001, max: 1000, defaultValue: 1 },
    { id: 'length', label: '길이', unit: 'm', min: 0.001, max: 1000, defaultValue: 1 },
    ...(embedded
      ? [
          { id: 'ux', label: '방향 x 성분', unit: '1', min: -10000, max: 10000, defaultValue: 0 },
          { id: 'uy', label: '방향 y 성분', unit: '1', min: -10000, max: 10000, defaultValue: -1 },
          { id: 'uz', label: '방향 z 성분', unit: '1', min: -10000, max: 10000, defaultValue: 0 },
          { id: 'wx', label: '방향 변화율 x 성분', unit: 's^-1', min: -10000, max: 10000, defaultValue: 0 },
          { id: 'wy', label: '방향 변화율 y 성분', unit: 's^-1', min: -10000, max: 10000, defaultValue: 0 },
          { id: 'wz', label: '방향 변화율 z 성분', unit: 's^-1', min: -10000, max: 10000, defaultValue: 0 }
        ]
      : [
          { id: 'theta', label: '기울기', unit: 'rad', min: -10000, max: 10000, defaultValue: 0.6 },
          { id: 'phi', label: '방위각', unit: 'rad', min: -10000, max: 10000, defaultValue: 0 },
          { id: 'thetaDot', label: '기울기 각속도', unit: 'rad/s', min: -10000, max: 10000, defaultValue: 0 },
          { id: 'phiDot', label: '방위 각속도', unit: 'rad/s', min: -10000, max: 10000, defaultValue: 0 }
        ])
  ] as const;
  const runtimeFields = [
    { id: 'g', label: '중력 가속도', unit: 'm/s^2', min: chain ? 0.001 : 0, max: 1000, defaultValue: 9.81 },
    { id: 'damping', label: '감쇠', unit: 's^-1', min: 0, max: 1000, defaultValue: 0 },
    { id: 'duration', label: '관찰 시간', unit: 's', min: 1e-6, max: 300, defaultValue: 10 },
    { id: 'step', label: '시간 간격', unit: 's', min: 1e-6, max: 0.05, defaultValue: 0.002 },
    { id: 'sampleEvery', label: '기록 간격 (단계 수)', unit: '1', min: 1, max: 100000, defaultValue: 1 }
  ] as const;
  for (const field of [...linkFields, ...runtimeFields]) {
    const control = createQuantity(document, {
      ...field,
      unit: field.unit as CanonicalUnit,
      id: `spatial-${field.id}`,
      symbol: field.id,
      meaning:
        field.id === 'damping'
          ? '속도에 비례하는 감쇠 계수입니다.'
          : ['ux', 'uy', 'uz'].includes(field.id)
            ? '다른 방향 성분과 함께 |u|=1을 만족해야 합니다.'
            : ['wx', 'wy', 'wz'].includes(field.id)
              ? 'w=du/dt이며 u·w=0을 만족하는 접선 방향 변화율입니다.'
              : field.id === 'sampleEvery'
                ? '최대 2,001개 표본으로 추가 축약할 수 있습니다.'
                : 'SI 초기조건입니다.',
      onChange: edited
    });
    controls.set(field.id, control);
    (linkFields.some((entry) => entry.id === field.id) ? fields : common).append(control.element);
  }
  const integrator = select(
    'spatial-integrator',
    '적분기',
    model.state.config.systemId === 'system:spherical-chain'
      ? [
          ['integrator:rk4', 'RK4'],
          ['integrator:rk2', 'RK2'],
          ['integrator:euler', 'Euler']
        ]
      : [['internal', '시스템 전용 적분기']]
  );
  integrator.control.addEventListener('change', edited);
  function values() {
    const result: Record<string, number> = {};
    let valid = true;
    for (const [id, control] of controls) {
      const parsed = control.read();
      if (!parsed.ok) valid = false;
      else result[id] = parsed.quantity.value;
    }
    return valid ? result : null;
  }
  const apply = createButton(document, {
    label: '조건 적용',
    onClick() {
      const v = values();
      if (!v) return;
      try {
        const current = model.state.config;
        const n = chain ? Number(count.control.value) : 1;
        const index = Math.min(selected, n - 1);
        model.configure(
          applySpatialDraft(current, n, selected, v, integrator.control.value as SpatialConfig['integratorId'])
        );
        selected = index;
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
      model.configure(defaultSpatialConfig(model.state.config.systemId));
      selected = 0;
      sync();
      onChange();
      notice.textContent = '기본 공간 운동 예제를 복원했습니다.';
    }
  });
  const actions = element(document, 'div', 'lab-inline-actions');
  actions.append(apply, undo, defaults);
  section.body.append(
    element(
      document,
      'p',
      'lab-preview-note',
      embedded
        ? 'Embedded 좌표: 링크 방향 u는 무차원 단위벡터, w=du/dt는 방향 변화율 (s⁻¹)입니다. |u|=1, u·w=0을 만족해야 합니다. 여러 성분을 함께 편집한 뒤 적용하세요. 수직 방향에서도 방위각 변환 없이 저장합니다.'
        : '구면 좌표: θ는 아래 방향 (−y)에서의 기울기, φ는 x에서 z로 증가하는 방위각입니다. x=ℓ sinθ cosφ, y=−ℓ cosθ, z=ℓ sinθ sinφ. 극점 θ=0,π에서는 φ가 정의되지 않습니다.'
    ),
    selectedLink.wrap
  );
  if (chain) section.body.append(count.wrap);
  section.body.append(
    fields,
    element(document, 'h3', '', '공통 실행 조건'),
    common,
    integrator.wrap,
    actions,
    error,
    notice,
    warning
  );
  function sync() {
    syncing = true;
    dirty = false;
    const c = model.state.config,
      n = c.parameters.masses.length,
      stride = embedded ? 3 : 2;
    selected = Math.min(selected, n - 1);
    selectedLink.control.replaceChildren(
      ...Array.from({ length: n }, (_, i) => {
        const option = element(document, 'option', '', `링크 ${i + 1}`);
        option.value = String(i);
        return option;
      })
    );
    selectedLink.control.value = String(selected);
    count.control.value = String(n);
    const v: Record<string, number> = {
      mass: c.parameters.masses[selected]!,
      length: c.parameters.lengths[selected]!,
      g: c.parameters.g,
      damping: c.parameters.damping,
      duration: c.duration,
      step: c.step,
      sampleEvery: c.sampleEvery ?? 1
    };
    (embedded ? ['ux', 'uy', 'uz'] : ['theta', 'phi']).forEach((id, j) => {
      v[id] = c.initialState[stride * selected + j]!;
    });
    (embedded ? ['wx', 'wy', 'wz'] : ['thetaDot', 'phiDot']).forEach((id, j) => {
      v[id] = c.initialState[stride * n + stride * selected + j]!;
    });
    for (const [id, control] of controls) control.setValue(v[id]!);
    integrator.control.value = c.integratorId;
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
    selectedLink.control.disabled = busy || dirty;
    undo.disabled = busy || !dirty;
    warning.textContent = spatialWarnings(state.config).join(' ');
  }
  sync();
  return { element: section.element, update, sync };
}
