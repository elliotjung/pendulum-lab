import { createChainSimulation, type ChainConfig, type ChainSample } from './chain';

export const CHAIN_WORKER_MAX_STEPS = 64;
export const CHAIN_WORKER_TIME_BUDGET_MS = 8;
export const CHAIN_MAX_SAMPLES = 2001;

export function chainSampleStride(config: ChainConfig): number {
  const requested = config.sampleEvery ?? 1;
  const ratio = config.duration / config.step;
  const total = Math.ceil(ratio - 8 * Number.EPSILON * ratio);
  return requested * Math.max(1, Math.ceil(total / ((CHAIN_MAX_SAMPLES - 1) * requested)));
}

export type ChainWorkerRequest =
  | { type: 'initialize'; id: string; sequence: number; config: ChainConfig }
  | { type: 'advance'; id: string; sequence: number; count: number }
  | { type: 'cancel'; id: string; sequence: number };

export interface ChainWorkerSnapshot {
  sample: ChainSample;
  /** Only newly retained samples; the worker never stores the full trajectory. */
  samples: readonly ChainSample[];
  sampleStride: number;
  advanced: number;
  done: boolean;
}

export type ChainWorkerEvent =
  | ({ type: 'ready' | 'progress'; id: string; sequence: number } & ChainWorkerSnapshot)
  | { type: 'error'; id: string; sequence: number; message: string; snapshot?: ChainWorkerSnapshot }
  | { type: 'cancelled'; id: string; sequence: number };

/** A single worker-owned simulation. A request performs at most one bounded chunk. */
export function createChainWorkerSession(now: () => number = () => performance.now()) {
  let simulation: ReturnType<typeof createChainSimulation> | undefined;
  let runId: string | undefined;
  let sequence = -1;
  let closed = false;
  let stride = 1;
  return {
    handle(request: ChainWorkerRequest): ChainWorkerEvent {
      const id = typeof request?.id === 'string' ? request.id : '';
      const nextSequence = Number.isSafeInteger(request?.sequence) ? request.sequence : -1;
      let advanced = 0;
      const samples: ChainSample[] = [];
      try {
        if (closed) throw new Error('이미 종료한 실행입니다. 새 실행을 시작하세요.');
        if (!id || id.length > 128 || nextSequence !== sequence + 1 || (runId !== undefined && runId !== id))
          throw new Error('계산 요청의 실행 ID 또는 순서가 올바르지 않습니다.');
        sequence = nextSequence;
        if (request.type === 'initialize') {
          if (simulation || runId !== undefined) throw new Error('실행을 중복 초기화할 수 없습니다.');
          runId = id;
          simulation = createChainSimulation(request.config);
          stride = chainSampleStride(simulation.config);
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
          request.count > CHAIN_WORKER_MAX_STEPS
        )
          throw new Error(`계산 묶음은 1–${CHAIN_WORKER_MAX_STEPS} 단계여야 합니다.`);
        const started = now();
        while (advanced < request.count && !simulation.done) {
          const sample = simulation.step();
          advanced++;
          if (sample.step % stride === 0 || simulation.done) samples.push(sample);
          // A single legacy step is indivisible; termination can interrupt it.
          if (now() - started >= CHAIN_WORKER_TIME_BUDGET_MS) break;
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
          message: cause instanceof Error ? cause.message : '사슬 계산에 실패했습니다.',
          ...(snapshot === undefined ? {} : { snapshot })
        };
      }
    }
  };
}
