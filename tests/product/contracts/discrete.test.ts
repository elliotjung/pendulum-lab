import { describe, expect, it } from 'vitest';
import {
  DISCRETE_SYSTEM_IDS,
  defaultDiscreteConfig,
  fromCanonicalDiscrete,
  toCanonicalDiscrete,
  validateDiscreteConfig
} from '../../../src/product/adapters/physics/discrete';

describe('S17 complex configuration serialization and compatibility', () => {
  it.each(DISCRETE_SYSTEM_IDS)('%s round-trips the complete state and runtime representation', (id) => {
    const config = defaultDiscreteConfig(id),
      canonical = toCanonicalDiscrete(config);
    if (!canonical.ok) throw new Error(canonical.issues.map((i) => i.message).join('\n'));
    expect(canonical.value.runtime.domain).toBe(id === 'system:unitary-floquet' ? 'evaluation' : 'iteration');
    const restored = fromCanonicalDiscrete(JSON.parse(JSON.stringify(canonical.value)));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(toCanonicalDiscrete(restored.value)).toEqual(canonical);
    if (id === 'system:quantum-kicked-rotor')
      expect(canonical.value.initialConditions.wavefunction!.kind).toBe('complex-vector');
    if (id === 'system:unitary-floquet') {
      const q = canonical.value.initialConditions.operator!;
      expect(q.kind).toBe('complex-vector');
      if (q.kind === 'complex-vector') expect(q.re).toHaveLength(config.gridSize ** 2);
    }
  });
  it('preserves arbitrary real and imaginary input coefficients and normalized units', () => {
    const c = {
        ...defaultDiscreteConfig('system:quantum-kicked-rotor'),
        wavefunction: { re: [Math.SQRT1_2, 0, 0, 0, 0, 0, 0, 0], im: [0, Math.SQRT1_2, 0, 0, 0, 0, 0, 0] }
      },
      canonical = toCanonicalDiscrete(c);
    if (!canonical.ok) throw new Error('canonical');
    const restored = fromCanonicalDiscrete(canonical.value);
    if (!restored.ok) throw new Error('restore');
    expect(restored.value.wavefunction).toEqual(c.wavefunction);
    expect(canonical.value.modelOptions!.representation).toBe('fft-momentum');
    expect(canonical.value.parameters.hbar!.unit).toBe('1');
  });
  it('rejects lossy, sparse, nonfinite and unknown complex inputs without dropping fields', () => {
    const c = defaultDiscreteConfig('system:quantum-kicked-rotor'),
      sparse = Array(8) as number[];
    for (const input of [
      { ...c, wavefunction: { re: [1], im: [0] } },
      { ...c, wavefunction: { re: [NaN, ...Array(7).fill(0)], im: Array(8).fill(0) } },
      { ...c, wavefunction: { re: sparse, im: Array(8).fill(0) } },
      { ...c, wavefunction: { re: Array(8).fill(0), im: Array(8).fill(0) } },
      { ...c, wavefunction: { ...c.wavefunction, extra: true } },
      { ...c, dt: 0.01 },
      { ...c, gridSize: 3 }
    ])
      expect(validateDiscreteConfig(input).ok).toBe(false);
    const canonical = toCanonicalDiscrete(defaultDiscreteConfig('system:unitary-floquet'));
    if (!canonical.ok) throw new Error('canonical');
    expect(
      fromCanonicalDiscrete({
        ...canonical.value,
        initialConditions: { ...canonical.value.initialConditions, unknown: { kind: 'scalar', value: 1, unit: '1' } }
      }).ok
    ).toBe(false);
    expect(
      fromCanonicalDiscrete({
        ...canonical.value,
        modelOptions: { ...canonical.value.modelOptions, representation: 'fft-momentum' }
      }).ok
    ).toBe(false);
    expect(fromCanonicalDiscrete({ ...canonical.value, modelVersion: 'future-v2' }).ok).toBe(false);
  });
  it('blocks incompatible continuous runtime, analyses and selectable integrators', () => {
    const canonical = toCanonicalDiscrete(defaultDiscreteConfig());
    if (!canonical.ok) throw new Error('canonical');
    expect(
      fromCanonicalDiscrete({
        ...canonical.value,
        runtime: {
          domain: 'time',
          start: { value: 0, unit: 's' },
          duration: { value: 1, unit: 's' },
          step: { value: 0.01, unit: 's' },
          sampleEvery: 1
        }
      }).ok
    ).toBe(false);
    expect(
      fromCanonicalDiscrete({
        ...canonical.value,
        integrator: { kind: 'selectable', id: 'integrator:rk4', version: '1', settings: {} }
      }).ok
    ).toBe(false);
    const incompatible = validateDiscreteConfig({
      ...defaultDiscreteConfig(),
      analyses: [{ id: 'analysis:ftle', algorithmVersion: '1', settings: {} }]
    });
    expect(incompatible.ok).toBe(false);
    if (!incompatible.ok) expect(incompatible.issues.some((i) => i.code === 'unsupported-analysis')).toBe(true);
  });
});
