import { arrheniusMTTF } from '../../../physics/kramersEscape';
import {
  acousticSoundSpeed,
  diatomicBandGap,
  diatomicDispersionCurve,
  diatomicGroupVelocity
} from '../../../physics/latticeDispersion';
import { peierlsNabarroBarrier, relaxFrenkelKontorovaKink } from '../../../physics/sineGordon';
import { element } from '../../app/dom';
import { createButton, createInput, createSection } from '../../design-system/primitives';

export type FieldDiagnosticId = 'diatomic' | 'pinning' | 'arrhenius';
interface DiagnosticField {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
}
interface DiagnosticDefinition {
  readonly id: FieldDiagnosticId;
  readonly title: string;
  readonly caveat: string;
  readonly fields: readonly DiagnosticField[];
}
export interface FieldDiagnosticResult {
  readonly diagnostic: FieldDiagnosticId;
  readonly settings: Readonly<Record<string, number>>;
  readonly source: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly number[])[];
  readonly summary: readonly string[];
}
/** Diagnostic settings are independent of canonical experiment state. Numeric limits have explicit JSON tokens. */
export function serializeFieldDiagnosticArtifact(result: FieldDiagnosticResult): string {
  return `${JSON.stringify(
    {
      schemaVersion: 'pendulum-field-diagnostic/v1',
      algorithmVersion: 'field-diagnostic-native-v1',
      scope: 'independent-native-diagnostic',
      diagnostic: result.diagnostic,
      settings: result.settings,
      settingsUnits: Object.fromEntries(definitions[result.diagnostic].fields.map((field) => [field.key, field.unit])),
      source: result.source,
      columns: result.columns,
      rows: result.rows.map((row) =>
        row.map((value) =>
          Number.isFinite(value)
            ? value
            : value === Infinity
              ? 'positive-infinity'
              : value === -Infinity
                ? 'negative-infinity'
                : 'not-a-number'
        )
      ),
      numericLimitEncoding: 'nonfinite numbers use explicit string tokens; they are not null or finite measurements',
      summary: result.summary
    },
    null,
    2
  )}\n`;
}
const definitions: Readonly<Record<FieldDiagnosticId, DiagnosticDefinition>> = {
  diatomic: {
    id: 'diatomic',
    title: '이원자 조화 분산',
    caveat:
      '독립적인 선형 이원자 사슬의 SI 설정입니다. 위의 단원자 정규화 고리 실행에서 자동 추정하지 않습니다. a는 두 원자 cell의 길이입니다. 비선형·결함 격자의 시간 전파를 계산하지 않습니다.',
    fields: [
      { key: 'massA', label: 'A 질량', unit: 'kg', value: 1, min: 0.01, max: 100 },
      { key: 'massB', label: 'B 질량', unit: 'kg', value: 2, min: 0.01, max: 100 },
      { key: 'forceConstant', label: '인접 spring 상수 C', unit: 'N/m', value: 1, min: 0.01, max: 100 },
      { key: 'latticeConstant', label: '두 원자 cell 길이 a', unit: 'm', value: 1, min: 0.01, max: 100 },
      { key: 'onsiteOmegaSq', label: '기판 각진동수 제곱', unit: 's⁻²', value: 0, min: 0, max: 100 },
      { key: 'samples', label: '파수 표본 수', unit: '개', value: 32, min: 2, max: 128, integer: true }
    ]
  },
  pinning: {
    id: 'pinning',
    title: 'FK 정적 pinning 에너지 비교',
    caveat:
      '독립적인 고정 0→2π 사슬에서 site/bond 중심 native Newton 정상점을 비교합니다. 홀수 site 수를 사용합니다. 정상점은 saddle일 수 있으며 차이는 구동 탈고정 힘·이동도 측정이 아닙니다. 반복 제한의 native 잔차는 마지막 update 이전 값일 수 있어 수렴 판단은 보수적입니다.',
    fields: [
      { key: 'coupling', label: '상대 결합 K', unit: '정규화', value: 1, min: 0.01, max: 20 },
      { key: 'sites', label: '사슬 site 수', unit: '홀수 개', value: 81, min: 5, max: 127, integer: true },
      { key: 'maxIterations', label: 'Newton 최대 반복', unit: '회', value: 100, min: 1, max: 200, integer: true },
      { key: 'tolerance', label: '기울기 허용치', unit: '정규화', value: 1e-9, min: 1e-12, max: 0.01 }
    ]
  },
  arrhenius: {
    id: 'arrhenius',
    title: 'Arrhenius 탈출 시간',
    caveat:
      '독립적인 정규화 장벽·시도율을 입력하는 native 근사식입니다. 위의 관성 확률 진자에서 장벽이나 시도율을 추정하지 않으며 탈출 경로·최적 잡음을 계산하지 않습니다. 활성화 에너지와 kT는 같은 에너지 단위를 사용하세요. 0/∞는 부동소수점 한계이며 유한한 물리량의 인증이 아닙니다.',
    fields: [
      { key: 'attemptRate', label: '시도율 r₀', unit: '정규화 시간⁻¹', value: 1, min: 1e-12, max: 1e12 },
      { key: 'activationEnergy', label: '활성화 에너지 Eₐ', unit: '정규화 에너지', value: 0.25, min: 0, max: 1e6 },
      { key: 'kT', label: '열 에너지 kT', unit: '같은 정규화 에너지', value: 0.05, min: 1e-12, max: 1e6 }
    ]
  }
};
export function fieldDiagnosticDefinition(systemId: string): DiagnosticDefinition | undefined {
  const id =
    systemId === 'system:lattice-fk-limit'
      ? 'diatomic'
      : systemId === 'system:frenkel-kontorova'
        ? 'pinning'
        : systemId === 'system:langevin'
          ? 'arrhenius'
          : undefined;
  return id ? definitions[id] : undefined;
}
export function defaultFieldDiagnosticSettings(id: FieldDiagnosticId): Record<string, number> {
  return Object.fromEntries(definitions[id].fields.map((f) => [f.key, f.value]));
}
const format = (value: number) => (value === Infinity ? '∞ (수치 상한)' : value === 0 ? '0' : value.toPrecision(9));
/** Independent bounded diagnostics call native public APIs without altering a running experiment. */
export function evaluateFieldDiagnostic(
  id: FieldDiagnosticId,
  values: Readonly<Record<string, number>>
): FieldDiagnosticResult {
  const definition = definitions[id];
  if (
    Object.keys(values).length !== definition.fields.length ||
    Object.keys(values).some((k) => !definition.fields.some((f) => f.key === k))
  )
    throw new Error('진단 설정의 모든 항목을 입력하세요.');
  for (const f of definition.fields) {
    const value = values[f.key];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < f.min ||
      value > f.max ||
      (f.integer && !Number.isInteger(value))
    )
      throw new Error(`${f.label}: ${f.min}–${f.max} ${f.unit} 범위를 확인하세요.`);
  }
  const settings = { ...values };
  if (id === 'diatomic') {
    const { samples: _samples, ...params } = values,
      p = {
        massA: params.massA!,
        massB: params.massB!,
        forceConstant: params.forceConstant!,
        latticeConstant: params.latticeConstant!,
        onsiteOmegaSq: params.onsiteOmegaSq!
      },
      curve = diatomicDispersionCurve(p, values.samples!),
      gap = diatomicBandGap(p),
      k = Math.PI / (2 * p.latticeConstant),
      acousticGroup = diatomicGroupVelocity(k, p, 'acoustic'),
      opticalGroup = diatomicGroupVelocity(k, p, 'optical');
    return {
      diagnostic: id,
      settings,
      source: 'diatomicDispersionCurve / diatomicBandGap / diatomicGroupVelocity',
      columns: ['k (m⁻¹)', 'ω acoustic (rad/s)', 'ω optical (rad/s)'],
      rows: curve.map((row) => [row.k, row.acoustic, row.optical]),
      summary: [
        `음향 band 상한 ${format(gap.acousticTop)} rad/s · 광학 band 하한 ${format(gap.opticalBottom)} rad/s · gap ${format(gap.gap)} rad/s`,
        `k=π/(2a)에서 group velocity: 음향 ${format(acousticGroup)} m/s · 광학 ${format(opticalGroup)} m/s (native 중앙 차분 h=10⁻⁶ m⁻¹)`,
        p.onsiteOmegaSq === 0
          ? `긴 파장 sound speed ${format(acousticSoundSpeed(p))} m/s`
          : '기판 pinning이 있어 native unpinned sound-speed 공식을 적용하지 않습니다.'
      ]
    };
  }
  if (id === 'pinning') {
    if (values.sites! % 2 !== 1) throw new Error('site 중심과 bond 중심을 구별하려면 홀수 site 수가 필요합니다.');
    const options = { sites: values.sites!, maxIterations: values.maxIterations!, tolerance: values.tolerance! },
      site = relaxFrenkelKontorovaKink(values.coupling!, { ...options, centerOffset: 0 }),
      bond = relaxFrenkelKontorovaKink(values.coupling!, { ...options, centerOffset: 0.5 }),
      barrier = peierlsNabarroBarrier(values.coupling!, options),
      witnesses = [barrier.siteEnergy, barrier.bondEnergy, barrier.barrier, site.gradNorm, bond.gradNorm];
    if (!witnesses.every(Number.isFinite))
      throw new Error('Newton 계산이 유한한 진단을 반환하지 않았습니다. 결합·격자·반복 수를 조정하세요.');
    const converged = site.gradNorm < values.tolerance! && bond.gradNorm < values.tolerance!;
    return {
      diagnostic: id,
      settings,
      source: 'peierlsNabarroBarrier / relaxFrenkelKontorovaKink',
      columns: ['중심 (0=site,1=bond)', '에너지 (정규화)', 'native 기울기 잔차', '반복 수'],
      rows: [
        [0, barrier.siteEnergy, site.gradNorm, site.iterations],
        [1, barrier.bondEnergy, bond.gradNorm, bond.iterations]
      ],
      summary: [
        `|E bond−E site| = ${format(barrier.barrier)} (정규화 에너지)`,
        converged
          ? '두 native 잔차가 허용치보다 작습니다. 정상점의 동적 안정성을 증명하지 않습니다.'
          : '수렴 미확인: 두 중심 모두 허용치에 도달했는지 추가 검사가 필요합니다. 에너지 차이를 확정 장벽으로 해석하지 마세요.'
      ]
    };
  }
  const time = arrheniusMTTF(values.attemptRate!, values.activationEnergy!, values.kT!);
  if (Number.isNaN(time)) throw new Error('탈출 시간이 정의되지 않았습니다. 입력 범위를 확인하세요.');
  return {
    diagnostic: id,
    settings,
    source: 'arrheniusMTTF',
    columns: ['평균 탈출 시간 (정규화)'],
    rows: [[time]],
    summary: [
      time === Infinity
        ? '평균 탈출 시간 ∞: 지수식이 부동소수점 상한을 넘었습니다. 실제 무한 대기 시간의 증명이 아닙니다.'
        : time === 0
          ? '평균 탈출 시간 0: 수치 표현 한계입니다.'
          : `평균 탈출 시간 ${format(time)} (정규화 시간)`
    ]
  };
}
export function createFieldDiagnostics(document: Document, systemId: string): HTMLElement {
  const definition = fieldDiagnosticDefinition(systemId);
  if (!definition) return element(document, 'div', '');
  const section = createSection(document, {
      id: `field-diagnostic-${definition.id}`,
      title: definition.title,
      headingLevel: 3
    }),
    form = element(document, 'div', 'lab-inspector-grid'),
    result = element(document, 'pre', 'lab-data-output'),
    error = element(document, 'p', 'ds-field__error'),
    description = element(document, 'p', 'lab-muted', definition.caveat),
    controls = definition.fields.map((f) => {
      const input = createInput(document, {
        id: `field-diagnostic-${definition.id}-${f.key}`,
        label: `${f.label} (${f.unit})`,
        type: 'number',
        value: String(f.value),
        help: `${f.min}–${f.max}${f.integer ? ' 정수' : ''}`
      });
      input.input.min = String(f.min);
      input.input.max = String(f.max);
      input.input.step = f.integer ? '1' : 'any';
      form.append(input.element);
      return { ...input, field: f };
    });
  let lastResult: FieldDiagnosticResult | undefined;
  const download = createButton(document, {
    label: `${definition.title} JSON 다운로드`,
    variant: 'secondary',
    disabled: true,
    onClick() {
      if (!lastResult) return;
      const browserUrl = document.defaultView?.URL ?? URL,
        url = browserUrl.createObjectURL(
          new Blob([serializeFieldDiagnosticArtifact(lastResult)], { type: 'application/json' })
        ),
        anchor = element(document, 'a', '');
      anchor.href = url;
      anchor.download = `pendulum-${definition.id}-diagnostic.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => browserUrl.revokeObjectURL(url), 1000);
    }
  });
  error.setAttribute('role', 'alert');
  error.hidden = true;
  result.setAttribute('aria-live', 'polite');
  result.setAttribute('aria-label', `${definition.title} 결과`);
  result.tabIndex = 0;
  const calculate = () => {
    try {
      const values = Object.fromEntries(
          controls.map((c) => {
            if (!c.input.value.trim()) throw new Error(`${c.field.label} 값을 입력하세요.`);
            return [c.field.key, Number(c.input.value)];
          })
        ),
        next = evaluateFieldDiagnostic(definition.id, values);
      lastResult = next;
      download.disabled = false;
      result.textContent = [
        ...next.summary,
        `기존 계산 경계: ${next.source}`,
        next.columns.join(' | '),
        ...next.rows.map((row) => row.map(format).join(' | '))
      ].join('\n');
      error.hidden = true;
      error.textContent = '';
      controls.forEach((c) => c.setError(''));
    } catch (cause) {
      error.textContent = `${cause instanceof Error ? cause.message : '진단 계산에 실패했습니다.'} 마지막 유효 결과를 유지합니다.`;
      error.hidden = false;
    }
  };
  section.body.append(
    description,
    form,
    createButton(document, { label: `${definition.title} 계산`, variant: 'secondary', onClick: calculate }),
    download,
    error,
    result
  );
  calculate();
  return section.element;
}
