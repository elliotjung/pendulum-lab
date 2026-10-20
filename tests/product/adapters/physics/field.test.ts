import { describe, expect, it } from 'vitest';
import {
  createFputVerletScratch,
  fputEnergy,
  fputModeEnergies,
  fputVelocityVerletStep
} from '../../../../src/physics/fput';
import { rhsPendulumNetwork, ringPhononDispersion } from '../../../../src/physics/pendulumNetwork';
import { createSineGordonField, relaxFrenkelKontorovaKink, stepSineGordon } from '../../../../src/physics/sineGordon';
import { eulerMaruyamaStep, gaussianSampler } from '../../../../src/physics/stochasticSteppers';
import {
  createFieldSimulation,
  defaultFieldConfig,
  fieldMemberSeed,
  fieldPendulumParameters,
  fromCanonicalField,
  resizeFieldConfig,
  toCanonicalField,
  validateFieldConfig
} from '../../../../src/product/adapters/physics/field';

describe('S16 native field and stochastic adapters', () => {
  it('FPUT states, Hamiltonian and harmonic modes match native Verlet through the complete horizon', () => {
    const c = { ...defaultFieldConfig('system:fput'), duration: 0.5 },
      sim = createFieldSimulation(c),
      state = Float64Array.from(c.initialState),
      p = { size: c.grid.points, alpha: c.parameters.alpha!, beta: c.parameters.beta! },
      scratch = createFputVerletScratch(p.size);
    while (!sim.done) {
      fputVelocityVerletStep(state, c.step, p, scratch);
      const sample = sim.step();
      expect(sample.state).toEqual(Array.from(state));
      expect(sample.energy).toBe(fputEnergy(state, p));
      expect(sample.modeEnergies).toEqual(fputModeEnergies(state, p));
    }
    expect(sim.snapshot().time).toBe(c.duration);
  });
  it.each(['fixed', 'periodic'] as const)(
    'sine-Gordon %s matches native time levels and restores exact continuation',
    (boundary) => {
      const base = resizeFieldConfig(defaultFieldConfig('system:sine-gordon'), 41),
        c = { ...base, grid: { ...base.grid, boundary }, duration: 0.1 },
        n = c.grid.points,
        dx = c.grid.length / (boundary === 'periodic' ? n : n - 1),
        native = createSineGordonField({
          points: n,
          length: c.grid.length,
          dt: c.step,
          boundary,
          initial: (x) => c.initialState[Math.round(x / dx)]!,
          initialRate: (x) => c.initialState[n + Math.round(x / dx)]!
        }),
        sim = createFieldSimulation(c);
      for (let i = 0; i < 5; i++) {
        stepSineGordon(native);
        const sample = sim.step();
        expect(sample.profile).toEqual(Array.from(native.u));
        expect(sample.previousField).toEqual(Array.from(native.uPrev));
      }
      const restart = sim.restartConfig(),
        canonical = toCanonicalField(restart);
      expect(canonical.ok).toBe(true);
      if (!canonical.ok) throw new Error('canonical');
      const restored = fromCanonicalField(canonical.value);
      if (!restored.ok) throw new Error('restore');
      const continuation = createFieldSimulation(restored.value);
      expect(continuation.step().profile).toEqual(sim.step().profile);
      if (boundary === 'fixed') {
        while (!sim.done) sim.step();
        expect(sim.snapshot().profile[0]).toBe(c.initialState[0]);
        expect(sim.snapshot().profile.at(-1)).toBe(c.initialState[n - 1]);
      }
    }
  );
  it('lattice diagnostic preserves native squared frequencies and FK native stationary profile', () => {
    const c = defaultFieldConfig('system:lattice-fk-limit'),
      s = createFieldSimulation(c);
    expect(s.done).toBe(true);
    expect(s.snapshot().profile).toEqual(
      ringPhononDispersion(c.parameters.onsiteOmegaSq!, c.parameters.couplingRate!, c.grid.points)
    );
    const fk = defaultFieldConfig('system:frenkel-kontorova'),
      native = relaxFrenkelKontorovaKink(fk.parameters.coupling!, {
        sites: fk.grid.points,
        centerOffset: fk.parameters.centerOffset!,
        maxIterations: fk.parameters.maxIterations!,
        tolerance: fk.parameters.tolerance!
      }),
      sample = createFieldSimulation(fk).snapshot();
    expect(sample.profile).toEqual(Array.from(native.angles));
    expect(sample.energy).toBe(native.energy);
    expect(sample.charge).toBe(1);
    expect(sample.gradNorm).toBeLessThan(fk.parameters.tolerance!);
  });
  it('seeded ensemble matches independent native Gaussian streams and preserves member prefix', () => {
    const c = { ...defaultFieldConfig(), duration: 0.2, ensemble: { members: 4 } },
      native = Array.from({ length: 4 }, () => Float64Array.from(c.initialState)),
      rng = Array.from({ length: 4 }, (_, i) => gaussianSampler(fieldMemberSeed(c.seed.value, i))),
      sim = createFieldSimulation(c),
      larger = createFieldSimulation({ ...c, ensemble: { members: 8 } }),
      params = fieldPendulumParameters(c);
    while (!sim.done) {
      native.forEach((s, i) => {
        const next = new Float64Array(2);
        eulerMaruyamaStep(
          s,
          c.step,
          (state, out) => rhsPendulumNetwork(state, params, out),
          [0, c.parameters.noise!],
          rng[i]!,
          next
        );
        s.set(next);
      });
      const sample = sim.step(),
        large = larger.step();
      expect(sample.memberStates).toEqual(native.map((s) => Array.from(s)));
      expect(large.memberStates.slice(0, 4)).toEqual(sample.memberStates);
      expect(large.ensemble.seeds.slice(0, 4)).toEqual(sample.ensemble.seeds);
    }
    expect(() => sim.restartConfig()).toThrow('cursor');
  });
  it('zero-noise paths coincide; changing seed changes noisy paths', () => {
    const c = { ...defaultFieldConfig(), duration: 0.2 },
      zero = createFieldSimulation({ ...c, parameters: { ...c.parameters, noise: 0 } }),
      a = createFieldSimulation(c),
      b = createFieldSimulation({ ...c, seed: { ...c.seed, value: 'other' } });
    while (!zero.done) {
      zero.step();
      a.step();
      b.step();
    }
    expect(
      zero.snapshot().memberStates.every((row) => JSON.stringify(row) === JSON.stringify(zero.snapshot().state))
    ).toBe(true);
    expect(zero.snapshot().variance).toEqual([0]);
    expect(a.snapshot().state).not.toEqual(b.snapshot().state);
  });
  it('rejects unstable SG, fractional final steps and work products before allocating native buffers', () => {
    const c = defaultFieldConfig('system:sine-gordon');
    expect(validateFieldConfig({ ...c, grid: { ...c.grid, length: 0.01 } }).ok).toBe(false);
    expect(validateFieldConfig({ ...c, duration: 0.015 }).ok).toBe(false);
    expect(
      validateFieldConfig({ ...defaultFieldConfig(), step: 0.001, duration: 100, ensemble: { members: 64 } }).ok
    ).toBe(false);
  });
});
