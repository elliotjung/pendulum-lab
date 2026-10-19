import {
  createNetworkBasinJob,
  createNetworkSimulation,
  networkStepCount,
  type NetworkBasinSnapshot,
  type NetworkConfig,
  type NetworkSample
} from './network';

export const NETWORK_WORKER_MAX_STEPS = 64;
export const NETWORK_WORKER_TIME_BUDGET_MS = 8;
export const NETWORK_MAX_SAMPLES = 2001;
export function networkSampleStride(config: NetworkConfig): number {
  const requested = config.sampleEvery ?? 1;
  return requested * Math.max(1, Math.ceil(networkStepCount(config) / ((NETWORK_MAX_SAMPLES - 1) * requested)));
}
type ControlRequest =
  { type: 'advance'; id: string; sequence: number; count: number } | { type: 'cancel'; id: string; sequence: number };
export type NetworkWorkerRequest =
  { type: 'initialize'; id: string; sequence: number; config: NetworkConfig } | ControlRequest;
export type NetworkBasinWorkerRequest =
  { type: 'initialize-basin'; id: string; sequence: number; config: NetworkConfig } | ControlRequest;
export interface NetworkWorkerSnapshot {
  readonly sample: NetworkSample;
  readonly samples: readonly NetworkSample[];
  readonly sampleStride: number;
  readonly advanced: number;
  readonly done: boolean;
}
export interface NetworkBasinWorkerSnapshot {
  readonly basin: NetworkBasinSnapshot;
  readonly advanced: number;
  readonly done: boolean;
}
type Failure<T> =
  | { type: 'error'; id: string; sequence: number; message: string; snapshot?: T }
  | { type: 'cancelled'; id: string; sequence: number };
export type NetworkWorkerEvent =
  | ({ type: 'ready' | 'progress'; id: string; sequence: number } & NetworkWorkerSnapshot)
  | Failure<NetworkWorkerSnapshot>;
export type NetworkBasinWorkerEvent =
  | ({ type: 'ready' | 'progress'; id: string; sequence: number } & NetworkBasinWorkerSnapshot)
  | Failure<NetworkBasinWorkerSnapshot>;
const message = (cause: unknown) => (cause instanceof Error ? cause.message : '네트워크 계산에 실패했습니다.');
function requestGuard() {
  let sequence = -1,
    id: string | undefined,
    closed = false;
  return {
    accept(request: { id: string; sequence: number }) {
      if (closed) throw new Error('이미 종료한 실행입니다. 새 실행을 시작하세요.');
      if (
        typeof request?.id !== 'string' ||
        !request.id ||
        request.id.length > 128 ||
        !Number.isSafeInteger(request.sequence) ||
        request.sequence !== sequence + 1 ||
        (id !== undefined && request.id !== id)
      )
        throw new Error('실행 ID 또는 요청 순서가 올바르지 않습니다.');
      sequence = request.sequence;
      id = request.id;
    },
    close: () => {
      closed = true;
    }
  };
}
function checkCount(count: number) {
  if (!Number.isInteger(count) || count < 1 || count > NETWORK_WORKER_MAX_STEPS)
    throw new Error(`계산 묶음은 1–${NETWORK_WORKER_MAX_STEPS} 단계여야 합니다.`);
}
export function createNetworkWorkerSession(now: () => number = () => performance.now()) {
  const guard = requestGuard();
  let simulation: ReturnType<typeof createNetworkSimulation> | undefined,
    stride = 1;
  return {
    handle(request: NetworkWorkerRequest): NetworkWorkerEvent {
      const id = typeof request?.id === 'string' ? request.id : '',
        sequence = request?.sequence ?? -1;
      let advanced = 0;
      const samples: NetworkSample[] = [];
      const snapshot = (): NetworkWorkerSnapshot => ({
        sample: simulation!.snapshot(),
        samples,
        sampleStride: stride,
        advanced,
        done: simulation!.done
      });
      try {
        guard.accept(request);
        if (request.type === 'initialize') {
          if (simulation) throw new Error('중복 초기화를 할 수 없습니다.');
          simulation = createNetworkSimulation(request.config);
          stride = networkSampleStride(simulation.config);
          return { type: 'ready', id, sequence, ...snapshot() };
        }
        if (!simulation) throw new Error('초기 설정을 먼저 전달하세요.');
        if (request.type === 'cancel') {
          guard.close();
          simulation = undefined;
          return { type: 'cancelled', id, sequence };
        }
        if (request.type !== 'advance') throw new Error('지원하지 않는 계산 요청입니다.');
        checkCount(request.count);
        const started = now();
        while (advanced < request.count && !simulation.done) {
          const sample = simulation.step();
          advanced++;
          if (sample.step % stride === 0 || simulation.done) samples.push(sample);
          if (now() - started >= NETWORK_WORKER_TIME_BUDGET_MS) break;
        }
        return { type: 'progress', id, sequence, ...snapshot() };
      } catch (cause) {
        const last = simulation ? snapshot() : undefined;
        guard.close();
        simulation = undefined;
        return { type: 'error', id, sequence, message: message(cause), ...(last ? { snapshot: last } : {}) };
      }
    }
  };
}
export function createNetworkBasinWorkerSession(now: () => number = () => performance.now()) {
  const guard = requestGuard();
  let job: ReturnType<typeof createNetworkBasinJob> | undefined;
  return {
    handle(request: NetworkBasinWorkerRequest): NetworkBasinWorkerEvent {
      const id = typeof request?.id === 'string' ? request.id : '',
        sequence = request?.sequence ?? -1;
      let advanced = 0;
      const snapshot = (): NetworkBasinWorkerSnapshot => ({ basin: job!.snapshot(), advanced, done: job!.done });
      try {
        guard.accept(request);
        if (request.type === 'initialize-basin') {
          if (job) throw new Error('중복 초기화를 할 수 없습니다.');
          job = createNetworkBasinJob(request.config);
          return { type: 'ready', id, sequence, ...snapshot() };
        }
        if (!job) throw new Error('격자 설정을 먼저 전달하세요.');
        if (request.type === 'cancel') {
          guard.close();
          job = undefined;
          return { type: 'cancelled', id, sequence };
        }
        if (request.type !== 'advance') throw new Error('지원하지 않는 계산 요청입니다.');
        checkCount(request.count);
        const started = now();
        while (advanced < request.count && !job.done) {
          job.step();
          advanced++;
          if (now() - started >= NETWORK_WORKER_TIME_BUDGET_MS) break;
        }
        return { type: 'progress', id, sequence, ...snapshot() };
      } catch (cause) {
        const last = job ? snapshot() : undefined;
        guard.close();
        job = undefined;
        return { type: 'error', id, sequence, message: message(cause), ...(last ? { snapshot: last } : {}) };
      }
    }
  };
}
