import {
  createConstraintSimulation,
  validateConstraintConfig,
  type ConstraintConfig,
  type ConstraintSample,
  type ConstraintEvent
} from '../../adapters/physics/constraint';
import { createConstraintWorkerClient, type ConstraintWorkerFactory } from '../../adapters/physics/constraint-client';
import {
  CONSTRAINT_MAX_SAMPLES,
  CONSTRAINT_WORKER_MAX_STEPS,
  constraintSampleStride,
  type ConstraintWorkerSnapshot
} from '../../adapters/physics/constraint-worker-protocol';
import type { AnalysisState } from '../../contracts/experiment';

export type ConstraintStatus = 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'error';

const immutableSample = (sample: ConstraintSample): ConstraintSample => {
  Object.freeze(sample.state);
  Object.freeze(sample.energy);
  sample.positions.forEach(Object.freeze);
  Object.freeze(sample.positions);
  Object.freeze(sample.lengths);
  Object.freeze(sample.tensions);
  Object.freeze(sample.constraintErrors);
  Object.freeze(sample.gaps);
  sample.events.forEach(Object.freeze);
  Object.freeze(sample.events);
  Object.freeze(sample.warnings);
  return Object.freeze(sample);
};

/** Rendering observes bounded samples. All time stepping is isolated in a dedicated worker. */
export function createConstraintModel(initial: ConstraintConfig, workerFactory?: ConstraintWorkerFactory) {
  const initialSimulation = createConstraintSimulation(initial);
  let config = initialSimulation.config;
  let sample = immutableSample(initialSimulation.snapshot());
  let samples: readonly ConstraintSample[] = Object.freeze([sample]);
  let events: readonly ConstraintEvent[] = Object.freeze([...sample.events]);
  let status: ConstraintStatus = 'ready';
  let valid = true;
  let error = '';
  let speed = 1;
  let busy = false;
  let pendingTime = 0;
  let singleStep = false;
  let generation = 0;
  let revision = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let client: ReturnType<typeof createConstraintWorkerClient> | undefined;
  const listeners = new Set<() => void>();
  const isRunning = () => status === 'running';
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
  const append = (next: readonly ConstraintSample[]) => {
    const additions = next.filter((entry) => entry.step > samples[samples.length - 1]!.step).map(immutableSample);
    if (additions.length) samples = Object.freeze([...samples, ...additions]);
  };
  const retainFinal = () => append([sample]);
  const accept = (snapshot: ConstraintWorkerSnapshot) => {
    const elapsed = (snapshot.sample.step - sample.step) * config.step;
    pendingTime = Math.max(0, pendingTime - Math.min(elapsed, config.duration - sample.step * config.step));
    sample = immutableSample(snapshot.sample);
    append(snapshot.samples);
    const lastSequence = events.at(-1)?.sequence ?? -1;
    const additions = snapshot.events
      .filter((event) => event.sequence > lastSequence)
      .map((event) => Object.freeze(event));
    if (additions.length) events = Object.freeze([...events, ...additions]);
  };
  const ensureClient = () => {
    if (client) return;
    const current = generation;
    busy = true;
    client = createConstraintWorkerClient(
      config,
      (event) => {
        if (disposed || generation !== current) return;
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
      pendingTime = Math.min(0.25, pendingTime + 0.016 * speed);
      if (!busy) {
        const remaining = config.duration - sample.step * config.step;
        const tolerance = 8 * Number.EPSILON * Math.max(1, config.duration);
        const count = Math.min(
          CONSTRAINT_WORKER_MAX_STEPS,
          pendingTime + tolerance >= remaining
            ? Math.ceil(remaining / config.step - 8 * Number.EPSILON * (remaining / config.step))
            : Math.floor((pendingTime + tolerance) / config.step)
        );
        if (count > 0) {
          busy = true;
          client!.advance(count);
          notify();
        }
      }
      if (!disposed && current === generation && status === 'running') schedule();
    }, 16);
  };
  function reset() {
    if (disposed) return;
    stop();
    sample = immutableSample(createConstraintSimulation(config).snapshot());
    samples = Object.freeze([sample]);
    events = Object.freeze([...sample.events]);
    pendingTime = 0;
    revision++;
    status = 'ready';
    error = '';
    notify();
  }
  return {
    get state() {
      const visibleSamples = samples.at(-1)!.step === sample.step ? samples : Object.freeze([...samples, sample]);
      return {
        config: structuredClone(config),
        revision,
        sample,
        samples: visibleSamples,
        events,
        status,
        error,
        valid,
        speed,
        busy,
        sampleStride: constraintSampleStride(config),
        maxSamples: CONSTRAINT_MAX_SAMPLES,
        progress: Math.min(1, (sample.step * config.step) / config.duration)
      };
    },
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => listeners.delete(listener);
    },
    configure(next: ConstraintConfig) {
      if (disposed) return;
      const checked = validateConstraintConfig(next);
      if (!checked.ok) throw new Error(checked.issues.map((entry) => entry.message).join(' '));
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
    setAnalyses(analyses: readonly AnalysisState[]) {
      if (disposed) return;
      const checked = validateConstraintConfig({ ...config, analyses });
      if (!checked.ok) throw new Error(checked.issues.map((entry) => entry.message).join(' '));
      config = checked.value;
      notify();
    },
    setSpeed(next: number) {
      if (!disposed && [0.25, 1, 4].includes(next)) {
        speed = next;
        notify();
      }
    },
    run() {
      if (disposed || !valid || isRunning()) return;
      if (status === 'completed' || status === 'cancelled' || status === 'error') reset();
      if (disposed || !valid || isRunning()) return;
      const current = generation;
      status = 'running';
      error = '';
      ensureClient();
      notify();
      if (!disposed && generation === current && status === 'running') schedule();
    },
    pause() {
      if (!disposed && status === 'running') {
        haltTimer();
        status = 'paused';
        // Any current chunk settles while paused. The same worker retains exact state for resume.
        notify();
      }
    },
    step() {
      if (disposed || !valid || busy || status === 'running' || status === 'completed') return;
      if (status === 'error' || status === 'cancelled') reset();
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
export type ConstraintModel = ReturnType<typeof createConstraintModel>;
