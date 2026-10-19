import { type NonlinearConfig, type NonlinearSample } from './nonlinear-schema';
import { validateNonlinearConfig } from './nonlinear-contract';
import {
  NONLINEAR_WORKER_MAX_STEPS,
  nonlinearSampleStride,
  type NonlinearWorkerEvent,
  type NonlinearWorkerRequest,
  type NonlinearWorkerSnapshot
} from './nonlinear-worker-protocol';

export interface NonlinearWorker {
  onmessage: ((event: MessageEvent<NonlinearWorkerEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: NonlinearWorkerRequest): void;
  terminate(): void;
}
export type NonlinearWorkerFactory = () => NonlinearWorker;
const defaultFactory: NonlinearWorkerFactory = () =>
  new Worker(new URL('./nonlinear.worker.ts', import.meta.url), { type: 'module' });
let runSequence = 0;

/** At most one request in flight. Disposal, completion and every failure terminate the worker. */
export function createNonlinearWorkerClient(
  config: NonlinearConfig,
  onEvent: (event: NonlinearWorkerEvent) => void,
  factory: NonlinearWorkerFactory = defaultFactory
) {
  const id = `nonlinear-${++runSequence}`;
  const n = 1;
  const dimension = config.initialState.length;
  const stride = nonlinearSampleStride(config);
  const ratio = config.duration / config.step;
  const total = Math.ceil(ratio - 8 * Number.EPSILON * ratio);
  let worker: NonlinearWorker | undefined;
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
  const validSample = (sample: NonlinearSample): boolean =>
    !!sample &&
    Number.isSafeInteger(sample.step) &&
    sample.step >= 0 &&
    sample.step <= total &&
    Number.isFinite(sample.time) &&
    sample.time === (config.startTime ?? 0) + Math.min(sample.step * config.step, config.duration) &&
    Array.isArray(sample.state) &&
    sample.state.length === dimension &&
    sample.state.every((x) => Number.isFinite(x) && Math.abs(x) <= 1e6) &&
    [
      sample.energy,
      sample.forcing,
      sample.feedback,
      sample.frictionForce,
      sample.momentumResidual,
      sample.coneResidual
    ].every(Number.isFinite) &&
    ['stick', 'slip', 'smooth'].includes(sample.mode) &&
    typeof sample.energyLabel === 'string' &&
    sample.energyLabel.length <= 256 &&
    typeof sample.energyUnit === 'string' &&
    sample.energyUnit.length <= 64 &&
    !!sample.phase &&
    [sample.phase.x, sample.phase.y].every(Number.isFinite) &&
    Array.isArray(sample.positions) &&
    sample.positions.length === n &&
    sample.positions.every((point) => !!point && [point.x, point.y].every(Number.isFinite)) &&
    Array.isArray(sample.potential) &&
    sample.potential.length ===
      (['system:duffing', 'system:kapitza', 'system:friction'].includes(config.systemId) ? 65 : 0) &&
    sample.potential.every((point) => !!point && [point.x, point.y].every(Number.isFinite)) &&
    Array.isArray(sample.history) &&
    sample.history.length <= 65 &&
    (config.systemId === 'system:pyragas' ? sample.history.length >= 2 : sample.history.length === 0) &&
    sample.history.every(
      (point, i) =>
        !!point &&
        [point.time, point.theta, point.omega].every(Number.isFinite) &&
        point.time <= 0 &&
        (i === 0 || point.time > sample.history[i - 1]!.time)
    ) &&
    (config.systemId === 'system:mathieu'
      ? !!sample.stability &&
        typeof sample.stability.stable === 'boolean' &&
        [sample.stability.spectralRadius, sample.stability.determinantDrift].every((x) => Number.isFinite(x) && x >= 0)
      : sample.stability === undefined) &&
    Array.isArray(sample.warnings) &&
    sample.warnings.length <= 32 &&
    sample.warnings.every((warning) => typeof warning === 'string' && warning.length <= 4096);
  const validSnapshot = (snapshot: NonlinearWorkerSnapshot, failed = false): boolean => {
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
      snapshot.samples.length > NONLINEAR_WORKER_MAX_STEPS
    )
      return false;
    if (config.systemId === 'system:pyragas') {
      const restart = validateNonlinearConfig(snapshot.restartConfig);
      if (
        !restart.ok ||
        restart.value.systemId !== config.systemId ||
        restart.value.startTime !== snapshot.sample.time ||
        restart.value.step !== config.step ||
        restart.value.duration !== config.duration ||
        !restart.value.delayState ||
        restart.value.initialState.some((v, i) => v !== snapshot.sample.state[i]) ||
        Object.keys(config.parameters).some((key) => restart.value.parameters[key] !== config.parameters[key]) ||
        JSON.stringify(restart.value.history) !== JSON.stringify(config.history)
      )
        return false;
    } else if (snapshot.restartConfig !== undefined) return false;
    const expectedSteps: number[] = [];
    for (let step = previousStep + 1; step <= snapshot.sample.step; step++)
      if (step % stride === 0 || (snapshot.done && step === total)) expectedSteps.push(step);
    return (
      snapshot.samples.length === expectedSteps.length &&
      snapshot.samples.every((sample, index) => validSample(sample) && sample.step === expectedSteps[index])
    );
  };
  const send = (request: NonlinearWorkerRequest) => {
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
      if (!Number.isInteger(nextCount) || nextCount < 1 || nextCount > NONLINEAR_WORKER_MAX_STEPS)
        throw new Error(`계산 묶음은 1–${NONLINEAR_WORKER_MAX_STEPS} 단계여야 합니다.`);
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
