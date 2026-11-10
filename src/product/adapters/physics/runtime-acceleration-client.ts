import { fields } from '../../contracts/contract-checks';
import type { ContractIssue } from '../../contracts/validation';
import { canonicalJson, inspectSafeData, type JsonValue } from '../../persistence/safe-data';
import {
  runtimeDifference,
  validateRuntimeAccelerationSettings,
  type RuntimeAccelerationResult
} from './runtime-acceleration';

export interface RuntimeAccelerationRequest {
  readonly type: 'calculate';
  readonly id: string;
  readonly experiment: unknown;
  readonly settings: unknown;
}
export type RuntimeAccelerationEvent =
  | { readonly type: 'result'; readonly id: string; readonly result: RuntimeAccelerationResult }
  | { readonly type: 'error'; readonly id: string; readonly message: string };
export interface RuntimeAccelerationWorker {
  onmessage: ((event: MessageEvent<RuntimeAccelerationEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: RuntimeAccelerationRequest): void;
  terminate(): void;
}
export type RuntimeAccelerationWorkerFactory = () => RuntimeAccelerationWorker;
const defaultFactory: RuntimeAccelerationWorkerFactory = () =>
  new Worker(new URL('./runtime-acceleration.worker.ts', import.meta.url), { type: 'module' });
let runSequence = 0;
const exact = (a: unknown, b: unknown) => canonicalJson(a as JsonValue) === canonicalJson(b as JsonValue);
function validResult(result: RuntimeAccelerationResult, experiment: unknown, settings: unknown): boolean {
  if (
    !result ||
    result.schema !== 'pendulum-runtime-acceleration/v1' ||
    result.algorithmVersion !== 'native-backend-comparison-v1' ||
    !exact(result.experiment, experiment) ||
    !exact(result.settings, settings) ||
    result.kind !== result.settings.kind ||
    !Array.isArray(result.warnings) ||
    !result.warnings.every((entry) => typeof entry === 'string') ||
    !result.capabilities ||
    result.normalization?.policy !== 'finite-json-zero/v1' ||
    !Number.isSafeInteger(result.normalization.negativeZeroToZero) ||
    result.normalization.negativeZeroToZero < 0 ||
    typeof result.capabilities.webgpuApi !== 'boolean' ||
    typeof result.capabilities.wasmSimdSupported !== 'boolean' ||
    !['available', 'unavailable', 'error', 'not-probed'].includes(result.capabilities.webgpuAdapter) ||
    !['available', 'unavailable', 'not-probed'].includes(result.capabilities.wasmEnsembleKernel) ||
    !['available', 'unavailable', 'not-probed'].includes(result.capabilities.wasmNChainKernel)
  )
    return false;
  if (result.kind === 'chain-jacobian-tape') {
    const masses = result.experiment.parameters.masses;
    const length =
      masses?.kind === 'vector'
        ? (result.settings.window + result.settings.forwardTransient) *
          result.settings.renormEvery *
          (2 * masses.values.length) ** 2
        : 0;
    return (
      result.source === 'buildNChainJacobianTapeWasm' &&
      ['wasm-simd', 'cpu'].includes(result.backend) &&
      result.promoted === false &&
      (result.backend === 'cpu' ? result.abiVersion === null : result.abiVersion === 2) &&
      (!result.settings.forceCpu || result.backend === 'cpu') &&
      Array.isArray(result.tape) &&
      result.tape.length === length &&
      Array.isArray(result.cpuTape) &&
      result.cpuTape.length === length &&
      exact(result.tapeDifference, runtimeDifference(result.tape, result.cpuTape)) &&
      Number.isFinite(result.elapsedMs) &&
      result.elapsedMs >= 0 &&
      Number.isFinite(result.cpuElapsedMs) &&
      result.cpuElapsedMs >= 0
    );
  }
  const length = result.settings.gridSize ** 2 * 4;
  return (
    result.source?.gpu === 'runDoublePendulumEnsemble' &&
    result.source.wasm === 'runDoublePendulumEnsembleWasm' &&
    result.source.reduction === 'webgpuEnsembleStatistics' &&
    Array.isArray(result.initialStates) &&
    result.initialStates.length === length &&
    result.cpuOracle?.backend === 'cpu' &&
    !!result.gpu &&
    ['webgpu', 'cpu'].includes(result.gpu.backend) &&
    !!result.wasm &&
    ['wasm', 'cpu'].includes(result.wasm.backend) &&
    (!result.settings.forceCpu ||
      (result.gpu.backend === 'cpu' && result.wasm.backend === 'cpu' && result.gpuReduction === null)) &&
    [result.cpuOracle, result.gpu, result.wasm].every(
      (entry) =>
        Array.isArray(entry.states) &&
        entry.states.length === length &&
        entry.n === length / 4 &&
        entry.steps === result.settings.steps &&
        entry.dt === result.settings.dt &&
        Number.isFinite(entry.elapsedMs) &&
        entry.elapsedMs >= 0
    ) &&
    exact(result.gpuStateDifference, runtimeDifference(result.gpu.states, result.cpuOracle.states)) &&
    exact(result.wasmStateDifference, runtimeDifference(result.wasm.states, result.cpuOracle.states)) &&
    typeof result.gpuStatisticsComparison?.passed === 'boolean'
  );
}
/** Worker lifetime is the boundary for native GPU/Wasm buffers, cancellation and late-result suppression. */
export function createRuntimeAccelerationClient(
  experiment: unknown,
  input: unknown,
  onEvent: (event: RuntimeAccelerationEvent) => void,
  factory: RuntimeAccelerationWorkerFactory = defaultFactory
) {
  const safe = inspectSafeData(experiment),
    checked = validateRuntimeAccelerationSettings(input),
    id = `runtime-acceleration-${++runSequence}`;
  let stopped = false,
    worker: RuntimeAccelerationWorker | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    }
  };
  const fail = (message: string) => {
    if (!stopped) {
      dispose();
      onEvent({ type: 'error', id, message });
    }
  };
  if (!safe.ok || !checked.ok) {
    const issues = !safe.ok ? safe.issues : !checked.ok ? checked.issues : [];
    queueMicrotask(() => fail(issues.map((entry) => entry.message).join(' ')));
    return { dispose };
  }
  try {
    worker = factory();
    worker.onmessage = (event) => {
      if (stopped) return;
      const safeEvent = inspectSafeData(event.data),
        issues: ContractIssue[] = [];
      if (!safeEvent.ok) {
        fail('backend worker가 안전하지 않은 데이터를 보냈습니다.');
        return;
      }
      const value = safeEvent.value;
      if (
        !fields(
          value,
          [
            'type',
            'id',
            ...(value !== null && typeof value === 'object' && !Array.isArray(value) && value.type === 'error'
              ? ['message']
              : ['result'])
          ],
          [],
          '$',
          issues
        ) ||
        issues.length ||
        value.id !== id
      ) {
        fail('backend worker 응답의 실행 ID·형식이 유효하지 않습니다.');
        return;
      }
      if (value.type === 'error') {
        fail(typeof value.message === 'string' ? value.message : 'backend worker 오류입니다.');
        return;
      }
      try {
        const result = value.result as unknown as RuntimeAccelerationResult;
        if (value.type !== 'result' || !validResult(result, safe.value, checked.value)) throw new Error('result');
        dispose();
        onEvent({ type: 'result', id, result });
      } catch {
        fail('backend worker의 실제 backend·출처·완료 결과를 확인할 수 없습니다.');
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail('native backend worker 실행에 실패했습니다.');
    };
    worker.onmessageerror = () => fail('native backend 결과 메시지를 읽지 못했습니다.');
    timer = setTimeout(() => fail('native backend 응답이 지연되었습니다. 작업 크기를 줄이세요.'), 15000);
    worker.postMessage({ type: 'calculate', id, experiment: safe.value, settings: checked.value });
  } catch {
    queueMicrotask(() => fail('이 환경에서 native backend worker를 시작하지 못했습니다.'));
  }
  return { dispose };
}
