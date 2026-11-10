import {
  createPlanarSimulation,
  validatePlanarConfig,
  type PlanarConfig,
  type PlanarSample
} from '../../adapters/physics/planar';
import type { AnalysisState } from '../../contracts/experiment';
import { createPlaybackClock, validatePlayback, type PlaybackSettings } from './playback-clock';

export type CoreStatus = 'ready' | 'running' | 'paused' | 'completed' | 'cancelled' | 'error';

/** A bounded animation scheduler; all physical stepping belongs to the existing engine adapter. */
export function createCoreModel(initial: PlanarConfig, now: () => number = () => performance.now()) {
  let simulation = createPlanarSimulation(initial);
  let config = simulation.config;
  const immutableSample = (sample: PlanarSample): PlanarSample => {
    Object.freeze(sample.state);
    Object.freeze(sample.energy);
    Object.freeze(sample.positions.pivot);
    Object.freeze(sample.positions.first);
    Object.freeze(sample.positions.second);
    sample.positions.centers?.forEach(Object.freeze);
    if (sample.positions.centers) Object.freeze(sample.positions.centers);
    Object.freeze(sample.positions);
    return Object.freeze(sample);
  };
  let sample = immutableSample(simulation.snapshot());
  let previousSample = sample;
  let samples: PlanarSample[] = [sample];
  let status: CoreStatus = 'ready';
  let error = '';
  let valid = true;
  let speed = 1;
  let playback: PlaybackSettings | null = null;
  let effectiveStepsPerFrame: number | null = null;
  let physicsMs = 0;
  const playbackClock = createPlaybackClock();
  let pendingTime = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let disposed = false;
  const listeners = new Set<() => void>();
  const isRunning = () => status === 'running';
  const notify = () => {
    if (!disposed) listeners.forEach((listener) => listener());
  };
  const stop = () => {
    generation++;
    clearTimeout(timer);
    timer = undefined;
  };

  function advance(count: number, accountPlayback = false) {
    let advanced = 0;
    try {
      const started = now();
      try {
        for (let i = 0; i < count && !simulation.done; i++) {
          const next = immutableSample(simulation.step());
          previousSample = sample;
          sample = next;
          advanced++;
          if (sample.step % (config.sampleEvery ?? 1) === 0 || simulation.done) samples.push(sample);
        }
      } finally {
        physicsMs = Math.max(0, now() - started);
        if (accountPlayback) playbackClock.commit(advanced);
      }
      if (simulation.done) {
        status = 'completed';
        stop();
      }
    } catch (cause) {
      retainFinal();
      stop();
      status = 'error';
      error = cause instanceof Error ? cause.message : '계산에 실패했습니다.';
    }
    notify();
  }
  function retainFinal() {
    if (samples[samples.length - 1]!.step !== sample.step) samples.push(sample);
  }
  function schedule() {
    const current = generation;
    timer = setTimeout(() => {
      if (disposed || current !== generation || status !== 'running') return;
      if (playback) {
        const remaining = Math.ceil((config.duration - sample.step * config.step) / config.step - 8 * Number.EPSILON);
        const count = playbackClock.plan(
          { ...playback, stepsPerFrame: effectiveStepsPerFrame ?? playback.stepsPerFrame },
          config.step,
          Math.max(0, remaining),
          performance.now(),
          1_000_000
        );
        if (count > 0) advance(count, true);
        else playbackClock.commit(0);
        if (!disposed && current === generation && status === 'running') schedule();
        return;
      }
      // Carry fractional target time across frames. Bound backlog to 0.25 s and
      // work to 200 steps: a costly run slows down instead of blocking the UI.
      pendingTime = Math.min(0.25, pendingTime + 0.016 * speed);
      let remaining = config.duration - sample.step * config.step;
      let count = 0;
      while (count < 200 && remaining > 0) {
        const dt = Math.min(config.step, remaining);
        if (pendingTime + 8 * Number.EPSILON * Math.max(1, config.duration) < dt) break;
        pendingTime = Math.max(0, pendingTime - dt);
        remaining -= dt;
        count++;
      }
      if (count > 0) advance(count);
      if (!disposed && current === generation && status === 'running') schedule();
    }, 16);
  }
  function reset() {
    if (disposed) return;
    stop();
    simulation = createPlanarSimulation(config);
    sample = immutableSample(simulation.snapshot());
    previousSample = sample;
    samples = [sample];
    pendingTime = 0;
    physicsMs = 0;
    effectiveStepsPerFrame = playback?.stepsPerFrame ?? null;
    playbackClock.reset();
    status = 'ready';
    error = '';
    notify();
  }
  return {
    get state() {
      return {
        config: structuredClone(config),
        samples: samples as readonly PlanarSample[],
        sample,
        previousSample,
        status,
        error,
        valid,
        speed,
        playback,
        effectiveStepsPerFrame,
        physicsMs,
        timingDiagnostics: playbackClock.diagnostics()
      };
    },
    subscribe(listener: () => void) {
      if (!disposed) listeners.add(listener);
      return () => listeners.delete(listener);
    },
    configure(next: PlanarConfig, execution?: PlaybackSettings) {
      if (disposed) return;
      const checked = validatePlanarConfig(next);
      if (!checked.ok) throw new Error(checked.issues.map((item) => item.message).join(' '));
      const timing = execution ? validatePlayback(execution) : playback;
      config = checked.value;
      playback = timing;
      if (timing) speed = timing.speed;
      valid = true;
      reset();
    },
    setValid(next: boolean) {
      if (disposed) return;
      valid = next;
      if (!next) {
        stop();
        status = 'ready';
      }
      notify();
    },
    setAnalyses(analyses: readonly AnalysisState[]) {
      if (disposed) return;
      const checked = validatePlanarConfig({ ...config, analyses });
      if (!checked.ok) throw new Error(checked.issues.map((item) => item.message).join(' '));
      config = checked.value;
      notify();
    },
    setSpeed(next: number) {
      if (!disposed && Number.isFinite(next) && next >= 0.1 && next <= 4) {
        speed = next;
        if (playback) playback = validatePlayback({ ...playback, speed });
        notify();
      }
    },
    setPlayback(next: PlaybackSettings) {
      const checked = validatePlayback(next);
      if (disposed) return;
      playback = checked;
      speed = checked.speed;
      effectiveStepsPerFrame = checked.stepsPerFrame;
      playbackClock.reset();
      notify();
    },
    setEffectivePlaybackBudget(next: number) {
      if (disposed) return false;
      if (!playback || !Number.isSafeInteger(next) || next < 1 || next > playback.stepsPerFrame)
        throw new RangeError('실제 frame 예산은 요청한 단계 수 이내의 양의 정수여야 합니다.');
      if (next === effectiveStepsPerFrame) return false;
      effectiveStepsPerFrame = next;
      notify();
      return true;
    },
    run() {
      if (disposed || !valid || isRunning()) return;
      if (status === 'completed' || status === 'error' || status === 'cancelled') reset();
      if (disposed || !valid || isRunning()) return;
      const current = generation;
      status = 'running';
      error = '';
      notify();
      if (!disposed && current === generation && status === 'running') schedule();
    },
    pause() {
      if (!disposed && status === 'running') {
        stop();
        playbackClock.reset();
        status = 'paused';
        notify();
      }
    },
    step() {
      if (disposed || !valid || status === 'running' || status === 'completed') return;
      status = 'paused';
      advance(1);
    },
    cancel() {
      if (!disposed && (status === 'running' || status === 'paused')) {
        stop();
        retainFinal();
        status = 'cancelled';
        notify();
      }
    },
    reset,
    dispose() {
      stop();
      disposed = true;
      listeners.clear();
    }
  };
}
export type CoreModel = ReturnType<typeof createCoreModel>;
