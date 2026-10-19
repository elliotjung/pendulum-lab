import { describe, expect, it } from 'vitest';
import { mathieuCoefficient, mathieuFloquet } from '../../../../src/chaos/mathieuStability';
import { energyDuffing, rhsDuffing, type DuffingParameters } from '../../../../src/physics/duffing';
import { staticFrictionComplementarityStep } from '../../../../src/physics/friction';
import { rk4Step } from '../../../../src/physics/integrators';
import { energyKapitza, rhsKapitza, type KapitzaParameters } from '../../../../src/physics/kapitza';
import { integratePyragasPendulumDde, type PyragasPendulumParameters } from '../../../../src/physics/pyragasDde';
import { energyVanDerPol, rhsVanDerPol, type VanDerPolParameters } from '../../../../src/physics/vanDerPol';
import {
  createNonlinearSimulation,
  defaultNonlinearConfig,
  fromCanonicalNonlinear,
  MAX_NONLINEAR_DELAY_POINTS,
  NONLINEAR_SYSTEM_IDS,
  nonlinearParameterFields,
  nonlinearPresetConfig,
  nonlinearPresets,
  nonlinearWarnings,
  toCanonicalNonlinear,
  validateNonlinearConfig,
  type NonlinearConfig
} from '../../../../src/product/adapters/physics/nonlinear';

function run(config: NonlinearConfig) {
  const simulation = createNonlinearSimulation(config);
  while (!simulation.done) simulation.step();
  return simulation.snapshot();
}
const normalized = (id: string) => ['system:duffing', 'system:van-der-pol', 'system:mathieu'].includes(id);
describe('S14 closed nonlinear contracts and explicit time conventions', () => {
  it.each(NONLINEAR_SYSTEM_IDS)(
    '%s defaults and every model preset round trip without changing units or metadata',
    (id) => {
      for (const preset of nonlinearPresets(id)) {
        const config = {
          ...nonlinearPresetConfig(id, preset.id),
          seed: { value: 'fixture', generator: 'none', generatorVersion: '1' },
          provenance: {
            createdByVersion: 'test',
            source: { kind: 'preset' as const, id: preset.id },
            parentExperimentIds: ['parent-1']
          }
        };
        expect(validateNonlinearConfig(config).ok).toBe(true);
        const canonical = toCanonicalNonlinear(config);
        if (!canonical.ok) throw new Error(JSON.stringify(canonical.issues));
        expect(canonical.value.modelOptions?.timeConvention).toBe(normalized(id) ? 'normalized' : 'si');
        expect(fromCanonicalNonlinear(canonical.value)).toEqual({ ok: true, value: config });
        const snapshot = createNonlinearSimulation(config).snapshot();
        expect(snapshot.state).toEqual(config.initialState);
        expect(snapshot.energyUnit).toBe(normalized(id) ? '정규화' : id === 'system:friction' ? 'J' : 'm²/s²');
        expect(nonlinearWarnings(config).length).toBeGreaterThan(2);
        expect(
          nonlinearParameterFields(id)
            .map((f) => f.key)
            .sort()
        ).toEqual(Object.keys(config.parameters).sort());
      }
    }
  );
  it('rejects unknown fields, lossy extensions, wrong conventions and incompatible integrators', () => {
    const base = defaultNonlinearConfig();
    for (const patch of [
      { unknown: 1 },
      { parameters: { ...base.parameters, hidden: 1 } },
      { initialState: [0, 0] },
      { integratorId: 'internal' },
      { history: { kind: 'constant', state: [0, 0] } },
      { analyses: [{ id: 'analysis:fft' }] },
      { step: 1e-6, duration: 300 },
      { sampleEvery: null }
    ])
      expect(validateNonlinearConfig({ ...base, ...patch }).ok).toBe(false);
    const value = toCanonicalNonlinear(base);
    if (!value.ok) throw new Error('canonical');
    expect(fromCanonicalNonlinear({ ...value.value, modelOptions: { timeConvention: 'si' } }).ok).toBe(false);
    expect(fromCanonicalNonlinear({ ...value.value, modelVersion: 'future' }).ok).toBe(false);
    expect(
      fromCanonicalNonlinear({
        ...value.value,
        initialConditions: { ...value.value.initialConditions, secret: { kind: 'scalar', value: 0, unit: '1' } }
      }).ok
    ).toBe(false);
    expect(
      fromCanonicalNonlinear({
        ...value.value,
        parameters: { ...value.value.parameters, linearStiffness: { kind: 'scalar', value: -1, unit: 's^-2' } }
      }).ok
    ).toBe(false);
  });
  it('never invokes accessors and rejects non-finite, negative-zero or oversized data', () => {
    let called = false;
    const getter = Object.defineProperty({}, 'systemId', {
      enumerable: true,
      get() {
        called = true;
        return 'system:duffing';
      }
    });
    expect(validateNonlinearConfig(getter).ok).toBe(false);
    expect(called).toBe(false);
    for (const initialState of [[NaN, 0, 0], [0, Infinity, 0], [0, -0, 0], Array(4097).fill(0)])
      expect(validateNonlinearConfig({ ...defaultNonlinearConfig(), initialState }).ok).toBe(false);
    expect(validateNonlinearConfig(JSON.parse('{"__proto__":{},"systemId":"system:duffing"}')).ok).toBe(false);
  });
  it('limits fast forcing, stiffness and delay storage before any simulation begins', () => {
    const k = defaultNonlinearConfig('system:kapitza'),
      v = defaultNonlinearConfig('system:van-der-pol'),
      d = defaultNonlinearConfig('system:pyragas'),
      f = defaultNonlinearConfig('system:friction');
    expect(validateNonlinearConfig({ ...k, step: 0.05 }).ok).toBe(false);
    expect(validateNonlinearConfig({ ...v, parameters: { mu: 20 }, step: 0.01 }).ok).toBe(false);
    expect(validateNonlinearConfig({ ...d, parameters: { ...d.parameters, delay: 0.001 } }).ok).toBe(false);
    expect(validateNonlinearConfig({ ...d, step: 1e-6 }).ok).toBe(false);
    expect(validateNonlinearConfig({ ...f, parameters: { ...f.parameters, dynamicFriction: 2 } }).ok).toBe(false);
  });
});
describe('S14 delegates native physical equations and reproduces known limits', () => {
  it.each(['system:duffing', 'system:van-der-pol', 'system:kapitza'] as const)(
    '%s native RK4 states and inherited energy are unchanged',
    (id) => {
      const config = defaultNonlinearConfig(id),
        native = Float64Array.from(config.initialState),
        out = new Float64Array(native.length),
        sim = createNonlinearSimulation(config);
      const rhs = (s: Float64Array, o: Float64Array) =>
        id === 'system:duffing'
          ? rhsDuffing(s, config.parameters as unknown as DuffingParameters, o)
          : id === 'system:van-der-pol'
            ? rhsVanDerPol(s, config.parameters as unknown as VanDerPolParameters, o)
            : rhsKapitza(s, config.parameters as unknown as KapitzaParameters, o);
      for (let i = 0; i < 20; i++) {
        rk4Step(native, config.step, rhs, out);
        native.set(out);
        expect(sim.step().state).toEqual(Array.from(native));
      }
      const energy =
        id === 'system:duffing'
          ? energyDuffing(native, config.parameters as unknown as DuffingParameters).total
          : id === 'system:van-der-pol'
            ? energyVanDerPol(native, config.parameters as unknown as VanDerPolParameters).total
            : energyKapitza(native, config.parameters as unknown as KapitzaParameters).total;
      expect(sim.snapshot().energy).toBe(energy);
    }
  );
  it('Duffing linear and Van der Pol μ=0 recover harmonic motion', () => {
    const d = defaultNonlinearConfig(),
      v = defaultNonlinearConfig('system:van-der-pol');
    const duffing = run({
      ...d,
      parameters: { damping: 0, linearStiffness: 2.25, cubicStiffness: 0, driveAmplitude: 0, driveFrequency: 0 },
      initialState: [0.001, 0, 0],
      duration: 1,
      step: 0.005
    });
    expect(duffing.state[0]).toBeCloseTo(0.001 * Math.cos(1.5), 12);
    const van = run({ ...v, parameters: { mu: 0 }, initialState: [1, 0], duration: 1, step: 0.005 });
    expect(van.state[0]).toBeCloseTo(Math.cos(1), 10);
    expect(van.state[1]).toBeCloseTo(-Math.sin(1), 10);
    expect(van.energy).toBeCloseTo(0.5, 10);
  });
  it('Duffing wells remain equilibria and the plotted potential exposes the barrier', () => {
    const d = defaultNonlinearConfig();
    const result = run({
      ...d,
      parameters: { ...d.parameters, damping: 0, driveAmplitude: 0 },
      initialState: [1, 0, 0],
      duration: 1
    });
    expect(result.state.slice(0, 2)).toEqual([1, 0]);
    expect(result.potential.find((p) => p.x === 0)?.y).toBe(0);
    expect(result.potential.some((p) => p.y < -0.24)).toBe(true);
  });
  it('Van der Pol settles to a finite attracting cycle from an inner initial state', () => {
    const c = defaultNonlinearConfig('system:van-der-pol'),
      sim = createNonlinearSimulation({ ...c, step: 0.005, duration: 40 });
    let amplitude = 0;
    while (!sim.done) {
      const sample = sim.step();
      if (sample.time > 30) amplitude = Math.max(amplitude, Math.abs(sample.state[0]!));
    }
    expect(amplitude).toBeGreaterThan(1.95);
    expect(amplitude).toBeLessThan(2.1);
  });
  it('Kapitza inverted preset remains near π while no-drive falls away', () => {
    const c = defaultNonlinearConfig('system:kapitza');
    const maxDeviation = (config: NonlinearConfig) => {
      const sim = createNonlinearSimulation(config);
      let max = 0;
      while (!sim.done) max = Math.max(max, Math.abs(sim.step().state[0]! - Math.PI));
      return max;
    };
    expect(maxDeviation(c)).toBeLessThan(1);
    expect(maxDeviation({ ...c, duration: 4, parameters: { ...c.parameters, driveAmplitude: 0 } })).toBeGreaterThan(1);
    expect(createNonlinearSimulation(c).snapshot().potential).toHaveLength(65);
  });
  it('Mathieu trajectory uses the exact native coefficient and internal Floquet remains optional', () => {
    const c = {
      ...defaultNonlinearConfig('system:mathieu'),
      parameters: { delta: 1, epsilon: 0 },
      initialState: [1, 0],
      duration: 1,
      step: 0.005
    };
    expect(createNonlinearSimulation(c).snapshot().stability).toBeUndefined();
    const result = run(c);
    expect(result.state[0]).toBeCloseTo(Math.cos(1), 10);
    const a = mathieuCoefficient(0.25, 0.5)(0.4);
    expect(a[1]![0]).toBe(-(0.25 + 0.5 * Math.cos(0.4)));
    for (const preset of ['default', 'stable']) {
      const fixture = nonlinearPresetConfig('system:mathieu', preset),
        native = mathieuFloquet(fixture.parameters.delta!, fixture.parameters.epsilon!);
      expect(createNonlinearSimulation(fixture, { stability: true }).snapshot().stability).toEqual({
        stable: native.stable,
        spectralRadius: native.spectralRadius,
        determinantDrift: Math.abs(native.determinant - 1)
      });
    }
  });
  it('friction native complementarity reproduces stick and break-away and marks initial motion as slip', () => {
    const c = defaultNonlinearConfig('system:friction'),
      p = { ...c.parameters, mass: 2, stiffness: 0, viscous: 0, driveFrequency: 0, driveAmplitude: 0.8 },
      base = { ...c, parameters: p, initialState: [0, 0, 0], step: 0.05, duration: 0.05 };
    expect(run(base)).toMatchObject({
      mode: 'stick',
      frictionForce: -0.8,
      state: [0, 0, 0],
      momentumResidual: 0,
      coneResidual: 0
    });
    const slipping = run({ ...base, parameters: { ...p, driveAmplitude: 2 } }),
      native = staticFrictionComplementarityStep(0, 2, { mass: 2, dt: 0.05, staticLimit: 1.2, dynamicMagnitude: 0.7 });
    expect(slipping.state[1]).toBe(native.nextVelocity);
    expect(slipping.mode).toBe('slip');
    expect(slipping.coneResidual).toBe(0);
    expect(createNonlinearSimulation({ ...c, initialState: [0, 0.1, 0] }).snapshot()).toMatchObject({
      mode: 'slip',
      frictionForce: -0.7
    });
    const sim = createNonlinearSimulation(c),
      modes = new Set<string>();
    while (!sim.done) modes.add(sim.step().mode);
    expect([...modes].sort()).toEqual(['slip', 'stick']);
    expect(sim.snapshot().potential.every((p) => p.x * p.y <= 1e-12)).toBe(true);
  });
  it('stops at the last accepted finite state and never advances after a numerical failure', () => {
    const c = defaultNonlinearConfig(),
      sim = createNonlinearSimulation({
        ...c,
        parameters: { damping: 0, linearStiffness: -20, cubicStiffness: -20, driveAmplitude: 0, driveFrequency: 0 },
        initialState: [10, 0, 0],
        step: 0.01,
        duration: 1
      });
    let last = sim.snapshot();
    expect(() => {
      while (!sim.done) last = sim.step();
    }).toThrow(/마지막 유효 상태/);
    expect(sim.snapshot()).toEqual(last);
    expect(last.state.every(Number.isFinite)).toBe(true);
    expect(() => sim.step()).toThrow();
    expect(sim.snapshot()).toEqual(last);
  });
});
describe('S14 Pyragas prehistory, bounded tape and continuation', () => {
  it('matches native batch RK4 with a nonintegral delay and a discontinuous prescribed history', () => {
    const c = {
      ...defaultNonlinearConfig('system:pyragas'),
      parameters: {
        g: 1,
        length: 1,
        damping: 0.1,
        feedbackGain: 0.7,
        delay: 0.073,
        driveAmplitude: 0.2,
        driveFrequency: 1.2
      },
      initialState: [0.3, -0.1],
      history: { kind: 'linear' as const, state: [0.4, 0.2] },
      duration: 0.25,
      step: 0.002
    };
    const native = integratePyragasPendulumDde([0.3, -0.1], c.parameters as PyragasPendulumParameters, {
      dt: c.step,
      duration: c.duration,
      history: (t) => [0.4 + 0.2 * t, 0.2]
    });
    const result = run(c);
    expect(result.state[0]).toBeCloseTo(native.finalState[0], 12);
    expect(result.state[1]).toBeCloseTo(native.finalState[1], 12);
  });
  it('uses negative-time history and recovers analytic first-delay and constant-velocity limits', () => {
    const c = defaultNonlinearConfig('system:pyragas');
    const result = run({
      ...c,
      parameters: { ...c.parameters, g: 0, damping: 0, feedbackGain: 1, delay: 1 },
      initialState: [0, 0],
      history: { kind: 'constant', state: [1, 0] },
      step: 0.002,
      duration: 0.5
    });
    expect(result.state[0]).toBeCloseTo(1 - Math.cos(0.5), 10);
    expect(result.state[1]).toBeCloseTo(Math.sin(0.5), 10);
    const free = run({
      ...c,
      parameters: { ...c.parameters, g: 0, damping: 0, feedbackGain: 0 },
      initialState: [0.3, -0.4],
      step: 0.005,
      duration: 1
    });
    expect(free.state[0]).toBeCloseTo(-0.1, 12);
    expect(free.state[1]).toBe(-0.4);
  });
  it('repeated early and late continuation keeps exact analytic boundary, full tape and absolute drive clock', () => {
    const c = {
      ...defaultNonlinearConfig('system:pyragas'),
      parameters: {
        g: 1,
        length: 1,
        damping: 0.1,
        feedbackGain: 0.7,
        delay: 0.2,
        driveAmplitude: 0.4,
        driveFrequency: 2.3
      },
      history: { kind: 'linear' as const, state: [0.8, -0.4] },
      step: 0.003,
      duration: 0.603,
      startTime: 0.7
    };
    const direct = createNonlinearSimulation(c);
    let restored = createNonlinearSimulation(c);
    for (let i = 1; i <= 180; i++) {
      const expected = direct.step(),
        actual = restored.step();
      expect(actual.state[0]).toBeCloseTo(expected.state[0]!, 12);
      expect(actual.state[1]).toBeCloseTo(expected.state[1]!, 12);
      expect(actual.forcing).toBeCloseTo(expected.forcing, 12);
      if (i % 11 === 0) {
        const restart = restored.serialize(),
          canonical = toCanonicalNonlinear(restart);
        expect(restart.delayState!.times[0]).toBeGreaterThanOrEqual(-0.2 - c.step - 1e-12);
        expect(restart.delayState!.times[0]).toBeLessThanOrEqual(-0.2 + 1e-12);
        expect(restart.delayState!.times.at(-1)).toBe(0);
        expect(restart.delayState!.times.length).toBeLessThanOrEqual(MAX_NONLINEAR_DELAY_POINTS);
        if (i < 60) expect(restart.delayState!.historyBoundary).toBeDefined();
        if (!canonical.ok) throw new Error(JSON.stringify(canonical.issues));
        const parsed = fromCanonicalNonlinear(canonical.value);
        if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
        expect(parsed.value).toEqual(restart);
        restored = createNonlinearSimulation(parsed.value);
      }
    }
  });
  it('keeps tape independent of output decimation, supports fractional endpoints and canonicalizes generated zero', () => {
    const c = { ...defaultNonlinearConfig('system:pyragas'), duration: 0.41, step: 0.003 };
    const a = createNonlinearSimulation(c),
      b = createNonlinearSimulation({ ...c, sampleEvery: 17 });
    while (!a.done) {
      a.step();
      b.step();
    }
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.serialize().delayState).toEqual(b.serialize().delayState);
    expect(a.snapshot().time).toBe(0.41);
    expect(a.snapshot().history.length).toBeLessThanOrEqual(65);
    const zero = createNonlinearSimulation({
      ...defaultNonlinearConfig('system:pyragas'),
      initialState: [0, 0],
      history: { kind: 'constant', state: [0, 0] },
      duration: 0.01
    });
    while (!zero.done) zero.step();
    expect(toCanonicalNonlinear(zero.serialize()).ok).toBe(true);
    expect(zero.serialize().delayState!.times.some((x) => Object.is(x, -0))).toBe(false);
  });
  it('selects the exact discontinuous history boundary consistently after shifting the time origin', () => {
    const c = {
      ...defaultNonlinearConfig('system:pyragas'),
      startTime: 2,
      duration: 0.4,
      step: 0.002,
      parameters: { ...defaultNonlinearConfig('system:pyragas').parameters, driveAmplitude: 0.4, driveFrequency: 1.7 },
      history: { kind: 'linear' as const, state: [0.7, -0.3] }
    };
    const direct = createNonlinearSimulation(c);
    for (let i = 0; i < 9; i++) direct.step();
    const encoded = toCanonicalNonlinear(direct.serialize());
    if (!encoded.ok) throw new Error('canonical');
    const parsed = fromCanonicalNonlinear(encoded.value);
    if (!parsed.ok) throw new Error('restore');
    const continuation = createNonlinearSimulation(parsed.value);
    while (!direct.done) {
      const expected = direct.step(),
        actual = continuation.step();
      expect(actual.state[0]).toBeCloseTo(expected.state[0]!, 13);
      expect(actual.state[1]).toBeCloseTo(expected.state[1]!, 13);
    }
  });
  it('rejects malformed coverage, endpoint, dimensions, boundary and oversized delay payloads without loss', () => {
    const c = defaultNonlinearConfig('system:pyragas');
    for (const delayState of [
      {
        times: [-0.1, 0],
        states: [
          [0.3, 0],
          [0.3, 0]
        ]
      },
      {
        times: [-0.2, -0.1],
        states: [
          [0.3, 0],
          [0.3, 0]
        ]
      },
      { times: [-0.2, 0], states: [[0.3], [0.3, 0]] },
      {
        times: [-0.2, 0],
        states: [
          [0.3, 0],
          [0.4, 0]
        ]
      },
      {
        times: [-0.2, -0.2, 0],
        states: [
          [0.3, 0],
          [0.3, 0],
          [0.3, 0]
        ]
      },
      {
        times: [-0.2, 0],
        states: [
          [0.3, 0],
          [0.3, 0]
        ],
        historyBoundary: -0.1
      },
      { times: Array(2049).fill(0), states: Array.from({ length: 2049 }, () => [0.3, 0]) }
    ])
      expect(validateNonlinearConfig({ ...c, delayState }).ok).toBe(false);
  });
  it('continues through the former arbitrary start-time ceiling and rejects an unrepresentable clock', () => {
    const c = { ...defaultNonlinearConfig('system:pyragas'), startTime: 1e6, duration: 0.01 };
    const sim = createNonlinearSimulation(c);
    sim.step();
    expect(sim.serialize().startTime).toBeGreaterThan(1e6);
    expect(toCanonicalNonlinear(sim.serialize()).ok).toBe(true);
    expect(validateNonlinearConfig({ ...c, startTime: Number.MAX_VALUE }).ok).toBe(false);
  });
});
