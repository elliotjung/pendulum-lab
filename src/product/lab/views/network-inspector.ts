import { element } from '../../app/dom';
import { createButton, createSection } from '../../design-system/primitives';
import { createQuantity, type QuantityControl } from '../../design-system/quantity';
import type { CanonicalUnit } from '../../contracts/quantities';
import {
  networkParameterFields,
  networkPresets,
  networkPresetConfig,
  networkWarnings,
  networkSeededConfig,
  resizeNetworkConfig,
  validateNetworkConfig,
  type NetworkConfig
} from '../../adapters/physics/network';
import type { NetworkModel } from './network-model';
import {
  NETWORK_IMPORT_MAX_BYTES,
  parseNetworkTopology,
  serializeNetworkTopology,
  networkIsNormalized
} from './network-storage';

export function applyNetworkDraft(
  current: NetworkConfig,
  values: Readonly<Record<string, number>>,
  topology: string
): NetworkConfig {
  const parameters = Object.fromEntries(Object.keys(current.parameters).map((key) => [key, values[key]]));
  const basin = current.basin
    ? Object.fromEntries(Object.keys(current.basin).map((key) => [key, values[`basin-${key}`]]))
    : undefined;
  const next = {
    ...current,
    parameters,
    step: values.step,
    duration: values.duration,
    sampleEvery: values.sampleEvery,
    ...(basin ? { basin } : {})
  } as NetworkConfig;
  const checked = validateNetworkConfig(parseNetworkTopology(topology, next));
  if (!checked.ok) throw new Error(checked.issues.map((entry) => entry.message).join(' '));
  return checked.value;
}

export function createNetworkInspector(document: Document, model: NetworkModel, onChange: () => void) {
  const initial = model.state.config,
    id = initial.systemId,
    normalized = networkIsNormalized(id);
  const section = createSection(document, {
    id: 'network-inspector',
    title: '실험 조건',
    description:
      '편집을 시작하면 실행을 취소합니다. 조건 적용은 계수·노드·간선·초기조건을 함께 검증하며 실패하면 마지막 유효 설정을 보존합니다.'
  });
  const controls = new Map<string, QuantityControl>(),
    notice = element(document, 'p', 'lab-muted'),
    error = element(document, 'p', 'ds-field__error'),
    warning = element(document, 'p', 'lab-preview-note');
  notice.setAttribute('role', 'status');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  let syncing = false,
    dirty = false,
    disposed = false,
    generation = 0;
  function edited() {
    if (syncing) return;
    dirty = true;
    model.setValid(false);
    notice.textContent = '편집 중입니다. 조건 적용 또는 편집 취소를 선택하세요.';
  }
  function panel(title: string, description: string) {
    const fieldset = element(document, 'fieldset', 'network-panel'),
      grid = element(document, 'div', 'network-fields');
    fieldset.append(element(document, 'legend', '', title), element(document, 'p', 'lab-muted', description), grid);
    section.body.append(fieldset);
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
      id: `network-${key}`,
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
    return control;
  }
  function selector(
    host: HTMLElement,
    key: string,
    labelText: string,
    entries: readonly (readonly [string, string])[]
  ) {
    const wrapper = element(document, 'div', 'ds-field'),
      label = element(document, 'label', 'ds-field__label', labelText),
      select = element(document, 'select', 'ds-field__control');
    label.htmlFor = `network-${key}`;
    select.id = label.htmlFor;
    entries.forEach(([value, text]) => {
      const option = element(document, 'option', '', text);
      option.value = value;
      select.append(option);
    });
    wrapper.append(label, select);
    host.append(wrapper);
    return select;
  }
  const presets = panel('대표 예제', '예제와 seed 초기조건 적용은 현재 편집을 취소하고 새 유효 설정으로 시작합니다.');
  const preset = selector(
      presets,
      'preset',
      '예제 선택',
      networkPresets(id).map((entry) => [entry.id, entry.label])
    ),
    presetText = element(document, 'p', 'lab-muted');
  const describePreset = () => {
    presetText.textContent = networkPresets(id).find((entry) => entry.id === preset.value)?.description ?? '';
  };
  preset.addEventListener('change', describePreset);
  describePreset();
  presets.append(
    presetText,
    createButton(document, {
      label: '예제 적용',
      variant: 'secondary',
      onClick() {
        model.configure(networkPresetConfig(id, preset.value));
        sync();
        onChange();
        notice.textContent = '선택한 예제를 적용했습니다.';
      }
    })
  );
  const plant = panel(
    '모델 계수',
    normalized
      ? '모든 변수·시간·에너지는 정규화 값이며 SI 값이 아닙니다.'
      : '위상은 rad, 시간은 s입니다. 모델별 물성의 단위를 따릅니다.'
  );
  for (const field of networkParameterFields(id))
    add(
      plant,
      field.key,
      `${field.label} · ${field.unit}`,
      field.canonicalUnit,
      field.min,
      field.max,
      initial.parameters[field.key]!,
      `모델에서 정의한 ${field.unit} 계수입니다.`
    );

  const topology = panel(
    '노드·간선 편집기',
    '노드 ID와 간선 endpoint를 함께 편집합니다. 자기 간선·중복 간선·없는 노드 참조·유한하지 않은 값은 적용할 수 없습니다.'
  );
  const count = add(
    topology,
    'node-count',
    '생성할 노드 수 N',
    '1',
    id === 'system:magnetic' ? 1 : id === 'system:chimera-exploration' ? 8 : 2,
    id === 'system:magnetic' ? 16 : 128,
    initial.graph.nodes.length,
    '모델별 허용 수를 최종 검증합니다. Huygens는 두 개, 자석은 최대 16개입니다.'
  );
  const radius = add(
    topology,
    'ring-radius',
    '링 이웃 반경 R',
    '1',
    1,
    63,
    Math.max(1, initial.parameters.radius ?? 1),
    '양쪽 R개 이웃을 연결합니다. R은 N에 맞는 정수여야 합니다.'
  );
  count.element.hidden = id === 'system:huygens-phase-pair';
  radius.element.hidden = id === 'system:magnetic' || id === 'system:huygens-phase-pair';
  const generate = createButton(document, {
    label:
      id === 'system:magnetic'
        ? '자석 배치 생성'
        : id === 'system:huygens-phase-pair'
          ? '두 노드 쌍 복원'
          : '노드 수로 링 생성',
    variant: 'secondary',
    onClick() {
      const n = count.read(),
        r = radius.read();
      if (!n.ok || !r.ok) return;
      try {
        model.configure(resizeNetworkConfig(model.state.config, n.quantity.value, r.quantity.value));
        sync();
        onChange();
        notice.textContent =
          id === 'system:magnetic'
            ? '자석 수와 배치를 적용했습니다. 자석은 간선을 사용하지 않습니다.'
            : id === 'system:huygens-phase-pair'
              ? '고정된 두 노드와 단위 가중치 간선 하나를 적용했습니다.'
              : '노드 수와 링 구조를 새 초기조건으로 적용했습니다.';
      } catch (cause) {
        showError(cause);
      }
    }
  });
  topology.append(generate);
  const seedLabel = element(document, 'label', 'ds-field__label', '초기조건 seed (문자열)'),
    seed = element(document, 'input', 'ds-field__control');
  seedLabel.htmlFor = 'network-seed';
  seed.id = seedLabel.htmlFor;
  seed.type = 'text';
  seed.maxLength = 128;
  topology.append(
    seedLabel,
    seed,
    createButton(document, {
      label: 'seed 초기조건 적용',
      variant: 'secondary',
      onClick() {
        try {
          model.configure(networkSeededConfig(model.state.config, seed.value));
          sync();
          onChange();
          notice.textContent = '동일한 seed·노드 ID·생성기 버전에서 같은 초기조건을 생성합니다.';
        } catch (cause) {
          showError(cause);
        }
      }
    }),
    element(
      document,
      'p',
      'lab-muted',
      'seed는 fnv1a-mulberry32 버전 1로 새 초기조건을 생성할 때 사용합니다. 저장·공유를 복원할 때는 명시한 초기조건을 그대로 사용합니다.'
    )
  );
  const textLabel = element(document, 'label', 'ds-field__label', '노드·간선·초기조건 JSON'),
    text = element(document, 'textarea', 'ds-field__control network-json');
  textLabel.htmlFor = 'network-topology-input';
  text.id = textLabel.htmlFor;
  text.rows = 15;
  text.spellcheck = false;
  text.setAttribute('aria-describedby', 'network-node-meaning network-topology-schema');
  text.addEventListener('input', edited);
  const activeFields = element(
    document,
    'p',
    'lab-muted',
    id === 'system:magnetic'
      ? '이 모델의 노드에서는 x·y·strength가 자석의 위치와 강도로 운동에 반영됩니다. 진자 자체의 시작 상태는 initialState [x,y,vx,vy]입니다. 노드의 mass·length·damping·frequency는 보존하는 메타데이터이며 이 모델의 운동을 바꾸지 않습니다. 감쇠는 별도 모델 계수 damping을 사용합니다.'
      : id === 'system:pendulum-network'
        ? '이 모델은 노드의 mass·length·damping, 간선 weight와 initialState의 θ·ω를 운동에 사용합니다. x·y는 배치용 메타데이터이며 운동방정식에는 들어가지 않습니다. frequency·strength도 보존하는 메타데이터이며 이 모델의 운동을 바꾸지 않습니다.'
        : id === 'system:huygens-phase-pair'
          ? '이 위상 축약 모델은 노드 frequency와 initialState의 두 위상을 운동에 사용합니다. 두 노드 사이의 간선은 하나이며 weight=1로 고정합니다. x·y·mass·length·damping·strength는 보존하는 메타데이터이며 이 모델의 운동을 바꾸지 않습니다.'
          : id === 'system:chimera-exploration'
            ? '이 위상 모델은 노드 frequency와 initialState의 위상을 운동에 사용합니다. ringOrder와 반경 R이 이웃 구조와 국소 진단을 정하며 간선 weight는 1로 고정합니다. x·y·mass·length·damping·strength는 보존하는 메타데이터이며 이 모델의 운동을 바꾸지 않습니다.'
            : '이 위상 모델은 노드 frequency, 간선 weight와 initialState의 위상을 운동에 사용합니다. x·y·mass·length·damping·strength는 보존하는 메타데이터이며 이 모델의 운동을 바꾸지 않습니다.'
  );
  activeFields.id = 'network-node-meaning';
  const schema = element(
    document,
    'p',
    'lab-muted',
    'nodes: id(고유 문자열), x·y(배치 좌표, 자석은 정규화 위치), mass(kg, >0), length(m, >0), damping(s⁻¹, ≥0), frequency(rad/s), strength(자석 정규화 강도, >0). edges: id, source, target, weight(진자 J/rad², 위상 모델 무차원, ≥0). initialState: 자석 [x,y,vx,vy] 정규화, 진자 [θ 전체(rad),ω 전체(rad/s)], 위상 모델 [θ 전체(rad)]. chimera의 ringOrder는 노드 ID 순열이며 간선은 선택한 R의 비국소 링이어야 합니다.'
  );
  schema.id = 'network-topology-schema';
  topology.append(textLabel, text, activeFields, schema);
  const fileLabel = element(document, 'label', 'ds-field__label', '노드·간선 JSON 가져오기'),
    file = element(document, 'input', 'ds-field__control');
  fileLabel.htmlFor = 'network-topology-import';
  file.id = fileLabel.htmlFor;
  file.type = 'file';
  file.accept = '.json,application/json';
  file.addEventListener('change', async () => {
    const current = ++generation,
      selected = file.files?.[0];
    if (!selected) return;
    try {
      if (selected.size > NETWORK_IMPORT_MAX_BYTES) throw new Error('파일은 256 KiB 이하여야 합니다.');
      const content = await selected.text();
      if (disposed || current !== generation) return;
      if (model.state.status === 'running' || model.state.busy) throw new Error('실행을 멈춘 뒤 가져오세요.');
      const values = readDraftValues();
      if (!values) throw new Error('다른 조건의 입력 오류를 먼저 수정하세요.');
      applyNetworkDraft(model.state.config, values, content);
      text.value = content;
      edited();
      notice.textContent = '노드·간선 파일을 편집기에 불러왔습니다. 조건 적용으로 확정하세요.';
    } catch (cause) {
      if (!disposed && current === generation) showError(cause);
    } finally {
      if (!disposed && current === generation) file.value = '';
    }
  });
  topology.append(fileLabel, file);

  const runtime = panel(
    '실행 조건',
    '고정 간격을 줄여 수렴을 확인하세요. 조밀한 네트워크는 한 단계 O(N²), 저장·그림은 표본 수를 제한합니다.'
  );
  add(
    runtime,
    'duration',
    normalized ? '정규화 관찰 길이' : '관찰 시간',
    normalized ? '1' : 's',
    0.00001,
    300,
    initial.duration,
    '설정한 미래 구간을 관찰합니다.'
  );
  add(
    runtime,
    'step',
    normalized ? '정규화 시간 간격' : '시간 간격',
    normalized ? '1' : 's',
    0.00001,
    0.05,
    initial.step,
    'RK4 또는 모델 전용 적분 간격입니다.'
  );
  add(
    runtime,
    'sampleEvery',
    '기록 간격 (단계 수)',
    '1',
    1,
    100000,
    initial.sampleEvery ?? 1,
    '최대 표본 제한에 따라 추가 축약합니다.'
  );
  if (initial.basin) {
    const basin = panel(
      '자기 인력권 seed 격자',
      '기존 semi-implicit Euler 정착 도구를 사용합니다. 궤적 RK4와 다른 계산입니다. 모든 격자 셀을 같은 조건에서 계산하며 제한 시간 안에 정착하지 않으면 미해결로 표시합니다.'
    );
    for (const [key, label, min, max] of [
      ['size', '한 축의 셀 수', 2, 16],
      ['xMin', 'x 최솟값', -10, 10],
      ['xMax', 'x 최댓값', -10, 10],
      ['yMin', 'y 최솟값', -10, 10],
      ['yMax', 'y 최댓값', -10, 10],
      ['maxSteps', '셀당 최대 단계', 1, 10000],
      ['speedTolerance', '정착 속도 허용오차', 0.000001, 1]
    ] as const)
      add(
        basin,
        `basin-${key}`,
        `${label} · 정규화`,
        '1',
        min,
        max,
        initial.basin[key],
        '격자와 정착 판정 설정입니다. seed 격자는 난수를 쓰지 않습니다.'
      );
  }
  function showError(cause: unknown) {
    error.hidden = false;
    error.textContent = `${cause instanceof Error ? cause.message : '조건을 확인하세요.'} 마지막 유효한 설정과 원본을 보존했습니다.`;
  }
  function readDraftValues(): Record<string, number> | undefined {
    const values: Record<string, number> = {};
    let valid = true;
    for (const [key, control] of controls) {
      if (key === 'node-count' || key === 'ring-radius') continue;
      const result = control.read();
      if (result.ok) values[key] = result.quantity.value;
      else valid = false;
    }
    return valid ? values : undefined;
  }
  const apply = createButton(document, {
      label: '조건 적용',
      onClick() {
        const values = readDraftValues();
        if (!values) return;
        try {
          model.configure(applyNetworkDraft(model.state.config, values, text.value));
          sync();
          onChange();
          notice.textContent = '조건·그래프·초기조건을 함께 적용했습니다.';
        } catch (cause) {
          showError(cause);
          model.setValid(false);
        }
      }
    }),
    undo = createButton(document, {
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
    const config = model.state.config,
      values: Record<string, number> = {
        ...config.parameters,
        step: config.step,
        duration: config.duration,
        sampleEvery: config.sampleEvery ?? 1,
        'node-count': config.graph.nodes.length,
        'ring-radius': Math.max(1, config.parameters.radius ?? 1)
      };
    if (config.basin) Object.entries(config.basin).forEach(([key, value]) => (values[`basin-${key}`] = value));
    controls.forEach((control, key) => control.setValue(values[key]!));
    text.value = serializeNetworkTopology(config);
    seed.value = config.seed.value;
    error.hidden = true;
    error.textContent = '';
    syncing = false;
    update();
  }
  function update() {
    const state = model.state,
      busy = state.status === 'running' || state.busy;
    section.element
      .querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>(
        'input,textarea,select,button'
      )
      .forEach((control) => (control.disabled = busy));
    undo.disabled = busy || !dirty;
    warning.textContent = networkWarnings(state.config).join(' ');
  }
  sync();
  return {
    element: section.element,
    sync,
    update,
    dispose() {
      disposed = true;
      generation++;
    }
  };
}
