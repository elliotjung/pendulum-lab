import { describe, expect, it } from 'vitest';
import { DoubleStringPendulum, doubleStringTautFraction, doubleStringTensions, type DoubleStringParams } from '../src/physics/doubleString';

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

  it('validates physical parameter signs before constructing a hybrid state', () => {
    expect(() => new DoubleStringPendulum({ ...params, m1: 0 }, 0, 0)).toThrow(/masses/);
    expect(() => new DoubleStringPendulum({ ...params, l2: -1 }, 0, 0)).toThrow(/lengths/);
    expect(() => new DoubleStringPendulum({ ...params, g: 0 }, 0, 0)).toThrow(/g/);
    expect(() => new DoubleStringPendulum({ ...params, damping: -0.01 }, 0, 0)).toThrow(/damping/);
  });

  it('reports taut-analysis validity when no slack event occurs over the horizon', () => {
    const result = doubleStringTautFraction(params, 0.05, 0.04, 0, 0, 0.2, 0.001);
    expect(result.tautFraction).toBe(1);
    expect(result.slackEvents).toBe(0);
    expect(result.captureEvents).toBe(0);
    expect(result.energyLost).toBe(0);
    expect(result.caveat).toMatch(/rigid-equivalent/);
  });

  it('locates a real outer-link release and inelastic recapture without energy gain', () => {
    const system = new DoubleStringPendulum(params, 0.2, 1.5, -2, 0, 0.001);
    const initialEnergy = system.energy();
    for (let i = 0; i < 2000; i += 1) system.step(0.001);
    const release = system.events.find((event) => event.type === 'slack' && event.link === 'outer');
    const capture = system.events.find((event) => event.type === 'capture' && event.link === 'outer');

    expect(release?.residual ?? Infinity).toBeLessThan(1e-6);
    expect(capture?.residual ?? Infinity).toBeLessThan(1e-6);
    expect(capture?.time ?? 0).toBeGreaterThan(release?.time ?? 0);
    expect(capture?.energyLoss ?? 0).toBeGreaterThan(0);
    expect(system.energy()).toBeLessThan(initialEnergy);
    expect(system.snapshot().constraintError2).toBeLessThan(1e-8);
  });
});
