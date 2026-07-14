import { describe, expect, test } from 'vitest';
import { detectEvents, type EventSpec } from '../src/physics/events';
import { rhsDouble, energyDouble } from '../src/physics/double';

// Harmonic oscillator x = cos t, v = -sin t.
function oscillator(state: Float64Array, out: Float64Array): void {
  out[0] = state[1] ?? 0;
  out[1] = -(state[0] ?? 0);
}

describe('event detection on the harmonic oscillator', () => {
  test('locates x = 0 crossings at the analytic times pi/2 + k*pi', () => {
    const specs: EventSpec[] = [{ g: (s) => s[0] ?? 0, label: 'x=0' }];
    const result = detectEvents(new Float64Array([1, 0]), oscillator, specs, {
      dt: 1e-3,
      maxTime: 15,
      rootTol: 1e-10
    });
    // Zeros of cos(t) within [0, 15]: pi/2, 3pi/2, 5pi/2, 7pi/2, 9pi/2 (11pi/2 > 15).
    const expected = [Math.PI / 2, (3 * Math.PI) / 2, (5 * Math.PI) / 2, (7 * Math.PI) / 2, (9 * Math.PI) / 2];
    expect(result.events.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i += 1) {
      expect(Math.abs((result.events[i]?.time ?? 0) - (expected[i] ?? 0))).toBeLessThan(1e-5);
      // x is ~0 at the located state.
      expect(Math.abs(result.events[i]?.state[0] ?? 1)).toBeLessThan(1e-4);
    }
  });

  test('direction filtering reports only falling crossings', () => {
    const specs: EventSpec[] = [{ g: (s) => s[0] ?? 0, direction: 'falling' }];
    const result = detectEvents(new Float64Array([1, 0]), oscillator, specs, { dt: 1e-3, maxTime: 10 });
    // Falling crossings of cos(t) within [0, 10]: pi/2 and 5pi/2 (9pi/2 > 10).
    expect(result.events.length).toBe(2);
    for (const ev of result.events) expect(ev.direction).toBe(-1);
    expect(Math.abs((result.events[0]?.time ?? 0) - Math.PI / 2)).toBeLessThan(1e-5);
  });

  test('maxEvents stops the integration early', () => {
    const specs: EventSpec[] = [{ g: (s) => s[0] ?? 0 }];
    const result = detectEvents(new Float64Array([1, 0]), oscillator, specs, {
      dt: 1e-3,
      maxTime: 100,
      maxEvents: 2
    });
    expect(result.events.length).toBe(2);
    expect(result.finalTime).toBeLessThan(10);
  });

  test('chooses the earliest refined crossing, independent of event-spec order', () => {
    const uniformMotion = (_state: Float64Array, out: Float64Array): void => {
      out[0] = 1;
    };
    const result = detectEvents(
      new Float64Array([0]),
      uniformMotion,
      [
        { g: (s) => (s[0] ?? 0) - 0.8, label: 'later' },
        { g: (s) => (s[0] ?? 0) - 0.2, label: 'earlier' }
      ],
      { dt: 1, maxTime: 1, maxEvents: 1, rootTol: 1e-12 }
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.label).toBe('earlier');
    expect(result.events[0]?.time).toBeCloseTo(0.2, 10);
    // A terminal event ends at its refined crossing, not at the enclosing
    // integration step's endpoint (which would be t=1, x=1).
    expect(result.finalTime).toBeCloseTo(0.2, 10);
    expect(result.finalState[0]).toBeCloseTo(0.2, 10);
  });

  test.each([0, -0.1, Number.NaN, Infinity])('rejects invalid dt=%s before integration', (dt) => {
    expect(() =>
      detectEvents(new Float64Array([1, 0]), oscillator, [{ g: (s) => s[0] ?? 0 }], { dt, maxTime: 1 })
    ).toThrow(/dt must be positive and finite/);
  });
});

describe('Poincare section of the double pendulum', () => {
  test('collects section points on theta2 = 0 (rising) with energy preserved', () => {
    const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
    const rhs = (s: Float64Array, o: Float64Array) => {
      rhsDouble(s, params, 0, o);
    };
    const state0 = new Float64Array([1.0, 0.4, 0, 0]);
    const e0 = energyDouble(state0, params).total;
    const specs: EventSpec[] = [{ g: (s) => s[1] ?? 0, direction: 'rising', label: 'theta2=0' }];
    const result = detectEvents(state0, rhs, specs, { dt: 5e-4, maxTime: 40, rootTol: 1e-9 });
    expect(result.events.length).toBeGreaterThan(3);
    for (const ev of result.events) {
      // On-section: theta2 ~ 0 and rising (omega2 > 0).
      expect(Math.abs(ev.state[1] ?? 1)).toBeLessThan(1e-4);
      expect(ev.state[3] ?? -1).toBeGreaterThan(0);
      // Energy is conserved at each section crossing (RK4, no damping).
      const e = energyDouble(ev.state, params).total;
      expect(Math.abs((e - e0) / e0)).toBeLessThan(1e-4);
    }
  });
});
