import { spatialIsEmbedded, type SpatialConfig, type SpatialSample } from './spatial-schema';
import {
  SPATIAL_WORKER_MAX_STEPS,
  spatialSampleStride,
  type SpatialWorkerEvent,
  type SpatialWorkerRequest,
  type SpatialWorkerSnapshot
} from './spatial-worker-protocol';

export interface SpatialWorker {
  onmessage: ((event: MessageEvent<SpatialWorkerEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: SpatialWorkerRequest): void;
  terminate(): void;
}
export type SpatialWorkerFactory = () => SpatialWorker;
const defaultFactory: SpatialWorkerFactory = () =>
  new Worker(new URL('./spatial.worker.ts', import.meta.url), { type: 'module' });
let runSequence = 0;

/** At most one request in flight. Disposal, completion and every failure terminate the worker. */
export function createSpatialWorkerClient(
  config: SpatialConfig,
  onEvent: (event: SpatialWorkerEvent) => void,
  factory: SpatialWorkerFactory = defaultFactory
) {
  const id = `spatial-${++runSequence}`;
  const n = config.parameters.masses.length;
  const dimension = (spatialIsEmbedded(config.systemId) ? 6 : 4) * n;
  const stride = spatialSampleStride(config);
  const ratio = config.duration / config.step;
  const total = Math.ceil(ratio - 8 * Number.EPSILON * ratio);
  let worker: SpatialWorker | undefined;
  let stopped = false,
    pending = true,
    sequence = 0,
    count = 0,
    previousStep = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timeout);
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
  };
  const fail = (message: string) => {
    if (stopped) return;
    stop();
    onEvent({ type: 'error', id, sequence, message });
  };
  const validSample = (sample: SpatialSample): boolean =>
    !!sample &&
    Number.isSafeInteger(sample.step) &&
    sample.step >= 0 &&
    sample.step <= total &&
    Number.isFinite(sample.time) &&
    sample.time === (config.startTime ?? 0) + Math.min(sample.step * config.step, config.duration) &&
    Array.isArray(sample.state) &&
    sample.state.length === dimension &&
    sample.state.every(Number.isFinite) &&
    !!sample.energy &&
    [sample.energy.KE, sample.energy.PE, sample.energy.total].every(Number.isFinite) &&
    [sample.positions, sample.velocities].every(
      (points) =>
        Array.isArray(points) &&
        points.length === n &&
        points.every((point) => !!point && [point.x, point.y, point.z].every(Number.isFinite))
    ) &&
    !!sample.angularMomentum &&
    [sample.angularMomentum.x, sample.angularMomentum.y, sample.angularMomentum.z].every(Number.isFinite) &&
    sample.verticalMomentum === sample.angularMomentum.y &&
    [sample.constraintErrors, sample.unitConstraintErrors, sample.tangentConstraintErrors, sample.poleProximity].every(
      (values) =>
        Array.isArray(values) && values.length === n && values.every((value) => Number.isFinite(value) && value >= 0)
    ) &&
    Array.isArray(sample.warnings) &&
    sample.warnings.length <= 32 &&
    sample.warnings.every((warning) => typeof warning === 'string' && warning.length <= 4096);
  const validSnapshot = (snapshot: SpatialWorkerSnapshot, failed = false): boolean => {
    if (
      !snapshot ||
      !validSample(snapshot.sample) ||
      snapshot.sampleStride !== stride ||
      !Number.isInteger(snapshot.advanced) ||
      snapshot.advanced < 0 ||
      snapshot.advanced > count ||
      (!failed && sequence > 0 && snapshot.advanced === 0) ||
      snapshot.sample.step !== previousStep + snapshot.advanced ||
      typeof snapshot.done !== 'boolean' ||
      snapshot.done !== (snapshot.sample.step === total) ||
      !Array.isArray(snapshot.samples) ||
      snapshot.samples.length > SPATIAL_WORKER_MAX_STEPS
    )
      return false;
    const expectedSteps: number[] = [];
    for (let step = previousStep + 1; step <= snapshot.sample.step; step++)
      if (step % stride === 0 || (snapshot.done && step === total)) expectedSteps.push(step);
    return (
      snapshot.samples.length === expectedSteps.length &&
      snapshot.samples.every((sample, index) => validSample(sample) && sample.step === expectedSteps[index])
    );
  };
  const send = (request: SpatialWorkerRequest) => {
    clearTimeout(timeout);
    timeout = setTimeout(
      () => fail('계산 worker 응답이 지연되었습니다. 시간 간격과 물성을 확인한 뒤 다시 시도하세요.'),
      15_000
    );
    worker!.postMessage(request);
  };
  try {
    worker = factory();
    worker.onmessage = (event) => {
      const data = event.data;
      if (stopped || data?.id !== id || data.sequence !== sequence || !pending) return;
      if (data.type === 'error') {
        if (
          typeof data.message !== 'string' ||
          data.message.length > 4096 ||
          (data.snapshot !== undefined && !validSnapshot(data.snapshot, true))
        ) {
          fail('계산 worker가 유효하지 않은 오류 결과를 보냈습니다.');
          return;
        }
        stop();
        onEvent(data);
        return;
      }
      if (
        (sequence === 0 ? data.type !== 'ready' : data.type !== 'progress') ||
        (data.type !== 'ready' && data.type !== 'progress') ||
        !validSnapshot(data)
      ) {
        fail('계산 worker가 유효하지 않은 결과를 보냈습니다.');
        return;
      }
      clearTimeout(timeout);
      pending = false;
      previousStep = data.sample.step;
      if (data.done) stop();
      onEvent(data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail('계산 worker를 실행하지 못했습니다. 설정을 확인한 뒤 다시 시도하세요.');
    };
    worker.onmessageerror = () => fail('계산 결과를 읽지 못했습니다. 다시 시도하세요.');
    send({ type: 'initialize', id, sequence, config });
  } catch {
    queueMicrotask(() =>
      fail('이 환경에서 계산 worker를 시작하지 못했습니다. 브라우저의 worker 지원과 정책을 확인하세요.')
    );
  }
  return {
    advance(nextCount: number) {
      if (stopped || pending) return false;
      if (!Number.isInteger(nextCount) || nextCount < 1 || nextCount > SPATIAL_WORKER_MAX_STEPS)
        throw new Error(`계산 묶음은 1–${SPATIAL_WORKER_MAX_STEPS} 단계여야 합니다.`);
      pending = true;
      count = nextCount;
      sequence++;
      try {
        send({ type: 'advance', id, sequence, count });
      } catch {
        fail('계산 worker에 요청을 전달하지 못했습니다. 다시 시도하세요.');
      }
      return true;
    },
    dispose: stop
  };
}
