import { describe, expect, it, test } from 'vitest';
import {
  createStepController,
  dormandPrince54Step,
  dormandPrince54StepDense,
  integrateAdaptive
} from '../src/physics/adaptive';
import { refineCrossing, locateTransition } from '../src/physics/eventLocator';
import { detectEvents } from '../src/physics/events';
import { rk4Step } from '../src/physics/integrators';
import { RopePendulum } from '../src/physics/rope';
import { DoubleStringPendulum, type DoubleStringParams } from '../src/physics/doubleString';
import { rhsDriven, DAMPED_DRIVEN_CHAOS_PRESET } from '../src/physics/driven';
import type { Derivative, StateVector } from '../src/physics/types';

/** Simple harmonic oscillator y'' = −y, exact solution available. */
const sho: Derivative = (s, o) => {
  o[0] = Number(s[1] ?? 0);
  o[1] = -Number(s[0] ?? 0);
};

describe('Dormand-Prince dense output', () => {
  it('matches the plain step at both endpoints exactly', () => {
    const state = Float64Array.from([1, 0.3]);
    const plain = dormandPrince54Step(state, 0.1, sho);
    const dense = dormandPrince54StepDense(state, 0.1, sho);
    expect(Array.from(dense.y)).toEqual(Array.from(plain.y));
    expect(dense.error).toBe(plain.error);
    const out = new Float64Array(2);
    dense.interpolate(0, out);
    expect(Array.from(out)).toEqual(Array.from(state));
    dense.interpolate(1, out);
    for (let i = 0; i < 2; i += 1) expect(Math.abs((out[i] ?? 0) - (dense.y[i] ?? 0))).toBeLessThan(1e-15);
  });

  it('interpolates mid-step with 4th-order accuracy (O(h^5) local error)', () => {
    // Wrong dense-output weights would degrade the convergence ratio toward
    // ~16 (order 3); the correct interpolant converges at ~32 per halving.
    const state = Float64Array.from([1, 0]);
    const out = new Float64Array(2);
    const midError = (h: number): number => {
      const dense = dormandPrince54StepDense(state, h, sho);
      dense.interpolate(0.5, out);
      const t = h / 2;
      return Math.max(Math.abs((out[0] ?? 0) - Math.cos(t)), Math.abs((out[1] ?? 0) + Math.sin(t)));
    };
    const e1 = midError(0.4);
    const e2 = midError(0.2);
    const e3 = midError(0.1);
    expect(e1 / e2).toBeGreaterThan(22);
    expect(e2 / e3).toBeGreaterThan(22);
  });
});

describe('step controllers', () => {
  it('basic controller reproduces the legacy elementary factor', () => {
    const controller = createStepController({ kind: 'basic', order: 5 });
    expect(controller.factor(0, true)).toBe(5);
    // err = 1 → factor = safety = 0.9
    expect(controller.factor(1, true)).toBeCloseTo(0.9, 12);
    // err = 2^5 → err^(−1/5) = 1/2 → 0.45
    expect(controller.factor(32, false)).toBeCloseTo(0.45, 12);
  });

  it('PI controller damps growth after a large-error step and never grows off a rejection', () => {
    const controller = createStepController({ kind: 'pi', order: 5 });
    const afterBigError = controller.factor(0.9, true);
    // Memory of the previous large error keeps the next factor conservative
    // relative to the memoryless controller fed the same small error.
    const piNext = controller.factor(1e-4, true);
    const basic = createStepController({ kind: 'basic', order: 5 });
    basic.factor(0.9, true);
    const basicNext = basic.factor(1e-4, true);
    expect(piNext).toBeLessThan(basicNext);
    expect(afterBigError).toBeGreaterThan(0);
    const rejected = controller.factor(40, false);
    expect(rejected).toBeLessThanOrEqual(1);
  });

  it('PI-controlled integration reaches the same answer with fewer or comparable rejections', () => {
    const rhs: Derivative = (s, o) => {
      rhsDriven(s, DAMPED_DRIVEN_CHAOS_PRESET, o);
    };
    const y0 = Float64Array.from([0.2, 0, 0]);
    const basic = integrateAdaptive(y0, 30, rhs, { absTol: 1e-9, relTol: 1e-8 });
    const pi = integrateAdaptive(y0, 30, rhs, { absTol: 1e-9, relTol: 1e-8, controller: 'pi' });
    for (let i = 0; i < 3; i += 1) {
      expect(Math.abs((basic.y[i] ?? 0) - (pi.y[i] ?? 0))).toBeLessThan(1e-5);
    }
    expect(pi.rejected).toBeLessThanOrEqual(basic.rejected * 2 + 4);
    expect(pi.accepted).toBeGreaterThan(0);
  });
});

describe('shared event locator', () => {
  it('refines a polynomial crossing to the requested tolerance', () => {
    const g = (t: number): number => (t - 0.37) * (t + 2);
    const crossing = refineCrossing(g, 0, 1, g(0), g(1), { tol: 1e-12 });
    expect(Math.abs(crossing.tAfter - 0.37)).toBeLessThan(1e-10);
    expect(crossing.iterations).toBeLessThan(60);
  });

  it('locateTransition rejects a degenerate bracket', () => {
    const result = locateTransition((t) => 1 + t, 0.5, 1, 1.5);
    expect(result.tAfter).toBe(0.5);
    expect(result.iterations).toBe(0);
  });

  it('dense-output event detection agrees with the RK4 path', () => {
    const state0 = Float64Array.from([1, 0]);
    const section = (s: StateVector): number => Number(s[0] ?? 0); // x = 0 crossings at t = π/2, 3π/2…
    const base = detectEvents(state0, sho, [{ g: section, direction: 'falling' }], {
      dt: 0.01,
      maxTime: 2,
      rootTol: 1e-10
    });
    const dense = detectEvents(state0, sho, [{ g: section, direction: 'falling' }], {
      dt: 0.01,
      maxTime: 2,
      rootTol: 1e-10,
      denseOutput: true
    });
    expect(base.events.length).toBe(1);
    expect(dense.events.length).toBe(1);
    expect(Math.abs((base.events[0]?.time ?? 0) - Math.PI / 2)).toBeLessThan(1e-7);
    expect(Math.abs((dense.events[0]?.time ?? 0) - Math.PI / 2)).toBeLessThan(1e-7);
  });

  it('event states sit on the section to root tolerance', () => {
    const state0 = Float64Array.from([1, 0]);
    const section = (s: StateVector): number => Number(s[0] ?? 0);
    for (const denseOutput of [false, true]) {
      const result = detectEvents(state0, sho, [{ g: section }], { dt: 0.02, maxTime: 7, rootTol: 1e-10, denseOutput });
      expect(result.events.length).toBeGreaterThanOrEqual(2);
      for (const event of result.events) {
        expect(Math.abs(Number(event.state[0] ?? 1))).toBeLessThan(1e-8);
      }
    }
  });
});

describe('refined hybrid transitions', () => {
  test('rope slack/capture events carry near-zero residuals', () => {
    // Start fast enough to go over the top region where tension reverses.
    const rope = new RopePendulum({ l: 1, g: 9.81, damping: 0 }, 0.1, 6.5);
    rope.step(6);
    const slack = rope.events.filter((e) => e.type === 'slack');
    const captures = rope.events.filter((e) => e.type === 'capture');
    expect(slack.length).toBeGreaterThan(0);
    expect(captures.length).toBeGreaterThan(0);
    for (const event of slack) expect(event.residual ?? 1).toBeLessThan(1e-5);
    for (const event of captures) expect(event.residual ?? 1).toBeLessThan(1e-6);
  });

  test('rope event times are strictly increasing and finite', () => {
    const rope = new RopePendulum({ l: 1, g: 9.81, damping: 0.01 }, 0.2, 6.2);
    rope.step(8);
    let last = -Infinity;
    for (const event of rope.events) {
      expect(Number.isFinite(event.time)).toBe(true);
      expect(event.time).toBeGreaterThanOrEqual(last);
      last = event.time;
    }
    expect(Number.isFinite(rope.energy())).toBe(true);
  });

  test('double-string slack and capture events carry near-zero residuals', () => {
    const params: DoubleStringParams = { m1: 1.2, m2: 0.8, l1: 1.1, l2: 0.9, g: 9.81, damping: 0 };
    const system = new DoubleStringPendulum(params, 2.6, 1.2, 0, 0);
    system.step(10);
    const refined = system.events.filter((e) => e.residual !== undefined && e.time > 0);
    expect(refined.length).toBeGreaterThan(0);
    for (const event of refined) {
      expect(event.residual ?? 1).toBeLessThan(1e-4);
    }
    const snapshot = system.snapshot();
    expect(Number.isFinite(snapshot.energy)).toBe(true);
  });

  test('double-string conserves energy in pure taut motion regardless of refinement', () => {
    const params: DoubleStringParams = { m1: 1.2, m2: 0.8, l1: 1.1, l2: 0.9, g: 9.81, damping: 0 };
    const system = new DoubleStringPendulum(params, 0.5, 0.3, 0, 0);
    const e0 = system.energy();
    system.step(5);
    expect(system.currentPhase()).toBe('taut');
    expect(Math.abs(system.energy() - e0) / Math.abs(e0)).toBeLessThan(1e-7);
  });
});

describe('rk4Step zero-length step', () => {
  it('returns the initial state (event-locator boundary case)', () => {
    const state = Float64Array.from([0.4, -0.2]);
    const out = new Float64Array(2);
    rk4Step(state, 0, sho, out);
    expect(Array.from(out)).toEqual(Array.from(state));
  });
});
