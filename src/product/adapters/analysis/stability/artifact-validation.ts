import { closedRecord, validateArtifactData } from '../core/artifact-validation';
import { validateStabilityRequest } from './validation';
import { stabilityResultSignature } from './result';
import {
  STABILITY_LIMITS as limits,
  STABILITY_VERSION,
  type StabilityArtifact,
  type StabilityRequest,
  type StabilityResult
} from './contracts';

const identifier = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const finiteArray = (value: unknown, max: number) =>
  Array.isArray(value) && value.length <= max && value.every((x) => typeof x === 'number' && Number.isFinite(x));
const strings = (value: unknown, max: number) =>
  Array.isArray(value) && value.length <= max && value.every((x) => typeof x === 'string' && x.length <= 2000);

/** Inspect descriptors before reading user supplied fields, then enforce a closed versioned contract. */
export function validateStabilityRequestData(input: unknown): asserts input is StabilityRequest {
  validateArtifactData(input);
  closedRecord(input, ['id', 'kind', 'experiment', 'settings'], ['restart'], '안정성 요청');
  if (!identifier(input.id)) throw new RangeError('안정성 작업 ID가 유효하지 않습니다.');
  if (input.restart !== undefined) {
    closedRecord(
      input.restart,
      ['artifactId', 'inputRunId', 'source', 'state', 'parameter', 'direction'],
      [],
      'branch 재시작'
    );
    const r = input.restart;
    if (
      !identifier(r.artifactId) ||
      !identifier(r.inputRunId) ||
      typeof r.source !== 'string' ||
      !finiteArray(r.state, limits.dimension) ||
      !(r.state as number[]).length ||
      typeof r.parameter !== 'number' ||
      !Number.isFinite(r.parameter) ||
      (r.direction !== 1 && r.direction !== -1)
    )
      throw new RangeError('branch 재시작의 계보·해·매개변수가 유효하지 않습니다.');
  }
  validateStabilityRequest(input as unknown as StabilityRequest);
}

export function validateStabilityResult(input: unknown, request: StabilityRequest): asserts input is StabilityResult {
  validateArtifactData(input);
  closedRecord(
    input,
    [
      'kind',
      'source',
      'summary',
      'columns',
      'units',
      'rows',
      'details',
      'warnings',
      'method',
      'branch',
      'log',
      'status'
    ],
    [],
    '안정성 결과'
  );
  if (
    input.kind !== request.kind ||
    input.source !== request.settings.source ||
    typeof input.summary !== 'string' ||
    !input.summary ||
    !strings(input.columns, 32) ||
    !(input.columns as string[]).length ||
    !strings(input.units, 32) ||
    !strings(input.warnings, 128) ||
    !['converged', 'partial', 'nonconverged', 'diagnostic'].includes(String(input.status))
  )
    throw new RangeError('안정성 결과의 종류·source·표·상태가 유효하지 않습니다.');
  const signature = stabilityResultSignature(request);
  if (
    JSON.stringify(input.columns) !== JSON.stringify(signature.columns) ||
    JSON.stringify(input.units) !== JSON.stringify(signature.units) ||
    input.method !== signature.method
  )
    throw new RangeError('안정성 결과의 좌표·단위·계산 방법이 요청과 다릅니다.');
  const width = signature.columns.length;
  if (
    !Array.isArray(input.rows) ||
    input.rows.length > limits.rows ||
    input.rows.some((r) => !finiteArray(r, width) || r.length !== width)
  )
    throw new RangeError('안정성 표의 차원·유한 수치·크기를 확인하세요.');
  if (
    !Array.isArray(input.branch) ||
    input.branch.length > limits.branchPoints ||
    !Array.isArray(input.log) ||
    input.log.length > limits.rows
  )
    throw new RangeError('branch·수렴 기록의 크기 제한을 초과했습니다.');
  let dimension: number | undefined;
  for (const point of input.branch) {
    closedRecord(point, ['parameter', 'state', 'residual', 'converged', 'stable'], [], 'branch 점');
    if (
      typeof point.parameter !== 'number' ||
      !Number.isFinite(point.parameter) ||
      !finiteArray(point.state, limits.dimension) ||
      !(point.state as number[]).length ||
      typeof point.residual !== 'number' ||
      point.residual < 0 ||
      !Number.isFinite(point.residual) ||
      typeof point.converged !== 'boolean' ||
      !(point.stable === null || typeof point.stable === 'boolean')
    )
      throw new RangeError('branch 점의 해·잔차·수렴·안정성 상태가 유효하지 않습니다.');
    const n = (point.state as number[]).length;
    const expectedDimension = ['fold-normal-form', 'pitchfork-normal-form'].includes(String(input.source)) ? 1 : 2;
    if (n !== expectedDimension) throw new RangeError('branch 해의 상태 차원이 source와 다릅니다.');
    if (dimension !== undefined && dimension !== n) throw new RangeError('branch 해의 상태 차원이 일치하지 않습니다.');
    dimension = n;
    if (!point.converged && point.stable !== null) throw new RangeError('비수렴 해의 안정성을 확정할 수 없습니다.');
  }
  let lastStep = -1;
  for (const entry of input.log) {
    closedRecord(entry, ['step', 'residual', 'converged'], [], '수렴 기록');
    if (
      !Number.isSafeInteger(entry.step) ||
      (entry.step as number) < 0 ||
      (entry.step as number) < lastStep ||
      typeof entry.residual !== 'number' ||
      !Number.isFinite(entry.residual) ||
      entry.residual < 0 ||
      typeof entry.converged !== 'boolean'
    )
      throw new RangeError('수렴 기록이 유효하지 않습니다.');
    lastStep = entry.step as number;
  }
  if (input.status === 'converged' && (!input.branch.length || input.branch.some((p) => !p.converged)))
    throw new RangeError('비수렴 branch를 완료된 해로 표시할 수 없습니다.');
}

export function validateStabilityArtifact(input: unknown): asserts input is StabilityArtifact {
  validateArtifactData(input);
  closedRecord(
    input,
    ['schema', 'algorithmVersion', 'artifactId', 'inputRunId', 'createdAt', 'request', 'result'],
    [],
    '안정성 artifact'
  );
  if (input.schema !== 'pendulum-stability-workflow/v1' || input.algorithmVersion !== STABILITY_VERSION)
    throw new RangeError('지원하지 않는 안정성 artifact·알고리즘 버전입니다. 원본을 보존하세요.');
  if (!identifier(input.artifactId) || !identifier(input.inputRunId))
    throw new RangeError('artifact·입력 run ID가 유효하지 않습니다.');
  if (
    typeof input.createdAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.createdAt) ||
    !Number.isFinite(Date.parse(input.createdAt)) ||
    new Date(input.createdAt).toISOString() !== input.createdAt
  )
    throw new RangeError('생성 시간은 유효한 UTC ISO 시간이어야 합니다.');
  validateStabilityRequestData(input.request);
  validateStabilityResult(input.result, input.request);
  if (
    input.request.restart &&
    (input.request.restart.artifactId === input.artifactId || input.request.restart.inputRunId !== input.inputRunId)
  )
    throw new RangeError('재시작 artifact는 다른 부모 artifact와 같은 입력 run을 참조해야 합니다.');
  if (new TextEncoder().encode(JSON.stringify(input)).length > limits.artifactBytes)
    throw new RangeError('안정성 artifact는 8 MiB 이하여야 합니다.');
}
