import type { ChainConfig, ChainSample } from './chain';
import {
  CHAIN_WORKER_MAX_STEPS,
  chainSampleStride,
  type ChainWorkerEvent,
  type ChainWorkerRequest,
  type ChainWorkerSnapshot
} from './chain-worker-protocol';

export interface ChainWorker {
  onmessage: ((event: MessageEvent<ChainWorkerEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: ChainWorkerRequest): void;
  terminate(): void;
}
export type ChainWorkerFactory = () => ChainWorker;
const defaultFactory: ChainWorkerFactory = () =>
  new Worker(new URL('./chain.worker.ts', import.meta.url), { type: 'module' });
let runSequence = 0;

/** At most one request in flight. Every terminal path terminates the actual worker. */
export function createChainWorkerClient(
  config: ChainConfig,
  onEvent: (event: ChainWorkerEvent) => void,
  factory: ChainWorkerFactory = defaultFactory
) {
  const id = `chain-${++runSequence}`;
  const n = config.parameters.masses.length;
  const stride = chainSampleStride(config);
  let worker: ChainWorker | undefined;
  let stopped = false;
  let pending = true;
  let sequence = 0;
  let count = 0;
  let previousStep = 0;
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
  const validSample = (sample: ChainSample): boolean =>
    !!sample &&
    Number.isSafeInteger(sample.step) &&
    sample.step >= 0 &&
    Number.isFinite(sample.time) &&
    sample.time === (config.startTime ?? 0) + Math.min(sample.step * config.step, config.duration) &&
    Array.isArray(sample.state) &&
    sample.state.length === n * 2 &&
    sample.state.every(Number.isFinite) &&
    !!sample.energy &&
    [sample.energy.KE, sample.energy.PE, sample.energy.total].every(Number.isFinite) &&
    Array.isArray(sample.positions) &&
    sample.positions.length === n &&
    sample.positions.every((point) => !!point && Number.isFinite(point.x) && Number.isFinite(point.y));
  const validSnapshot = (snapshot: ChainWorkerSnapshot, failed = false): boolean => {
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
      snapshot.done !== snapshot.sample.step * config.step >= config.duration - 8 * Number.EPSILON * config.duration ||
      !Array.isArray(snapshot.samples) ||
      snapshot.samples.length > CHAIN_WORKER_MAX_STEPS
    )
      return false;
    let last = previousStep;
    for (const sample of snapshot.samples) {
      if (
        !validSample(sample) ||
        sample.step <= last ||
        sample.step > snapshot.sample.step ||
        (sample.step % stride !== 0 && !(snapshot.done && sample.step === snapshot.sample.step))
      )
        return false;
      last = sample.step;
    }
    return true;
  };
  const send = (request: ChainWorkerRequest) => {
    clearTimeout(timeout);
    timeout = setTimeout(
      () => fail('계산 worker 응답이 지연되었습니다. 시간 간격과 링크 수를 확인한 뒤 다시 시도하세요.'),
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
        if (typeof data.message !== 'string' || (data.snapshot !== undefined && !validSnapshot(data.snapshot, true))) {
          fail('계산 worker가 유효하지 않은 오류 결과를 보냈습니다.');
          return;
        }
        stop();
        onEvent(data);
        return;
      }
      if (
        (data.type !== 'ready' && data.type !== 'progress') ||
        (sequence === 0 ? data.type !== 'ready' : data.type !== 'progress') ||
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
      if (!Number.isInteger(nextCount) || nextCount < 1 || nextCount > CHAIN_WORKER_MAX_STEPS)
        throw new Error(`계산 묶음은 1–${CHAIN_WORKER_MAX_STEPS} 단계여야 합니다.`);
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
