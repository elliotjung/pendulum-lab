import { describe, expect, it } from 'vitest';
import {
  createDrivenSimulation,
  defaultDrivenConfig,
  validateDrivenConfig,
  toCanonicalDriven,
  fromCanonicalDriven,
  DRIVEN_SYSTEM_IDS,
  drivenWaveform,
  drivenWarnings,
  type DrivenConfig,
  type DrivenSample
} from '../../../../src/product/adapters/physics/driven';
import { createExpansionSystem } from '../../../../src/physics/expandedModels-factory';
import { rk4Step } from '../../../../src/physics/integrators';
import { createExperimentRoute, resolveProductRoute } from '../../../../src/product/persistence';

function trajectory(config: DrivenConfig): DrivenSample[] {
  const simulation = createDrivenSimulation(config),
    samples = [simulation.snapshot()];
  while (!simulation.done) samples.push(simulation.step());
  return samples;
}

describe('S13 original-engine and passive characterization', () => {
  it.each(DRIVEN_SYSTEM_IDS)(
    '%s keeps native legacy state and energy with default cosine drive/controller off',
    (systemId) => {
      const config = { ...defaultDrivenConfig(systemId), duration: 0.2 };
      const id = systemId.slice(7) as 'driven',
        forcing = config.forcing;
      const engine = createExpansionSystem(
        id,
        {
          ...config.parameters,
          ...(id === 'driven'
            ? { driveAmplitude: forcing!.amplitude, driveFrequency: forcing!.frequency }
            : id === 'parametric'
              ? { amplitude: forcing!.amplitude, frequency: forcing!.frequency }
              : {})
        },
        config.initialState
      );
      let native = Float64Array.from(config.initialState);
      const simulation = createDrivenSimulation(config);
      while (true) {
        const sample = simulation.snapshot();
        sample.state.forEach((value, i) => expect(value).toBeCloseTo(native[i]!, 11));
        expect(sample.energy).toBeCloseTo(engine.energy(native), 10);
        expect(sample.control).toBe(0);
        if (simulation.done) break;
        const next = new Float64Array(native.length);
        rk4Step(native, config.step, engine.rhs, next);
        native = next;
        simulation.step();
      }
    }
  );
  it('retains the original cart-pole constant force independently from waveform and controller', () => {
    const base = defaultDrivenConfig('system:cartpole'),
      config = { ...base, parameters: { ...base.parameters, force: -0.8 }, duration: 0.1 };
    const original = createExpansionSystem('cartpole', config.parameters, config.initialState);
    let state = Float64Array.from(config.initialState);
    for (const sample of trajectory(config).slice(1)) {
      const next = new Float64Array(4);
      rk4Step(state, config.step, original.rhs, next);
      state = next;
      sample.state.forEach((x, i) => expect(x).toBeCloseTo(state[i]!, 12));
    }
  });
  it.each(['system:driven', 'system:parametric'] as const)(
    '%s zero amplitude matches the passive pendulum acceleration',
    (systemId) => {
      const base = defaultDrivenConfig(systemId),
        config = {
          ...base,
          parameters: { ...base.parameters, g: 9.81, length: 1, damping: 0 },
          forcing: { ...base.forcing!, amplitude: 0 },
          initialState: [0.4, 0.2, 0.8],
          duration: 0.3
        };
      const passive = trajectory(config);
      const other = defaultDrivenConfig(systemId === 'system:driven' ? 'system:parametric' : 'system:driven');
      const comparison = trajectory({
        ...other,
        parameters: config.parameters,
        forcing: { ...other.forcing!, amplitude: 0 },
        initialState: config.initialState,
        duration: config.duration
      });
      passive.forEach((sample, i) => {
        expect(sample.state.slice(0, 2)).toEqual(comparison[i]!.state.slice(0, 2));
        expect(Math.abs(sample.energy - passive[0]!.energy)).toBeLessThan(1e-9);
      });
    }
  );
  it('uncoupled identical pendulums stay in the symmetric normal mode', () => {
    const base = defaultDrivenConfig('system:coupled'),
      samples = trajectory({ ...base, initialState: [0.2, 0.2, 0, 0], duration: 1 });
    samples.forEach((sample) => {
      expect(sample.state[0]).toBe(sample.state[1]);
      expect(sample.state[2]).toBe(sample.state[3]);
      expect(Math.abs(sample.energy - samples[0]!.energy)).toBeLessThan(1e-8);
    });
  });
  it('renders upright inverted/cart-pole and fixed-length gravity modulation without changing their native physics', () => {
    for (const id of ['system:inverted', 'system:cartpole', 'system:parametric'] as const) {
      const base = defaultDrivenConfig(id),
        sample = createDrivenSimulation({
          ...base,
          initialState: id === 'system:cartpole' ? [0.3, 0, 0, 0] : id === 'system:inverted' ? [0, 0] : [0, 0, 0]
        }).snapshot();
      expect(sample.positions.at(-1)!.y).toBe(
        id === 'system:parametric' ? -base.parameters.length! : base.parameters.length!
      );
    }
    expect(drivenWarnings(defaultDrivenConfig('system:cartpole')).join()).toContain('4/3');
    expect(drivenWarnings(defaultDrivenConfig('system:coupled')).join()).toContain('길이≠1');
  });
});

describe('S13 forcing and feedback', () => {
  it.each(['sine', 'square', 'triangle'] as const)(
    '%s waveform has bounded output and a quarter-cycle peak',
    (waveform) => {
      for (let i = -100; i <= 100; i++) expect(Math.abs(drivenWaveform(waveform, i / 10))).toBeLessThanOrEqual(1);
      expect(drivenWaveform(waveform, Math.PI / 2)).toBeCloseTo(1, 14);
      expect(drivenWaveform(waveform, -Math.PI / 2)).toBeCloseTo(-1, 14);
    }
  );
  it('a gravity-free driven pendulum agrees with the analytic sinusoidal response', () => {
    const base = defaultDrivenConfig(),
      a = 0.6,
      frequency = 2.3,
      amplitude = 0.7,
      duration = 0.8;
    const samples = trajectory({
      ...base,
      parameters: { ...base.parameters, g: 0, damping: 0 },
      initialState: [0, 0, 0.2],
      forcing: { waveform: 'sine', amplitude, frequency, phase: 0.4 },
      duration
    });
    const final = samples.at(-1)!;
    expect(final.state[0]).toBeCloseTo(
      (amplitude / frequency) * Math.cos(a) * duration -
        (amplitude / frequency ** 2) * (Math.sin(a + frequency * duration) - Math.sin(a)),
      10
    );
    expect(final.state[1]).toBeCloseTo(
      (amplitude / frequency) * (Math.cos(a) - Math.cos(a + frequency * duration)),
      10
    );
    expect(final.state[2]).toBeCloseTo(0.2 + frequency * duration, 12);
  });
  it('cart-pole evaluates sine input at RK stages and has fourth-order impulse convergence at nonzero absolute time', () => {
    const base = defaultDrivenConfig('system:cartpole'),
      frequency = 7,
      phase = 0.4,
      duration = 0.4,
      startTime = 2;
    const config = {
      ...base,
      parameters: { ...base.parameters, g: 0, force: 0 },
      initialState: [0, 0, 0, 0],
      forcing: { waveform: 'sine' as const, amplitude: 0.5, frequency, phase },
      duration,
      startTime
    };
    const impulse =
      (0.5 / frequency) *
      (Math.cos(frequency * startTime + phase) - Math.cos(frequency * (startTime + duration) + phase));
    const error = (step: number) => {
      const s = trajectory({ ...config, step }).at(-1)!.state,
        p = config.parameters as Readonly<Record<string, number>>;
      return Math.abs(
        (p.cartMass! + p.poleMass!) * s[2]! + p.poleMass! * p.length! * Math.cos(s[1]!) * s[3]! - impulse
      );
    };
    const coarse = error(0.05),
      fine = error(0.025);
    expect(fine).toBeLessThan(1e-7);
    expect(coarse / fine).toBeGreaterThan(12);
    expect(coarse / fine).toBeLessThan(20);
  });
  it.each(['system:inverted', 'system:cartpole'] as const)(
    '%s default feedback reduces the upright disturbance',
    (systemId) => {
      const base = defaultDrivenConfig(systemId),
        config = { ...base, controller: { ...base.controller!, enabled: true }, duration: 5 };
      const samples = trajectory(config),
        final = samples.at(-1)!,
        angle = systemId === 'system:cartpole' ? 1 : 0;
      expect(Math.abs(final.state[angle]!)).toBeLessThan(Math.abs(base.initialState[angle]!) * 0.15);
      expect(final.state.every(Number.isFinite)).toBe(true);
    }
  );
  it('cart-pole private elapsed clock avoids accumulating tiny dt onto a large absolute start time', () => {
    const base = defaultDrivenConfig('system:cartpole'),
      startTime = 1e9,
      duration = 0.1;
    const simulation = createDrivenSimulation({
      ...base,
      parameters: { ...base.parameters, g: 0 },
      initialState: [0, 0, 0, 0],
      forcing: { waveform: 'sine', amplitude: 0.5, frequency: 1, phase: 0 },
      startTime,
      duration,
      step: 1e-5
    });
    while (!simulation.done) simulation.step();
    const sample = simulation.snapshot(),
      s = sample.state,
      p = base.parameters;
    const impulse = 0.5 * (Math.cos(startTime) - Math.cos(startTime + duration));
    expect(
      Math.abs((p.cartMass! + p.poleMass!) * s[2]! + p.poleMass! * p.length! * Math.cos(s[1]!) * s[3]! - impulse)
    ).toBeLessThan(1e-8);
    expect(sample.time).toBe(startTime + duration);
    expect(sample.state.length).toBe(4);
  });
  it('controller output saturates and disabled control leaves the plant untouched', () => {
    const base = defaultDrivenConfig('system:inverted'),
      controller = { ...base.controller!, enabled: true, kp: 10000, maxOutput: 0.1 };
    const active = createDrivenSimulation({ ...base, controller }).snapshot();
    expect(active.control).toBe(-0.1);
    expect(active.warnings.join()).toContain('포화');
    const disabled = trajectory({ ...base, controller: { ...controller, enabled: false }, duration: 0.1 });
    expect(disabled).toEqual(trajectory({ ...base, duration: 0.1 }));
  });
  it('unsafe closed-loop departure freezes the last accepted finite state and rethrows on further steps', () => {
    const base = defaultDrivenConfig('system:inverted'),
      simulation = createDrivenSimulation({
        ...base,
        controller: { ...base.controller!, enabled: true, maxOutput: 0.1 },
        initialState: [1.5, 10],
        duration: 0.5
      });
    let last = simulation.snapshot(),
      failed = false;
    try {
      while (!simulation.done) last = simulation.step();
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(last.step).toBeGreaterThan(0);
    expect(simulation.snapshot()).toEqual(last);
    expect(last.state.every(Number.isFinite)).toBe(true);
    expect(() => simulation.step()).toThrow('안전 범위');
  });
});

describe('S13 closed canonical native-state contract', () => {
  it.each(DRIVEN_SYSTEM_IDS)(
    '%s routes round-trip the exact native state, forcing and optional controller',
    (systemId) => {
      const base = defaultDrivenConfig(systemId),
        config = {
          ...base,
          duration: 0.021,
          step: 0.002,
          startTime: 1.234,
          ...(base.forcing
            ? { forcing: { waveform: 'triangle' as const, amplitude: 0.2, frequency: 4.321, phase: -0.4321 } }
            : {})
        };
      const encoded = toCanonicalDriven(config);
      if (!encoded.ok) throw new Error(JSON.stringify(encoded.issues));
      const route = createExperimentRoute(encoded.value);
      if (!route.ok) throw new Error('route');
      const resolved = resolveProductRoute(route.value);
      if (!resolved.ok || !resolved.value.experiment) throw new Error('resolve');
      const restored = fromCanonicalDriven(resolved.value.experiment);
      if (!restored.ok) throw new Error(JSON.stringify(restored.issues));
      expect(restored.value).toEqual(config);
      expect(trajectory(restored.value)).toEqual(trajectory(config));
      const initial = createDrivenSimulation(config).snapshot(),
        mutation = restored.value as unknown as { initialState: number[] };
      mutation.initialState[0] = 123;
      expect(createDrivenSimulation(config).snapshot()).toEqual(initial);
    }
  );
  it.each(['system:driven', 'system:parametric', 'system:cartpole'] as const)(
    '%s native restart retains phase/frequency and follows the same continuation',
    (systemId) => {
      const base = defaultDrivenConfig(systemId),
        config = {
          ...base,
          duration: 0.2,
          forcing: { ...base.forcing!, waveform: 'triangle' as const, phase: 0.4, frequency: 2.3, amplitude: 0.2 }
        };
      const samples = trajectory(config),
        midpoint = samples[50]!;
      const restart = { ...config, initialState: midpoint.state, startTime: midpoint.time, duration: 0.1 };
      const canonical = toCanonicalDriven(restart);
      if (!canonical.ok) throw new Error('encode');
      const restored = fromCanonicalDriven(canonical.value);
      if (!restored.ok) throw new Error('decode');
      const final = trajectory(restored.value).at(-1)!;
      final.state.forEach((value, i) => expect(value).toBeCloseTo(samples.at(-1)!.state[i]!, 12));
    }
  );
  it.each([
    (c: DrivenConfig) => ({ ...c, unknown: 1 }),
    (c: DrivenConfig) => ({ ...c, parameters: { ...c.parameters, mass: 1 } }),
    (c: DrivenConfig) => ({ ...c, forcing: { ...c.forcing!, frequency: NaN } }),
    (c: DrivenConfig) => ({ ...c, forcing: { ...c.forcing!, waveform: 'expression' } }),
    (c: DrivenConfig) => ({ ...c, forcing: { ...c.forcing!, function: 'sin(t)' } }),
    (c: DrivenConfig) => ({ ...c, duration: 300, step: 0.000001 }),
    (c: DrivenConfig) => ({ ...c, analyses: [{ id: 'analysis:fft', algorithmVersion: 'v1', settings: {} }] }),
    (c: DrivenConfig) => ({
      ...c,
      controller: { enabled: false, kp: 1, kd: 1, kx: 0, kv: 0, reference: 0, maxOutput: 1 }
    }),
    (c: DrivenConfig) => ({ ...c, initialState: [0, 0] })
  ])('invalid/unsupported input is rejected without mutation %#', (mutate) => {
    const input = mutate(defaultDrivenConfig());
    expect(validateDrivenConfig(input).ok).toBe(false);
  });
  it.each(['kp', 'kd', 'kx', 'kv', 'maxOutput'] as const)(
    'invalid controller %s is rejected even when disabled',
    (key) => {
      const base = defaultDrivenConfig('system:cartpole');
      expect(validateDrivenConfig({ ...base, controller: { ...base.controller!, [key]: -1 } }).ok).toBe(false);
    }
  );
  it.each(['system:inverted', 'system:cartpole'] as const)(
    '%s requires explicit controller settings even when disabled',
    (systemId) => {
      const { controller: _controller, ...config } = defaultDrivenConfig(systemId);
      expect(validateDrivenConfig(config).ok).toBe(false);
      const canonical = toCanonicalDriven(defaultDrivenConfig(systemId));
      if (!canonical.ok) throw new Error('encode');
      const { controllerEnabled: _enabled, ...options } = canonical.value.modelOptions!;
      const parameters = Object.fromEntries(
        Object.entries(canonical.value.parameters).filter(([key]) => !key.startsWith('controller'))
      );
      expect(fromCanonicalDriven({ ...canonical.value, parameters, modelOptions: options }).ok).toBe(false);
    }
  );
  it('canonical active gains have physical units and incompatible/unknown fields or nonempty analyses are not discarded', () => {
    const base = defaultDrivenConfig('system:cartpole'),
      result = toCanonicalDriven(base);
    if (!result.ok) throw new Error('canonical');
    expect(result.value.parameters.controllerKp?.unit).toBe('N/rad');
    expect(result.value.parameters.controllerKd?.unit).toBe('N*s/rad');
    for (const change of [
      { parameters: { ...result.value.parameters, controllerKp: { kind: 'scalar', value: 40, unit: '1' } } },
      { modelOptions: { ...result.value.modelOptions, unknown: true } },
      { analyses: [{ id: 'analysis:fft', algorithmVersion: 'v1', settings: {} }] },
      { initialConditions: { ...result.value.initialConditions, other: { kind: 'scalar', value: 0, unit: 'rad' } } }
    ])
      expect(fromCanonicalDriven({ ...result.value, ...change }).ok).toBe(false);
  });
});
