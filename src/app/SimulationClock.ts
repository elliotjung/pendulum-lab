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
}

export type SimulationTimingMode = 'deterministic' | 'wall-clock';

export class SimulationClock {
  private lastWallClockMs: number | null = null;
  private wallClockRemainderSec = 0;

  reset(): void {
    this.lastWallClockMs = null;
    this.wallClockRemainderSec = 0;
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
    const stepsAdvanced = mode === 'wall-clock'
      ? this.wallClockSteps(options)
      : Math.max(0, Math.round(options.stepsPerFrame));
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
      timingMode: mode
    };
  }

  private wallClockSteps(options: {
    sim: LabSimulation;
    stepsPerFrame: number;
    timestampMs?: number;
    speedMultiplier?: number;
    maxWallClockSteps?: number;
  }): number {
    const timestampMs = options.timestampMs ?? now();
    const dt = Math.max(Number.EPSILON, options.sim.config.dt);
    const speed = Math.max(0, options.speedMultiplier ?? 1);
    const maxSteps = Math.max(1, Math.round(options.maxWallClockSteps ?? 180));
    const fallbackElapsedSec = Math.max(0, options.stepsPerFrame) * dt;
    const elapsedSec = this.lastWallClockMs === null
      ? fallbackElapsedSec
      : Math.max(0, Math.min(0.25, (timestampMs - this.lastWallClockMs) / 1000));
    this.lastWallClockMs = timestampMs;
    const available = this.wallClockRemainderSec + elapsedSec * speed;
    const rawSteps = Math.floor(available / dt);
    const steps = Math.min(maxSteps, rawSteps);
    this.wallClockRemainderSec = rawSteps > maxSteps ? 0 : available - steps * dt;
    return steps;
  }
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
