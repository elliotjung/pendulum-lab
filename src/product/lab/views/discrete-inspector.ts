import { element } from '../../app/dom';
import { createButton, createSection } from '../../design-system/primitives';
import { createQuantity, type QuantityControl } from '../../design-system/quantity';
import { parseContractJson } from '../../persistence/json';
import {
  discreteParameterFields,
  discreteWarnings,
  resizeDiscreteConfig,
  validateDiscreteConfig,
  MAX_DISCRETE_STEPS,
  MAX_DISCRETE_GRID,
  MAX_DISCRETE_MATRIX,
  type DiscreteConfig
} from '../../adapters/physics/discrete';
import type { DiscreteModel } from './discrete-model';

export function applyDiscreteDraft(
  current: DiscreteConfig,
  values: Readonly<Record<string, number>>,
  stateText: string,
  wavefunctionText: string,
  matrixText: string
): DiscreteConfig {
  const read = (text: string, label: string) => {
    const parsed = parseContractJson(text);
    if (!parsed.ok)
      throw new Error(`${label} JSON을 확인하세요. ${parsed.issues.map((issue) => issue.message).join(' ')}`);
    return parsed.value;
  };
  const parameters = Object.fromEntries(Object.keys(current.parameters).map((key) => [key, values[key]!]));
  const map = current.systemId === 'system:standard-map',
    quantum = current.systemId === 'system:quantum-kicked-rotor';
  const candidate = {
    ...current,
    parameters,
    gridSize: values.gridSize!,
    iterations: values.iterations!,
    sampleEvery: values.sampleEvery!,
    initialState: map ? read(stateText, '초기조건') : [],
    ...(quantum ? { wavefunction: read(wavefunctionText, '파동함수') } : {}),
    ...(current.systemId === 'system:unitary-floquet' ? { matrix: read(matrixText, '행렬') } : {})
  };
  const checked = validateDiscreteConfig(candidate);
  if (!checked.ok) throw new Error(checked.issues.map((issue) => `${issue.path}: ${issue.message}`).join(' '));
  return checked.value;
}
export function createDiscreteInspector(document: Document, model: DiscreteModel, onChange: () => void) {
  const initial = model.state.config,
    id = initial.systemId,
    map = id === 'system:standard-map',
    quantum = id === 'system:quantum-kicked-rotor',
    spectral = id === 'system:unitary-floquet';
  const section = createSection(document, {
    id: 'discrete-inspector',
    title: '실험 조건',
    description:
      '조건을 한 번에 적용합니다. 편집 중에는 실행을 멈추고 마지막 유효한 설정을 보존합니다. 이산 반복 또는 행렬 평가이며 연속 시간 적분기를 사용하지 않습니다.'
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
    const panel = element(document, 'fieldset', 'discrete-panel'),
      grid = element(document, 'div', 'discrete-fields');
    panel.append(element(document, 'legend', '', title), element(document, 'p', 'lab-muted', description), grid);
    section.body.append(panel);
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
      id: `discrete-${key}`,
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
  const parameters = group(
    '모델 계수와 연산',
    '각 계수는 native 정규화 값입니다. internal stepper는 한 번의 사상 반복·킥 주기 또는 한 번의 스펙트럼 평가와 호환됩니다.'
  );
  for (const field of discreteParameterFields(id))
    add(
      parameters,
      field.key,
      field.label,
      field.min,
      field.max,
      initial.parameters[field.key]!,
      '선택한 이산 모델의 native 정규화 계수입니다.'
    );
  const stepper = element(
    document,
    'p',
    'lab-muted',
    spectral ? '호환 연산: internal · 복소 행렬 스펙트럼 평가' : '호환 stepper: internal · 이산 반복'
  );
  stepper.id = 'discrete-stepper';
  parameters.append(stepper);
  const mesh = group(
    quantum ? '운동량 격자' : spectral ? '행렬 차원' : '위상 원통',
    quantum
      ? 'N은 2–512의 2의 거듭제곱입니다. 복소 배열은 native FFT 순서입니다. m은 정수 운동량 인덱스이며 p=ℏm입니다. 격자 변경 시 배열 길이도 맞추세요.'
      : spectral
        ? '실수·허수 블록이 같은 크기의 2–8 정방 행렬이어야 합니다. 유니터리성을 자동으로 보정하지 않습니다.'
        : 'θ는 한 바퀴 주기로 wrapping하며 p는 wrapping 없이 누적합니다. 점을 선으로 연결하지 않아 원통 이음선을 가로지르는 가짜 궤적을 피합니다.'
  );
  add(
    mesh,
    'gridSize',
    quantum ? '격자 크기 N (정수)' : spectral ? '행렬 차원 N (정수)' : '상태 차원 (고정)',
    quantum || spectral ? 2 : initial.gridSize,
    quantum ? MAX_DISCRETE_GRID : spectral ? MAX_DISCRETE_MATRIX : initial.gridSize,
    initial.gridSize,
    quantum
      ? '2의 거듭제곱만 지원합니다. 준에너지 계산은 같은 N≤8 격자에만 제공됩니다.'
      : '입력 배열과 일치해야 합니다.'
  );
  if (!map)
    mesh.append(
      createButton(document, {
        label: '차원 예제 적용',
        variant: 'secondary',
        onClick() {
          const parsed = controls.get('gridSize')!.read();
          if (!parsed.ok) return;
          try {
            model.configure(resizeDiscreteConfig(model.state.config, parsed.quantity.value));
            sync();
            onChange();
            notice.textContent = '입력한 차원에 맞는 native 예제를 적용했습니다. 다른 미적용 편집은 취소했습니다.';
          } catch (cause) {
            fail(cause);
          }
        }
      })
    );
  const native = group(
    spectral ? '복소 Floquet 연산자' : '초기 상태',
    map
      ? '[θ, p] JSON 배열입니다. θ 단위는 rad, p는 정규화 운동량입니다.'
      : quantum
        ? '{"re":[…],"im":[…]} JSON입니다. 실제 허수 성분과 norm을 그대로 보존하며 자동 재정규화하지 않습니다. norm은 Σ|ψ|²입니다.'
        : '{"re":[[…]],"im":[[…]]} JSON입니다. 입력 행렬의 고유값을 단위원으로 투영하지 않습니다. 결함과 단위원 이탈을 함께 확인하세요.'
  );
  function text(key: string, label: string) {
    const caption = element(document, 'label', 'ds-field__label', label),
      input = element(document, 'textarea', 'ds-field__control discrete-json');
    input.id = `discrete-${key}`;
    caption.htmlFor = input.id;
    input.maxLength = 100000;
    input.addEventListener('input', edited);
    native.append(caption, input);
    return { caption, input };
  }
  const state = text('initialState', '초기조건 JSON 배열 [θ, p]'),
    wavefunction = text('wavefunction', '복소 파동함수 JSON {re, im}'),
    matrix = text('matrix', '복소 행렬 JSON {re, im}');
  state.caption.hidden = state.input.hidden = !map;
  wavefunction.caption.hidden = wavefunction.input.hidden = !quantum;
  matrix.caption.hidden = matrix.input.hidden = !spectral;
  const runtime = group(
    '실행 조건',
    spectral
      ? '스펙트럼은 한 번 평가합니다. 반복 수와 기록 간격은 행렬 평가에 적용하지 않습니다.'
      : '반복 수는 양의 정수입니다. 기록 간격은 반복 단위이며 메모리 한도에 따라 더 커질 수 있습니다. 중간 미기록 반복은 CSV에 포함하지 않습니다.'
  );
  add(
    runtime,
    'iterations',
    '반복 수 (정수)',
    1,
    MAX_DISCRETE_STEPS,
    initial.iterations,
    '초기 iteration 이후 전진할 반복 수입니다.'
  );
  add(
    runtime,
    'sampleEvery',
    '기록 간격 (반복 수, 정수)',
    1,
    MAX_DISCRETE_STEPS,
    initial.sampleEvery ?? 1,
    '현재·마지막 상태는 예정 기록 간격 밖에서도 보존합니다.'
  );
  if (spectral) for (const key of ['iterations', 'sampleEvery']) controls.get(key)!.element.hidden = true;
  const origin = element(document, 'p', 'lab-muted');
  origin.id = 'discrete-startIteration';
  runtime.append(origin);
  const actions = element(document, 'div', 'lab-inline-actions');
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
          applyDiscreteDraft(
            model.state.config,
            values,
            state.input.value,
            wavefunction.input.value,
            matrix.input.value
          )
        );
        sync();
        onChange();
        notice.textContent = '조건을 적용했습니다. 초기 상태부터 다시 실행할 수 있습니다.';
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
    const config = model.state.config,
      values: Record<string, number> = {
        ...config.parameters,
        gridSize: config.gridSize,
        iterations: config.iterations,
        sampleEvery: config.sampleEvery ?? 1
      };
    for (const [key, control] of controls) control.setValue(values[key]!);
    state.input.value = JSON.stringify(config.initialState);
    wavefunction.input.value = JSON.stringify(config.wavefunction ?? { re: [], im: [] });
    matrix.input.value = JSON.stringify(config.matrix ?? { re: [], im: [] });
    origin.textContent = `시작 iteration ${config.startIteration ?? 0}. 복소 상태 JSON 복원은 이 iteration과 실제 복소 상태에서 이어갑니다.`;
    error.hidden = true;
    syncing = false;
    update();
  }
  function update() {
    const busy = model.state.status === 'running' || model.state.busy;
    for (const control of section.element.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement
    >('input,select,button,textarea'))
      control.disabled = busy;
    undo.disabled = busy || !dirty;
    controls.get('gridSize')!.input.disabled = busy || map;
    if (spectral) for (const key of ['iterations', 'sampleEvery']) controls.get(key)!.input.disabled = true;
    warning.textContent = discreteWarnings(model.state.config).join(' ');
  }
  sync();
  return { element: section.element, sync, update };
}
