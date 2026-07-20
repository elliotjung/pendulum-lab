import { describe, expect, it } from 'vitest';
import { LabSimulation, type LabConfig } from '../src/app/LabSimulation';
import { rhsDouble } from '../src/physics/double';
import { rk4Step } from '../src/physics/integrators';

const DOUBLE: LabConfig = {
  system: 'double',
  parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 },
  gamma: 0,
  method: 'rk4',
  dt: 0.002,
  initialState: [2.0, 2.5, 0, 0]
};

describe('LabSimulation', () => {
  it('reproduces a hand-rolled engine loop bit-for-bit (faithful engine use)', () => {
    const sim = new LabSimulation(DOUBLE);
    sim.step(500);

    // Independent reference using the same exported engine primitives.
    const ref = new Float64Array(DOUBLE.initialState as number[]);
    const out = new Float64Array(4);
    const rhs = (s: Float64Array, o: Float64Array) => rhsDouble(s, DOUBLE.parameters, 0, o);
    for (let i = 0; i < 500; i += 1) {
      rk4Step(ref, DOUBLE.dt, rhs, out);
      ref.set(out);
    }
    expect(sim.getState()).toEqual(Array.from(ref));
  });

  it('is deterministic for identical configs', () => {
    const a = new LabSimulation(DOUBLE);
    const b = new LabSimulation(DOUBLE);
    a.step(300);
    b.step(300);
    expect(a.getState()).toEqual(b.getState());
    expect(a.time).toBeCloseTo(b.time, 12);
  });

  it('conserves energy well with a high-accuracy method (γ=0)', () => {
    const sim = new LabSimulation({ ...DOUBLE, method: 'gbs', dt: 0.01 });
    sim.step(2000);
    expect(sim.drift()).toBeLessThan(1e-6);
  });

  it('keeps RK4 energy drift small over a short conservative run', () => {
    const sim = new LabSimulation(DOUBLE);
    sim.step(1000); // 2 s
    expect(sim.drift()).toBeLessThan(1e-2);
  });

  it('dissipates energy when damping is enabled (γ>0)', () => {
    const sim = new LabSimulation({ ...DOUBLE, gamma: 0.5 });
    const e0 = sim.energy();
    sim.step(2000);
    expect(sim.energy()).toBeLessThan(e0);
  });

  it('maps θ=0 to a straight-down hang in metres', () => {
    const sim = new LabSimulation({ ...DOUBLE, initialState: [0, 0, 0, 0] });
    const [b1, b2] = sim.bobPositionsMeters();
    expect(b1!.x).toBeCloseTo(0, 12);
    expect(b1!.y).toBeCloseTo(1.2, 12); // l1 straight down (+y)
    expect(b2!.x).toBeCloseTo(0, 12);
    expect(b2!.y).toBeCloseTo(2.2, 12); // l1 + l2
  });

  it('supports the triple system with the right dimensionality', () => {
    const sim = new LabSimulation({
      system: 'triple',
      parameters: { m1: 1, m2: 1, m3: 1, l1: 1, l2: 1, l3: 1, g: 9.81 },
      gamma: 0,
      method: 'rk4',
      dt: 0.002,
      initialState: [1, 1, 1, 0, 0, 0]
    });
    sim.step(100);
    expect(sim.getState()).toHaveLength(6);
    expect(sim.bobPositionsMeters()).toHaveLength(3);
    expect(Number.isFinite(sim.energy())).toBe(true);
  });

  it('produces a self-describing snapshot', () => {
    const sim = new LabSimulation(DOUBLE);
    sim.step(10);
    const snap = sim.snapshot();
    expect(snap.time).toBeCloseTo(0.02, 12);
    expect(snap.state).toHaveLength(4);
    expect(snap.bobs).toHaveLength(2);
    expect(Number.isFinite(snap.energy)).toBe(true);
    expect(snap.drift).toBeGreaterThanOrEqual(0);
  });

  it.each([
    [{ ...DOUBLE, dt: 0 }, /dt/],
    [{ ...DOUBLE, gamma: Number.NaN }, /gamma/],
    [{ ...DOUBLE, parameters: { ...DOUBLE.parameters, l1: 0 } }, /l1/],
    [{ ...DOUBLE, initialState: [0, Number.POSITIVE_INFINITY] }, /initialState/],
    [{ ...DOUBLE, system: 'spherical' }, /only double and triple/]
  ])('rejects malformed runtime configuration before integration', (config, expected) => {
    expect(() => new LabSimulation(config as LabConfig)).toThrow(expected as RegExp);
  });

  it('owns an immutable configuration snapshot', () => {
    const source: LabConfig = {
      ...DOUBLE,
      parameters: { ...DOUBLE.parameters },
      initialState: [...DOUBLE.initialState]
    };
    const sim = new LabSimulation(source);
    source.parameters.l1 = 99;
    (source.initialState as number[])[0] = 99;
    expect(sim.config.parameters.l1).toBe(1.2);
    expect(sim.getState()[0]).toBe(2);
    expect(Object.isFrozen(sim.config)).toBe(true);
    expect(Object.isFrozen(sim.config.parameters)).toBe(true);
  });

  it.each([-1, 0.5, Number.NaN, 1_000_001])('rejects an invalid step count (%s)', (steps) => {
    const sim = new LabSimulation(DOUBLE);
    expect(() => sim.step(steps)).toThrow(/steps/);
  });
});
