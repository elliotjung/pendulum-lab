import { discreteStepCount, validateDiscreteConfig } from './discrete-contract';
import { MAX_DISCRETE_MATRIX, discreteWarnings, type DiscreteConfig, type DiscreteSample } from './discrete-schema';
import {
  DISCRETE_WORKER_MAX_STEPS,
  discreteRetention,
  discreteSampleStride,
  type DiscreteWorkerEvent,
  type DiscreteWorkerRequest,
  type DiscreteWorkerSnapshot
} from './discrete-worker-protocol';
export interface DiscreteWorker {
  onmessage: ((event: MessageEvent<DiscreteWorkerEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: DiscreteWorkerRequest): void;
  terminate(): void;
}
export type DiscreteWorkerFactory = () => DiscreteWorker;
const defaultFactory: DiscreteWorkerFactory = () =>
  new Worker(new URL('./discrete.worker.ts', import.meta.url), { type: 'module' });
let runSequence = 0;
function dense(value: unknown, length: number): value is unknown[] {
  if (!Array.isArray(value) || value.length !== length || Object.keys(value).length !== length) return false;
  for (let i = 0; i < length; i++) if (!Object.hasOwn(value, i)) return false;
  return true;
}
const exact = (v: object, keys: readonly string[]) =>
  Object.keys(v).length === keys.length && Object.keys(v).every((k) => keys.includes(k));
const numbers = (v: unknown, n: number): v is number[] =>
  dense(v, n) && v.every((x) => typeof x === 'number' && Number.isFinite(x));
/** One in-flight request. Completion, disposal, failure and timeout release the native worker. */
export function createDiscreteWorkerClient(
  input: DiscreteConfig,
  onEvent: (event: DiscreteWorkerEvent) => void,
  factory: DiscreteWorkerFactory = defaultFactory
) {
  const id = `discrete-${++runSequence}`,
    checked = validateDiscreteConfig(input),
    config = checked.ok ? checked.value : undefined;
  const total = config ? discreteStepCount(config) : 0,
    stride = config ? discreteSampleStride(config) : 1;
  let worker: DiscreteWorker | undefined,
    stopped = false,
    pending = true,
    sequence = 0,
    count = 0,
    previousStep = 0,
    spectrumJson: string | undefined;
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
  const validSample = (input: unknown): input is DiscreteSample => {
    const s = input as DiscreteSample;
    if (
      !config ||
      !s ||
      typeof s !== 'object' ||
      Array.isArray(s) ||
      !Number.isSafeInteger(s.step) ||
      s.step < 0 ||
      s.step > total ||
      s.iteration !== config.startIteration + s.step
    )
      return false;
    const map = config.systemId === 'system:standard-map',
      qkr = config.systemId === 'system:quantum-kicked-rotor',
      n = qkr ? config.gridSize : 0,
      hasSpectrum = !map && (!qkr || config.gridSize <= MAX_DISCRETE_MATRIX);
    if (
      !exact(s, [
        'step',
        'iteration',
        'state',
        'theta',
        'p',
        're',
        'im',
        'momentum',
        'probability',
        'norm',
        'normDrift',
        'meanSquareMomentum',
        'warnings',
        ...(hasSpectrum ? ['spectrum'] : [])
      ])
    )
      return false;
    if (
      !numbers(s.state, map ? 2 : 0) ||
      !numbers(s.re, n) ||
      !numbers(s.im, n) ||
      !numbers(s.momentum, n) ||
      !numbers(s.probability, n) ||
      ![s.theta, s.p, s.norm, s.normDrift, s.meanSquareMomentum].every(
        (x) => typeof x === 'number' && Number.isFinite(x)
      )
    )
      return false;
    if (
      s.theta !== (s.state[0] ?? 0) ||
      s.p !== (s.state[1] ?? 0) ||
      (map && s.step > 0 && (s.theta < 0 || s.theta >= 2 * Math.PI))
    )
      return false;
    if (map && s.step === 0 && s.state.some((v, i) => v !== config.initialState[i])) return false;
    if (qkr) {
      let norm = 0,
        mean = 0;
      for (let i = 0; i < n; i++) {
        const p = s.re[i]! ** 2 + s.im[i]! ** 2,
          m = i < n / 2 ? i : i - n;
        if (s.probability[i] !== p || s.momentum[i] !== m) return false;
        norm += p;
        mean += m * m * p;
      }
      if (
        s.norm !== norm ||
        s.normDrift !== Math.abs(norm - 1) ||
        s.meanSquareMomentum !== (norm > 0 ? mean / norm : 0)
      )
        return false;
      if (
        s.step === 0 &&
        (s.re.some((v, i) => v !== config.wavefunction!.re[i]) || s.im.some((v, i) => v !== config.wavefunction!.im[i]))
      )
        return false;
    } else if (s.norm !== 0 || s.normDrift !== 0 || s.meanSquareMomentum !== 0) return false;
    const warnings = discreteWarnings(config);
    if (!dense(s.warnings, warnings.length) || s.warnings.some((w, i) => w !== warnings[i])) return false;
    if (hasSpectrum) {
      const sp = s.spectrum!,
        dimension = config.gridSize;
      if (
        !sp ||
        typeof sp !== 'object' ||
        !exact(sp, ['eigenvalues', 'phases', 'quasiEnergies', 'unitarityDefect', 'maxUnitCircleDrift']) ||
        !dense(sp.eigenvalues, dimension) ||
        !numbers(sp.phases, dimension) ||
        !numbers(sp.quasiEnergies, dimension) ||
        ![sp.unitarityDefect, sp.maxUnitCircleDrift].every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0)
      )
        return false;
      let drift = 0;
      for (let i = 0; i < dimension; i++) {
        const e = sp.eigenvalues[i]!;
        if (!e || typeof e !== 'object' || !exact(e, ['re', 'im']) || !Number.isFinite(e.re) || !Number.isFinite(e.im))
          return false;
        const phase = Math.atan2(e.im, e.re);
        if (
          sp.phases[i] !== phase ||
          sp.quasiEnergies[i] !== (-config.parameters.hbar! * phase) / (qkr ? 1 : config.parameters.period!) ||
          (i > 0 && sp.phases[i]! < sp.phases[i - 1]!)
        )
          return false;
        drift = Math.max(drift, Math.abs(Math.hypot(e.re, e.im) - 1));
      }
      if (sp.maxUnitCircleDrift !== drift || (spectrumJson !== undefined && JSON.stringify(sp) !== spectrumJson))
        return false;
    }
    return true;
  };
  const validSnapshot = (s: DiscreteWorkerSnapshot, failed = false) => {
    if (
      !config ||
      !s ||
      !validSample(s.sample) ||
      s.sampleStride !== stride ||
      !s.retention ||
      !exact(s.retention, ['kind', 'stride', 'totalSteps', 'maximumSamples', 'includesFinal', 'scope']) ||
      JSON.stringify(s.retention) !== JSON.stringify(discreteRetention(config)) ||
      !Number.isInteger(s.advanced) ||
      s.advanced < 0 ||
      s.advanced > count ||
      (!failed && sequence > 0 && !s.advanced) ||
      s.sample.step !== previousStep + s.advanced ||
      s.done !== (s.sample.step === total) ||
      !Array.isArray(s.samples) ||
      s.samples.length > DISCRETE_WORKER_MAX_STEPS ||
      !dense(s.samples, s.samples.length)
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
  const safeSnapshot = (s: DiscreteWorkerSnapshot, failed = false) => {
    try {
      return validSnapshot(s, failed);
    } catch {
      return false;
    }
  };
  const send = (request: DiscreteWorkerRequest) => {
    clearTimeout(timeout);
    timeout = setTimeout(
      () => fail('계산 worker 응답이 지연되었습니다. 격자·반복 수·행렬을 확인하고 다시 시도하세요.'),
      15000
    );
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
      if (data.sample.spectrum) spectrumJson = JSON.stringify(data.sample.spectrum);
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
      if (!Number.isInteger(nextCount) || nextCount < 1 || nextCount > DISCRETE_WORKER_MAX_STEPS)
        throw new RangeError(`계산 묶음은 1–${DISCRETE_WORKER_MAX_STEPS}회여야 합니다.`);
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
