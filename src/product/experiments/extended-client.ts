import { batchData, stableBatchJson } from '../lab/experiments/safe';
import { validateBatchSnapshot } from '../lab/experiments/validation';
import { validateExtendedCanonical, extendedConfig } from './extended-config';
import { extendedBatchPlan } from './extended-science';
import type { ExtendedResult } from './extended-results';
import type { ExtendedExecutor, ExtendedRequest, ExtendedWorker } from './extended-worker';

/** A worker is an untrusted boundary: enforce finite, bounded results and exact input lineage. */
export function validateExtendedResult(input: unknown, request: ExtendedRequest): ExtendedResult {
  const result = batchData(input) as unknown as ExtendedResult;
  if (
    !result ||
    typeof result !== 'object' ||
    Array.isArray(result) ||
    Object.keys(result).some(
      (k) =>
        ![
          'schema',
          'algorithmVersion',
          'unitId',
          'canonical',
          'fields',
          'metrics',
          'tables',
          'trace',
          'warnings',
          'companions',
          'batch'
        ].includes(k)
    )
  )
    throw new Error('전용 실험 결과 객체가 유효하지 않습니다.');
  if (
    result.schema !== 'pendulum-learn-diagnostics/v1' ||
    result.algorithmVersion !== 'learn-extended-v1' ||
    result.unitId !== request.unitId ||
    stableBatchJson(result.fields) !== stableBatchJson(request.fields)
  )
    throw new Error('전용 실험 결과의 입력 계보가 다릅니다.');
  validateExtendedCanonical(
    { id: request.unitId, courseId: `course-${request.unitId[0]}`, contentVersion: 1 },
    request.fields,
    result.canonical
  );
  if (
    !Array.isArray(result.trace) ||
    result.trace.length < 1 ||
    result.trace.length > 801 ||
    !Array.isArray(result.metrics) ||
    result.metrics.length > 64 ||
    !Array.isArray(result.tables) ||
    result.tables.length > 20 ||
    !Array.isArray(result.warnings) ||
    result.warnings.length > 100 ||
    !Array.isArray(result.companions) ||
    result.companions.length > 10
  )
    throw new Error('전용 실험 결과의 배열 한도를 넘었습니다.');
  for (const m of result.metrics)
    if (
      !m ||
      typeof m !== 'object' ||
      typeof m.id !== 'string' ||
      m.id.length > 80 ||
      typeof m.label !== 'string' ||
      m.label.length > 200 ||
      !Number.isFinite(m.value) ||
      typeof m.unit !== 'string' ||
      m.unit.length > 80
    )
      throw new Error('전용 실험 진단값이 유효하지 않습니다.');
  if (new Set(result.metrics.map((m) => m.id)).size !== result.metrics.length)
    throw new Error('전용 실험 진단 ID가 중복됐습니다.');
  const declaredTables: Readonly<Record<string, readonly string[]>> = {
    '2.1': ['state-derivative'],
    '2.2': ['error-cost'],
    '2.3': ['adaptive-steps'],
    '2.4': ['canonical-energy'],
    '2.5': ['stiff-radius'],
    '2.6': ['poincare-crossings'],
    '2.7': ['error-cost', 'adaptive-steps', 'tolerance-cost'],
    '2.8': [],
    '2.9': ['batch-comparison'],
    '3.1': ['mass-matrix', 'two-link-mass-matrix'],
    '3.2': ['mass-matrix'],
    '3.3': ['compound-matrix', 'point-matrix', 'compound-time-comparison', 'compound-crossing-intervals'],
    '3.4': ['radial-angular-exchange'],
    '3.5': ['constraint-events', 'tension-timeline'],
    '3.6': ['constraint-events', 'tension-timeline'],
    '3.7': ['spatial-precession'],
    '3.8': ['spatial-mass-matrix', 'spatial-precession'],
    '3.9': ['spatial-precession', 'embedded-polar']
  };
  const expectedTables = declaredTables[request.unitId];
  if (
    !expectedTables ||
    result.tables.length !== expectedTables.length ||
    new Set(result.tables.map((t) => t?.id)).size !== result.tables.length ||
    result.tables.some((t) => !expectedTables.includes(t?.id))
  )
    throw new Error('이 단원의 선언된 결과 표와 다릅니다.');
  const numericTables = new Set([
    'adaptive-steps',
    'canonical-energy',
    'stiff-radius',
    'compound-time-comparison',
    'radial-angular-exchange',
    'spatial-precession',
    'embedded-polar',
    'mass-matrix',
    'two-link-mass-matrix',
    'compound-matrix',
    'point-matrix',
    'spatial-mass-matrix',
    'tolerance-cost'
  ]);
  let cells = 0;
  for (const t of result.tables) {
    if (
      !t ||
      typeof t !== 'object' ||
      typeof t.id !== 'string' ||
      t.id.length > 80 ||
      typeof t.title !== 'string' ||
      t.title.length > 200 ||
      !Array.isArray(t.columns) ||
      t.columns.length < 1 ||
      t.columns.length > 20 ||
      !t.columns.every((c: unknown) => typeof c === 'string' && c.length <= 200) ||
      !Array.isArray(t.rows) ||
      t.rows.length > 401
    )
      throw new Error('전용 실험 표의 한도를 넘었습니다.');
    for (const row of t.rows) {
      if (
        !Array.isArray(row) ||
        row.length !== t.columns.length ||
        row.some(
          (c: unknown) => !(typeof c === 'string' && c.length <= 1000) && !(typeof c === 'number' && Number.isFinite(c))
        )
      )
        throw new Error('전용 실험 표가 유효하지 않습니다.');
      if (numericTables.has(t.id) && row.some((c) => typeof c !== 'number' || !Number.isFinite(c)))
        throw new Error('수치 그래프 표에는 유한한 숫자가 필요합니다.');
      cells += row.length;
    }
  }
  if (cells > 20000) throw new Error('전용 실험 표의 전체 크기 한도를 넘었습니다.');
  const source = extendedConfig(request.unitId, request.fields),
    dimension = source.config.initialState.length,
    spatial = source.family === 'spatial',
    hybrid = source.family === 'constraint' && source.config.systemId !== 'system:spring';
  const stateDimension = hybrid ? (source.config.systemId === 'system:rope' ? 4 : 8) : dimension;
  const positions =
    source.family === 'planar'
      ? 2
      : source.family === 'chain' || source.family === 'spatial'
        ? source.config.parameters.masses.length
        : source.config.systemId === 'system:double-string'
          ? 2
          : 1;
  let previous = -Infinity;
  for (const s of result.trace) {
    if (
      !s ||
      typeof s !== 'object' ||
      !Number.isFinite(s.time) ||
      s.time < 0 ||
      s.time > request.fields.duration! + 1e-12 ||
      s.time <= previous ||
      !Number.isFinite(s.energy) ||
      !Array.isArray(s.state) ||
      s.state.length !== stateDimension ||
      s.state.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v)) ||
      !Array.isArray(s.positions) ||
      s.positions.length !== positions ||
      s.positions.some((p: unknown) => {
        if (!p || typeof p !== 'object') return true;
        const point = p as { x: unknown; y: unknown; z?: unknown };
        return ![point.x, point.y, ...(spatial ? [point.z] : point.z === undefined ? [] : [point.z])].every(
          (v) => typeof v === 'number' && Number.isFinite(v)
        );
      })
    )
      throw new Error('전용 실험 궤적 차원·단위·시간이 유효하지 않습니다.');
    for (const key of ['constraint', 'unitConstraint', 'tangentConstraint', 'poleProximity'] as const)
      if (s[key] !== undefined && (typeof s[key] !== 'number' || !Number.isFinite(s[key]) || s[key]! < 0))
        throw new Error('전용 실험 구속 진단이 유효하지 않습니다.');
    if (spatial) {
      if (
        !Number.isFinite(s.verticalMomentum) ||
        s.unitConstraint === undefined ||
        s.tangentConstraint === undefined ||
        s.poleProximity === undefined
      )
        throw new Error('공간 진단 데이터가 없습니다.');
    } else if (s.verticalMomentum !== undefined) throw new Error('이 모형의 각운동량 선언이 다릅니다.');
    if (source.family === 'constraint') {
      const n = source.config.systemId === 'system:double-string' ? 2 : 1;
      if (
        !Array.isArray(s.tensions) ||
        s.tensions.length !== n ||
        s.tensions.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v)) ||
        !['elastic', 'taut', 'slack', 'outer-slack', 'full-slack'].includes(s.phase ?? '')
      )
        throw new Error('장력·구속 상태 데이터가 유효하지 않습니다.');
    } else if (s.tensions !== undefined || s.phase !== undefined)
      throw new Error('이 모형에는 선언된 장력이 없습니다.');
    previous = s.time;
  }
  if (result.trace[0]?.time !== 0 || Math.abs((result.trace.at(-1)?.time ?? -1) - request.fields.duration!) > 1e-12)
    throw new Error('전용 실험 기록의 시작·종료 시간이 다릅니다.');
  if (result.warnings.some((w) => typeof w !== 'string' || w.length > 2000))
    throw new Error('전용 실험 경고가 유효하지 않습니다.');
  for (const c of result.companions) {
    if (
      !c ||
      typeof c !== 'object' ||
      typeof c.id !== 'string' ||
      c.id.length > 80 ||
      typeof c.description !== 'string' ||
      c.description.length > 2000 ||
      !c.settings ||
      typeof c.settings !== 'object' ||
      Array.isArray(c.settings) ||
      Object.keys(c.settings).length > 32 ||
      Object.entries(c.settings).some(
        ([key, v]) =>
          key.length > 80 ||
          (!(typeof v === 'number' && Number.isFinite(v)) && !(typeof v === 'string' && v.length <= 500))
      )
    )
      throw new Error('비교 계산 설정이 유효하지 않습니다.');
  }
  if (request.unitId === '2.9') {
    if (!result.batch) throw new Error('S21 비교 결과가 없습니다.');
    const b = validateBatchSnapshot(result.batch);
    if (
      b.status !== 'completed' ||
      stableBatchJson(b.plan) !== stableBatchJson(extendedBatchPlan(request.unitId, request.fields)) ||
      (request.batch && stableBatchJson(b) !== stableBatchJson(request.batch))
    )
      throw new Error('S21 비교 결과가 원본과 다릅니다.');
  } else if (result.batch !== undefined) throw new Error('이 단원에 선언되지 않은 다중 run 결과입니다.');
  return result;
}
export const EXTENDED_WORKER_TIMEOUT_MS = 30000;
export function createExtendedExecutor(
  factory: () => ExtendedWorker = () => new Worker(new URL('./extended.worker.ts', import.meta.url), { type: 'module' })
): ExtendedExecutor {
  return (request, onEvent) => {
    let worker: ExtendedWorker | undefined,
      finished = false,
      last = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.terminate();
      }
    };
    const fail = (message: string) => {
      if (finished) return;
      stop();
      onEvent({ type: 'error', id: request.id, message });
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => fail('30초 동안 전용 실험 worker 응답이 없습니다. 시간·차원을 줄여 다시 실행하세요.'),
        EXTENDED_WORKER_TIMEOUT_MS
      );
    };
    try {
      worker = factory();
      worker.onmessage = ({ data }) => {
        if (finished || data?.id !== request.id) return;
        if (data.type === 'progress') {
          if (!Number.isFinite(data.fraction) || data.fraction < last || data.fraction > 1) {
            fail('전용 실험 진행률이 유효하지 않습니다.');
            return;
          }
          last = data.fraction;
          arm();
          onEvent(data);
        } else if (data.type === 'result') {
          try {
            const result = validateExtendedResult(data.result, request);
            stop();
            onEvent({ ...data, result });
          } catch {
            fail('전용 실험 worker 결과·단위·입력 계보가 유효하지 않습니다.');
          }
        } else if (data.type === 'error' && typeof data.message === 'string' && data.message.length) {
          fail(data.message.slice(0, 500));
        } else fail('전용 실험 worker 응답을 읽지 못했습니다.');
      };
      worker.onerror = (event) => {
        event.preventDefault();
        fail('전용 실험 worker 계산에 실패했습니다. 설정을 확인하세요.');
      };
      worker.onmessageerror = () => fail('전용 실험 worker 응답을 읽지 못했습니다.');
      arm();
      worker.postMessage(request);
    } catch {
      queueMicrotask(() => fail('전용 실험 worker를 시작하지 못했습니다. 이 환경의 worker 지원과 정책을 확인하세요.'));
    }
    return { dispose: stop };
  };
}
