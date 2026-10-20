import { createDiscreteSession } from './discrete-engine';
import { discreteStepCount } from './discrete-contract';
import { DISCRETE_MAX_SAMPLES, type DiscreteConfig, type DiscreteSample } from './discrete-schema';
export { DISCRETE_MAX_SAMPLES } from './discrete-schema';
export const DISCRETE_WORKER_MAX_STEPS = 64;
export const DISCRETE_WORKER_TIME_BUDGET_MS = 8;
export function discreteSampleStride(c: DiscreteConfig): number {
  return c.sampleEvery * Math.max(1, Math.ceil(discreteStepCount(c) / ((DISCRETE_MAX_SAMPLES - 1) * c.sampleEvery)));
}
export interface DiscreteRetention {
  readonly kind: 'raw' | 'downsampled';
  readonly stride: number;
  readonly totalSteps: number;
  readonly maximumSamples: number;
  readonly includesFinal: true;
  readonly scope: 'retained-iteration-samples';
}
export function discreteRetention(c: DiscreteConfig): DiscreteRetention {
  const stride = discreteSampleStride(c);
  return {
    kind: stride === 1 ? 'raw' : 'downsampled',
    stride,
    totalSteps: discreteStepCount(c),
    maximumSamples: DISCRETE_MAX_SAMPLES,
    includesFinal: true,
    scope: 'retained-iteration-samples'
  };
}
export type DiscreteWorkerRequest =
  | { type: 'initialize'; id: string; sequence: number; config: DiscreteConfig }
  | { type: 'advance'; id: string; sequence: number; count: number }
  | { type: 'cancel'; id: string; sequence: number };
export interface DiscreteWorkerSnapshot {
  readonly sample: DiscreteSample;
  readonly samples: readonly DiscreteSample[];
  readonly sampleStride: number;
  readonly retention: DiscreteRetention;
  readonly advanced: number;
  readonly done: boolean;
}
export type DiscreteWorkerEvent =
  | ({ type: 'ready' | 'progress'; id: string; sequence: number } & DiscreteWorkerSnapshot)
  | { type: 'error'; id: string; sequence: number; message: string; snapshot?: DiscreteWorkerSnapshot }
  | { type: 'cancelled'; id: string; sequence: number };
export function createDiscreteWorkerSession(now: () => number = () => performance.now()) {
  let simulation: ReturnType<typeof createDiscreteSession> | undefined,
    id: string | undefined,
    sequence = -1,
    closed = false;
  return {
    handle(request: DiscreteWorkerRequest): DiscreteWorkerEvent {
      const requestId = typeof request?.id === 'string' ? request.id : '',
        requestSequence = request?.sequence ?? -1;
      let advanced = 0;
      const samples: DiscreteSample[] = [];
      const snapshot = (): DiscreteWorkerSnapshot => ({
        sample: simulation!.snapshot(),
        samples,
        sampleStride: discreteSampleStride(simulation!.config),
        retention: discreteRetention(simulation!.config),
        advanced,
        done: simulation!.done
      });
      try {
        if (closed) throw new Error('이미 종료한 실행입니다. 새 실행을 시작하세요.');
        if (
          !requestId ||
          requestId.length > 128 ||
          !Number.isSafeInteger(requestSequence) ||
          requestSequence !== sequence + 1 ||
          (id !== undefined && requestId !== id)
        )
          throw new Error('실행 ID 또는 요청 순서가 올바르지 않습니다.');
        id = requestId;
        sequence = requestSequence;
        if (request.type === 'initialize') {
          if (simulation) throw new Error('중복 초기화를 할 수 없습니다.');
          simulation = createDiscreteSession(request.config);
          return { type: 'ready', id, sequence, ...snapshot() };
        }
        if (!simulation) throw new Error('초기 설정을 먼저 전달하세요.');
        if (request.type === 'cancel') {
          closed = true;
          simulation = undefined;
          return { type: 'cancelled', id, sequence };
        }
        if (request.type !== 'advance') throw new Error('지원하지 않는 계산 요청입니다.');
        if (!Number.isInteger(request.count) || request.count < 1 || request.count > DISCRETE_WORKER_MAX_STEPS)
          throw new Error(`계산 묶음은 1–${DISCRETE_WORKER_MAX_STEPS}회여야 합니다.`);
        const started = now(),
          stride = discreteSampleStride(simulation.config);
        while (advanced < request.count && !simulation.done) {
          const sample = simulation.step();
          advanced++;
          if (sample.step % stride === 0 || simulation.done) samples.push(sample);
          if (now() - started >= DISCRETE_WORKER_TIME_BUDGET_MS) break;
        }
        return { type: 'progress', id, sequence, ...snapshot() };
      } catch (cause) {
        const last = simulation ? snapshot() : undefined;
        closed = true;
        simulation = undefined;
        return {
          type: 'error',
          id: requestId,
          sequence: requestSequence,
          message: cause instanceof Error ? cause.message : '이산·양자 계산에 실패했습니다.',
          ...(last ? { snapshot: last } : {})
        };
      }
    }
  };
}
