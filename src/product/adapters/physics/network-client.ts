import { networkStepCount, validateNetworkConfig } from './network-contract';
import type { NetworkConfig, NetworkSample } from './network-schema';
import {
  NETWORK_WORKER_MAX_STEPS,
  networkSampleStride,
  type NetworkBasinWorkerEvent,
  type NetworkBasinWorkerRequest,
  type NetworkBasinWorkerSnapshot,
  type NetworkWorkerEvent,
  type NetworkWorkerRequest,
  type NetworkWorkerSnapshot
} from './network-worker-protocol';

type Event = NetworkWorkerEvent | NetworkBasinWorkerEvent;
type Request = NetworkWorkerRequest | NetworkBasinWorkerRequest;
export interface NetworkWorker {
  onmessage: ((event: MessageEvent<Event>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: Request): void;
  terminate(): void;
}
export type NetworkWorkerFactory = () => NetworkWorker;
export type NetworkBasinWorkerFactory = NetworkWorkerFactory;
const defaultFactory: NetworkWorkerFactory = () =>
  new Worker(new URL('./network.worker.ts', import.meta.url), { type: 'module' });
let runSequence = 0;
function client(
  input: NetworkConfig,
  basinMode: boolean,
  onEvent: (event: Event) => void,
  factory: NetworkWorkerFactory
) {
  const id = `network-${++runSequence}`,
    checked = validateNetworkConfig(input);
  let worker: NetworkWorker | undefined,
    stopped = false,
    pending = true,
    sequence = 0,
    count = 0,
    previousStep = 0;
  let previousBasin: NetworkBasinWorkerSnapshot['basin'] | undefined;
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
    if (!stopped) {
      stop();
      onEvent({ type: 'error', id, sequence, message });
    }
  };
  const config = checked.ok ? checked.value : undefined;
  const total = config ? networkStepCount(config) : 0,
    stride = config ? networkSampleStride(config) : 1;
  const finiteArray = (a: unknown, length: number): a is number[] =>
    Array.isArray(a) &&
    a.length === length &&
    a.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 1e6);
  const validSample = (s: NetworkSample): boolean => {
    if (
      !config ||
      !s ||
      !Number.isSafeInteger(s.step) ||
      s.step < 0 ||
      s.step > total ||
      s.time !== (config.startTime ?? 0) + Math.min(s.step * config.step, config.duration)
    )
      return false;
    const n = config.graph.nodes.length,
      magnetic = config.systemId === 'system:magnetic';
    return (
      finiteArray(s.state, config.initialState.length) &&
      (s.step !== 0 || s.state.every((v, i) => v === config.initialState[i])) &&
      Array.isArray(s.nodeIds) &&
      s.nodeIds.length === n &&
      s.nodeIds.every((nodeId, i) => nodeId === config.graph.nodes[i]!.id) &&
      finiteArray(s.phases, magnetic ? 0 : n) &&
      s.phases.every((v, i) => v === s.state[i]) &&
      finiteArray(s.localCoherence, magnetic ? 0 : n) &&
      s.localCoherence.every((v) => v >= 0 && v <= 1) &&
      [s.order, s.meanLocalOrder].every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) &&
      [s.energy, s.phaseDifference].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
      typeof s.energyUnit === 'string' &&
      s.energyUnit.length <= 32 &&
      typeof s.classification === 'string' &&
      s.classification.length <= 128 &&
      Array.isArray(s.positions) &&
      s.positions.length === (magnetic ? 1 : n) &&
      s.positions.every((p) => !!p && finiteArray([p.x, p.y], 2)) &&
      Array.isArray(s.warnings) &&
      s.warnings.length <= 32 &&
      s.warnings.every((w) => typeof w === 'string' && w.length <= 4096)
    );
  };
  const validSimulation = (s: NetworkWorkerSnapshot, failed: boolean) => {
    if (
      !s ||
      !validSample(s.sample) ||
      s.sampleStride !== stride ||
      !Number.isInteger(s.advanced) ||
      s.advanced < 0 ||
      s.advanced > count ||
      (!failed && sequence > 0 && !s.advanced) ||
      s.sample.step !== previousStep + s.advanced ||
      s.done !== (s.sample.step === total) ||
      !Array.isArray(s.samples) ||
      s.samples.length > NETWORK_WORKER_MAX_STEPS
    )
      return false;
    const steps: number[] = [];
    for (let step = previousStep + 1; step <= s.sample.step; step++)
      if (step % stride === 0 || (s.done && step === total)) steps.push(step);
    return (
      s.samples.length === steps.length &&
      s.samples.every(
        (sample, i) =>
          validSample(sample) &&
          sample.step === steps[i] &&
          (sample.step !== s.sample.step || JSON.stringify(sample) === JSON.stringify(s.sample))
      )
    );
  };
  const validBasin = (s: NetworkBasinWorkerSnapshot, failed: boolean) => {
    const b = config?.basin,
      grid = s?.basin;
    if (
      !b ||
      !grid ||
      grid.width !== b.size ||
      grid.height !== b.size ||
      grid.total !== b.size ** 2 ||
      !Number.isInteger(grid.completed) ||
      grid.completed < (previousBasin?.completed ?? 0) ||
      grid.completed > grid.total ||
      !Number.isInteger(s.advanced) ||
      s.advanced < 0 ||
      s.advanced > count ||
      (!failed && sequence > 0 && !s.advanced) ||
      grid.completed - (previousBasin?.completed ?? 0) > s.advanced ||
      s.done !== (grid.completed === grid.total) ||
      !Array.isArray(grid.cells) ||
      grid.cells.length !== grid.completed
    )
      return false;
    return grid.cells.every(
      (cell, i) =>
        !!cell &&
        cell.x === b.xMin + ((b.xMax - b.xMin) * (i % b.size)) / (b.size - 1) &&
        cell.y === b.yMin + ((b.yMax - b.yMin) * Math.floor(i / b.size)) / (b.size - 1) &&
        config!.graph.nodes.some((n) => n.id === cell.magnetId) &&
        typeof cell.converged === 'boolean' &&
        Number.isInteger(cell.steps) &&
        cell.steps >= 1 &&
        cell.steps <= b.maxSteps &&
        (i >= (previousBasin?.completed ?? 0) || JSON.stringify(cell) === JSON.stringify(previousBasin!.cells[i]))
    );
  };
  const validSnapshot = (s: NetworkWorkerSnapshot | NetworkBasinWorkerSnapshot, failed = false) =>
    !!s &&
    typeof s === 'object' &&
    !Array.isArray(s) &&
    (basinMode ? 'basin' in s && validBasin(s, failed) : 'sample' in s && validSimulation(s, failed));
  const send = (request: Request) => {
    clearTimeout(timeout);
    timeout = setTimeout(
      () => fail('계산 worker 응답이 지연되었습니다. 규모·시간 간격을 확인하고 다시 시도하세요.'),
      15000
    );
    worker!.postMessage(request);
  };
  try {
    if (!checked.ok || !config)
      throw new Error(checked.ok ? '유효하지 않은 설정입니다.' : checked.issues.map((i) => i.message).join('\n'));
    if (basinMode && config.systemId !== 'system:magnetic')
      throw new Error('자기 모델만 basin 격자를 계산할 수 있습니다.');
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
      if ('sample' in data) previousStep = data.sample.step;
      else previousBasin = structuredClone(data.basin);
      if (data.done) stop();
      onEvent(data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail('계산 worker를 실행하지 못했습니다. 다시 시도하세요.');
    };
    worker.onmessageerror = () => fail('계산 worker 결과를 읽지 못했습니다. 다시 시도하세요.');
    send({ type: basinMode ? 'initialize-basin' : 'initialize', id, sequence, config });
  } catch (cause) {
    queueMicrotask(() => fail(cause instanceof Error ? cause.message : '계산 worker를 시작하지 못했습니다.'));
  }
  return {
    advance(nextCount: number) {
      if (stopped || pending) return false;
      if (!Number.isInteger(nextCount) || nextCount < 1 || nextCount > NETWORK_WORKER_MAX_STEPS)
        throw new RangeError(`계산 묶음은 1–${NETWORK_WORKER_MAX_STEPS} 단계여야 합니다.`);
      pending = true;
      count = nextCount;
      sequence++;
      try {
        send({ type: 'advance', id, sequence, count });
      } catch {
        fail('계산 worker에 요청을 전달하지 못했습니다.');
      }
      return true;
    },
    dispose: stop
  };
}
/** One request in flight; complete, cancel/dispose, failure, timeout all terminate the worker. */
export function createNetworkWorkerClient(
  config: NetworkConfig,
  onEvent: (event: NetworkWorkerEvent) => void,
  factory: NetworkWorkerFactory = defaultFactory
) {
  return client(config, false, (event) => onEvent(event as NetworkWorkerEvent), factory);
}
export function createNetworkBasinClient(
  config: NetworkConfig,
  onEvent: (event: NetworkBasinWorkerEvent) => void,
  factory: NetworkBasinWorkerFactory = defaultFactory
) {
  return client(config, true, (event) => onEvent(event as NetworkBasinWorkerEvent), factory);
}
