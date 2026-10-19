import {
  drivenHasForcing,
  validateDrivenConfig,
  type DrivenConfig,
  type DrivenSample
} from '../../adapters/physics/driven';
import { createDrivenWorkerClient, type DrivenWorkerFactory } from '../../adapters/physics/driven-client';
import { DRIVEN_WORKER_MAX_STEPS } from '../../adapters/physics/driven-worker-protocol';

export interface DrivenSweepPoint {
  readonly frequency: number;
  readonly amplitude: number;
  readonly samples: number;
}
export type DrivenSweepStatus = 'ready' | 'running' | 'completed' | 'cancelled' | 'error';

/** S13 only: at most six independent forcing frequencies; no shared or persisted job queue. */
export function createDrivenSweep(workerFactory?: DrivenWorkerFactory) {
  let status: DrivenSweepStatus = 'ready',
    progress = 0,
    error = '',
    points: readonly DrivenSweepPoint[] = Object.freeze([]),
    generation = 0,
    disposed = false;
  let client: ReturnType<typeof createDrivenWorkerClient> | undefined;
  const listeners = new Set<() => void>();
  const notify = () => {
    if (!disposed) listeners.forEach((fn) => fn());
  };
  const stop = () => {
    generation++;
    client?.dispose();
    client = undefined;
  };
  return {
    get state() {
      return { status, progress, error, points };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    run(config: DrivenConfig, start: number, end: number, count: number) {
      if (disposed || status === 'running') return;
      if (!drivenHasForcing(config.systemId) || !config.forcing)
        throw new Error('구동 신호가 있는 시스템에서만 주파수 스윕을 실행합니다.');
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end <= start ||
        end > 1000 ||
        !Number.isInteger(count) ||
        count < 2 ||
        count > 6
      )
        throw new Error('0–1000 rad/s 범위에서 시작보다 큰 끝 주파수와 2–6개 지점을 선택하세요.');
      const base = { ...config, duration: Math.min(30, config.duration), sampleEvery: 1 };
      const check = validateDrivenConfig(base);
      if (!check.ok) throw new Error(check.issues.map((i) => i.message).join(' '));
      stop();
      const current = generation;
      status = 'running';
      progress = 0;
      error = '';
      points = Object.freeze([]);
      let index = 0;
      const next = () => {
        if (disposed || generation !== current) return;
        const frequency = start + ((end - start) * index) / (count - 1);
        const settings = { ...check.value, forcing: { ...config.forcing!, frequency } };
        let lower = Infinity,
          upper = -Infinity,
          n = 0,
          lastStep = -1;
        const accept = (samples: readonly DrivenSample[]) => {
          for (const sample of samples) {
            if (sample.step <= lastStep) continue;
            lastStep = sample.step;
            if (sample.time - (settings.startTime ?? 0) < settings.duration / 2) continue;
            const theta = sample.state[settings.systemId === 'system:cartpole' ? 1 : 0]!;
            lower = Math.min(lower, theta);
            upper = Math.max(upper, theta);
            n++;
          }
        };
        client = createDrivenWorkerClient(
          settings,
          (event) => {
            if (disposed || generation !== current) return;
            if (event.type === 'error') {
              stop();
              status = 'error';
              error = event.message;
              notify();
              return;
            }
            if (event.type !== 'ready' && event.type !== 'progress') return;
            accept(event.samples);
            accept([event.sample]);
            progress = (index + Math.min(1, (event.sample.step * settings.step) / settings.duration)) / count;
            if (event.done) {
              client?.dispose();
              client = undefined;
              if (n < 2 || !Number.isFinite(upper - lower)) {
                stop();
                status = 'error';
                error = '후반부 진폭을 추정할 기록이 부족합니다. 관찰 시간을 늘리거나 시간 간격을 줄이세요.';
                notify();
                return;
              }
              points = Object.freeze([
                ...points,
                Object.freeze({ frequency, amplitude: (upper - lower) / 2, samples: n })
              ]);
              index++;
              if (index === count) {
                status = 'completed';
                progress = 1;
                notify();
              } else {
                notify();
                next();
              }
            } else {
              notify();
              if (!disposed && generation === current && status === 'running') client?.advance(DRIVEN_WORKER_MAX_STEPS);
            }
          },
          workerFactory
        );
      };
      notify();
      next();
    },
    cancel() {
      if (!disposed && status === 'running') {
        stop();
        status = 'cancelled';
        notify();
      }
    },
    reset() {
      if (disposed) return;
      stop();
      status = 'ready';
      progress = 0;
      error = '';
      points = Object.freeze([]);
      notify();
    },
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      listeners.clear();
    }
  };
}
