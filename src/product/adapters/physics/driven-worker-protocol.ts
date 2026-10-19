import { createDrivenSimulation, type DrivenConfig, type DrivenSample } from './driven';

export const DRIVEN_WORKER_MAX_STEPS = 64;
export const DRIVEN_WORKER_TIME_BUDGET_MS = 8;
export const DRIVEN_MAX_SAMPLES = 2001;

export function drivenSampleStride(config: DrivenConfig): number {
  const requested = config.sampleEvery ?? 1;
  const ratio = config.duration / config.step;
  const total = Math.ceil(ratio - 8 * Number.EPSILON * ratio);
  return requested * Math.max(1, Math.ceil(total / ((DRIVEN_MAX_SAMPLES - 1) * requested)));
}

export type DrivenWorkerRequest =
  | { type: 'initialize'; id: string; sequence: number; config: DrivenConfig }
  | { type: 'advance'; id: string; sequence: number; count: number }
  | { type: 'cancel'; id: string; sequence: number };

export interface DrivenWorkerSnapshot {
  sample: DrivenSample;
  /** Newly retained samples only; the worker never stores the full trajectory. */
  samples: readonly DrivenSample[];
  sampleStride: number;
  advanced: number;
  done: boolean;
}

export type DrivenWorkerEvent =
  | ({ type: 'ready' | 'progress'; id: string; sequence: number } & DrivenWorkerSnapshot)
  | { type: 'error'; id: string; sequence: number; message: string; snapshot?: DrivenWorkerSnapshot }
  | { type: 'cancelled'; id: string; sequence: number };

/** One worker-owned simulation, with a bounded number of indivisible legacy steps per request. */
export function createDrivenWorkerSession(now: () => number = () => performance.now()) {
  let simulation: ReturnType<typeof createDrivenSimulation> | undefined;
  let runId: string | undefined;
  let sequence = -1;
  let closed = false;
  let stride = 1;
  return {
    handle(request: DrivenWorkerRequest): DrivenWorkerEvent {
      const id = typeof request?.id === 'string' ? request.id : '';
      const nextSequence = Number.isSafeInteger(request?.sequence) ? request.sequence : -1;
      let advanced = 0;
      const samples: DrivenSample[] = [];
      try {
        if (closed) throw new Error('이미 종료한 실행입니다. 새 실행을 시작하세요.');
        if (!id || id.length > 128 || nextSequence !== sequence + 1 || (runId !== undefined && runId !== id))
          throw new Error('계산 요청의 실행 ID 또는 순서가 올바르지 않습니다.');
        sequence = nextSequence;
        if (request.type === 'initialize') {
          if (simulation || runId !== undefined) throw new Error('실행을 중복 초기화할 수 없습니다.');
          runId = id;
          simulation = createDrivenSimulation(request.config);
          stride = drivenSampleStride(simulation.config);
          return {
            type: 'ready',
            id,
            sequence,
            sample: simulation.snapshot(),
            samples,
            sampleStride: stride,
            advanced,
            done: simulation.done
          };
        }
        if (!simulation) throw new Error('초기 설정을 먼저 전달하세요.');
        if (request.type === 'cancel') {
          closed = true;
          simulation = undefined;
          return { type: 'cancelled', id, sequence };
        }
        if (
          request.type !== 'advance' ||
          !Number.isInteger(request.count) ||
          request.count < 1 ||
          request.count > DRIVEN_WORKER_MAX_STEPS
        )
          throw new Error(`계산 묶음은 1–${DRIVEN_WORKER_MAX_STEPS} 단계여야 합니다.`);
        const started = now();
        while (advanced < request.count && !simulation.done) {
          const sample = simulation.step();
          advanced++;
          if (sample.step % stride === 0 || simulation.done) samples.push(sample);
          if (now() - started >= DRIVEN_WORKER_TIME_BUDGET_MS) break;
        }
        return {
          type: 'progress',
          id,
          sequence,
          sample: simulation.snapshot(),
          samples,
          sampleStride: stride,
          advanced,
          done: simulation.done
        };
      } catch (cause) {
        const snapshot = simulation
          ? { sample: simulation.snapshot(), samples, sampleStride: stride, advanced, done: simulation.done }
          : undefined;
        closed = true;
        simulation = undefined;
        return {
          type: 'error',
          id,
          sequence: nextSequence,
          message: cause instanceof Error ? cause.message : '구동 시스템 계산에 실패했습니다.',
          ...(snapshot === undefined ? {} : { snapshot })
        };
      }
    }
  };
}
