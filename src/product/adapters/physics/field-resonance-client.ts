import { inspectSafeData, canonicalJson, type JsonValue } from '../../persistence/safe-data';
import { validateFieldResonanceSettings, fieldResonanceSigmas, type FieldResonanceSettings } from './field-resonance';
import type { FieldResonanceEvent, FieldResonanceRequest } from './field-resonance-worker-protocol';

export interface FieldResonanceWorker {
  onmessage: ((event: MessageEvent<FieldResonanceEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: FieldResonanceRequest): void;
  terminate(): void;
}
export type FieldResonanceWorkerFactory = () => FieldResonanceWorker;
const defaultFactory: FieldResonanceWorkerFactory = () =>
  new Worker(new URL('./field-resonance.worker.ts', import.meta.url), { type: 'module' });
let runSequence = 0;

/** One native response in flight. Every terminal path terminates the worker. */
export function createFieldResonanceClient(
  input: FieldResonanceSettings,
  onEvent: (event: FieldResonanceEvent) => void,
  factory: FieldResonanceWorkerFactory = defaultFactory
) {
  const checked = validateFieldResonanceSettings(input),
    id = `field-resonance-${++runSequence}`;
  let worker: FieldResonanceWorker | undefined,
    stopped = false,
    sequence = 0,
    previousCompleted = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
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
      stop();
      onEvent({ type: 'error', id, sequence, message });
    }
  };
  const send = (request: FieldResonanceRequest) => {
    clearTimeout(timer);
    timer = setTimeout(() => fail('확률 공명 worker 응답이 지연되었습니다. 주기·실현 수를 줄이세요.'), 15000);
    worker!.postMessage(request);
  };
  if (!checked.ok) {
    queueMicrotask(() => fail(checked.issues.map((entry) => entry.message).join(' ')));
    return { dispose: stop };
  }
  const settings = checked.value,
    total = settings.sigmaCount * settings.realizations;
  try {
    worker = factory();
    worker.onmessage = (event) => {
      if (stopped) return;
      const safe = inspectSafeData(event.data);
      if (!safe.ok) {
        fail('확률 공명 worker 데이터 형식을 확인할 수 없습니다.');
        return;
      }
      const data = safe.value as unknown as FieldResonanceEvent;
      if (data?.id !== id || data.sequence !== sequence) return;
      if (data.type === 'error') {
        fail(typeof data.message === 'string' ? data.message : '확률 공명 worker 오류입니다.');
        return;
      }
      if (
        (sequence === 0 ? data.type !== 'ready' : data.type !== 'progress') ||
        (data.type !== 'ready' && data.type !== 'progress') ||
        data.total !== total ||
        data.completed !== (sequence === 0 ? 0 : previousCompleted + 1) ||
        data.done !== (data.completed === total)
      ) {
        fail('확률 공명 worker 진행 순서가 유효하지 않습니다.');
        return;
      }
      if (data.done) {
        const result = data.result,
          sigmas = fieldResonanceSigmas(settings);
        if (
          !result ||
          result.schema !== 'pendulum-stochastic-resonance/v1' ||
          result.algorithmVersion !== 'stochastic-resonance-native-v1' ||
          result.scope !== 'independent-overdamped-quartic' ||
          result.source !== 'stochasticResonanceCurve' ||
          canonicalJson(result.settings as unknown as JsonValue) !== canonicalJson(settings as unknown as JsonValue) ||
          !Array.isArray(result.rows) ||
          result.rows.length !== settings.sigmaCount ||
          !Array.isArray(result.sigmas) ||
          result.sigmas.length !== sigmas.length ||
          result.sigmas.some((value, index) => value !== sigmas[index]) ||
          result.rows.some(
            (row, index) =>
              !row ||
              row.sigma !== sigmas[index] ||
              ![row.responseAmplitude, row.signalPower, row.rightWellFraction, row.transitions].every(
                Number.isFinite
              ) ||
              row.responseAmplitude < 0 ||
              row.signalPower < 0 ||
              row.rightWellFraction < 0 ||
              row.rightWellFraction > 1 ||
              row.transitions < 0
          ) ||
          !Array.isArray(result.warnings) ||
          !result.warnings.every((warning) => typeof warning === 'string')
        ) {
          fail('확률 공명 worker가 유효하지 않은 완료 결과를 보냈습니다.');
          return;
        }
      } else if (data.result !== undefined) {
        fail('미완료 결과를 완료 artifact로 취급할 수 없습니다.');
        return;
      }
      clearTimeout(timer);
      previousCompleted = data.completed;
      if (data.done) stop();
      onEvent(data);
      if (!data.done && !stopped) {
        sequence++;
        try {
          send({ type: 'advance', id, sequence });
        } catch {
          fail('확률 공명 worker 요청을 전달하지 못했습니다.');
        }
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail('확률 공명 worker 실행에 실패했습니다.');
    };
    worker.onmessageerror = () => fail('확률 공명 결과 메시지를 읽지 못했습니다.');
    send({ type: 'initialize', id, sequence, settings });
  } catch {
    queueMicrotask(() => fail('이 환경에서 확률 공명 worker를 시작하지 못했습니다.'));
  }
  return { dispose: stop };
}
