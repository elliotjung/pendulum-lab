import { closed } from '../../../lab/experiments/safe';
import { DATA_DRIVEN_VERSION, type DataDrivenResult, type DataDrivenRequest } from './contracts';
import { dataDrivenInputId, dataDrivenResultId, evaluateDataDrivenOutput, validateDataDrivenRequest } from './execute';
import { freezeModelData, modelData, modelJson, parseModelJson } from './safe';

/** Re-evaluate saved coefficients/vectors. No learning fit or Krylov iteration runs during restore. */
export async function validateDataDrivenResult(
  input: unknown,
  expected?: DataDrivenRequest
): Promise<DataDrivenResult> {
  modelData(input);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('모델 결과 객체가 필요합니다.');
  const result = input as DataDrivenResult;
  closed(result, ['schema', 'algorithmVersion', 'id', 'inputId', 'request', 'output']);
  if (result.schema !== 'pendulum-data-driven-result/v1' || result.algorithmVersion !== DATA_DRIVEN_VERSION)
    throw new Error('지원하지 않는 모델 결과 버전입니다. 원본 파일을 보존하세요.');
  validateDataDrivenRequest(result.request);
  if (expected && modelJson(result.request) !== modelJson(expected))
    throw new Error('실행 요청과 결과 계보가 다릅니다.');
  if (!result.output || typeof result.output !== 'object') throw new Error('모델 진단이 없습니다.');
  closed(result.output, ['model', 'metrics', 'columns', 'units', 'rows', 'warnings', 'details']);
  const out = result.output;
  const strings = (v: unknown, max: number) =>
    Array.isArray(v) && v.length <= max && v.every((s) => typeof s === 'string' && s.length <= 4000);
  if (
    !strings(out.columns, 32) ||
    !strings(out.units, 32) ||
    out.columns.length !== out.units.length ||
    !strings(out.warnings, 128) ||
    !strings(out.details, 128) ||
    !Array.isArray(out.rows) ||
    out.rows.length > 512 ||
    out.rows.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== out.columns.length ||
        row.some((v) => typeof v !== 'number' || !Number.isFinite(v))
    ) ||
    !out.metrics ||
    typeof out.metrics !== 'object' ||
    Array.isArray(out.metrics) ||
    Object.values(out.metrics).some((v) => typeof v !== 'number' || !Number.isFinite(v))
  )
    throw new Error('모델 진단 표·단위·잔차 차원이 유효하지 않습니다.');
  if (result.request.mode === 'evaluate' && modelJson(result.request.model) !== modelJson(out.model))
    throw new Error('재평가 모델과 저장 모델이 다릅니다.');
  if (result.inputId !== (await dataDrivenInputId(result.request)))
    throw new Error('원본 데이터 계보 SHA256이 다릅니다.');
  const { id, ...body } = result;
  if (id !== (await dataDrivenResultId(body))) throw new Error('모델 결과 SHA256이 다릅니다.');
  const checked = evaluateDataDrivenOutput(result.request, out.model);
  if (modelJson(checked) !== modelJson(out)) throw new Error('저장 모델의 재평가와 진단·경고가 일치하지 않습니다.');
  return freezeModelData(modelData(result) as unknown as DataDrivenResult);
}
export async function serializeDataDrivenResult(result: DataDrivenResult): Promise<string> {
  const checked = await validateDataDrivenResult(result);
  return JSON.stringify(checked, null, 2) + '\n';
}
export async function parseDataDrivenResult(text: string): Promise<DataDrivenResult> {
  return validateDataDrivenResult(parseModelJson(text));
}
