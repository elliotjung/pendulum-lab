import { element } from '../../app/dom';
import type { ExperimentStateV1 } from '../../contracts/experiment';
import type { ObservationArtifact } from '../../observations/types';
import { defaultInverseSettings } from '../../adapters/analysis/inverse/settings';
import { INVERSE_LIMITS, type EstimateSettings, type UqSettings } from '../../adapters/analysis/inverse/contracts';
import { builderFields } from '../experiments/builders';
import { batchMetricMetadata } from '../experiments/metadata';
import { batchFieldId, batchFieldLabel } from '../experiments/settings';
import { numberField, readNumber, selectField, textField } from './controls';

export function createWorkflowSettings(document: Document, changed: () => void) {
  const root = element(document, 'fieldset', 'research-settings');
  root.append(element(document, 'legend', '', '3. 추정 또는 불확실성 계산'));
  const kind = selectField(document, root, 'kind', '계산 유형', [
    ['estimate', '관측에서 매개변수 추정'],
    ['sobol', 'Sobol 1차·총효과'],
    ['pce', 'PCE 대리모델 · 독립 검증']
  ]);
  const assumptions = element(document, 'p', 'lab-preview-note');
  const fields = element(document, 'div', 'research-grid');
  root.append(assumptions, fields);
  let source: ExperimentStateV1 | undefined;
  let loaded: EstimateSettings | UqSettings | undefined;
  let readSettings: ((observation?: ObservationArtifact) => EstimateSettings | UqSettings) | undefined;
  function render() {
    fields.replaceChildren();
    if (!source) {
      readSettings = undefined;
      return;
    }
    if (kind.value === 'estimate') {
      assumptions.textContent =
        '기존 이중진자 추정기를 사용합니다. 현재 대상은 system:double · RK4 · 시작시간 0입니다. 관측 시간은 모델 시간과 일치해야 하며 초기 각도·각속도는 알려진 값입니다. 질량의 공통 배율은 각도만으로 식별할 수 없습니다. 국소 최적화·유한 잔차는 유일해나 posterior 신뢰구간을 보장하지 않습니다.';
      const parameterOptions = [
        ['g', '중력가속도 g (m/s²)'],
        ['l1', '첫 막대 길이 l1 (m)'],
        ['l2', '둘째 막대 길이 l2 (m)'],
        ['m1', '첫 질량 m1 (kg)'],
        ['m2', '둘째 질량 m2 (kg)']
      ] as const;
      const defaults = loaded?.kind === 'estimate' ? loaded : undefined;
      const count = numberField(
        document,
        fields,
        'fit-count',
        '추정할 매개변수 수',
        defaults?.parameters.length ?? 1,
        '1–3개. 질량 공통 배율처럼 식별할 수 없는 조합을 확인하세요.'
      );
      const parameters = Array.from({ length: 3 }, (_, i) => {
        const group = element(document, 'fieldset', 'research-grid');
        group.append(element(document, 'legend', '', `추정 매개변수 ${i + 1}`));
        const suffix = i ? `-${i}` : '';
        const key = selectField(
          document,
          group,
          `fit-parameter${suffix}`,
          `추정할 매개변수 ${i + 1}`,
          parameterOptions
        );
        const previous = defaults?.parameters[i];
        key.value = previous?.key ?? (i === 0 ? 'g' : i === 1 ? 'l1' : 'l2');
        const min = numberField(
          document,
          group,
          `fit-min${suffix}`,
          `추정 범위 ${i + 1} 하한 · 표시된 SI 단위`,
          previous?.min ?? 0.1
        );
        const max = numberField(
          document,
          group,
          `fit-max${suffix}`,
          `추정 범위 ${i + 1} 상한 · 표시된 SI 단위`,
          previous?.max ?? 30
        );
        fields.append(group);
        return { group, key, min, max };
      });
      const visibility = () =>
        parameters.forEach((parameter, i) => {
          parameter.group.hidden = i >= Number(count.value);
        });
      count.addEventListener('input', visibility);
      visibility();
      const iterations = numberField(
        document,
        fields,
        'fit-iterations',
        '최대 최적화 반복 수',
        defaults?.maxIterations ?? 30,
        `범위 1–${INVERSE_LIMITS.iterations}. 오차 함수의 유한 차분과 반복마다 기존 엔진을 실행합니다.`
      );
      readSettings = (observation) => {
        if (!observation) throw new Error('관측 미리보기를 확인한 뒤 가져오기를 확정하세요.');
        const number = readNumber(count);
        if (!Number.isInteger(number) || number < 1 || number > 3)
          throw new Error('추정 매개변수 수는 1–3 정수여야 합니다.');
        return {
          kind: 'estimate',
          observation,
          parameters: parameters.slice(0, number).map(({ key, min, max }) => ({
            key: key.value as EstimateSettings['parameters'][number]['key'],
            min: readNumber(min),
            max: readNumber(max)
          })),
          maxIterations: readNumber(iterations)
        };
      };
    } else {
      const method = kind.value as 'sobol' | 'pce';
      const defaults = loaded?.kind === method ? loaded : defaultInverseSettings(source, method);
      const available = builderFields(source);
      assumptions.textContent =
        method === 'sobol'
          ? '선택한 입력은 서로 독립인 균일분포입니다. 원래 공용 엔진으로 Saltelli/Jansen 표본 N×(변수 수+2)를 평가합니다. 유한 표본의 음수·1 초과 지수도 보존하며 수렴과 상호작용을 확인하세요. 신뢰구간·상관 입력 분해는 제공하지 않습니다.'
          : '선택한 입력은 서로 독립인 균일분포입니다. 기존 정규화 Legendre PCE를 LHS 훈련 표본에 적합하고 별도 검증 표본으로 오차를 평가합니다. 훈련 R²만으로 예측 성능을 판단하지 마세요. 표본 수·차수·조건수를 확인하며 범위 밖 예측은 하지 않습니다.';
      const samples = numberField(
        document,
        fields,
        'uq-samples',
        method === 'sobol' ? 'Sobol 기본 표본 수 N' : 'PCE 훈련 표본 수',
        defaults.samples,
        `8–${INVERSE_LIMITS.samples}. 검증·표본 평가를 포함한 전체 비용 상한을 검사합니다.`
      );
      const degree = numberField(
        document,
        fields,
        'uq-degree',
        'PCE 최대 다항식 차수',
        defaults.degree,
        'PCE에서만 사용합니다. 차수가 높을수록 필요한 기저와 훈련 표본이 증가합니다.'
      );
      degree.closest<HTMLElement>('.ds-field')!.hidden = method !== 'pce';
      const seed = textField(document, fields, 'uq-seed', 'PCE 표본 설계 seed', defaults.seed);
      seed.closest<HTMLElement>('.ds-field')!.hidden = method !== 'pce';
      const metadata = batchMetricMetadata(source);
      const metric = selectField(
        document,
        fields,
        'uq-metric',
        '요약할 출력 성분',
        metadata.labels.map((label, index) => [String(index), `${label} (${metadata.units[index]})`])
      );
      const statistic = selectField(document, fields, 'uq-statistic', '출력 요약 통계', [
        ['final', '마지막 값'],
        ['mean', '기록 표본 산술평균'],
        ['rms', '기록 표본 RMS']
      ]);
      metric.value = String(defaults.metric.index);
      statistic.value = defaults.metric.statistic;
      const count = numberField(
        document,
        fields,
        'uq-count',
        '불확실한 변수 수',
        Math.max(1, defaults.variables.length),
        `1–${INVERSE_LIMITS.variables}. 숨겨진 변수는 계산에 포함하지 않습니다.`
      );
      const axes = Array.from({ length: INVERSE_LIMITS.variables }, (_, i) => {
        const group = element(document, 'fieldset', 'research-grid');
        group.append(element(document, 'legend', '', `입력 변수 ${i + 1}`));
        const selection = selectField(
          document,
          group,
          `uq-field-${i}`,
          `변수 ${i + 1} · 이름과 단위`,
          available.map((field) => [batchFieldId(field), batchFieldLabel(field)])
        );
        const initial = defaults.variables[i] ?? defaults.variables[0];
        if (initial) selection.value = batchFieldId(initial);
        const min = numberField(document, group, `uq-min-${i}`, `변수 ${i + 1} 균일분포 하한`, initial?.min ?? 0);
        const max = numberField(document, group, `uq-max-${i}`, `변수 ${i + 1} 균일분포 상한`, initial?.max ?? 1);
        selection.addEventListener('change', () => {
          const field = available.find((entry) => batchFieldId(entry) === selection.value);
          if (field) {
            min.value = String(field.value - 0.01);
            max.value = String(field.value + 0.01);
          }
        });
        fields.append(group);
        return { group, selection, min, max };
      });
      function visibility() {
        axes.forEach((axis, i) => {
          axis.group.hidden = i >= Number(count.value);
        });
      }
      count.addEventListener('input', visibility);
      visibility();
      readSettings = () => {
        const number = readNumber(count);
        if (!Number.isInteger(number) || number < 1 || number > INVERSE_LIMITS.variables)
          throw new Error(`불확실한 변수 수는 1–${INVERSE_LIMITS.variables} 정수여야 합니다.`);
        return {
          ...defaults,
          kind: method,
          samples: readNumber(samples),
          degree: readNumber(degree),
          seed: seed.value,
          metric: { index: Number(metric.value), statistic: statistic.value as UqSettings['metric']['statistic'] },
          variables: axes.slice(0, number).map((axis) => {
            const field = available.find((entry) => batchFieldId(entry) === axis.selection.value);
            if (!field) throw new Error('현재 시스템에 없는 입력 변수입니다.');
            return {
              group: field.group,
              key: field.key,
              ...(field.index === undefined ? {} : { index: field.index }),
              min: readNumber(axis.min),
              max: readNumber(axis.max)
            };
          })
        };
      };
    }
  }
  kind.addEventListener('change', () => {
    loaded = undefined;
    render();
  });
  root.addEventListener('input', changed);
  root.addEventListener('change', changed);
  return {
    element: root,
    sync(experiment: ExperimentStateV1, settings?: EstimateSettings | UqSettings) {
      source = structuredClone(experiment);
      loaded = settings ? structuredClone(settings) : undefined;
      if (settings) kind.value = settings.kind;
      else if (
        experiment.systemId !== 'system:double' ||
        experiment.integrator.kind !== 'selectable' ||
        experiment.integrator.id !== 'integrator:rk4' ||
        experiment.runtime.domain !== 'time' ||
        experiment.runtime.start.value !== 0
      )
        kind.value = 'sobol';
      render();
    },
    getSettings(observation?: ObservationArtifact) {
      if (!readSettings) throw new Error('현재 실험 설정을 먼저 읽으세요.');
      return readSettings(observation);
    },
    setDisabled(value: boolean) {
      root.disabled = value;
    }
  };
}
