import { describe, expect, it } from 'vitest';
import {
  defaultSpatialConfig,
  spatialIsEmbedded,
  type SpatialConfig
} from '../../../src/product/adapters/physics/spatial';
import { applySpatialDraft } from '../../../src/product/lab/views/spatial-inspector';

function draft(config: SpatialConfig, selected: number) {
  const n = config.parameters.masses.length,
    embedded = spatialIsEmbedded(config.systemId),
    stride = embedded ? 3 : 2;
  const values: Record<string, number> = {
    mass: config.parameters.masses[selected]!,
    length: config.parameters.lengths[selected]!,
    g: config.parameters.g,
    damping: config.parameters.damping,
    step: config.step,
    duration: config.duration,
    sampleEvery: config.sampleEvery ?? 1
  };
  (embedded ? ['ux', 'uy', 'uz'] : ['theta', 'phi']).forEach((id, j) => {
    values[id] = config.initialState[stride * selected + j]!;
  });
  (embedded ? ['wx', 'wy', 'wz'] : ['thetaDot', 'phiDot']).forEach((id, j) => {
    values[id] = config.initialState[stride * (n + selected) + j]!;
  });
  return values;
}

describe('S12 atomic native-coordinate edits', () => {
  it.each(['system:spherical-chain', 'system:spherical-embedded-chain'] as const)(
    '%s preserves the identities and velocities of every surviving link when N changes',
    (systemId) => {
      const base = defaultSpatialConfig(systemId, 3),
        stride = spatialIsEmbedded(systemId) ? 3 : 2;
      const config = { ...base, parameters: { ...base.parameters, masses: [1, 2, 3], lengths: [0.4, 0.8, 1.2] } };
      const before = structuredClone(config),
        edited = draft(config, 2);
      edited.mass = 99;
      edited.length = 77;
      const smaller = applySpatialDraft(config, 2, 2, edited, config.integratorId);
      expect(smaller.parameters.masses).toEqual([1, 2]);
      expect(smaller.parameters.lengths).toEqual([0.4, 0.8]);
      expect(smaller.initialState).toEqual([
        ...config.initialState.slice(0, stride * 2),
        ...config.initialState.slice(stride * 3, stride * 5)
      ]);
      const larger = applySpatialDraft(config, 16, 2, draft(config, 2), config.integratorId);
      expect(larger.initialState.slice(0, stride * 3)).toEqual(config.initialState.slice(0, stride * 3));
      expect(larger.initialState.slice(stride * 16, stride * 19)).toEqual(config.initialState.slice(stride * 3));
      const template = defaultSpatialConfig(systemId, 16);
      expect(larger.initialState.slice(stride * 3, stride * 16)).toEqual(
        template.initialState.slice(stride * 3, stride * 16)
      );
      expect(larger.initialState.slice(stride * 19)).toEqual(template.initialState.slice(stride * 19));
      expect(config).toEqual(before);
    }
  );

  it('applies polar angles without wrapping and changes only the selected link', () => {
    const config = defaultSpatialConfig('system:spherical-chain', 2);
    const values = { ...draft(config, 1), theta: 14, phi: -20, thetaDot: 0.3, phiDot: -0.4, mass: 3, length: 2 };
    const edited = applySpatialDraft(config, 2, 1, values, 'integrator:rk2');
    expect(edited.initialState).toEqual([
      config.initialState[0],
      config.initialState[1],
      14,
      -20,
      config.initialState[4],
      config.initialState[5],
      0.3,
      -0.4
    ]);
    expect(edited.parameters.masses).toEqual([1, 3]);
    expect(edited.parameters.lengths).toEqual([1, 2]);
    expect(edited.integratorId).toBe('integrator:rk2');
  });

  it('applies embedded vector components together without conversion or normalization', () => {
    const config = defaultSpatialConfig('system:spherical-embedded');
    const values = { ...draft(config, 0), ux: 0, uy: -1, uz: 0, wx: 2, wy: 0, wz: -3 };
    expect(applySpatialDraft(config, 1, 0, values, 'internal').initialState).toEqual([0, -1, 0, 2, 0, -3]);
    expect(() => applySpatialDraft(config, 1, 0, { ...values, uy: -0.5 }, 'internal')).toThrow();
    expect(() => applySpatialDraft(config, 1, 0, { ...values, wy: 1 }, 'internal')).toThrow();
    expect(config).toEqual(defaultSpatialConfig('system:spherical-embedded'));
  });

  it('preserves metadata and accepts native scalar boundary values atomically', () => {
    const config: SpatialConfig = {
      ...defaultSpatialConfig(),
      startTime: 2,
      provenance: { createdByVersion: '10.36.0', source: { kind: 'manual' }, parentExperimentIds: [] }
    };
    const values = {
      ...draft(config, 0),
      mass: 0.001,
      length: 1000,
      g: 0,
      damping: 1000,
      step: 1e-6,
      duration: 1e-6,
      sampleEvery: 100000
    };
    const edited = applySpatialDraft(config, 1, 0, values, 'internal');
    expect(edited.parameters).toEqual({ masses: [0.001], lengths: [1000], g: 0, damping: 1000 });
    expect(edited.startTime).toBe(2);
    expect(edited.provenance).toEqual(config.provenance);
    expect(edited.duration).toBe(1e-6);
  });

  it.each([
    { mass: 0 },
    { length: -1 },
    { damping: -1 },
    { duration: 0 },
    { step: 0.1 },
    { sampleEvery: 1.5 },
    { phi: NaN }
  ])('rejects the entire invalid edit without changing the source: %j', (patch) => {
    const config = defaultSpatialConfig(),
      before = structuredClone(config);
    expect(() => applySpatialDraft(config, 1, 0, { ...draft(config, 0), ...patch }, 'internal')).toThrow();
    expect(config).toEqual(before);
  });

  it('requires valid counts/selections and respects the legacy chain gravity floor', () => {
    const config = defaultSpatialConfig('system:spherical-chain'),
      values = draft(config, 0);
    for (const n of [0, 17, 1.5]) expect(() => applySpatialDraft(config, n, 0, values, config.integratorId)).toThrow();
    for (const selected of [-1, 2, 0.5])
      expect(() => applySpatialDraft(config, 2, selected, values, config.integratorId)).toThrow();
    expect(() => applySpatialDraft(config, 2, 0, { ...values, g: 0 }, config.integratorId)).toThrow();
    expect(applySpatialDraft(config, 2, 0, { ...values, g: 0.001 }, config.integratorId).parameters.g).toBe(0.001);
  });
});
