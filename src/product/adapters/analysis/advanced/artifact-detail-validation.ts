import type { AdvancedDiagnosticRequest, AdvancedDiagnosticResult } from './contracts';
import { advancedSignal } from './validation';
import { createDiagnosticFlow } from '../core/source';
import type { JsonValue } from '../../../persistence/safe-data';

const record = (value: JsonValue | undefined): value is Record<string, JsonValue> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const numbers = (value: JsonValue | undefined, length: number): value is number[] =>
  Array.isArray(value) && value.length === length && value.every((v) => typeof v === 'number' && Number.isFinite(v));

/** Rendering projections retain native array shapes; valid JSON alone does not establish a valid matrix. */
export function validateAdvancedDetailShape(
  result: AdvancedDiagnosticResult,
  request: AdvancedDiagnosticRequest
): void {
  const details = result.details;
  if (!record(details)) throw new RangeError('고급 분석 native 세부 결과 객체가 필요합니다.');
  if (request.kind === 'rqa' || request.kind === 'recurrence-network') {
    const selected = advancedSignal(request).values.length;
    const size = selected - (Number(request.settings.dimension) - 1) * Number(request.settings.delay);
    if (
      details.size !== size ||
      !numbers(details.matrix, size * size) ||
      details.matrix.some((v) => v !== 0 && v !== 1)
    )
      throw new RangeError('재귀 행렬의 표본 차원·이진 값이 native 입력과 다릅니다.');
    for (let i = 0; i < size; i++)
      for (let j = i; j < size; j++)
        if (details.matrix[i * size + j] !== details.matrix[j * size + i])
          throw new RangeError('재귀 행렬은 대칭이어야 합니다.');
  } else if (request.kind === 'clv') {
    const dimension = createDiagnosticFlow(request.experiment).initial.length;
    const count = Number(request.settings.count) || dimension;
    const records = Math.min(
      Number(request.settings.window),
      Number(request.settings.window) - Number(request.settings.backwardTransient) + 1
    );
    if (
      !numbers(details.times, records) ||
      !numbers(details.exponents, count) ||
      !Array.isArray(details.vectors) ||
      details.vectors.length !== records ||
      details.vectors.some((vector) => !numbers(vector, dimension * count))
    )
      throw new RangeError('CLV 시간·지수·벡터 차원이 native 설정과 다릅니다.');
    const interval = Number(request.settings.dt) * Number(request.settings.renormEvery);
    for (let t = 0; t < records; t++) {
      if (details.times[t] !== t * interval) throw new RangeError('CLV 기록 시각이 native 설정과 다릅니다.');
      for (let i = 0; i < count; i++) {
        const row = result.rows[t * count + i];
        if (!row || row[0] !== details.times[t] || row[1] !== i || row[2] !== details.exponents[i])
          throw new RangeError('CLV 표와 native 시간·지수 기록이 다릅니다.');
      }
    }
  } else if (['basin', 'uncertainty', 'lcs-ridge'].includes(request.kind)) {
    const size = Number(request.settings.resolution);
    if (details.width !== size || details.height !== size)
      throw new RangeError('격자 결과의 너비·높이가 요청 해상도와 다릅니다.');
    if (request.kind === 'lcs-ridge') {
      if (
        !record(details.field) ||
        !numbers(details.field.values, size * size) ||
        !record(details.ridges) ||
        !numbers(details.ridges.mask, size * size) ||
        details.ridges.mask.some((v) => v !== 0 && v !== 1)
      )
        throw new RangeError('FTLE 장·능선 mask의 차원 또는 값이 유효하지 않습니다.');
    } else if (
      !record(details.grid) ||
      !numbers(details.grid.labels, size * size) ||
      details.grid.labels.some((v) => v !== 0 && v !== 1 && v !== 2)
    )
      throw new RangeError('반전 격자 label의 차원 또는 값이 유효하지 않습니다.');
  }
}
