import { replayAcceptedSteps, type AdaptiveIntegrationResult } from '../../physics/adaptive';
import type { PlanarConfig } from '../adapters/physics/planar';

/** Fits the existing worker/file envelope (8192 entries per array, 16 MiB total). */
export const ADAPTIVE_ARCHIVE_LIMITS = Object.freeze({ acceptedSteps: 8192, bytes: 16 * 1024 * 1024 });
export interface AdaptiveReplaySettings {
  readonly absTol: number;
  readonly relTol: number;
  readonly initialDt: number;
  readonly maxDt: number;
  readonly minDt: number;
  readonly maxIterations: 20000;
}
export interface AdaptiveReplayRun {
  readonly id: string;
  readonly initialState: readonly number[];
  /** These are the actual arguments; omitted controller coefficients retain native defaults. */
  readonly options: AdaptiveReplaySettings;
  readonly result: Omit<AdaptiveIntegrationResult, 'y'> & { readonly y: readonly number[] };
}
export interface AdaptiveReplayArchiveV1 {
  readonly schema: 'pendulum-adaptive-replay/v1';
  readonly scope: 'all-adaptive-calls';
  readonly runs: readonly AdaptiveReplayRun[];
}
export function adaptiveReplaySpecifications(unitId: string, step: number, tolerance: number) {
  const main = {
    absTol: tolerance,
    relTol: tolerance,
    initialDt: step,
    maxDt: 0.1,
    minDt: 1e-8,
    maxIterations: 20000 as const
  };
  if (unitId !== '2.3' && unitId !== '2.7') throw new Error('적응형 아카이브를 지원하지 않는 단원입니다.');
  return [
    { id: 'main', options: main },
    ...(unitId === '2.7'
      ? [
          { id: 'reference', options: { ...main, absTol: 1e-11, relTol: 1e-11, maxDt: 0.05, minDt: 1e-9 } },
          ...[Math.min(1e-3, tolerance * 10), tolerance, Math.max(1e-10, tolerance / 10)].map((tol, i) => ({
            id: `tolerance-${i}`,
            options: { ...main, absTol: tol, relTol: tol }
          }))
        ]
      : [])
  ];
}

export function createAdaptiveReplayArchive(): AdaptiveReplayArchiveV1 & { runs: AdaptiveReplayRun[] } {
  return { schema: 'pendulum-adaptive-replay/v1', scope: 'all-adaptive-calls', runs: [] };
}
/** Never discard a schedule tail: the entire diagnostic fails if the native result exceeds the cap. */
export function appendAdaptiveReplayRun(
  archive: AdaptiveReplayArchiveV1 & { runs: AdaptiveReplayRun[] },
  id: string,
  initialState: readonly number[],
  options: AdaptiveReplaySettings,
  result: AdaptiveIntegrationResult
): void {
  if (
    archive.runs.length >= 5 ||
    archive.runs.reduce((sum, run) => sum + run.result.acceptedSteps.length, 0) + result.acceptedSteps.length >
      ADAPTIVE_ARCHIVE_LIMITS.acceptedSteps
  )
    throw new Error('전체 적응형 기록이 8,192 수락 단계 한도를 넘었습니다. 결과를 줄여 저장하지 않았습니다.');
  archive.runs.push({
    id,
    initialState: [...initialState],
    options: { ...options },
    result: { ...result, y: Array.from(result.y), acceptedSteps: result.acceptedSteps.map((step) => ({ ...step })) }
  });
  if (new TextEncoder().encode(JSON.stringify(archive)).length > ADAPTIVE_ARCHIVE_LIMITS.bytes)
    throw new Error('전체 적응형 기록이 16 MiB 한도를 넘었습니다. 결과를 줄여 저장하지 않았습니다.');
}

const exactKeys = (value: object, keys: readonly string[]) =>
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const sameNumbers = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/** Call after the descriptor-safe worker/file envelope check; validate every schedule entry, including the tail. */
export function validateAdaptiveReplayArchive(
  archive: AdaptiveReplayArchiveV1 | undefined,
  unitId: string,
  config: PlanarConfig,
  tolerance: number,
  rhs: (state: Float64Array, out: Float64Array) => void
): void {
  if (
    !archive ||
    typeof archive !== 'object' ||
    !exactKeys(archive, ['schema', 'scope', 'runs']) ||
    archive.schema !== 'pendulum-adaptive-replay/v1' ||
    archive.scope !== 'all-adaptive-calls' ||
    !Array.isArray(archive.runs)
  )
    throw new Error('전체 적응형 아카이브가 없습니다.');
  const specifications = adaptiveReplaySpecifications(unitId, config.step, tolerance);
  if (archive.runs.length !== specifications.length) throw new Error('적응형 비교 계산 기록이 누락됐습니다.');
  let count = 0;
  for (const [i, run] of archive.runs.entries()) {
    const specification = specifications[i]!;
    if (
      !run ||
      typeof run !== 'object' ||
      !exactKeys(run, ['id', 'initialState', 'options', 'result']) ||
      run.id !== specification.id ||
      !Array.isArray(run.initialState) ||
      !sameNumbers(run.initialState, config.initialState) ||
      !run.options ||
      typeof run.options !== 'object' ||
      !exactKeys(run.options, Object.keys(specification.options)) ||
      Object.entries(specification.options).some(
        ([key, value]) => run.options[key as keyof AdaptiveReplaySettings] !== value
      )
    )
      throw new Error('적응형 계산의 입력과 설정 계보가 다릅니다.');
    const result = run.result;
    if (
      !result ||
      typeof result !== 'object' ||
      !exactKeys(result, [
        'y',
        'accepted',
        'rejected',
        'steps',
        'finalTime',
        'targetTime',
        'reachedTarget',
        'terminationReason',
        'acceptedSteps',
        'finalSuggestedDt'
      ]) ||
      !Array.isArray(result.y) ||
      result.y.length !== config.initialState.length ||
      !result.y.every(finite) ||
      !Number.isSafeInteger(result.accepted) ||
      result.accepted < 1 ||
      !Number.isSafeInteger(result.rejected) ||
      result.rejected < 0 ||
      result.steps !== result.accepted + result.rejected ||
      result.steps > run.options.maxIterations ||
      result.finalTime !== config.duration ||
      result.targetTime !== config.duration ||
      result.reachedTarget !== true ||
      result.terminationReason !== 'target-reached' ||
      !finite(result.finalSuggestedDt) ||
      result.finalSuggestedDt < run.options.minDt ||
      result.finalSuggestedDt > run.options.maxDt ||
      !Array.isArray(result.acceptedSteps) ||
      result.acceptedSteps.length !== result.accepted
    )
      throw new Error('적응형 네이티브 결과의 최종 상태·종료·카운터가 유효하지 않습니다.');
    count += result.acceptedSteps.length;
    if (count > ADAPTIVE_ARCHIVE_LIMITS.acceptedSteps)
      throw new Error('전체 적응형 기록의 수락 단계 한도를 넘었습니다.');
    let time = 0;
    for (const [index, step] of result.acceptedSteps.entries()) {
      if (
        !step ||
        typeof step !== 'object' ||
        !exactKeys(step, ['index', 'startTime', 'endTime', 'dt', 'errorNorm']) ||
        step.index !== index ||
        step.startTime !== time ||
        !finite(step.endTime) ||
        step.endTime <= time ||
        step.endTime > config.duration ||
        !finite(step.dt) ||
        step.dt <= 0 ||
        step.dt > run.options.maxDt ||
        !finite(step.errorNorm) ||
        step.errorNorm < 0 ||
        step.errorNorm > 1
      )
        throw new Error('적응형 수락 단계의 전체 기록이 유효하지 않습니다.');
      time = step.endTime;
    }
    if (time !== result.finalTime) throw new Error('적응형 수락 단계의 끝부분이 누락됐습니다.');
    const replay = replayAcceptedSteps(Float64Array.from(run.initialState), rhs, result.acceptedSteps);
    if (replay.finalTime !== result.finalTime || !sameNumbers(Array.from(replay.y), result.y))
      throw new Error('전체 적응형 수락 단계의 네이티브 재생이 최종 상태와 다릅니다.');
  }
}
