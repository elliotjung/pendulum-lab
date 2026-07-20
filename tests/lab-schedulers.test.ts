import { describe, expect, it } from 'vitest';
import { DiagnosticsScheduler } from '../src/app/DiagnosticsScheduler';
import { LabSimulation, type LabConfig } from '../src/app/LabSimulation';
import { SimulationClock } from '../src/app/SimulationClock';
import { UiTaskQueue } from '../src/app/UiTaskQueue';

const DOUBLE: LabConfig = {
  system: 'double',
  parameters: { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
  gamma: 0,
  method: 'rk4',
  dt: 0.003,
  initialState: [2, 2.5, 0, 0]
};

describe('UiTaskQueue', () => {
  it('runs higher-priority tasks first and coalesces keyed tasks', () => {
    const callbacks: Array<() => void> = [];
    const queue = new UiTaskQueue((callback) => callbacks.push(() => callback()));
    const order: string[] = [];

    queue.schedule({ priority: 0, run: () => order.push('low') });
    queue.schedule({ key: 'plot', priority: 1, run: () => order.push('old-plot') });
    queue.schedule({ key: 'plot', priority: 3, run: () => order.push('new-plot') });
    queue.schedule({ priority: 2, run: () => order.push('mid') });
    callbacks.shift()?.();

    expect(order).toEqual(['new-plot', 'mid', 'low']);
    expect(queue.pendingCount()).toBe(0);
  });
});

describe('DiagnosticsScheduler', () => {
  it('queues only scheduled visible frames and advances plot phases', () => {
    const queue = new UiTaskQueue((callback) => callback());
    const scheduler = new DiagnosticsScheduler(3, queue);
    const plots: number[] = [];

    scheduler.schedule({ frameCount: 1, interval: 2, visible: () => true, draw: (plot) => plots.push(plot) });
    scheduler.schedule({ frameCount: 2, interval: 2, visible: () => false, draw: (plot) => plots.push(plot) });
    scheduler.schedule({ frameCount: 4, interval: 2, visible: () => true, draw: (plot) => plots.push(plot) });
    scheduler.schedule({ frameCount: 6, interval: 2, visible: () => true, draw: (plot) => plots.push(plot) });

    expect(plots).toEqual([0, 1]);
  });
});

describe('SimulationClock', () => {
  it('advances fixed steps and reports a live state view without snapshot copies', () => {
    const sim = new LabSimulation(DOUBLE);
    const clock = new SimulationClock();
    let observed = 0;
    const frame = clock.advance({
      sim,
      stepsPerFrame: 4,
      bobsScratch: [],
      onStep: () => {
        observed += 1;
      }
    });

    expect(observed).toBe(4);
    expect(frame.time).toBeCloseTo(DOUBLE.dt * 4, 12);
    expect(frame.state).toBe(sim.stateView());
    expect(frame.bobs).toHaveLength(2);
    expect(Number.isFinite(frame.physicsMs)).toBe(true);
    expect(frame.stepsAdvanced).toBe(4);
    expect(frame.timingMode).toBe('deterministic');
  });

  it('can advance from wall-clock time with a catch-up cap', () => {
    const sim = new LabSimulation(DOUBLE);
    const clock = new SimulationClock();
    const advanced: number[] = [];

    const first = clock.advance({
      sim,
      mode: 'wall-clock',
      timestampMs: 1_000,
      speedMultiplier: 1,
      maxWallClockSteps: 5,
      stepsPerFrame: 4,
      bobsScratch: [],
      onStep: () => {},
      afterSteps: (steps) => advanced.push(steps)
    });
    const second = clock.advance({
      sim,
      mode: 'wall-clock',
      timestampMs: 1_300,
      speedMultiplier: 1,
      maxWallClockSteps: 5,
      stepsPerFrame: 4,
      bobsScratch: [],
      onStep: () => {},
      afterSteps: (steps) => advanced.push(steps)
    });

    expect(first.stepsAdvanced).toBe(4);
    expect(second.stepsAdvanced).toBe(5);
    expect(advanced).toEqual([4, 5]);
    expect(second.timingMode).toBe('wall-clock');
  });

  it.each([
    [{ stepsPerFrame: Number.NaN }, /stepsPerFrame/],
    [{ stepsPerFrame: -1 }, /stepsPerFrame/],
    [{ stepsPerFrame: 1, mode: 'wall-clock', timestampMs: Number.NaN }, /timestampMs/],
    [{ stepsPerFrame: 1, mode: 'wall-clock', speedMultiplier: -1 }, /speedMultiplier/],
    [{ stepsPerFrame: 1, mode: 'wall-clock', maxWallClockSteps: 0 }, /maxWallClockSteps/]
  ])('rejects malformed scheduler options', (invalid, expected) => {
    const sim = new LabSimulation(DOUBLE);
    const clock = new SimulationClock();
    expect(() =>
      clock.advance({
        sim,
        bobsScratch: [],
        onStep: () => {},
        ...invalid
      } as Parameters<SimulationClock['advance']>[0])
    ).toThrow(expected as RegExp);
  });
});
