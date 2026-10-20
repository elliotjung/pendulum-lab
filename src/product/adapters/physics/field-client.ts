import { fieldStepCount, validateFieldConfig } from './field-contract';
import { fieldEnsembleProvenance, type FieldConfig, type FieldSample } from './field-schema';
import {
  FIELD_WORKER_MAX_STEPS,
  fieldRetention,
  fieldSampleStride,
  type FieldWorkerEvent,
  type FieldWorkerRequest,
  type FieldWorkerSnapshot
} from './field-worker-protocol';
export interface FieldWorker {
  onmessage: ((event: MessageEvent<FieldWorkerEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: FieldWorkerRequest): void;
  terminate(): void;
}
export type FieldWorkerFactory = () => FieldWorker;
const defaultFactory: FieldWorkerFactory = () =>
  new Worker(new URL('./field.worker.ts', import.meta.url), { type: 'module' });
let runSequence = 0;
/** One in-flight request; completion, disposal, failure and timeout terminate the native worker. */
export function createFieldWorkerClient(
  input: FieldConfig,
  onEvent: (event: FieldWorkerEvent) => void,
  factory: FieldWorkerFactory = defaultFactory
) {
  const id = `field-${++runSequence}`,
    checked = validateFieldConfig(input),
    config = checked.ok ? checked.value : undefined;
  const total = config ? fieldStepCount(config) : 0,
    stride = config ? fieldSampleStride(config) : 1,
    ensemble = config ? fieldEnsembleProvenance(config) : undefined;
  let worker: FieldWorker | undefined,
    stopped = false,
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
    if (!stopped) {
      stop();
      onEvent({ type: 'error', id, sequence, message });
    }
  };
  const finiteArray = (value: unknown, length: number, bound = 1000): value is number[] =>
    Array.isArray(value) &&
    value.length === length &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= bound);
  const exactKeys = (value: object, keys: readonly string[]) =>
    Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
  const validSample = (s: FieldSample) => {
    if (
      !config ||
      !s ||
      typeof s !== 'object' ||
      Array.isArray(s) ||
      !Number.isSafeInteger(s.step) ||
      s.step < 0 ||
      s.step > total ||
      s.time !== (config.startTime ?? 0) + (total > 0 && s.step === total ? config.duration : s.step * config.step)
    )
      return false;
    if (
      !exactKeys(s, [
        'step',
        'time',
        'state',
        'profile',
        'variance',
        'mean',
        'memberStates',
        'previousField',
        'energy',
        'energyUnit',
        'modeEnergies',
        'charge',
        'gradNorm',
        'converged',
        'iterations',
        'ensemble',
        'warnings'
      ])
    )
      return false;
    const n = config.grid.points,
      langevin = config.systemId === 'system:langevin',
      sg = config.systemId === 'system:sine-gordon',
      fput = config.systemId === 'system:fput',
      dimension = langevin ? 2 : sg || fput ? 2 * n : n;
    if (
      !finiteArray(s.state, dimension) ||
      !finiteArray(s.profile, langevin ? 1 : n) ||
      !finiteArray(s.mean, langevin ? 2 : 0) ||
      !finiteArray(s.variance, langevin ? 1 : 0, Number.MAX_VALUE) ||
      !finiteArray(s.previousField, sg ? n : 0) ||
      !Array.isArray(s.memberStates) ||
      s.memberStates.length !== (langevin ? config.ensemble.members : 0) ||
      s.memberStates.some((v) => !finiteArray(v, 2))
    )
      return false;
    if (
      ![s.energy, s.charge, s.gradNorm].every((v) => typeof v === 'number' && Number.isFinite(v)) ||
      s.gradNorm < 0 ||
      typeof s.converged !== 'boolean' ||
      !Number.isSafeInteger(s.iterations) ||
      s.iterations < 0 ||
      s.iterations > 200 ||
      s.energyUnit !== '정규화' ||
      !Array.isArray(s.modeEnergies) ||
      s.modeEnergies.length !== (fput ? n : 0) ||
      s.modeEnergies.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0)
    )
      return false;
    if (
      !s.ensemble ||
      !ensemble ||
      !exactKeys(s.ensemble, ['members', 'seeds', 'generator', 'generatorVersion', 'seedValue', 'memberIds']) ||
      s.ensemble.members !== ensemble.members ||
      s.ensemble.generator !== ensemble.generator ||
      s.ensemble.generatorVersion !== ensemble.generatorVersion ||
      s.ensemble.seedValue !== ensemble.seedValue ||
      !Array.isArray(s.ensemble.seeds) ||
      s.ensemble.seeds.length !== ensemble.seeds.length ||
      s.ensemble.seeds.some((v, i) => v !== ensemble.seeds[i]) ||
      !Array.isArray(s.ensemble.memberIds) ||
      s.ensemble.memberIds.length !== ensemble.memberIds.length ||
      s.ensemble.memberIds.some((v, i) => v !== ensemble.memberIds[i]) ||
      !Array.isArray(s.warnings) ||
      s.warnings.length > 16 ||
      s.warnings.some((v) => typeof v !== 'string' || v.length > 4096)
    )
      return false;
    if (langevin) {
      const mean = [0, 0],
        m2 = [0, 0];
      s.memberStates.forEach((row, r) =>
        row.forEach((v: number, i: number) => {
          const d = v - mean[i]!;
          mean[i] = mean[i]! + d / (r + 1);
          m2[i] = m2[i]! + d * (v - mean[i]!);
        })
      );
      if (
        s.state.some((v, i) => v !== s.memberStates[0]![i]) ||
        s.mean.some((v, i) => v !== mean[i]) ||
        s.profile[0] !== mean[0] ||
        s.variance[0] !== m2[0]! / (config.ensemble.members - 1)
      )
        return false;
      if (
        s.step === 0 &&
        s.memberStates.some((row) => row.some((v: number, i: number) => v !== config.initialState[i]))
      )
        return false;
    } else if (s.profile.some((v, i) => v !== s.state[i])) return false;
    if ((sg || fput) && s.step === 0 && s.state.some((v, i) => v !== config.initialState[i])) return false;
    if (
      sg &&
      (s.step > 0 || config.previousField) &&
      s.profile.some((v, i) => s.state[n + i] !== (v - s.previousField[i]!) / config.step)
    )
      return false;
    return true;
  };
  const validSnapshot = (s: FieldWorkerSnapshot, failed = false) => {
    if (
      !config ||
      !s ||
      !validSample(s.sample) ||
      s.sampleStride !== stride ||
      !s.retention ||
      !exactKeys(s.retention, ['kind', 'stride', 'totalSteps', 'maximumSamples', 'includesFinal', 'scope']) ||
      JSON.stringify(s.retention) !== JSON.stringify(fieldRetention(config)) ||
      !Number.isInteger(s.advanced) ||
      s.advanced < 0 ||
      s.advanced > count ||
      (!failed && sequence > 0 && !s.advanced) ||
      s.sample.step !== previousStep + s.advanced ||
      s.done !== (s.sample.step === total) ||
      !Array.isArray(s.samples) ||
      s.samples.length > FIELD_WORKER_MAX_STEPS
    )
      return false;
    const steps: number[] = [];
    for (let step = previousStep + 1; step <= s.sample.step; step++)
      if (step % stride === 0 || (s.done && step === total)) steps.push(step);
    return (
      s.samples.length === steps.length &&
      s.samples.every(
        (v, i) =>
          validSample(v) &&
          v.step === steps[i] &&
          (v.step !== s.sample.step || JSON.stringify(v) === JSON.stringify(s.sample))
      )
    );
  };
  const safeSnapshot = (s: FieldWorkerSnapshot, failed = false) => {
    try {
      return validSnapshot(s, failed);
    } catch {
      return false;
    }
  };
  const send = (request: FieldWorkerRequest) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fail('계산 worker 응답이 지연되었습니다. 규모·dt를 확인하고 다시 시도하세요.'), 15000);
    worker!.postMessage(request);
  };
  try {
    if (!checked.ok || !config)
      throw new Error(checked.ok ? '유효하지 않은 설정입니다.' : checked.issues.map((i) => i.message).join('\n'));
    worker = factory();
    worker.onmessage = (event) => {
      const data = event.data;
      if (stopped || data?.id !== id || data.sequence !== sequence || !pending) return;
      if (data.type === 'error') {
        if (
          typeof data.message !== 'string' ||
          data.message.length > 4096 ||
          (data.snapshot !== undefined && !safeSnapshot(data.snapshot, true))
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
        !safeSnapshot(data)
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
      fail('계산 worker를 실행하지 못했습니다. 다시 시도하세요.');
    };
    worker.onmessageerror = () => fail('계산 worker 결과를 읽지 못했습니다. 다시 시도하세요.');
    send({ type: 'initialize', id, sequence, config });
  } catch (cause) {
    queueMicrotask(() => fail(cause instanceof Error ? cause.message : '계산 worker를 시작하지 못했습니다.'));
  }
  return {
    advance(nextCount: number) {
      if (stopped || pending) return false;
      if (!Number.isInteger(nextCount) || nextCount < 1 || nextCount > FIELD_WORKER_MAX_STEPS)
        throw new RangeError(`계산 묶음은 1–${FIELD_WORKER_MAX_STEPS} 단계여야 합니다.`);
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
