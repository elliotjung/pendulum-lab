import { describe, expect, it } from 'vitest';
import { createQkrPlan, qkrMeanSquareMomentum, qkrNorm, qkrStep } from '../../../../src/physics/quantumKickedRotor';
import { standardMapStep } from '../../../../src/physics/standardMap';
import { qkrQuasiEnergySpectrum } from '../../../../src/research/qkrFloquet';
import { complexUnitaryFloquetSpectrum } from '../../../../src/research/unitaryFloquet';
import {
  createDiscreteSession,
  defaultDiscreteConfig,
  fromCanonicalDiscrete,
  resizeDiscreteConfig,
  toCanonicalDiscrete,
  validateDiscreteConfig
} from '../../../../src/product/adapters/physics/discrete';

describe('S17 native discrete and complex evolution', () => {
  it('standard-map iteration preserves native angular wrapping and unwrapped momentum exactly', () => {
    const c = { ...defaultDiscreteConfig(), initialState: [6.2, 2000], iterations: 137 },
      s = createDiscreteSession(c);
    let theta = c.initialState[0]!,
      p = c.initialState[1]!;
    while (!s.done) {
      const next = standardMapStep(theta, p, c.parameters.kickStrength!);
      theta = next.theta;
      p = next.p;
      const sample = s.step();
      expect(sample.state).toEqual([theta, p]);
      expect(sample.iteration).toBe(sample.step);
      expect(sample.theta).toBeGreaterThanOrEqual(0);
      expect(sample.theta).toBeLessThan(2 * Math.PI);
    }
    expect(s.snapshot().p).toBeGreaterThan(1000);
    const saved = toCanonicalDiscrete(s.restartConfig());
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error('canonical');
    const restored = fromCanonicalDiscrete(JSON.parse(JSON.stringify(saved.value)));
    if (!restored.ok) throw new Error('restore');
    const continued = createDiscreteSession(restored.value).step(),
      next = standardMapStep(theta, p, c.parameters.kickStrength!);
    expect(continued.state).toEqual([next.theta, next.p]);
    expect(continued.iteration).toBe(c.iterations + 1);
  });
  it('complex FFT evolution matches the native state, norm and momentum observable at every period', () => {
    const base = resizeDiscreteConfig(defaultDiscreteConfig('system:quantum-kicked-rotor'), 16),
      c = {
        ...base,
        iterations: 100,
        wavefunction: {
          re: Array.from({ length: 16 }, (_, i) => Math.cos(i) / 4),
          im: Array.from({ length: 16 }, (_, i) => Math.sin(i) / 4)
        }
      },
      sim = createDiscreteSession(c);
    const plan = createQkrPlan({ gridSize: 16, kickStrength: c.parameters.kickStrength!, hbar: c.parameters.hbar! }),
      wave = { re: Float64Array.from(c.wavefunction.re), im: Float64Array.from(c.wavefunction.im) };
    while (!sim.done) {
      qkrStep(wave, plan);
      const sample = sim.step();
      expect(sample.re).toEqual(Array.from(wave.re));
      expect(sample.im).toEqual(Array.from(wave.im));
      expect(sample.norm).toBe(qkrNorm(wave));
      expect(sample.meanSquareMomentum).toBe(qkrMeanSquareMomentum(wave, plan));
      expect(sample.momentum).toEqual(Array.from(plan.momentum));
    }
    expect(sim.snapshot().spectrum).toBeUndefined();
    expect(sim.snapshot().warnings.join(' ')).toContain('생략');
    const canonical = toCanonicalDiscrete(sim.restartConfig());
    if (!canonical.ok) throw new Error('canonical');
    const restored = fromCanonicalDiscrete(JSON.parse(JSON.stringify(canonical.value)));
    if (!restored.ok) throw new Error('restore');
    qkrStep(wave, plan);
    expect(createDiscreteSession(restored.value).step().re).toEqual(Array.from(wave.re));
  });
  it('preserves a non-unit initial norm without automatic coefficient correction', () => {
    const base = defaultDiscreteConfig('system:quantum-kicked-rotor'),
      c = { ...base, wavefunction: { re: [2, ...(Array(7).fill(0) as number[])], im: Array(8).fill(0) as number[] } },
      s = createDiscreteSession(c);
    expect(s.snapshot().norm).toBe(4);
    expect(s.snapshot().normDrift).toBe(3);
    expect(s.snapshot().warnings.join(' ')).toContain('초기 확률 norm=4');
    while (!s.done) s.step();
    expect(s.snapshot().norm).toBeCloseTo(4, 10);
    expect(s.snapshot().normDrift).toBeCloseTo(3, 10);
  });
  it('uses exactly the same finite-grid native Floquet spectrum as the small QKR state', () => {
    const c = defaultDiscreteConfig('system:quantum-kicked-rotor'),
      native = qkrQuasiEnergySpectrum(
        { gridSize: c.gridSize, kickStrength: c.parameters.kickStrength!, hbar: c.parameters.hbar! },
        { period: 1, projectToUnitCircle: false }
      ),
      sample = createDiscreteSession(c).snapshot();
    const { gridSize: _grid, kickStrength: _kick, hbar: _hbar, ...spectrum } = native;
    expect(sample.spectrum).toEqual(spectrum);
    expect(sample.spectrum!.phases).toHaveLength(c.gridSize);
    expect(sample.spectrum!.unitarityDefect).toBeLessThan(1e-12);
    expect(sample.spectrum!.maxUnitCircleDrift).toBeLessThan(1e-8);
  });
  it('known phases and nonunitary raw eigenvalues preserve the native evaluation contract', () => {
    const c = {
        ...resizeDiscreteConfig(defaultDiscreteConfig('system:unitary-floquet'), 2),
        matrix: {
          re: [
            [1, 0],
            [0, 0]
          ],
          im: [
            [0, 0],
            [0, -1]
          ]
        },
        parameters: { hbar: 0.5, period: 2 }
      },
      s = createDiscreteSession(c);
    expect(s.done).toBe(true);
    expect(s.snapshot().spectrum!.phases[0]).toBeCloseTo(-Math.PI / 2, 10);
    expect(s.snapshot().spectrum!.quasiEnergies[0]).toBeCloseTo(Math.PI / 8, 10);
    expect(s.step()).toEqual(s.snapshot());
    const leaky = {
        ...c,
        matrix: {
          re: [
            [1, 0],
            [0, 2]
          ],
          im: [
            [0, 0],
            [0, 0]
          ]
        }
      },
      sample = createDiscreteSession(leaky).snapshot(),
      native = complexUnitaryFloquetSpectrum(leaky.matrix, { ...leaky.parameters, projectToUnitCircle: false });
    expect(sample.spectrum).toEqual(native);
    expect(sample.spectrum!.unitarityDefect).toBeGreaterThan(1);
    expect(sample.spectrum!.maxUnitCircleDrift).toBeCloseTo(1, 10);
    expect(Math.max(...sample.spectrum!.eigenvalues.map((e) => Math.hypot(e.re, e.im)))).toBeCloseTo(2, 10);
  });
  it('guards initial cylinder coordinates, dedicated stepping and bounded work', () => {
    for (const theta of [-0.01, 2 * Math.PI])
      expect(validateDiscreteConfig({ ...defaultDiscreteConfig(), initialState: [theta, 0] }).ok).toBe(false);
    expect(validateDiscreteConfig({ ...defaultDiscreteConfig(), initialState: [1, 1e12] }).ok).toBe(true);
    expect(validateDiscreteConfig({ ...defaultDiscreteConfig(), integratorId: 'integrator:rk4' }).ok).toBe(false);
    expect(
      validateDiscreteConfig({
        ...resizeDiscreteConfig(defaultDiscreteConfig('system:quantum-kicked-rotor'), 512),
        iterations: 100000
      }).ok
    ).toBe(false);
    expect(() => createDiscreteSession({ ...defaultDiscreteConfig(), iterations: 0 })).toThrow();
    expect(() => createDiscreteSession(defaultDiscreteConfig()).advance(65)).toThrow();
  });
});
