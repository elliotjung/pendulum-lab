import { element } from '../../app/dom';
import { createButton, createSection } from '../../design-system/primitives';
import { createQuantity, type QuantityControl } from '../../design-system/quantity';
import {
  CHAIN_INTEGRATOR_IDS,
  chainWarnings,
  validateChainConfig,
  type ChainConfig,
  type ChainBulkField
} from '../../adapters/physics/chain';
import { addChainLink, removeChainLink, bulkChainLinks, resizeChainLinks } from '../../adapters/physics/chain-edit';
import { chainPresets } from '../../adapters/physics/chain-presets';
import type { ChainModel } from './chain-model';

export function createChainInspector(document: Document, model: ChainModel, onChange: () => void) {
  const section = createSection(document, {
    id: 'chain-inspector',
    title: '실험 조건',
    description: '링크는 고정점부터 순서대로 셉니다. 유효한 편집을 적용하면 초기조건부터 다시 실행합니다.'
  });
  const notice = element(document, 'p', 'lab-muted');
  notice.setAttribute('role', 'status');
  const errors = element(document, 'p', 'ds-field__error');
  errors.setAttribute('role', 'alert');
  errors.hidden = true;
  const tools = element(document, 'div', 'chain-link-tools');
  function select(id: string, labelText: string, values: readonly (readonly [string, string])[]) {
    const label = element(document, 'label', 'ds-field__label', labelText);
    label.htmlFor = id;
    const control = element(document, 'select', 'ds-field__control');
    control.id = id;
    for (const [value, text] of values) {
      const option = element(document, 'option', '', text);
      option.value = value;
      control.append(option);
    }
    const wrap = element(document, 'div', 'ds-field');
    wrap.append(label, control);
    return { control, wrap };
  }
  const link = select('chain-selected-link', '편집할 링크', []);
  tools.append(link.wrap);
  const count = select(
    'chain-count',
    '링크 수 N',
    Array.from({ length: 128 }, (_, i) => [String(i + 1), String(i + 1)] as const)
  );
  if (model.state.config.systemId === 'system:chain') tools.append(count.wrap);
  let selected = 0,
    syncing = false;
  const fields = element(document, 'div', 'chain-link-fields'),
    controls = new Map<string, QuantityControl>();
  const ranges = {
    mass: { label: '질량', unit: 'kg', min: 0.001, max: 1000, defaultValue: 1 },
    length: { label: '길이', unit: 'm', min: 0.001, max: 1000, defaultValue: 1 },
    theta: { label: '시작 각도', unit: 'rad', min: -1e6, max: 1e6, defaultValue: 0 },
    omega: { label: '시작 각속도', unit: 'rad/s', min: -1e4, max: 1e4, defaultValue: 0 }
  } as const;
  const parameters = element(document, 'div', 'chain-link-fields');
  const runtimeFields = [
    {
      id: 'g',
      label: '중력 가속도',
      unit: 'm/s^2',
      min: model.state.config.systemId === 'system:triple' ? 0 : Number.MIN_VALUE,
      max: 1000,
      defaultValue: 9.81
    },
    { id: 'gamma', label: '힌지 감쇠', unit: 'kg*m^2/s', min: 0, max: 1000, defaultValue: 0 },
    { id: 'duration', label: '관찰 시간', unit: 's', min: 1e-6, max: 300, defaultValue: 10 },
    { id: 'step', label: '시간 간격', unit: 's', min: 1e-6, max: 0.05, defaultValue: 0.002 },
    { id: 'sampleEvery', label: '기록 간격 (단계 수)', unit: '1', min: 1, max: 100000, defaultValue: 1 }
  ] as const;
  const integrator = select(
    'chain-integrator',
    '적분기',
    CHAIN_INTEGRATOR_IDS.map((id) => [id, id.slice(11).toUpperCase()])
  );
  function apply(next: ChainConfig) {
    const checked = validateChainConfig(next);
    errors.hidden = checked.ok;
    errors.textContent = checked.ok ? '' : checked.issues.map((i) => i.message).join(' ');
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
    for (const [id, control] of controls) {
      const result = control.read();
      if (result.ok) values[id] = result.quantity.value;
      else valid = false;
    }
    if (!valid) {
      model.setValid(false);
      return;
    }
    const current = model.state.config,
      n = current.parameters.masses.length;
    const masses = [...current.parameters.masses],
      lengths = [...current.parameters.lengths],
      initial = [...current.initialState];
    masses[selected] = values.mass!;
    lengths[selected] = values.length!;
    initial[selected] = values.theta!;
    initial[n + selected] = values.omega!;
    apply({
      ...current,
      parameters: { masses, lengths, g: values.g! },
      gamma: values.gamma!,
      initialState: initial,
      duration: values.duration!,
      step: values.step!,
      sampleEvery: values.sampleEvery!,
      integratorId: integrator.control.value as ChainConfig['integratorId']
    });
  }
  for (const [id, range] of Object.entries(ranges)) {
    const control = createQuantity(document, {
      ...range,
      id: `chain-${id}`,
      symbol: id,
      meaning: '선택한 링크의 SI 초기조건입니다.',
      onChange: edit
    });
    controls.set(id, control);
    fields.append(control.element);
  }
  for (const field of runtimeFields) {
    const control = createQuantity(document, {
      ...field,
      id: `chain-${field.id}`,
      symbol: field.id,
      meaning:
        field.id === 'gamma'
          ? '힌지 토크 = −γ·각속도.'
          : field.id === 'sampleEvery'
            ? '요청 간격. 큰 실행에서는 2,001개 이하로 추가 축약합니다.'
            : '전체 사슬의 재실행 조건입니다.',
      onChange: edit
    });
    controls.set(field.id, control);
    parameters.append(control.element);
  }
  const add = createButton(document, {
    label: '선택한 링크 뒤에 추가',
    variant: 'secondary',
    onClick() {
      try {
        const next = addChainLink(model.state.config, selected + 1);
        if (apply(next)) {
          selected++;
          sync();
          link.control.focus();
          notice.textContent = '새 링크를 추가했습니다. 다른 링크의 질량·길이·각도·각속도 대응을 유지했습니다.';
        }
      } catch (cause) {
        showError(cause);
      }
    }
  });
  const remove = createButton(document, {
    label: '선택한 링크 삭제',
    variant: 'secondary',
    onClick() {
      try {
        if (apply(removeChainLink(model.state.config, selected))) {
          selected = Math.min(selected, model.state.config.parameters.masses.length - 1);
          sync();
          link.control.focus();
          notice.textContent = '선택한 링크를 삭제했습니다. 나머지 링크의 값과 순서를 유지했습니다.';
        }
      } catch (cause) {
        showError(cause);
      }
    }
  });
  if (model.state.config.systemId === 'system:chain') tools.append(add, remove);
  const bulk = element(document, 'div', 'chain-bulk-tools');
  const bulkField = select(
    'chain-bulk-field',
    '모든 링크에 적용할 항목',
    Object.entries(ranges).map(([id, r]) => [id, `${r.label} (${r.unit})`])
  );
  const bulkControlHost = element(document, 'div', '');
  let bulkControl: QuantityControl;
  function bulkInput() {
    const field = bulkField.control.value as ChainBulkField;
    bulkControl = createQuantity(document, {
      ...ranges[field],
      id: 'chain-bulk-value',
      symbol: field,
      label: '일괄 값',
      meaning: '적용 버튼을 누르면 모든 링크의 이 값만 바뀝니다.'
    });
    bulkControlHost.replaceChildren(bulkControl.element);
  }
  bulkInput();
  bulkField.control.addEventListener('change', bulkInput);
  const bulkApply = createButton(document, {
    label: '모든 링크에 일괄 적용',
    variant: 'secondary',
    onClick() {
      const parsed = bulkControl.read();
      if (!parsed.ok) return;
      try {
        if (
          apply(bulkChainLinks(model.state.config, bulkField.control.value as ChainBulkField, parsed.quantity.value))
        ) {
          sync();
          notice.textContent = '모든 링크에 값을 적용했습니다.';
        }
      } catch (cause) {
        showError(cause);
      }
    }
  });
  bulk.append(bulkField.wrap, bulkControlHost, bulkApply);
  const presets = chainPresets(model.state.config.systemId);
  const preset = select(
    'chain-preset',
    '프리셋',
    presets.map((p) => [p.id, p.label])
  );
  const presetApply = createButton(document, {
    label: '프리셋 적용',
    variant: 'secondary',
    onClick() {
      const choice = presets.find((p) => p.id === preset.control.value);
      if (choice && apply(choice.config)) {
        selected = 0;
        sync();
        notice.textContent = '프리셋의 초기조건과 실행 설정을 적용했습니다.';
      }
    }
  });
  function showError(cause: unknown) {
    errors.hidden = false;
    errors.textContent = cause instanceof Error ? cause.message : '조건을 확인하세요.';
  }
  link.control.addEventListener('change', () => {
    selected = Number(link.control.value);
    sync();
  });
  count.control.addEventListener('change', () => {
    try {
      const target = Number(count.control.value);
      const next = resizeChainLinks(model.state.config, target);
      if (apply(next)) {
        selected = Math.min(selected, target - 1);
        sync();
        notice.textContent = '끝부분 링크 수를 변경했습니다. 앞부분 링크의 값은 유지했습니다.';
      }
    } catch (cause) {
      showError(cause);
    }
  });
  integrator.control.addEventListener('change', edit);
  const warning = element(document, 'p', 'lab-preview-note');
  section.body.append(
    preset.wrap,
    presetApply,
    tools,
    fields,
    element(document, 'h3', '', '일괄 편집'),
    bulk,
    element(document, 'h3', '', '공통 실행 조건'),
    parameters,
    integrator.wrap,
    errors,
    notice,
    warning,
    element(
      document,
      'p',
      'lab-muted',
      '최대 300 s·100,000 단계. RK4·RK2·Euler를 지원합니다. 프리셋과 상태 JSON을 적용하면 초기조건부터 다시 실행합니다.'
    )
  );
  function sync() {
    syncing = true;
    const c = model.state.config,
      n = c.parameters.masses.length;
    selected = Math.min(selected, n - 1);
    link.control.replaceChildren(
      ...Array.from({ length: n }, (_, i) => {
        const option = element(document, 'option', '', `링크 ${i + 1}`);
        option.value = String(i);
        return option;
      })
    );
    link.control.value = String(selected);
    count.control.value = String(n);
    const values: Record<string, number> = {
      mass: c.parameters.masses[selected]!,
      length: c.parameters.lengths[selected]!,
      theta: c.initialState[selected]!,
      omega: c.initialState[n + selected]!,
      g: c.parameters.g,
      gamma: c.gamma,
      duration: c.duration,
      step: c.step,
      sampleEvery: c.sampleEvery ?? 1
    };
    for (const [id, control] of controls) control.setValue(values[id]!);
    integrator.control.value = c.integratorId;
    errors.hidden = true;
    errors.textContent = '';
    syncing = false;
    update();
  }
  function update() {
    const state = model.state,
      busy = state.status === 'running' || state.busy,
      n = state.config.parameters.masses.length;
    for (const control of section.element.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
      'input,select,button'
    ))
      control.disabled = busy;
    add.disabled = busy || !state.valid || n >= 128;
    remove.disabled = busy || !state.valid || n <= 1;
    count.control.disabled = busy || !state.valid;
    link.control.disabled = busy || !state.valid;
    bulkApply.disabled = busy || !state.valid;
    warning.textContent = chainWarnings(state.config).join(' ');
  }
  sync();
  return { element: section.element, update, sync };
}
