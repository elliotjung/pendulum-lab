import { canonicalJson, type JsonValue } from '../../../persistence/safe-data';
import { modelData } from './safe';
import {
  LEARNING_METHODS,
  type LearningData,
  type LearningSettings,
  type LearningPreprocessing
} from './learning-contracts';

export function learningSafe(input: unknown): void {
  try {
    modelData(input);
  } catch {
    throw new Error('학습 입력은 크기 한도 내의 유한한 일반 JSON 데이터여야 합니다.');
  }
}
export function learningClosed(input: unknown, names: string[]): asserts input is Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('학습 데이터 객체가 필요합니다.');
  if (Object.keys(input).some((key) => !names.includes(key))) throw new Error('알 수 없는 학습 필드입니다.');
  if (names.some((key) => !Object.hasOwn(input, key))) throw new Error('학습 필드가 빠졌습니다.');
}
export function learningInteger(value: number, min: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`학습 정수 설정은 ${min}–${max} 범위여야 합니다.`);
}
export function learningNumbers(values: unknown, length: number, bound = 1e12): asserts values is number[] {
  if (
    !Array.isArray(values) ||
    values.length !== length ||
    values.some((v) => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > bound)
  )
    throw new Error('학습 수치 배열의 차원·유한값·범위를 확인하세요.');
}
export function validateLearning(data: LearningData, settings: LearningSettings): void {
  learningSafe(data);
  learningSafe(settings);
  learningClosed(data, ['times', 'values', 'labels', 'units', 'axisUnit', 'provenance']);
  learningClosed(settings, [
    'method',
    'selection',
    'sliceStart',
    'sliceEnd',
    'splitIndex',
    'preprocessing',
    'seed',
    'polynomialDegree',
    'includeTrig',
    'threshold',
    'ridge',
    'delays',
    'rank',
    'reservoirSize',
    'washout',
    'rolloutSteps'
  ]);
  learningInteger(data.values.length, 24, 512);
  learningInteger(data.labels.length, 1, 4);
  if (data.units.length !== data.labels.length || new Set(data.labels).size !== data.labels.length)
    throw new Error('학습 변수의 이름·단위·중복을 확인하세요.');
  if ([...data.labels, ...data.units, data.axisUnit].some((v) => typeof v !== 'string' || !v || v.length > 80))
    throw new Error('학습 변수와 시간축의 이름·단위를 명시하세요.');
  if (!data.provenance || typeof data.provenance !== 'object' || Array.isArray(data.provenance))
    throw new Error('학습 데이터의 출처가 필요합니다.');
  learningNumbers(data.times, data.values.length);
  data.values.forEach((row) => learningNumbers(row, data.labels.length, 1e6));
  const dt = data.times[1]! - data.times[0]!;
  if (
    !(dt >= 1e-6 && dt <= 1e4) ||
    data.times.some((t, i) => i > 0 && Math.abs(t - data.times[i - 1]! - dt) > 1e-7 * dt)
  )
    throw new Error('학습은 증가하는 균일 시간축을 요구합니다. 시간 간격을 확인하세요.');
  if (!LEARNING_METHODS.includes(settings.method) || !['none', 'standardize'].includes(settings.preprocessing))
    throw new Error('지원하지 않는 학습 방법·전처리입니다.');
  if (typeof settings.seed !== 'string' || !/^[A-Za-z0-9._:-]{1,64}$/.test(settings.seed))
    throw new Error('학습 seed는 1–64자 영문·숫자·점·밑줄·콜론·대시입니다.');
  if (
    !Array.isArray(settings.selection) ||
    !settings.selection.length ||
    new Set(settings.selection).size !== settings.selection.length
  )
    throw new Error('중복 없는 학습 변수를 선택하세요.');
  settings.selection.forEach((v) => learningInteger(v, 0, data.labels.length - 1));
  learningInteger(settings.sliceStart, 0, data.values.length - 24);
  learningInteger(settings.sliceEnd, settings.sliceStart + 24, data.values.length);
  learningInteger(settings.splitIndex, settings.sliceStart + 12, settings.sliceEnd - 8);
  learningInteger(settings.polynomialDegree, 1, settings.method === 'hamiltonian' ? 4 : 3);
  learningInteger(settings.delays, 4, 32);
  learningInteger(settings.rank, 2, 6);
  learningInteger(settings.reservoirSize, 4, 32);
  learningInteger(settings.washout, 0, 64);
  learningInteger(settings.rolloutSteps, 1, 64);
  if (
    typeof settings.includeTrig !== 'boolean' ||
    !Number.isFinite(settings.threshold) ||
    settings.threshold < 0 ||
    settings.threshold > 10
  )
    throw new Error('학습 library와 희소 임계값을 확인하세요.');
  if (!Number.isFinite(settings.ridge) || settings.ridge < 0 || settings.ridge > 1)
    throw new Error('학습 ridge는 0–1의 유한값입니다.');
  const train = settings.splitIndex - settings.sliceStart,
    validation = settings.sliceEnd - settings.splitIndex;
  if (settings.rolloutSteps >= validation) throw new Error('rollout은 검증 구간 안에서 끝나야 합니다.');
  if (
    settings.method === 'havok' &&
    (settings.selection.length !== 1 ||
      settings.rank >= settings.delays ||
      train <= settings.delays + 4 ||
      validation <= settings.delays + 4)
  )
    throw new Error('HAVOK은 단일 관측량과 각 분할의 충분한 delay window, rank < delays를 요구합니다.');
  if (settings.method === 'reservoir' && (train <= settings.washout + 3 || settings.ridge <= 0))
    throw new Error('reservoir 훈련 표본을 늘리거나 washout을 줄이고 양의 ridge를 사용하세요.');
  if (settings.method === 'hamiltonian') {
    const labels = settings.selection.map((i) => data.labels[i]),
      units = settings.selection.map((i) => data.units[i]);
    const n = labels.length / 2;
    const expected = Array.from({ length: n }, (_, i) => `q${i}`).concat(Array.from({ length: n }, (_, i) => `p${i}`));
    if (
      ![2, 4].includes(labels.length) ||
      settings.preprocessing !== 'none' ||
      data.provenance.canonical !== true ||
      data.provenance.coordinateOrder !== 'q,p' ||
      JSON.stringify(data.provenance.canonicalUnits) !== JSON.stringify(units) ||
      JSON.stringify(labels) !== JSON.stringify(expected)
    )
      throw new Error(
        'Hamiltonian 학습에는 명시된 canonical q,p 좌표·단위와 전처리 없음이 필요합니다. 각속도는 운동량이 아닙니다.'
      );
    if (settings.polynomialDegree < 2) throw new Error('Hamiltonian library는 최소 2차를 선택하세요.');
  }
}
export function learningSeed(text: string): number {
  let seed = 2166136261;
  for (const c of text) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return seed >>> 0;
}
export function learningIdentity(data: LearningData, settings: LearningSettings): string {
  const text = canonicalJson({
    times: data.times.slice(settings.sliceStart, settings.splitIndex),
    values: data.values
      .slice(settings.sliceStart, settings.splitIndex)
      .map((r) => settings.selection.map((i) => r[i]!)),
    labels: settings.selection.map((i) => data.labels[i]!),
    units: settings.selection.map((i) => data.units[i]!),
    axisUnit: data.axisUnit,
    settings: settings as unknown as JsonValue
  });
  return learningSeed(text).toString(16).padStart(8, '0');
}
export function fitLearningPreprocessing(rows: number[][], kind: LearningPreprocessing['kind']): LearningPreprocessing {
  const mean = rows[0]!.map((_, i) => (kind === 'none' ? 0 : rows.reduce((s, r) => s + r[i]!, 0) / rows.length));
  const scale = mean.map((m, i) =>
    kind === 'none' ? 1 : Math.sqrt(rows.reduce((s, r) => s + (r[i]! - m) ** 2, 0) / rows.length)
  );
  if (scale.some((s) => s < 1e-10)) throw new Error('상수 또는 거의 상수인 변수는 표준화할 수 없습니다.');
  return { kind, mean, scale };
}
export function transformLearning(rows: number[][], preprocessing: LearningPreprocessing): number[][] {
  return rows.map((row) => row.map((v, i) => (v - preprocessing.mean[i]!) / preprocessing.scale[i]!));
}
export function learningSlices(
  data: LearningData,
  settings: LearningSettings
): { train: number[][]; validation: number[][]; dt: number } {
  const select = (rows: number[][]) => rows.map((row) => settings.selection.map((i) => row[i]!));
  return {
    train: select(data.values.slice(settings.sliceStart, settings.splitIndex)),
    validation: select(data.values.slice(settings.splitIndex, settings.sliceEnd)),
    dt: data.times[1]! - data.times[0]!
  };
}
