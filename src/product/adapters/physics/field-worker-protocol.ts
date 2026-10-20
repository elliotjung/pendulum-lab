import { createFieldSimulation, fieldStepCount, FIELD_MAX_SAMPLES, type FieldConfig, type FieldSample } from './field';
export { FIELD_MAX_SAMPLES } from './field-schema';
export const FIELD_WORKER_MAX_STEPS = 64;
export const FIELD_WORKER_TIME_BUDGET_MS = 8;
export function fieldSampleStride(c: FieldConfig): number {
  const requested = c.sampleEvery ?? 1;
  return requested * Math.max(1, Math.ceil(fieldStepCount(c) / ((FIELD_MAX_SAMPLES - 1) * requested)));
}
export interface FieldRetention {
  readonly kind: 'raw' | 'downsampled';
  readonly stride: number;
  readonly totalSteps: number;
  readonly maximumSamples: number;
  readonly includesFinal: true;
  readonly scope: 'retained-integration-samples';
}
export function fieldRetention(c: FieldConfig): FieldRetention {
  const stride = fieldSampleStride(c);
  return {
    kind: stride === 1 ? 'raw' : 'downsampled',
    stride,
    totalSteps: fieldStepCount(c),
    maximumSamples: FIELD_MAX_SAMPLES,
    includesFinal: true,
    scope: 'retained-integration-samples'
  };
}
export type FieldWorkerRequest =
  | { type: 'initialize'; id: string; sequence: number; config: FieldConfig }
  | { type: 'advance'; id: string; sequence: number; count: number }
  | { type: 'cancel'; id: string; sequence: number };
export interface FieldWorkerSnapshot {
  readonly sample: FieldSample;
  readonly samples: readonly FieldSample[];
  readonly sampleStride: number;
  readonly retention: FieldRetention;
  readonly advanced: number;
  readonly done: boolean;
}
export type FieldWorkerEvent =
  | ({ type: 'ready' | 'progress'; id: string; sequence: number } & FieldWorkerSnapshot)
  | { type: 'error'; id: string; sequence: number; message: string; snapshot?: FieldWorkerSnapshot }
  | { type: 'cancelled'; id: string; sequence: number };
export function createFieldWorkerSession(now: () => number = () => performance.now()) {
  let simulation: ReturnType<typeof createFieldSimulation> | undefined,
    id: string | undefined,
    sequence = -1,
    closed = false;
  return {
    handle(request: FieldWorkerRequest): FieldWorkerEvent {
      const requestId = typeof request?.id === 'string' ? request.id : '',
        requestSequence = request?.sequence ?? -1;
      let advanced = 0;
      const samples: FieldSample[] = [];
      const snapshot = (): FieldWorkerSnapshot => ({
        sample: simulation!.snapshot(),
        samples,
        sampleStride: fieldSampleStride(simulation!.config),
        retention: fieldRetention(simulation!.config),
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
          simulation = createFieldSimulation(request.config);
          return { type: 'ready', id, sequence, ...snapshot() };
        }
        if (!simulation) throw new Error('초기 설정을 먼저 전달하세요.');
        if (request.type === 'cancel') {
          closed = true;
          simulation = undefined;
          return { type: 'cancelled', id, sequence };
        }
        if (request.type !== 'advance') throw new Error('지원하지 않는 계산 요청입니다.');
        if (!Number.isInteger(request.count) || request.count < 1 || request.count > FIELD_WORKER_MAX_STEPS)
          throw new Error(`계산 묶음은 1–${FIELD_WORKER_MAX_STEPS} 단계여야 합니다.`);
        const started = now(),
          stride = fieldSampleStride(simulation.config);
        while (advanced < request.count && !simulation.done) {
          const sample = simulation.step();
          advanced++;
          if (sample.step % stride === 0 || simulation.done) samples.push(sample);
          if (now() - started >= FIELD_WORKER_TIME_BUDGET_MS) break;
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
          message: cause instanceof Error ? cause.message : '장 계산에 실패했습니다.',
          ...(last ? { snapshot: last } : {})
        };
      }
    }
  };
}
