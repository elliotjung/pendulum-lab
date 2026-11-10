import type { StateVector } from '../physics/types';
import { LabSimulation, type BobPosition } from './LabSimulation';

export interface SimulationStepObserver {
  (state: Readonly<StateVector>): void;
}

export interface SimulationFrameResult {
  state: Readonly<StateVector>;
  time: number;
  energy: number;
  drift: number;
  bobs: BobPosition[];
  physicsMs: number;
  stepsAdvanced: number;
  timingMode: SimulationTimingMode;
  /** Fixed-dt simulation time waiting behind the per-frame catch-up budget. */
  timingDebtSeconds: number;
  /** Cumulative wall time intentionally not simulated because safety bounds were exceeded. */
  droppedSimulationSeconds: number;
}

export type SimulationTimingMode = 'deterministic' | 'wall-clock';

export interface SimulationClockCheckpoint {
  readonly schemaVersion: 'pendulum-simulation-clock-checkpoint/v1';
  readonly lastWallClockMs: number | null;
  readonly timingDebtSeconds: number;
  readonly droppedSimulationSeconds: number;
}

export interface SimulationFrameAccounting {
  readonly dt: number;
  readonly stepsPerFrame: number;
  readonly actualSteps: number;
  readonly mode?: SimulationTimingMode;
  readonly timestampMs?: number;
  readonly speedMultiplier?: number;
  readonly maxWallClockSteps?: number;
}

const MAX_FRAME_STEPS = 1_000_000;
const MAX_WALL_CLOCK_ELAPSED_SECONDS = 0.25;
const MAX_WALL_CLOCK_DEBT_SECONDS = 2;

function finiteNonNegative(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative`);
  return value;
}

function readCheckpoint(input: unknown): SimulationClockCheckpoint {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('Clock checkpoint must be plain data.');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Clock checkpoint must be plain data.');
  const descriptors = Object.getOwnPropertyDescriptors(input),
    keys = Reflect.ownKeys(descriptors);
  const expected = ['schemaVersion', 'lastWallClockMs', 'timingDebtSeconds', 'droppedSimulationSeconds'];
  if (keys.length !== expected.length || keys.some((key) => typeof key !== 'string' || !expected.includes(key)))
    throw new TypeError('Clock checkpoint fields are unsupported.');
  const values: Record<string, unknown> = {};
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
      throw new TypeError('Clock checkpoint accessors are unsupported.');
    values[key] = descriptor.value;
  }
  if (values.schemaVersion !== 'pendulum-simulation-clock-checkpoint/v1')
    throw new TypeError('Clock checkpoint version is unsupported.');
  const last = values.lastWallClockMs,
    debt = values.timingDebtSeconds,
    dropped = values.droppedSimulationSeconds;
  if (
    (last !== null && (typeof last !== 'number' || !Number.isFinite(last) || last < 0)) ||
    typeof debt !== 'number' ||
    !Number.isFinite(debt) ||
    debt < 0 ||
    debt > MAX_WALL_CLOCK_DEBT_SECONDS ||
    typeof dropped !== 'number' ||
    !Number.isFinite(dropped) ||
    dropped < 0
  )
    throw new RangeError('Clock checkpoint values are outside finite timing bounds.');
  return {
    schemaVersion: 'pendulum-simulation-clock-checkpoint/v1',
    lastWallClockMs: last,
    timingDebtSeconds: debt,
    droppedSimulationSeconds: dropped
  };
}

export class SimulationClock {
  private lastWallClockMs: number | null = null;
  private wallClockRemainderSec = 0;
  private totalDroppedSimulationSec = 0;

  reset(clearDiagnostics = true): void {
    this.lastWallClockMs = null;
    this.wallClockRemainderSec = 0;
    if (clearDiagnostics) this.totalDroppedSimulationSec = 0;
  }

  diagnostics(): { timingDebtSeconds: number; droppedSimulationSeconds: number } {
    return {
      timingDebtSeconds: this.wallClockRemainderSec,
      droppedSimulationSeconds: this.totalDroppedSimulationSec
    };
  }

  /** Additive transaction boundary for asynchronous adapters; no solver state is stored. */
  checkpoint(): SimulationClockCheckpoint {
    return Object.freeze(
      readCheckpoint({
        schemaVersion: 'pendulum-simulation-clock-checkpoint/v1',
        lastWallClockMs: this.lastWallClockMs,
        timingDebtSeconds: this.wallClockRemainderSec,
        droppedSimulationSeconds: this.totalDroppedSimulationSec
      })
    );
  }

  restore(input: unknown): void {
    const checked = readCheckpoint(input);
    this.lastWallClockMs = checked.lastWallClockMs;
    this.wallClockRemainderSec = checked.timingDebtSeconds;
    this.totalDroppedSimulationSec = checked.droppedSimulationSeconds;
  }

  /** Account for work an external worker actually completed, including zero.
   * Existing advance() still owns its original positive wall-clock budget validation. */
  accountFrame(options: SimulationFrameAccounting) {
    const mode = options.mode ?? 'deterministic';
    if (mode !== 'deterministic' && mode !== 'wall-clock') throw new RangeError('timing mode is unsupported');
    const requested = finiteNonNegative('stepsPerFrame', options.stepsPerFrame);
    if (requested > MAX_FRAME_STEPS) throw new RangeError(`stepsPerFrame must be at most ${MAX_FRAME_STEPS}`);
    if (!Number.isFinite(options.dt) || options.dt <= 0)
      throw new RangeError('accountFrame dt must be finite and positive.');
    if (!Number.isSafeInteger(options.actualSteps) || options.actualSteps < 0 || options.actualSteps > MAX_FRAME_STEPS)
      throw new RangeError('actualSteps must be a bounded non-negative integer.');
    const before = this.checkpoint();
    try {
      if (mode === 'wall-clock') {
        const speed = finiteNonNegative('speedMultiplier', options.speedMultiplier ?? 1);
        const limit = options.maxWallClockSteps ?? Math.max(1, Math.round(requested * Math.max(1, speed)));
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_FRAME_STEPS || options.actualSteps > limit)
          throw new RangeError('actualSteps exceeds the valid frame budget.');
        const advanced = this.wallClockSteps(
          {
            dt: options.dt,
            stepsPerFrame: requested,
            ...(options.timestampMs === undefined ? {} : { timestampMs: options.timestampMs }),
            speedMultiplier: speed,
            maxWallClockSteps: options.actualSteps
          },
          true
        );
        if (advanced !== options.actualSteps)
          throw new RangeError('actualSteps exceeds the available wall-clock interval.');
      } else if (options.actualSteps > Math.round(requested))
        throw new RangeError('actualSteps exceeds the deterministic frame budget.');
      this.checkpoint(); // New accounting never publishes a non-finite checkpoint.
    } catch (cause) {
      this.restore(before);
      throw cause;
    }
    return {
      stepsAdvanced: options.actualSteps,
      timingMode: mode,
      ...(mode === 'wall-clock'
        ? this.diagnostics()
        : { timingDebtSeconds: 0, droppedSimulationSeconds: this.totalDroppedSimulationSec })
    };
  }

  advance(options: {
    sim: LabSimulation;
    stepsPerFrame: number;
    mode?: SimulationTimingMode;
    timestampMs?: number;
    speedMultiplier?: number;
    maxWallClockSteps?: number;
    bobsScratch: BobPosition[];
    onStep: SimulationStepObserver;
    afterSteps?: (stepsAdvanced: number) => void;
  }): SimulationFrameResult {
    const started = now();
    const mode = options.mode ?? 'deterministic';
    if (mode !== 'deterministic' && mode !== 'wall-clock') throw new RangeError('timing mode is unsupported');
    const requestedSteps = finiteNonNegative('stepsPerFrame', options.stepsPerFrame);
    if (requestedSteps > MAX_FRAME_STEPS) {
      throw new RangeError(`stepsPerFrame must be at most ${MAX_FRAME_STEPS}`);
    }
    const stepsAdvanced =
      mode === 'wall-clock'
        ? this.wallClockSteps({ ...options, stepsPerFrame: requestedSteps })
        : Math.round(requestedSteps);
    for (let step = 0; step < stepsAdvanced; step += 1) {
      options.sim.step(1);
      options.onStep(options.sim.stateView());
    }
    options.afterSteps?.(stepsAdvanced);
    const physicsMs = now() - started;
    const state = options.sim.stateView();
    const energy = options.sim.energy();
    return {
      state,
      time: options.sim.time,
      energy,
      drift: options.sim.driftForEnergy(energy),
      bobs: options.sim.bobPositionsInto(options.bobsScratch),
      physicsMs,
      stepsAdvanced,
      timingMode: mode,
      ...(mode === 'wall-clock'
        ? this.diagnostics()
        : { timingDebtSeconds: 0, droppedSimulationSeconds: this.totalDroppedSimulationSec })
    };
  }

  private wallClockSteps(
    options: ({ sim: LabSimulation } | { dt: number }) & {
      stepsPerFrame: number;
      timestampMs?: number;
      speedMultiplier?: number;
      maxWallClockSteps?: number;
    },
    allowZeroLimit = false
  ): number {
    const timestampMs = finiteNonNegative('timestampMs', options.timestampMs ?? now());
    const dt = Math.max(Number.EPSILON, 'sim' in options ? options.sim.config.dt : options.dt);
    const speed = finiteNonNegative('speedMultiplier', options.speedMultiplier ?? 1);
    // In wall-clock mode `stepsPerFrame` is the adaptive per-frame physics
    // budget.  Previously it was used only to seed the first elapsed-time
    // quantum while every later frame silently fell back to a fixed cap of
    // 180.  That made LabQualityBudget's SPF shedding a no-op under the
    // default real-time mode. Scale the budget for explicit fast-forward so
    // the speed control retains its range, while still letting auto-quality
    // reduce work predictably.
    const requestedMaxSteps =
      options.maxWallClockSteps ?? Math.max(1, Math.round(options.stepsPerFrame * Math.max(1, speed)));
    if (
      !Number.isSafeInteger(requestedMaxSteps) ||
      requestedMaxSteps < (allowZeroLimit ? 0 : 1) ||
      requestedMaxSteps > MAX_FRAME_STEPS
    ) {
      throw new RangeError(
        `maxWallClockSteps must be a safe integer in [${allowZeroLimit ? 0 : 1}, ${MAX_FRAME_STEPS}]`
      );
    }
    const maxSteps = requestedMaxSteps;
    const fallbackElapsedSec = options.stepsPerFrame * dt;
    const rawElapsedSec =
      this.lastWallClockMs === null ? fallbackElapsedSec : Math.max(0, (timestampMs - this.lastWallClockMs) / 1000);
    const elapsedSec = Math.min(MAX_WALL_CLOCK_ELAPSED_SECONDS, rawElapsedSec);
    if (rawElapsedSec > elapsedSec) this.totalDroppedSimulationSec += (rawElapsedSec - elapsedSec) * speed;
    this.lastWallClockMs = timestampMs;
    const available = this.wallClockRemainderSec + elapsedSec * speed;
    const rawSteps = Math.floor(available / dt);
    const steps = Math.min(maxSteps, rawSteps);
    // Preserve catch-up remainder as visible debt instead of silently erasing
    // it when the per-frame step budget is reached. A separate hard debt bound
    // prevents a permanently overloaded session from chasing hours of backlog;
    // any excess is accumulated as an explicit dropped-time diagnostic.
    const remainder = Math.max(0, available - steps * dt);
    this.wallClockRemainderSec = Math.min(MAX_WALL_CLOCK_DEBT_SECONDS, remainder);
    if (remainder > this.wallClockRemainderSec) {
      this.totalDroppedSimulationSec += remainder - this.wallClockRemainderSec;
    }
    return steps;
  }
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
