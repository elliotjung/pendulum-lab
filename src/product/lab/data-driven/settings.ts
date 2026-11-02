import { element } from '../../app/dom';
import { createButton } from '../../design-system/primitives';
import {
  learningDefaults,
  type LearningData,
  type LearningSettings
} from '../../adapters/analysis/data-driven/learning-contracts';
import type { EigenOperator, EigenSettings } from '../../adapters/analysis/data-driven/eigen-contracts';
import type { DataDrivenRequest } from '../../adapters/analysis/data-driven/contracts';
import { numberField, readNumber, selectField, textField, textareaField } from './controls';

export const MODEL_METHOD_LABELS = {
  sindy: 'SINDy · 희소 방정식 발견',
  dmd: 'DMD · 선형 관측 모델',
  havok: 'HAVOK · 지연 좌표와 조건부 forcing',
  reservoir: 'Reservoir · seeded ESN',
  hamiltonian: 'Hamiltonian · 정준 구조 제약',
  arnoldi: 'Arnoldi · 일반 희소 연산자',
  lanczos: 'Lanczos · 실대칭 연산자',
  'general-eigensolver': '일반 고유해석 · 작은 밀집 행렬'
} as const;
type Method = keyof typeof MODEL_METHOD_LABELS;
const learningMethod = (method: Method): method is LearningSettings['method'] =>
  ['sindy', 'dmd', 'havok', 'reservoir', 'hamiltonian'].includes(method);
const initialMatrix = {
  kind: 'dense',
  matrix: [
    [4, 0.2, 0, 0],
    [0.2, 3, 0.2, 0],
    [0, 0.2, 2, 0.2],
    [0, 0, 0.2, 1]
  ]
};

export function createModelSettings(document: Document, changed: () => void) {
  const root = element(document, 'fieldset', 'data-model-settings');
  root.append(element(document, 'legend', '', '학습 모델 또는 고유해석 선택'));
  const method = selectField(document, root, 'method', '분석 방법', Object.entries(MODEL_METHOD_LABELS));
  const note = element(document, 'p', 'lab-preview-note');
  const fields = element(document, 'div', 'data-model-grid');
  root.append(note, fields);
  let data: LearningData | undefined;
  let current: DataDrivenRequest['input'] | undefined;
  let read: (() => DataDrivenRequest['input']) | undefined;
  function render() {
    fields.replaceChildren();
    const kind = method.value as Method;
    read = undefined;
    if (learningMethod(kind)) {
      note.textContent =
        kind === 'havok'
          ? '훈련 구간에서만 지연 좌표 기저를 맞춥니다. 검증 forcing을 사용하는 조건부 재구성은 자율 예측이 아닙니다.'
          : kind === 'hamiltonian'
            ? '명시적인 정준 q,p와 단위가 필요합니다. 각속도는 일반적으로 운동량이 아닙니다. 전처리는 none만 허용합니다. 단일 에너지 궤적은 식별성이 부족할 수 있습니다.'
            : '시간 순서대로 분리한 훈련 구간에만 전처리와 모델을 적합합니다. 검증 오차와 자율 rollout을 함께 확인하세요. 관측 데이터는 최소 24표본, HAVOK에는 더 긴 각 구간이 필요합니다.';
      if (!data) {
        fields.append(
          element(
            document,
            'p',
            'lab-muted',
            '현재 실험의 기록 또는 저장 데이터 JSON을 미리 보고 확정하면 학습 조건이 열립니다.'
          )
        );
        return;
      }
      const defaults =
        current?.kind === 'learning' && current.settings.method === kind
          ? current.settings
          : learningDefaults(data, kind);
      const sourceData = data;
      const features = textField(
        document,
        fields,
        'features',
        '선택할 관측 성분 · 0부터 시작하는 인덱스',
        defaults.selection.join(','),
        sourceData.labels.map((label, i) => `${i}: ${label} (${sourceData.units[i]})`).join(' · ')
      );
      const start = numberField(document, fields, 'slice-start', '데이터 slice 시작 · 포함', defaults.sliceStart);
      const end = numberField(document, fields, 'slice-end', '데이터 slice 끝 · 제외', defaults.sliceEnd);
      const split = numberField(
        document,
        fields,
        'split',
        '훈련 끝 / 검증 시작 인덱스',
        defaults.splitIndex,
        '훈련 [시작, 분리), 검증 [분리, 끝). 미분·다음 표본·지연 창이 경계를 넘지 않습니다.'
      );
      const preprocessing = selectField(document, fields, 'preprocessing', '전처리 · 훈련 구간에서만 적합', [
        ['none', 'none · 원 단위 유지'],
        ['standardize', 'standardize · 훈련 평균·표준편차']
      ]);
      preprocessing.value = defaults.preprocessing;
      const seed = textField(document, fields, 'seed', '학습 seed · 모델 계보에 저장', defaults.seed);
      const ridge = numberField(document, fields, 'ridge', 'Ridge 정규화', defaults.ridge);
      ridge.closest<HTMLElement>('.ds-field')!.hidden = kind === 'havok';
      const rollout = numberField(
        document,
        fields,
        'rollout',
        '검증 rollout step 수',
        defaults.rolloutSteps,
        '최대 64. 검증 구간 길이보다 작아야 합니다.'
      );
      let degree: HTMLInputElement | undefined,
        threshold: HTMLInputElement | undefined,
        trig: HTMLSelectElement | undefined;
      let delays: HTMLInputElement | undefined, rank: HTMLInputElement | undefined;
      let reservoirSize: HTMLInputElement | undefined, washout: HTMLInputElement | undefined;
      if (kind === 'sindy' || kind === 'hamiltonian') {
        degree = numberField(
          document,
          fields,
          'degree',
          '다항식 library 최대 차수',
          defaults.polynomialDegree,
          kind === 'hamiltonian' ? '정준 Hamiltonian library: 2–4.' : 'SINDy library: 1–3.'
        );
        trig = selectField(document, fields, 'trig', '삼각함수 library', [
          ['false', '다항식만'],
          ['true', '다항식 + sin/cos']
        ]);
        trig.value = String(defaults.includeTrig);
        if (kind === 'sindy')
          threshold = numberField(document, fields, 'threshold', '희소 계수 threshold', defaults.threshold);
      }
      if (kind === 'havok') {
        delays = numberField(
          document,
          fields,
          'delays',
          'Hankel 지연 수',
          defaults.delays,
          '4–32. 훈련과 검증에 각각 지연 수+4보다 많은 표본이 필요합니다.'
        );
        rank = numberField(
          document,
          fields,
          'rank',
          'HAVOK rank · 마지막 좌표는 forcing',
          defaults.rank,
          '2–6, 지연 수 이하.'
        );
      }
      if (kind === 'reservoir') {
        reservoirSize = numberField(
          document,
          fields,
          'reservoir-size',
          'Reservoir 크기',
          defaults.reservoirSize,
          '4–32. seed로 고정된 reservoir와 ridge readout을 사용합니다.'
        );
        washout = numberField(
          document,
          fields,
          'washout',
          '훈련 washout 표본 수',
          defaults.washout,
          '훈련 시작의 내부 상태 과도구간을 제외합니다.'
        );
      }
      read = () => {
        if (!/^\d+(?:\s*,\s*\d+)*$/.test(features.value.trim()))
          throw new Error('성분 인덱스는 0,1처럼 쉼표로 구분한 정수여야 합니다.');
        return {
          kind: 'learning',
          data: structuredClone(sourceData),
          settings: {
            ...defaults,
            method: kind,
            selection: features.value.split(',').map((v) => Number(v.trim())),
            sliceStart: readNumber(start),
            sliceEnd: readNumber(end),
            splitIndex: readNumber(split),
            preprocessing: preprocessing.value as LearningSettings['preprocessing'],
            seed: seed.value,
            ridge: readNumber(ridge),
            rolloutSteps: readNumber(rollout),
            polynomialDegree: degree ? readNumber(degree) : defaults.polynomialDegree,
            includeTrig: trig ? trig.value === 'true' : defaults.includeTrig,
            threshold: threshold ? readNumber(threshold) : defaults.threshold,
            delays: delays ? readNumber(delays) : defaults.delays,
            rank: rank ? readNumber(rank) : defaults.rank,
            reservoirSize: reservoirSize ? readNumber(reservoirSize) : defaults.reservoirSize,
            washout: washout ? readNumber(washout) : defaults.washout
          }
        };
      };
    } else {
      note.textContent =
        kind === 'lanczos'
          ? 'Lanczos는 실대칭 연산자만 허용합니다. 입력 행렬과 복소 Ritz vector에서 실제 잔차를 다시 계산합니다. 요청 고유쌍 수와 잔차 기준을 모두 만족해야 수렴입니다.'
          : kind === 'arnoldi'
            ? 'Arnoldi는 실수 일반 연산자의 큰 절댓값 고유쌍을 구합니다. native 추정 잔차와 실제 복소 잔차를 구분합니다. 내부 cycle별 잔차는 native API가 제공하지 않습니다.'
            : '일반 밀집 고유해석은 최대 64차 실수 행렬의 전체 복소 고유값을 구합니다. 고유벡터와 Krylov 잔차는 제공하지 않습니다.';
      const defaults: EigenSettings =
        current?.kind === 'eigen' && current.settings.method === kind
          ? current.settings
          : { method: kind, k: 2, krylovDim: 4, maxRestarts: 10, tolerance: 1e-7, seed: 'krylov-1', which: 'LA' };
      const operator = textareaField(
        document,
        fields,
        'operator',
        '연산자 JSON · 밀집 행렬 또는 희소 triplet',
        JSON.stringify(current?.kind === 'eigen' ? current.operator : initialMatrix)
      );
      operator.maxLength = 2 * 1024 * 1024;
      const examples = element(document, 'div', 'lab-inline-actions');
      const example = createButton(document, {
        label: '64차 희소 Laplacian 예제',
        variant: 'secondary',
        onClick: () => {
          const entries = Array.from({ length: 64 }, (_, i) => [
            { row: i, column: i, value: 2 },
            ...(i ? [{ row: i, column: i - 1, value: -1 }] : []),
            ...(i < 63 ? [{ row: i, column: i + 1, value: -1 }] : [])
          ]).flat();
          operator.value = JSON.stringify({ kind: 'sparse', dimension: 64, entries });
          space.value = '24';
          restarts.value = '20';
          changed();
        }
      });
      examples.append(example);
      examples.hidden = kind === 'general-eigensolver';
      fields.append(examples);
      const k = numberField(
        document,
        fields,
        'eigenpairs',
        '요청 고유쌍 수 k',
        defaults.k,
        'Krylov: 1–16, 연산자 차원보다 작아야 합니다.'
      );
      const space = numberField(
        document,
        fields,
        'krylov',
        'Krylov 공간 차수 m',
        defaults.krylovDim,
        'k보다 크고 연산자 차원 이하, 최대 64.'
      );
      const restarts = numberField(
        document,
        fields,
        'restarts',
        '최대 restart 수',
        defaults.maxRestarts,
        '1–40. 계산량 한도를 넘는 설정은 실행 전 거부합니다.'
      );
      const tolerance = numberField(
        document,
        fields,
        'tolerance',
        '실제 잔차 허용오차',
        defaults.tolerance,
        '1e-12–1e-2. 행렬 단위와 크기에 영향을 받습니다.'
      );
      const seed = textField(document, fields, 'eigen-seed', 'Krylov 시작 vector seed', defaults.seed);
      const which = selectField(document, fields, 'which', 'Lanczos 목표', [
        ['LA', 'LA · 가장 큰 실수값'],
        ['SA', 'SA · 가장 작은 실수값'],
        ['LM', 'LM · 가장 큰 절댓값']
      ]);
      which.value = defaults.which;
      if (kind === 'general-eigensolver')
        for (const control of [k, space, restarts, tolerance, seed, which])
          control.closest<HTMLElement>('.ds-field')!.hidden = true;
      if (kind !== 'lanczos') which.closest<HTMLElement>('.ds-field')!.hidden = true;
      read = () => {
        if (new TextEncoder().encode(operator.value).length > 2 * 1024 * 1024)
          throw new Error('연산자 JSON은 최대 2 MiB입니다.');
        return {
          kind: 'eigen',
          operator: JSON.parse(operator.value) as EigenOperator,
          settings: {
            method: kind,
            k: kind === 'general-eigensolver' ? 1 : readNumber(k),
            krylovDim: kind === 'general-eigensolver' ? 2 : readNumber(space),
            maxRestarts: kind === 'general-eigensolver' ? 1 : readNumber(restarts),
            tolerance: readNumber(tolerance),
            seed: seed.value,
            which: which.value as EigenSettings['which']
          }
        };
      };
    }
  }
  method.addEventListener('change', () => {
    current = undefined;
    render();
    changed();
  });
  root.addEventListener('input', changed);
  render();
  return {
    element: root,
    syncData(value: LearningData) {
      data = structuredClone(value);
      current = undefined;
      render();
    },
    restore(input: DataDrivenRequest['input']) {
      current = structuredClone(input);
      if (input.kind === 'learning') data = structuredClone(input.data);
      method.value = input.settings.method;
      render();
    },
    read() {
      if (!read) throw new Error('학습 데이터를 미리 보고 확정하세요.');
      return read();
    },
    setDisabled(value: boolean) {
      root.disabled = value;
    },
    isLearning() {
      return learningMethod(method.value as Method);
    }
  };
}
