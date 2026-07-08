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
}

export class SimulationClock {
  advance(options: {
    sim: LabSimulation;
    stepsPerFrame: number;
    bobsScratch: BobPosition[];
    onStep: SimulationStepObserver;
    afterSteps?: () => void;
  }): SimulationFrameResult {
    const started = now();
    for (let step = 0; step < options.stepsPerFrame; step += 1) {
      options.sim.step(1);
      options.onStep(options.sim.stateView());
    }
    options.afterSteps?.();
    const physicsMs = now() - started;
    const state = options.sim.stateView();
    const energy = options.sim.energy();
    return {
      state,
      time: options.sim.time,
      energy,
      drift: options.sim.driftForEnergy(energy),
      bobs: options.sim.bobPositionsInto(options.bobsScratch),
      physicsMs
    };
  }
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
