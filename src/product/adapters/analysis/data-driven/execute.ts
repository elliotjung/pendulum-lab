import { closed } from '../../../lab/experiments/safe';
import { validateLearning, trainLearning, evaluateLearning } from './learning';
import { validateEigen, solveEigen, evaluateEigen } from './eigen';
import {
  DATA_DRIVEN_VERSION,
  type DataDrivenRequest,
  type DataDrivenResult,
  type DataDrivenProgress,
  type DataDrivenEvent,
  type DataDrivenOutput
} from './contracts';
import { modelData, modelDigest, freezeModelData } from './safe';

export function validateDataDrivenRequest(input: unknown): asserts input is DataDrivenRequest {
  modelData(input);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('모델 실행 요청이 필요합니다.');
  const request = input as DataDrivenRequest;
  closed(request, ['schema', 'id', 'mode', 'input', 'model', 'parentId']);
  if (
    request.schema !== 'pendulum-data-driven-request/v1' ||
    typeof request.id !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(request.id) ||
    !['train', 'evaluate'].includes(request.mode)
  )
    throw new Error('지원하지 않는 모델 요청 버전·ID·작업입니다.');
  if (
    request.mode === 'train'
      ? request.model !== undefined || request.parentId !== undefined
      : request.model === undefined ||
        typeof request.parentId !== 'string' ||
        !/^data-result-[0-9a-f]{64}$/.test(request.parentId)
  )
    throw new Error('재평가에는 저장 모델과 원 결과 계보가 필요합니다.');
  if (!request.input || typeof request.input !== 'object') throw new Error('입력 데이터가 필요합니다.');
  if (request.input.kind === 'learning') {
    closed(request.input, ['kind', 'data', 'settings']);
    validateLearning(request.input.data, request.input.settings);
  } else if (request.input.kind === 'eigen') {
    closed(request.input, ['kind', 'operator', 'settings']);
    validateEigen(request.input.operator, request.input.settings);
  } else throw new Error('지원하지 않는 모델 입력 종류입니다.');
}
export async function dataDrivenInputId(request: DataDrivenRequest): Promise<string> {
  return `data-input-${await modelDigest(request.input)}`;
}
export async function dataDrivenResultId(result: Omit<DataDrivenResult, 'id'>): Promise<string> {
  return `data-result-${await modelDigest(result)}`;
}
export function evaluateDataDrivenOutput(request: DataDrivenRequest, model: unknown): DataDrivenOutput {
  return request.input.kind === 'learning'
    ? evaluateLearning(request.input.data, request.input.settings, model)
    : evaluateEigen(request.input.operator, request.input.settings, model);
}
/** Synchronous native linear algebra is isolated in a dedicated terminable worker. */
export async function runDataDriven(
  input: DataDrivenRequest,
  progress: DataDrivenProgress = () => undefined
): Promise<DataDrivenResult> {
  validateDataDrivenRequest(input);
  const request = modelData(input) as unknown as DataDrivenRequest;
  progress({ fraction: null, work: 0 });
  let lastWork = 0;
  const report = (work: number) => {
    lastWork = Math.max(lastWork, work);
    progress({ fraction: null, work: lastWork });
  };
  const output =
    request.mode === 'evaluate'
      ? evaluateDataDrivenOutput(request, request.model)
      : request.input.kind === 'learning'
        ? trainLearning(request.input.data, request.input.settings, report)
        : solveEigen(request.input.operator, request.input.settings, report);
  modelData(output);
  const body: Omit<DataDrivenResult, 'id'> = {
    schema: 'pendulum-data-driven-result/v1',
    algorithmVersion: DATA_DRIVEN_VERSION,
    inputId: await dataDrivenInputId(request),
    request,
    output
  };
  const result = freezeModelData(
    modelData({ ...body, id: await dataDrivenResultId(body) }) as unknown as DataDrivenResult
  );
  progress({ fraction: 1, work: lastWork });
  return result;
}
export async function reevaluateDataDriven(
  result: DataDrivenResult,
  progress?: DataDrivenProgress
): Promise<DataDrivenResult> {
  return runDataDriven(
    {
      ...result.request,
      id: `${result.request.id.slice(0, 110)}-eval`,
      mode: 'evaluate',
      model: result.output.model,
      parentId: result.id
    },
    progress
  );
}
export async function executeDataDrivenJob(
  request: DataDrivenRequest,
  emit: (event: DataDrivenEvent) => void
): Promise<void> {
  let id = 'invalid';
  try {
    modelData(request);
    if (typeof request?.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(request.id)) id = request.id;
    const result = await runDataDriven(request, (value) => emit({ type: 'progress', id, ...value }));
    emit({ type: 'result', id, result });
  } catch (cause) {
    emit({
      type: 'error',
      id,
      message: cause instanceof Error ? cause.message.slice(0, 2000) : '모델 계산에 실패했습니다.'
    });
  }
}
