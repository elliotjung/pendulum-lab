import { describe, expect, it } from 'vitest';
import { DoubleStringPendulum, doubleStringTensions, type DoubleStringParams } from '../src/physics/doubleString';

const params: DoubleStringParams = { m1: 1.2, m2: 0.8, l1: 1.1, l2: 0.9, g: 9.81, damping: 0 };

describe('double string pendulum', () => {
  it('reports the correct static tensions when both links hang straight down', () => {
    const { tension1, tension2 } = doubleStringTensions([0, 0, 0, 0], params);
    expect(tension1).toBeCloseTo((params.m1 + params.m2) * params.g, 10);
    expect(tension2).toBeCloseTo(params.m2 * params.g, 10);
  });

  it('runs taut dynamics with bounded constraint error', () => {
    const system = new DoubleStringPendulum(params, 0.7, 0.4, 0.2, -0.1);
    system.step(2);
    const snapshot = system.snapshot();
    expect(snapshot.phase).toBe('taut');
    expect(snapshot.constraintError1).toBeLessThan(1e-12);
    expect(snapshot.constraintError2).toBeLessThan(1e-12);
    expect(Number.isFinite(snapshot.energy)).toBe(true);
  });

  it('releases the outer string when the computed tension becomes negative', () => {
    const system = new DoubleStringPendulum(params, 0.2, 2.5, 0, 0);
    const snapshot = system.snapshot();
    expect(snapshot.phase).toBe('outer-slack');
    expect(snapshot.tension2).toBe(0);
    expect(system.events[0]).toMatchObject({ type: 'slack', link: 'outer' });
  });

  it('keeps damped runs dissipative outside recapture impulses', () => {
    const system = new DoubleStringPendulum({ ...params, damping: 0.2 }, 0.5, 0.2, 0.1, 0);
    const e0 = system.energy();
    system.step(4);
    expect(system.energy()).toBeLessThan(e0);
  });
});
