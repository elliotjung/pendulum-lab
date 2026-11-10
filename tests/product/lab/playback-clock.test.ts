import { describe, expect, it } from 'vitest';
import { SimulationClock } from '../../../src/app/SimulationClock';
import { LabSimulation } from '../../../src/app/LabSimulation';
import { createPlaybackClock, validatePlayback, DEFAULT_PLAYBACK } from '../../../src/product/lab/views/playback-clock';

describe('S28 native playback budget', () => {
  for (const timingMode of ['deterministic', 'wall-clock'] as const)
    for (const speed of [0.1, 1, 1.7, 4]) {
      it(`${timingMode} at ${speed}× uses the actual legacy frame counts and debt`, () => {
        const native = new SimulationClock();
        const product = createPlaybackClock();
        const sim = new LabSimulation({
          system: 'double',
          method: 'rk4',
          dt: 0.002,
          gamma: 0,
          parameters: { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
          initialState: [0.4, 0.2, 0, 0]
        });
        const settings = { ...DEFAULT_PLAYBACK, timingMode, speed, stepsPerFrame: 7 };
        for (const timestampMs of [100, 116, 132, 1000, 1016, 25000, 25016]) {
          const actual = native.advance({
            sim,
            mode: timingMode,
            stepsPerFrame: timingMode === 'deterministic' ? Math.round(7 * speed) : 7,
            timestampMs,
            speedMultiplier: speed,
            bobsScratch: [],
            onStep() {}
          });
          expect(product.next(settings, 0.002, 100000, timestampMs)).toBe(actual.stepsAdvanced);
          expect(product.diagnostics()).toEqual(native.diagnostics());
        }
        native.reset();
        product.reset();
        expect(product.diagnostics()).toEqual(native.diagnostics());
      });
    }
  it('bounds completion and rejects invalid settings before scheduling', () => {
    const clock = createPlaybackClock();
    expect(
      clock.next({ ...DEFAULT_PLAYBACK, timingMode: 'deterministic', speed: 4, stepsPerFrame: 60 }, 0.002, 3, 0)
    ).toBe(3);
    expect(clock.next(DEFAULT_PLAYBACK, 0.002, 0, 1)).toBe(0);
    for (const patch of [
      { speed: NaN },
      { speed: 0 },
      { speed: 4.1 },
      { stepsPerFrame: 1.5 },
      { stepsPerFrame: 61 },
      { timingMode: 'fake' },
      { mode: 'fake' }
    ])
      expect(() => validatePlayback({ ...DEFAULT_PLAYBACK, ...patch } as typeof DEFAULT_PLAYBACK)).toThrow();
    expect(() => clock.next(DEFAULT_PLAYBACK, 0.002, -1, 1)).toThrow();
  });
});
