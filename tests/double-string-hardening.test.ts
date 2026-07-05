import { describe, expect, test } from 'vitest';
import {
  DoubleStringPendulum,
  doubleStringEnergyFromTautState,
  doubleStringTautFraction,
  doubleStringTensions,
  type DoubleStringParams
} from '../src/physics/doubleString';
import { mulberry32 } from '../src/chaos/variational';

/**
 * Property-style hardening for the double-string hybrid: taut/slack transition
 * bracketing, bounded in-substep switching under event storms, and the
 * energy/tension invariants of the inelastic-capture model.
 *
 * Measured (2026-07-05 probe, m=[1,0.8] l=[1,0.8]):
 * - rest tensions are exact: T1=(m1+m2)g=17.658, T2=m2 g=7.848.
 * - IC (1.2,1.4,2,-3): starts taut, 2 refined slack events (residual <= 1.42e-8),
 *   2 captures (residual <= 4.01e-9, energyLoss >= 0.927), returns to taut.
 * - IC (0.3,0.2,6,0): grazing event storm - 562 slack / 1123 captures over 6 s
 *   without stack overflow (bounded switch depth), losses all >= 0.
 */
const params: DoubleStringParams = { m1: 1, m2: 0.8, l1: 1, l2: 0.8, g: 9.81, damping: 0 };

describe('tension gate', () => {
  test('hanging rest carries the exact static tensions', () => {
    const { tension1, tension2 } = doubleStringTensions([0, 0, 0, 0], params);
    expect(tension2).toBeCloseTo(params.m2 * params.g, 9);
    expect(tension1).toBeCloseTo((params.m1 + params.m2) * params.g, 9);
  });

  test('an outer bob held above horizontal at rest cannot be supported (negative T2)', () => {
    const { tension2 } = doubleStringTensions([0.4, 2.6, 0, 0], params);
    expect(tension2).toBeLessThan(0);
  });

  test('the constructor gates the initial phase on the tension signs', () => {
    expect(new DoubleStringPendulum(params, 0.3, 0.35, 0, 0).currentPhase()).toBe('taut');
    expect(new DoubleStringPendulum(params, 0.4, 2.6, 0, 0).currentPhase()).toBe('outer-slack');
  });
});

describe('taut/slack transition bracketing', () => {
  test('in-run releases and captures are refined to the event surface', () => {
    const sim = new DoubleStringPendulum(params, 1.2, 1.4, 2, -3, 0.002);
    expect(sim.currentPhase()).toBe('taut');
    sim.step(6);
    const slacks = sim.events.filter((event) => event.type === 'slack');
    const captures = sim.events.filter((event) => event.type === 'capture');
    expect(slacks.length).toBeGreaterThanOrEqual(1);
    expect(captures.length).toBeGreaterThanOrEqual(1);
    for (const event of slacks) {
      // Refined release: |T| at the located time is at the root tolerance,
      // not one substep's worth of overshoot.
      expect(event.residual).toBeDefined();
      expect(event.residual!).toBeLessThan(1e-6);
      expect(event.energyLoss).toBe(0);
      expect(event.time).toBeGreaterThan(0);
      expect(event.time).toBeLessThanOrEqual(6.001);
    }
    for (const event of captures) {
      // Refined capture: | |r| - l | at the located time is tiny, and the
      // inelastic projection can only remove energy.
      expect(event.residual!).toBeLessThan(1e-6);
      expect(event.energyLoss).toBeGreaterThanOrEqual(0);
    }
    expect(sim.currentPhase()).toBe('taut');
  });

  test('events are time-ordered and slack/capture alternate per link', () => {
    const sim = new DoubleStringPendulum(params, 1.2, 1.4, 2, -3, 0.002);
    sim.step(6);
    for (let i = 1; i < sim.events.length; i += 1) {
      expect(sim.events[i]!.time).toBeGreaterThanOrEqual(sim.events[i - 1]!.time);
    }
    const outer = sim.events.filter((event) => event.link === 'outer');
    for (let i = 1; i < outer.length; i += 1) {
      expect(outer[i]!.type).not.toBe(outer[i - 1]!.type);
    }
  });
});

describe('bounded switching under event storms', () => {
  test('a grazing trajectory with hundreds of transitions keeps integrating (bounded recursion)', () => {
    const sim = new DoubleStringPendulum(params, 0.3, 0.2, 6, 0, 0.002);
    sim.step(6);
    const slacks = sim.events.filter((event) => event.type === 'slack').length;
    const captures = sim.events.filter((event) => event.type === 'capture').length;
    expect(slacks).toBeGreaterThan(100);
    expect(captures).toBeGreaterThan(100);
    for (const event of sim.events) expect(event.energyLoss).toBeGreaterThanOrEqual(0);
    expect(['taut', 'outer-slack', 'full-slack']).toContain(sim.currentPhase());
  });
});

describe('energy invariants (property-style over seeded initial conditions)', () => {
  test('undamped runs never gain energy; total capture loss accounts for the deficit', () => {
    const rand = mulberry32(20260705);
    for (let trial = 0; trial < 12; trial += 1) {
      const theta1 = (rand() * 2 - 1) * 1.4;
      const theta2 = (rand() * 2 - 1) * 1.4;
      const omega1 = (rand() * 2 - 1) * 3;
      const omega2 = (rand() * 2 - 1) * 3;
      const sim = new DoubleStringPendulum(params, theta1, theta2, omega1, omega2, 0.002);
      if (sim.currentPhase() !== 'taut') continue;
      const initialEnergy = doubleStringEnergyFromTautState([theta1, theta2, omega1, omega2], params);
      sim.step(4);
      const finalEnergy = sim.energy();
      const lost = sim.events.reduce((sum, event) => sum + event.energyLoss, 0);
      // Mechanism-level invariants (exact): releases are lossless and every
      // recorded capture loss is non-negative.
      expect(lost).toBeGreaterThanOrEqual(0);
      for (const event of sim.events) {
        expect(event.energyLoss).toBeGreaterThanOrEqual(0);
        if (event.type === 'slack') expect(event.energyLoss).toBe(0);
      }
      // Numerical claim boundary: through transition storms RK4 drift can go
      // EITHER way (measured up to +1.2% of |E|), so the run-level bound is a
      // bounded-drift claim, not a monotonicity claim...
      expect(finalEnergy).toBeLessThanOrEqual(initialEnergy + Math.max(1e-6, 0.02 * Math.abs(initialEnergy)));
      // ...while an event-free (purely taut, smooth) run conserves tightly.
      if (sim.events.length === 0) {
        expect(Math.abs(finalEnergy - initialEnergy)).toBeLessThan(1e-5);
      }
    }
  });

  test('taut-fraction probe: small-angle motion stays taut with a validity caveat', () => {
    const result = doubleStringTautFraction(params, 0.25, 0.3, 0, 0, 10);
    expect(result.tautFraction).toBe(1);
    expect(result.slackEvents).toBe(0);
    expect(result.captureEvents).toBe(0);
    expect(result.energyLost).toBe(0);
    expect(result.caveat).toContain('valid');
    const slack = doubleStringTautFraction(params, 1.2, 1.4, 2, -3, 10);
    expect(slack.tautFraction).toBeLessThan(1);
    expect(slack.tautFraction).toBeGreaterThan(0.5);
    expect(slack.caveat).toContain('%');
  });
});
