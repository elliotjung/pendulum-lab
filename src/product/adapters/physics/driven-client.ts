import { type DrivenConfig, type DrivenSample } from './driven-schema';
import {
  DRIVEN_WORKER_MAX_STEPS,
  drivenSampleStride,
  type DrivenWorkerEvent,
  type DrivenWorkerRequest,
  type DrivenWorkerSnapshot
} from './driven-worker-protocol';

export interface DrivenWorker {
  onmessage: ((event: MessageEvent<DrivenWorkerEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: DrivenWorkerRequest): void;
  terminate(): void;
}
export type DrivenWorkerFactory = () => DrivenWorker;
const defaultFactory: DrivenWorkerFactory = () =>
  new Worker(new URL('./driven.worker.ts', import.meta.url), { type: 'module' });
let runSequence = 0;

/** At most one request in flight. Disposal, completion and every failure terminate the worker. */
export function createDrivenWorkerClient(
  config: DrivenConfig,
  onEvent: (event: DrivenWorkerEvent) => void,
  factory: DrivenWorkerFactory = defaultFactory
) {
  const id = `driven-${++runSequence}`;
  const n = ['system:coupled', 'system:cartpole'].includes(config.systemId) ? 2 : 1;
  const dimension = config.initialState.length;
  const stride = drivenSampleStride(config);
  const ratio = config.duration / config.step;
  const total = Math.ceil(ratio - 8 * Number.EPSILON * ratio);
  let worker: DrivenWorker | undefined;
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
  const validSample = (sample: DrivenSample): boolean =>
    !!sample &&
    Number.isSafeInteger(sample.step) &&
    sample.step >= 0 &&
    sample.step <= total &&
    Number.isFinite(sample.time) &&
    sample.time === (config.startTime ?? 0) + Math.min(sample.step * config.step, config.duration) &&
    Array.isArray(sample.state) &&
    sample.state.length === dimension &&
    sample.state.every(Number.isFinite) &&
    [sample.energy, sample.forcing, sample.control, sample.reference, sample.error].every(Number.isFinite) &&
    !!sample.phase &&
    [sample.phase.x, sample.phase.y].every(Number.isFinite) &&
    Array.isArray(sample.positions) &&
    sample.positions.length === n &&
    sample.positions.every((point) => !!point && [point.x, point.y].every(Number.isFinite)) &&
    Array.isArray(sample.warnings) &&
    sample.warnings.length <= 32 &&
    sample.warnings.every((warning) => typeof warning === 'string' && warning.length <= 4096);
  const validSnapshot = (snapshot: DrivenWorkerSnapshot, failed = false): boolean => {
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
      snapshot.samples.length > DRIVEN_WORKER_MAX_STEPS
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
  const send = (request: DrivenWorkerRequest) => {
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
      if (!Number.isInteger(nextCount) || nextCount < 1 || nextCount > DRIVEN_WORKER_MAX_STEPS)
        throw new Error(`계산 묶음은 1–${DRIVEN_WORKER_MAX_STEPS} 단계여야 합니다.`);
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
