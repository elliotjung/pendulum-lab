import {
  createDiscreteSimulation,
  validateDiscreteConfig,
  type DiscreteConfig,
  type DiscreteSample
} from '../../adapters/physics/discrete';
import { createDiscreteWorkerClient, type DiscreteWorkerFactory } from '../../adapters/physics/discrete-client';
import {
  DISCRETE_MAX_SAMPLES,
  DISCRETE_WORKER_MAX_STEPS,
  discreteSampleStride,
  type DiscreteWorkerSnapshot
} from '../../adapters/physics/discrete-worker-protocol';

export type DiscreteStatus = 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'error';
const immutable = (sample: DiscreteSample): DiscreteSample => {
  const freeze = (value: unknown): void => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  };
  freeze(sample);
  return sample;
};
/** Iterations run in a dedicated worker; rendering retains bounded observations. */
export function createDiscreteModel(initial: DiscreteConfig, workerFactory?: DiscreteWorkerFactory) {
  const simulation = createDiscreteSimulation(initial);
  let config = simulation.config,
    sample = immutable(simulation.snapshot());
  let samples: readonly DiscreteSample[] = Object.freeze([sample]);
  let status: DiscreteStatus = 'ready',
    valid = true,
    error = '',
    speed = 1,
    busy = false;
  let singleStep = false,
    generation = 0,
    revision = 0,
    disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let client: ReturnType<typeof createDiscreteWorkerClient> | undefined;
  const listeners = new Set<() => void>();
  const notify = () => {
    if (!disposed) listeners.forEach((listener) => listener());
  };
  const haltTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const stop = () => {
    generation++;
    haltTimer();
    client?.dispose();
    client = undefined;
    busy = false;
    singleStep = false;
  };
  const append = (next: readonly DiscreteSample[]) => {
    const additions = next.filter((entry) => entry.step > samples.at(-1)!.step).map(immutable);
    if (additions.length) samples = Object.freeze([...samples, ...additions]);
  };
  const retainFinal = () => append([sample]);
  const accept = (snapshot: DiscreteWorkerSnapshot) => {
    sample = immutable(snapshot.sample);
    if (samples.at(-1)!.step === sample.step) samples = Object.freeze([...samples.slice(0, -1), sample]);
    append(snapshot.samples);
  };
  const ensureClient = () => {
    if (client) return;
    const current = generation;
    busy = true;
    client = createDiscreteWorkerClient(
      config,
      (event) => {
        if (disposed || current !== generation) return;
        busy = false;
        if (event.type === 'error') {
          if (event.snapshot) accept(event.snapshot);
          retainFinal();
          stop();
          status = 'error';
          error = event.message;
        } else if (event.type === 'ready' || event.type === 'progress') {
          accept(event);
          if (event.done) {
            retainFinal();
            stop();
            status = 'completed';
          } else if (singleStep) {
            singleStep = false;
            busy = true;
            client!.advance(1);
          }
        }
        notify();
      },
      workerFactory
    );
  };
  const schedule = () => {
    const current = generation;
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed || current !== generation || status !== 'running') return;
      if (!busy && client) {
        busy = true;
        client.advance(Math.min(DISCRETE_WORKER_MAX_STEPS, Math.max(1, Math.round(4 * speed))));
      }
      if (!disposed && current === generation && status === 'running') schedule();
    }, 16);
  };
  function reset() {
    if (disposed) return;
    stop();
    sample = immutable(createDiscreteSimulation(config).snapshot());
    samples = Object.freeze([sample]);
    revision++;
    status = 'ready';
    error = '';
    notify();
  }
  return {
    get state() {
      return {
        config: structuredClone(config),
        revision,
        sample,
        samples: samples.at(-1)!.step === sample.step ? samples : Object.freeze([...samples, sample]),
        status,
        valid,
        error,
        speed,
        busy,
        sampleStride: discreteSampleStride(config),
        maxSamples: DISCRETE_MAX_SAMPLES,
        progress: status === 'completed' ? 1 : Math.min(1, sample.step / Math.max(1, config.iterations))
      };
    },
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => listeners.delete(listener);
    },
    configure(next: DiscreteConfig) {
      if (disposed) return;
      const checked = validateDiscreteConfig(next);
      if (!checked.ok) throw new Error(checked.issues.map((issue) => issue.message).join(' '));
      createDiscreteSimulation(checked.value).snapshot();
      config = checked.value;
      valid = true;
      reset();
    },
    setValid(next: boolean) {
      if (disposed) return;
      valid = next;
      if (!next) {
        stop();
        retainFinal();
        status = 'cancelled';
      }
      notify();
    },
    setSpeed(next: number) {
      if (!disposed && [0.25, 1, 4].includes(next)) {
        speed = next;
        notify();
      }
    },
    run() {
      if (disposed || !valid || status === 'running') return;
      if (['completed', 'cancelled', 'error'].includes(status)) reset();
      const current = generation;
      status = 'running';
      error = '';
      ensureClient();
      notify();
      if (!disposed && current === generation && status === 'running') schedule();
    },
    pause() {
      if (!disposed && status === 'running') {
        haltTimer();
        status = 'paused';
        notify();
      }
    },
    step() {
      if (disposed || !valid || busy || status === 'running' || status === 'completed') return;
      if (status === 'cancelled' || status === 'error') reset();
      status = 'paused';
      if (!client) {
        singleStep = true;
        ensureClient();
      } else {
        busy = true;
        client.advance(1);
      }
      notify();
    },
    cancel() {
      if (!disposed && (status === 'running' || status === 'paused' || busy)) {
        stop();
        retainFinal();
        status = 'cancelled';
        notify();
      }
    },
    reset,
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      listeners.clear();
    }
  };
}
export type DiscreteModel = ReturnType<typeof createDiscreteModel>;
