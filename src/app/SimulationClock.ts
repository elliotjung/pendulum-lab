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

const MAX_FRAME_STEPS = 1_000_000;
const MAX_WALL_CLOCK_ELAPSED_SECONDS = 0.25;
const MAX_WALL_CLOCK_DEBT_SECONDS = 2;

function finiteNonNegative(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative`);
  return value;
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

  private wallClockSteps(options: {
    sim: LabSimulation;
    stepsPerFrame: number;
    timestampMs?: number;
    speedMultiplier?: number;
    maxWallClockSteps?: number;
  }): number {
    const timestampMs = finiteNonNegative('timestampMs', options.timestampMs ?? now());
    const dt = Math.max(Number.EPSILON, options.sim.config.dt);
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
    if (!Number.isSafeInteger(requestedMaxSteps) || requestedMaxSteps < 1 || requestedMaxSteps > MAX_FRAME_STEPS) {
      throw new RangeError(`maxWallClockSteps must be a safe integer in [1, ${MAX_FRAME_STEPS}]`);
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
