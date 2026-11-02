import { element } from '../../app/dom';
import { createButton, createInput } from '../../design-system/primitives';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import { catalog } from '../../catalog';
import {
  BATCH_KINDS,
  BATCH_LIMITS,
  type BatchAxis,
  type BatchBuilderSettings,
  type BatchField,
  type BatchKind
} from './contracts';
import { builderFields, compatibleBatchIntegrators, defaultBatchSettings } from './builders';

export const batchKindNames: Record<BatchKind, string> = {
  paired: '두 조건 비교',
  grid: '선형 격자 sweep',
  log: '로그 격자 sweep',
  lhs: 'Latin hypercube sweep',
  ensemble: 'Seed ensemble',
  integrators: '적분기 비교'
};

export const batchKindHelp: Record<BatchKind, string> = {
  paired:
    '원래 실험을 대조군으로 두고 선택한 변수 하나의 끝값만 바꿉니다. 나머지 물성·초기조건·seed·실행 기간은 같습니다. 차이는 인과성이나 수치 정확도의 증명이 아닙니다.',
  grid: '각 변수의 시작·끝을 포함하는 등간격 격자의 모든 조합을 실행합니다. 전체 run 수는 축별 점 수의 곱입니다. 해상도를 높여 요약값의 수렴을 확인하세요.',
  log: '양의 시작·끝 사이를 로그 간격으로 나눕니다. 각 변수 격자의 모든 조합을 실행하며 0과 음수는 사용할 수 없습니다. 넓은 스케일을 탐색할 때 사용하세요.',
  lhs: '각 변수 구간을 run 수만큼 층화한 뒤 seed로 섞고 각 층에서 한 점을 뽑습니다. 유한 표본은 결합 분포나 희귀 현상을 보장하지 않습니다.',
  ensemble:
    '독립 seed를 가진 run을 반복합니다. 변수를 추가하면 해당 구간의 독립 균일분포를 표본화합니다. 확률계 이외에서는 같은 입력이 같은 결과를 낼 수 있습니다. 집계는 표본 통계이며 신뢰구간이 아닙니다.',
  integrators:
    '현재 adapter가 실제 지원하는 방법만 선택합니다. 동일 초기조건·seed·기간·step을 사용합니다. 방법 간 차이는 참해 오차가 아니며 step을 줄이는 독립 수렴 검사가 필요합니다.'
};

export function batchFieldId(field: Pick<BatchField, 'group' | 'key' | 'index'>): string {
  return `${field.group}:${field.key}${field.index === undefined ? '' : `:${field.index}`}`;
}

export function batchFieldLabel(field: BatchField): string {
  return `${field.group === 'parameters' ? '물성' : '초기조건'} · ${field.key}${field.index === undefined ? '' : `[${field.index}]`} (${field.unit})`;
}

function numeric(text: string): number {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) ? Number(text) : NaN;
}

export function createBatchSettings(document: Document, onChange: () => void) {
  const root = element(document, 'div', 'batch-settings');
  const label = element(document, 'label', 'ds-field__label', '다중 실험 유형');
  label.htmlFor = 'batch-kind';
  const kind = element(document, 'select', 'ds-field__control');
  kind.id = label.htmlFor;
  for (const id of BATCH_KINDS) {
    const option = element(document, 'option', '', batchKindNames[id]);
    option.value = id;
    kind.append(option);
  }
  const help = element(document, 'p', 'lab-preview-note');
  help.id = 'batch-method-help';
  kind.setAttribute('aria-describedby', help.id);
  const common = element(document, 'div', 'batch-common');
  const axes = element(document, 'div', 'batch-axes');
  const add = createButton(document, { label: '변수 추가', variant: 'secondary', onClick: addAxis });
  const integrators = element(document, 'fieldset', 'batch-integrators');
  const rejection = element(document, 'p', 'lab-preview-note');
  rejection.id = 'batch-integrator-rejection';
  root.append(label, kind, help, common, axes, add, integrators, rejection);
  let settings: BatchBuilderSettings | undefined;
  let fields: readonly BatchField[] = [];
  let choices: readonly string[] = [];
  let disabled = false;
  function changed(next: BatchBuilderSettings) {
    settings = next;
    onChange();
  }
  function renderCommon() {
    if (!settings) return;
    common.replaceChildren();
    const count = createInput(document, {
      id: 'batch-count',
      label: 'Run 수',
      value: String(settings.count),
      type: 'number',
      help: `범위 2–${BATCH_LIMITS.runs} 정수. LHS와 ensemble에서 사용하는 반복 수입니다. 격자는 축별 점 수로 정합니다.`,
      onInput: (value) => changed({ ...settings!, count: numeric(value) })
    });
    count.input.min = '2';
    count.input.max = String(BATCH_LIMITS.runs);
    count.input.step = '1';
    count.element.hidden = !['lhs', 'ensemble'].includes(settings.kind);
    const seed = createInput(document, {
      id: 'batch-seed',
      label: '표본 설계 seed',
      value: settings.seed,
      help: '같은 전체 설정과 seed는 같은 표본·run 순서를 만듭니다. 원래 시스템의 생성기 버전은 각 run에 보존합니다.',
      onInput: (value) => changed({ ...settings!, seed: value })
    });
    seed.element.hidden = !['lhs', 'ensemble'].includes(settings.kind);
    const concurrency = createInput(document, {
      id: 'batch-concurrency',
      label: '동시 실행 수',
      value: String(settings.concurrency),
      type: 'number',
      help: `범위 1–${BATCH_LIMITS.concurrency} 정수. worker 개수를 제한합니다. 실행 완료 순서가 달라도 입력 순서와 집계는 같습니다.`,
      onInput: (value) => changed({ ...settings!, concurrency: numeric(value) })
    });
    concurrency.input.min = '1';
    concurrency.input.max = String(BATCH_LIMITS.concurrency);
    concurrency.input.step = '1';
    common.append(count.element, seed.element, concurrency.element);
  }
  function renderAxes() {
    if (!settings) return;
    axes.replaceChildren();
    axes.hidden = settings.kind === 'integrators';
    add.hidden = settings.kind === 'integrators' || settings.kind === 'paired';
    settings.axes.forEach((axis, index) => {
      const field = element(document, 'fieldset', 'batch-axis');
      field.append(element(document, 'legend', '', `변수 ${index + 1}`));
      const fieldLabel = element(document, 'label', 'ds-field__label', `변수 ${index + 1} 선택`);
      const select = element(document, 'select', 'ds-field__control');
      select.id = `batch-axis-${index}-field`;
      fieldLabel.htmlFor = select.id;
      for (const candidate of fields) {
        const option = element(document, 'option', '', batchFieldLabel(candidate));
        option.value = batchFieldId(candidate);
        select.append(option);
      }
      select.value = batchFieldId(axis);
      const selected = fields.find((candidate) => batchFieldId(candidate) === select.value);
      const meaning = element(
        document,
        'p',
        'ds-field__help',
        `현재 값 ${selected?.value ?? '없음'} ${selected?.unit ?? ''}. 시작·끝은 이 단위의 SI 값입니다. 각 run은 선택 시스템의 유효 범위 검사를 받습니다.`
      );
      meaning.id = `${select.id}-help`;
      select.setAttribute('aria-describedby', meaning.id);
      select.addEventListener('change', () => {
        const next = fields.find((candidate) => batchFieldId(candidate) === select.value);
        if (!next) return;
        updateAxis(index, {
          group: next.group,
          key: next.key,
          ...(next.index === undefined ? {} : { index: next.index }),
          start: next.value,
          end: next.value,
          count: axis.count
        });
        renderAxes();
        setDisabled(disabled);
      });
      const values = element(document, 'div', 'batch-axis-values');
      for (const key of ['start', 'end', 'count'] as const) {
        const control = createInput(document, {
          id: `batch-axis-${index}-${key}`,
          label: `${key === 'start' ? '시작값' : key === 'end' ? '끝값' : '축별 점 수'}${key === 'count' ? '' : ` (${selected?.unit ?? '1'})`}`,
          value: String(axis[key]),
          type: 'number',
          help:
            key === 'count'
              ? `범위 2–${BATCH_LIMITS.runs} 정수. 선형·로그 격자의 축별 점 수입니다.`
              : key === 'start' && settings!.kind === 'paired'
                ? `대조군은 원래 값 ${selected?.value ?? '없음'}을 사용합니다. 시작값은 두 조건 비교에서 사용하지 않습니다.`
                : settings!.kind === 'log'
                  ? '양의 유한한 수를 입력하세요. 시작·끝 모두 포함합니다.'
                  : '유한한 수를 입력하세요. 원래 시스템의 물성·초기조건 제한을 따릅니다.',
          onInput: (value) => updateAxis(index, { ...settings!.axes[index]!, [key]: numeric(value) })
        });
        if (key === 'count') {
          control.input.min = '2';
          control.input.max = String(BATCH_LIMITS.runs);
          control.input.step = '1';
          control.element.hidden = !['grid', 'log'].includes(settings!.kind);
        } else control.input.step = 'any';
        control.element.hidden ||= key === 'start' && settings!.kind === 'paired';
        values.append(control.element);
      }
      const remove = createButton(document, {
        label: `변수 ${index + 1} 제거`,
        variant: 'secondary',
        onClick: () => {
          changed({ ...settings!, axes: settings!.axes.filter((_, candidate) => candidate !== index) });
          renderAxes();
          setDisabled(disabled);
        }
      });
      remove.hidden = settings!.kind === 'paired' || (settings!.kind !== 'ensemble' && settings!.axes.length <= 1);
      field.append(fieldLabel, select, meaning, values, remove);
      axes.append(field);
    });
    if (!settings.axes.length && settings.kind === 'ensemble')
      axes.append(element(document, 'p', 'lab-muted', '변수 변화 없이 독립 seed만 반복합니다.'));
    add.disabled = disabled || settings.axes.length >= BATCH_LIMITS.axes || settings.axes.length >= fields.length;
  }
  function updateAxis(index: number, axis: BatchAxis) {
    changed({ ...settings!, axes: settings!.axes.map((value, candidate) => (candidate === index ? axis : value)) });
  }
  function addAxis() {
    if (!settings || settings.axes.length >= BATCH_LIMITS.axes) return;
    const field = fields.find(
      (candidate) => !settings!.axes.some((axis) => batchFieldId(axis) === batchFieldId(candidate))
    );
    if (!field) return;
    changed({
      ...settings,
      axes: [
        ...settings.axes,
        {
          group: field.group,
          key: field.key,
          ...(field.index === undefined ? {} : { index: field.index }),
          start: field.value,
          end: field.value,
          count: 3
        }
      ]
    });
    renderAxes();
    setDisabled(disabled);
    document.getElementById(`batch-axis-${settings.axes.length - 1}-field`)?.focus();
  }
  function renderIntegrators() {
    if (!settings) return;
    integrators.replaceChildren(element(document, 'legend', '', '비교할 적분기'));
    integrators.hidden = settings.kind !== 'integrators';
    rejection.hidden = settings.kind !== 'integrators' || choices.length >= 2;
    rejection.textContent =
      '이 시스템의 현재 adapter는 두 가지 이상의 적분기를 제공하지 않습니다. 내부 stepper를 일반 적분기로 바꾸지 않으며, 다른 다중 실험 유형을 선택할 수 있습니다.';
    for (const id of choices) {
      const label = element(document, 'label', '');
      const checkbox = element(document, 'input', '');
      checkbox.type = 'checkbox';
      checkbox.id = `batch-integrators-${id.replace('integrator:', '')}`;
      checkbox.value = id;
      checkbox.checked = settings.integratorIds.includes(id);
      checkbox.addEventListener('change', () =>
        changed({
          ...settings!,
          integratorIds: choices.filter(
            (candidate) => integrators.querySelector<HTMLInputElement>(`input[value="${candidate}"]`)?.checked
          )
        })
      );
      label.append(
        checkbox,
        document.createTextNode(
          catalog.integrators.find((entry) => entry.id === id)?.name.ko ?? id.replace('integrator:', '').toUpperCase()
        )
      );
      integrators.append(label);
    }
  }
  kind.addEventListener('change', () => {
    if (!settings) return;
    const nextKind = kind.value as BatchKind;
    let nextAxes = settings.axes;
    if (nextKind === 'integrators') nextAxes = [];
    if (nextKind === 'paired') nextAxes = nextAxes.slice(0, 1);
    if (!nextAxes.length && nextKind !== 'ensemble' && nextKind !== 'integrators' && fields[0]) {
      const first = fields[0];
      nextAxes = [
        {
          group: first.group,
          key: first.key,
          ...(first.index === undefined ? {} : { index: first.index }),
          start: first.value,
          end: first.value,
          count: 3
        }
      ];
    }
    changed({ ...settings, kind: nextKind, axes: nextAxes });
    render();
  });
  function render() {
    if (!settings) return;
    kind.value = settings.kind;
    help.textContent = batchKindHelp[settings.kind];
    renderCommon();
    renderAxes();
    renderIntegrators();
    setDisabled(disabled);
  }
  function setDisabled(value: boolean) {
    disabled = value;
    for (const control of root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
      'input,select,button'
    ))
      control.disabled = value;
    add.disabled ||= !settings || settings.axes.length >= BATCH_LIMITS.axes || settings.axes.length >= fields.length;
  }
  return {
    element: root,
    sync(experiment: ExperimentStateV1, imported?: BatchBuilderSettings) {
      fields = builderFields(experiment);
      choices = compatibleBatchIntegrators(experiment);
      settings = structuredClone(imported ?? defaultBatchSettings(experiment));
      render();
    },
    getSettings() {
      if (!settings) throw new Error('기준 실험을 먼저 읽으세요.');
      return structuredClone(settings);
    },
    setDisabled
  };
}
