import { describe, expect, it } from 'vitest';
import {
  createConstraintSimulation,
  defaultConstraintConfig,
  validateConstraintConfig,
  toCanonicalConstraint,
  fromCanonicalConstraint,
  constraintWarnings,
  CONSTRAINT_SYSTEM_IDS,
  type ConstraintConfig,
  type ConstraintSample
} from '../../../../src/product/adapters/physics/constraint';
import { constraintPresets } from '../../../../src/product/adapters/physics/constraint-presets';
import { rhsSpring, energySpring } from '../../../../src/physics/spring';
import { rk4Step, rk2Step, eulerStep } from '../../../../src/physics/integrators';
import { RopePendulum } from '../../../../src/physics/rope';
import { DoubleStringPendulum } from '../../../../src/physics/doubleString';
import { createExperimentRoute, resolveProductRoute } from '../../../../src/product/persistence';

function trajectory(config: ConstraintConfig): ConstraintSample[] {
  const sim = createConstraintSimulation(config),
    samples = [sim.snapshot()];
  while (!sim.done) samples.push(sim.step());
  return samples;
}
function finiteSample(sample: ConstraintSample) {
  expect(
    [
      sample.time,
      ...sample.state,
      ...Object.values(sample.energy),
      ...sample.lengths,
      ...sample.tensions,
      ...sample.constraintErrors,
      ...sample.gaps,
      sample.captureLoss,
      ...sample.events.flatMap((event) => [event.time, event.residual, event.energyLoss])
    ].every(Number.isFinite)
  ).toBe(true);
}

describe('S11 original-engine characterization', () => {
  it.each([
    ['integrator:rk4', rk4Step],
    ['integrator:rk2', rk2Step],
    ['integrator:euler', eulerStep]
  ] as const)('spring %s preserves original derivative and energy at every step', (integratorId, stepper) => {
    const parameters = { mass: 1.3, stiffness: 35, restLength: 0.8, g: 9.81 };
    const config = {
      ...defaultConstraintConfig(),
      parameters,
      integratorId,
      initialState: [1.2, 0.4, -0.1, 0.2],
      duration: 0.2
    };
    const sim = createConstraintSimulation(config),
      state = Float64Array.from(config.initialState),
      out = new Float64Array(4);
    while (!sim.done) {
      stepper(state, config.step, (value, result) => rhsSpring(value, parameters, result), out);
      state.set(out);
      const sample = sim.step();
      expect(sample.state).toEqual(Array.from(state));
      expect(sample.energy).toEqual(energySpring(state, parameters));
      expect(sample.positions).toEqual([{ x: state[0]! * Math.sin(state[1]!), y: -state[0]! * Math.cos(state[1]!) }]);
      expect(sample.tensions).toEqual([parameters.stiffness * (state[0]! - parameters.restLength)]);
    }
  });
  it('radial spring matches the analytic oscillator and retains compression as signed force', () => {
    const config = { ...defaultConstraintConfig(), initialState: [1.44525, 0, 0, 0], duration: 1 };
    const samples = trajectory(config),
      final = samples.at(-1)!;
    expect(final.state[0]).toBeCloseTo(1.24525 + 0.2 * Math.cos(Math.sqrt(40)), 9);
    expect(final.state[1]).toBe(0);
    expect(Math.max(...samples.map((s) => Math.abs(s.energy.total - samples[0]!.energy.total)))).toBeLessThan(1e-8);
    const compressed = createConstraintSimulation({ ...config, initialState: [0.9, 0.1, 0, 0] }).snapshot();
    expect(compressed.tensions[0]).toBeCloseTo(-4, 12);
  });
  it.each([0, 0.1])('rope uses the original hybrid engine and SI mass scaling with damping=%s', (damping) => {
    const config = {
      ...defaultConstraintConfig('system:rope'),
      parameters: { mass: 2.7, length: 1.2, g: 9.81, damping },
      initialState: [2.5, 0],
      duration: 2,
      startTime: 7
    };
    const original = new RopePendulum({ l: 1.2, g: 9.81, damping }, 2.5, 0),
      sim = createConstraintSimulation(config);
    let consumed = 0;
    for (let i = 0; i <= 1000; i++) {
      if (i) {
        original.step(config.step);
        sim.step();
      }
      const source = original.snapshot(),
        sample = sim.snapshot();
      expect(sample.state).toEqual([source.x, source.y, source.vx, source.vy]);
      expect(sample.phase).toBe(source.phase);
      expect(sample.tensions).toEqual([2.7 * source.tension]);
      expect(sample.energy.total).toBe(2.7 * source.energy);
      expect(sample.energy.KE).toBe(0.5 * 2.7 * (source.vx ** 2 + source.vy ** 2));
      expect(sample.events).toEqual(
        original.events.slice(consumed).map((event, j) => ({
          ...event,
          sequence: consumed + j,
          link: 'inner',
          time: 7 + event.time,
          energyLoss: 2.7 * event.energyLoss,
          residual: (event.residual ?? 0) * (event.type === 'slack' ? 2.7 : 1),
          residualUnit: event.type === 'slack' ? 'N' : 'm',
          source: i ? 'integration' : 'initial-condition'
        }))
      );
      consumed = original.events.length;
      finiteSample(sample);
    }
  });
  it.each([
    ['taut', [0.4, 0.2, 0, 0]],
    ['outer-slack', [0.2, 2.5, 0, 0]],
    ['full-slack', [2.5, 2.5, 0, 0]]
  ] as const)(
    'double string preserves original %s trajectory, tensions and all event values',
    (phase, initialState) => {
      const parameters = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81, damping: 0 };
      const config = { ...defaultConstraintConfig('system:double-string'), parameters, initialState, duration: 2 };
      const original = new DoubleStringPendulum(
          parameters,
          initialState[0],
          initialState[1],
          initialState[2],
          initialState[3]
        ),
        sim = createConstraintSimulation(config);
      expect(sim.snapshot().phase).toBe(phase);
      let consumed = 0;
      while (true) {
        const source = original.snapshot(),
          sample = sim.snapshot();
        expect(sample.state).toEqual([
          source.x1,
          source.y1,
          source.x2,
          source.y2,
          source.vx1,
          source.vy1,
          source.vx2,
          source.vy2
        ]);
        expect(sample.energy.total).toBe(source.energy);
        expect(sample.phase).toBe(source.phase);
        expect(sample.tensions).toEqual([source.tension1, source.tension2]);
        expect(sample.gaps).toEqual([source.constraintError1, source.constraintError2]);
        expect(sample.events).toEqual(
          original.events.slice(consumed).map((event, j) => ({
            ...event,
            sequence: consumed + j,
            residual: event.residual ?? 0,
            residualUnit: event.type === 'slack' ? 'N' : 'm',
            source: sample.step ? 'integration' : 'initial-condition'
          }))
        );
        consumed = original.events.length;
        finiteSample(sample);
        if (sim.done) break;
        original.step(config.step);
        sim.step();
      }
    }
  );
  it('distinguishes initial release from a located tension zero and conserves energy between rope captures', () => {
    const initial = createConstraintSimulation({
      ...defaultConstraintConfig('system:rope'),
      initialState: [2.5, 0]
    }).snapshot();
    expect(initial.events).toMatchObject([{ time: 0, type: 'slack', source: 'initial-condition' }]);
    const samples = trajectory({ ...defaultConstraintConfig('system:rope'), initialState: [0, 6], duration: 2 });
    const events = samples.flatMap((sample) => sample.events);
    expect(events.map((event) => event.type)).toEqual(['slack', 'capture']);
    expect(events.every((event) => event.source === 'integration')).toBe(true);
    expect(events[0]!.time).toBeCloseTo(0.4844661317713155, 10);
    expect(events[0]!.residual).toBeLessThan(1e-8);
    expect(events[1]!.time).toBeCloseTo(1.2760235893130412, 10);
    expect(events[1]!.energyLoss).toBeCloseTo(17.79757080649749, 8);
    for (const sample of samples) {
      expect(sample.energy.total + sample.captureLoss).toBeCloseTo(8.19, 8);
      expect(Math.max(...sample.constraintErrors)).toBeLessThan(1e-12);
      finiteSample(sample);
    }
    const releaseIndex = samples.findIndex((sample) => sample.events.some((e) => e.type === 'slack'));
    expect(samples[releaseIndex - 1]!.phase).toBe('taut');
    expect(samples[releaseIndex - 1]!.tensions[0]).toBeGreaterThan(0);
    expect(samples[releaseIndex]!.phase).toBe('slack');
    expect(samples[releaseIndex]!.tensions[0]).toBe(0);
  });
  it('locks finite before/after outer-capture energy and separates inactive slack gap from violation', () => {
    const samples = trajectory({
      ...defaultConstraintConfig('system:double-string'),
      initialState: [0.2, 2.5, 0, 0],
      duration: 0.8
    });
    const index = samples.findIndex((sample) => sample.events.some((event) => event.type === 'capture'));
    const before = samples[index - 1]!,
      after = samples[index]!;
    expect(before.phase).toBe('outer-slack');
    expect(before.gaps[1]).toBeGreaterThan(0.006);
    expect(before.constraintErrors).toEqual([0, 0]);
    expect(after.phase).toBe('taut');
    expect(after.events[0]!.time).toBeCloseTo(0.5338936045441138, 10);
    expect(before.energy.total - after.energy.total).toBeCloseTo(4.437544926933429, 8);
    expect(after.captureLoss).toBeCloseTo(before.energy.total - after.energy.total, 8);
    expect(Math.max(...after.constraintErrors)).toBeLessThan(1e-12);
    finiteSample(before);
    finiteSample(after);
  });
  it('locks and warns about inherited full-slack overextension and nonconservative capture rather than hiding them', () => {
    const config = { ...defaultConstraintConfig('system:double-string'), initialState: [2.5, 2.5, 0, 0], duration: 2 };
    const samples = trajectory(config),
      events = samples.flatMap((sample) => sample.events);
    expect(events.map(({ type, link }) => [type, link])).toEqual([
      ['slack', 'inner'],
      ['capture', 'inner'],
      ['capture', 'outer'],
      ['slack', 'inner']
    ]);
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
    expect(events.every((event, i) => i === 0 || event.time >= events[i - 1]!.time)).toBe(true);
    expect(trajectory(config)).toEqual(samples);
    const outer = samples.findIndex((sample) =>
      sample.events.some((event) => event.type === 'capture' && event.link === 'outer')
    );
    expect(samples[outer]!.energy.total - samples[outer - 1]!.energy.total).toBeCloseTo(5.323319117350394, 8);
    expect(samples[outer]!.events[0]!.energyLoss).toBe(0);
    expect(samples[outer]!.warnings.join(' ')).toContain('에너지가 증가');
    expect(Math.max(...samples.flatMap((sample) => sample.constraintErrors))).toBeCloseTo(0.4352688973307348, 9);
    expect(samples.at(-1)!.warnings.join(' ')).toContain('구속 잔차');
    expect(constraintWarnings(config).join(' ')).toContain('에너지가 증가');
    samples.forEach(finiteSample);
  });
});

describe('S11 bounded restart contract', () => {
  it.each(CONSTRAINT_SYSTEM_IDS)(
    '%s presets and canonical/share routes retain configuration and provenance',
    (systemId) => {
      for (const { config } of constraintPresets(systemId)) {
        const before = structuredClone(config),
          encoded = toCanonicalConstraint(config);
        if (!encoded.ok) throw new Error(JSON.stringify(encoded.issues));
        expect(fromCanonicalConstraint(encoded.value)).toEqual({ ok: true, value: config });
        const route = createExperimentRoute(encoded.value);
        if (!route.ok) throw new Error('route');
        const restored = resolveProductRoute(route.value);
        if (!restored.ok) throw new Error('restore');
        expect(restored.value.experiment).toEqual(encoded.value);
        expect(config).toEqual(before);
        trajectory(config).forEach(finiteSample);
      }
    }
  );
  it.each(CONSTRAINT_SYSTEM_IDS)('%s preserves seed, analyses, source units and derived provenance', (systemId) => {
    const config: ConstraintConfig = {
      ...defaultConstraintConfig(systemId),
      seed: { value: '42', generator: 'fixture', generatorVersion: 'v1' },
      analyses: [{ id: 'analysis:energy', algorithmVersion: 'fixture-v1', settings: {} }],
      provenance: {
        createdByVersion: 's11-fixture',
        source: { kind: 'derived', id: 'fixture' },
        parentExperimentIds: ['parent-1'],
        sourceUnits: {
          [systemId === 'system:double-string' ? 'initialConditions.theta1' : 'initialConditions.theta']: 'deg'
        }
      }
    };
    const encoded = toCanonicalConstraint(config);
    if (!encoded.ok) throw new Error(JSON.stringify(encoded.issues));
    expect(fromCanonicalConstraint(encoded.value)).toEqual({ ok: true, value: config });
  });
  it.each([
    { startTime: null },
    { sampleEvery: null },
    { analyses: null },
    { seed: null },
    { provenance: null },
    { step: 0 },
    { step: 0.1 },
    { duration: 301 },
    { step: 0.000001, duration: 1 },
    { duration: 0.001, step: 0.002 },
    { sampleEvery: 1.5 },
    { sampleEvery: 0 },
    { startTime: 1e100 },
    { integratorId: 'internal' },
    { integratorId: 'integrator:verlet' },
    { systemId: 'system:double' },
    { unknown: 'preserve' },
    { initialState: [0, 0, 0, 0] },
    { initialState: [1, 2] },
    { initialState: [1, NaN, 0, 0] },
    { initialState: new Array(4) },
    { parameters: { mass: 0, stiffness: 40, restLength: 1, g: 9.81 } },
    { parameters: { mass: 1, stiffness: 40, restLength: 1, g: 9.81, extra: 2 } }
  ])('rejects malformed settings without source mutation: %j', (patch) => {
    const value = { ...defaultConstraintConfig(), ...patch },
      before = structuredClone(value);
    expect(validateConstraintConfig(value).ok).toBe(false);
    expect(value).toEqual(before);
  });
  it('rejects executable, prototype-poisoned and cyclic inputs without invoking callbacks', () => {
    let called = false;
    const accessor = Object.defineProperty({}, 'parameters', {
      enumerable: true,
      get() {
        called = true;
        return {};
      }
    });
    expect(validateConstraintConfig(accessor).ok).toBe(false);
    expect(called).toBe(false);
    expect(validateConstraintConfig(JSON.parse('{"__proto__":{"polluted":true}}')).ok).toBe(false);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(validateConstraintConfig(cycle).ok).toBe(false);
  });
  it.each(CONSTRAINT_SYSTEM_IDS)('%s refuses unsupported canonical fields, versions, units and runtime', (systemId) => {
    const encoded = toCanonicalConstraint(defaultConstraintConfig(systemId));
    if (!encoded.ok) throw new Error('canonical');
    const state = encoded.value,
      key = systemId === 'system:double-string' ? 'm1' : 'mass';
    for (const patch of [
      { schema: 'pendulum-experiment/v99' },
      { modelVersion: 'future' },
      { modelOptions: {} },
      { integrator: { ...state.integrator, version: 'future' } },
      { integrator: { ...state.integrator, options: {} } },
      { integrator: { ...state.integrator, settings: { tolerance: { kind: 'scalar', value: 1, unit: '1' } } } },
      { runtime: { domain: 'evaluation' } },
      { parameters: { ...state.parameters, [key]: { kind: 'scalar', value: 1, unit: 'm' } } },
      { parameters: { ...state.parameters, [key]: { kind: 'vector', values: [1], unit: 'kg' } } },
      { parameters: { ...state.parameters, extra: { kind: 'scalar', value: 1, unit: 'kg' } } },
      { initialConditions: { ...state.initialConditions, extra: { kind: 'scalar', value: 1, unit: 'rad' } } }
    ]) {
      const value = { ...state, ...patch },
        before = structuredClone(value);
      expect(fromCanonicalConstraint(value).ok).toBe(false);
      expect(value).toEqual(before);
    }
  });
  it('permits zero gravity only where the original model accepts it and enforces internal rope stepping', () => {
    for (const systemId of CONSTRAINT_SYSTEM_IDS) {
      const config = defaultConstraintConfig(systemId);
      expect(validateConstraintConfig({ ...config, parameters: { ...config.parameters, g: 0 } }).ok).toBe(
        systemId !== 'system:double-string'
      );
      if (systemId !== 'system:spring')
        expect(validateConstraintConfig({ ...config, integratorId: 'integrator:rk4' }).ok).toBe(false);
    }
  });
  it('keeps the last valid state, time and event accounting on singular failure and refuses further steps', () => {
    // Force-free radial motion crosses r=0 on step two; a restoring spring would bounce first.
    const sim = createConstraintSimulation({
      ...defaultConstraintConfig(),
      parameters: { mass: 1, stiffness: 0, restLength: 1, g: 0 },
      integratorId: 'integrator:euler',
      initialState: [0.051, 0, -1, 0],
      step: 0.05,
      duration: 1
    });
    sim.step();
    const before = sim.snapshot();
    expect(before.step).toBe(1);
    expect(() => sim.step()).toThrow(/특이점/);
    expect(sim.snapshot()).toEqual(before);
    expect(() => sim.step()).toThrow(/특이점/);
    expect(sim.snapshot()).toEqual(before);
  });
  it.each(CONSTRAINT_SYSTEM_IDS)(
    '%s stops at fractional duration and isolates input, config and output buffers',
    (systemId) => {
      const config = { ...defaultConstraintConfig(systemId), step: 0.003, duration: 0.01, startTime: 2 },
        sim = createConstraintSimulation(config);
      const initial = sim.snapshot();
      (initial.state as number[])[0] = 999;
      (config.initialState as number[])[0] = 888;
      (sim.config.initialState as number[])[0] = 777;
      expect(sim.snapshot().state[0]).not.toBe(999);
      while (!sim.done) sim.step();
      const final = sim.snapshot();
      expect(final.step).toBe(4);
      expect(final.time).toBe(2.01);
      expect(sim.step()).toEqual(final);
    }
  );
});
