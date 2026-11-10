import { describe, expect, it } from 'vitest';
import { createCoreModel } from '../../../src/product/lab/views/core-model';
import { createChainModel } from '../../../src/product/lab/views/chain-model';
import { DEFAULT_PLAYBACK, validatePlayback } from '../../../src/product/lab/views/playback-clock';
import {
  defaultPlanarConfig,
  createPlanarSimulation,
  type PlanarConfig
} from '../../../src/product/adapters/physics/planar';
import { defaultChainConfig, type ChainConfig } from '../../../src/product/adapters/physics/chain';
import { createWorkspaceRuntimeProvider, legacySnapshotTolerance } from '../../../src/product/app/browser-api-provider';

function planar(config: PlanarConfig = defaultPlanarConfig()) {
  const model = createCoreModel(config);
  model.setPlayback(DEFAULT_PLAYBACK);
  const provider = createWorkspaceRuntimeProvider({
    model,
    readTiming: () => model.state.playback!,
    restore(next, timing) {
      const playback = validatePlayback({ ...model.state.playback!, ...timing });
      model.configure(next);
      model.setPlayback(playback);
    }
  });
  return { model, provider };
}
describe('S28 truthful core/triple public runtime provider', () => {
  it('delegates reset through the visible-control policy before changing model state', () => {
    const model = createCoreModel(defaultPlanarConfig());
    model.setPlayback(DEFAULT_PLAYBACK);
    model.step();
    const before = model.state.sample;
    let busy = true;
    let called = 0;
    const provider = createWorkspaceRuntimeProvider({
      model,
      readTiming: () => model.state.playback!,
      restore: (config) => model.configure(config),
      reset() {
        if (busy) throw new Error('busy');
        called++;
        model.reset();
      }
    });
    expect(() => provider.reset()).toThrow('busy');
    expect(model.state.sample).toEqual(before);
    expect(called).toBe(0);
    busy = false;
    provider.reset();
    expect(called).toBe(1);
    expect(model.state.sample.time).toBe(0);
    model.dispose();
  });
  it('reads the actual live state/time, native method and five double parameters', () => {
    const { model, provider } = planar();
    model.step();
    const snapshot = provider.snapshot();
    expect(snapshot.state).toEqual(model.state.sample.state);
    expect(snapshot.simTime).toBe(model.state.sample.time);
    expect(snapshot.simTime).toBeGreaterThan(0);
    expect(Object.keys(snapshot.parameters).sort()).toEqual(['g', 'l1', 'l2', 'm1', 'm2']);
    expect(snapshot.method).toBe('rk4');
    expect(snapshot.seed).toBeNull();
    snapshot.state[0] = 999;
    expect(provider.snapshot().state[0]).not.toBe(999);
    model.dispose();
  });

  it('commits validated scientific settings and actual scheduler mode/SPF together', () => {
    const { model, provider } = planar();
    const original = provider.snapshot();
    const next = provider.applySnapshot({
      ...original,
      parameters: { ...original.parameters, m1: 1.75 },
      method: 'dopri5',
      dt: 0.003,
      tolerance: 1e-8,
      state: [0.4, -0.3, 0.2, -0.1],
      simTime: 7,
      mode: 'research',
      stepsPerFrame: 17,
      seed: 42
    });
    expect(next.parameters.m1).toBe(1.75);
    expect(next.state).toEqual([0.4, -0.3, 0.2, -0.1]);
    expect(next.simTime).toBe(7);
    expect(next.mode).toBe('research');
    expect(next.stepsPerFrame).toBe(17);
    expect(model.state.playback).toEqual({ ...DEFAULT_PLAYBACK, mode: 'research', stepsPerFrame: 17 });
    expect(model.state.config.integratorId).toBe('integrator:dopri5');
    expect(model.state.config.tolerance).toBe(1e-8);
    expect(model.state.config.seed?.value).toBe('42');
    model.dispose();
  });

  it.each(['integrator:hmidpoint', 'integrator:gauss2', 'integrator:bdf2'] as const)(
    '%s preserves the exact omitted native tolerance policy on unrelated patches',
    (integratorId) => {
      const { model, provider } = planar({ ...defaultPlanarConfig(), integratorId, step: 0.001 });
      const original = provider.snapshot();
      expect(original.tolerance).toBe(integratorId === 'integrator:gauss2' ? 1e-12 : 1e-10);
      provider.applySnapshot({ ...original, parameters: { ...original.parameters, m1: 1.5 } });
      expect(model.state.config.tolerance).toBeUndefined();
      const native = createPlanarSimulation(model.state.config);
      model.step();
      expect(model.state.sample).toEqual(native.step());
      model.dispose();
    }
  );

  it('preserves unchanged seed metadata, exact snapshot alias and explicitly applies native alias normalization', () => {
    const { model, provider } = planar({
      ...defaultPlanarConfig(),
      integratorId: 'integrator:verlet',
      seed: { value: '17', generator: 'original-generator', generatorVersion: 'original-v1' }
    });
    const original = provider.snapshot();
    expect(original.method).toBe('verlet');
    provider.applySnapshot(original);
    expect(provider.snapshot().method).toBe('leapfrog');
    expect(model.state.config.seed).toEqual({
      value: '17',
      generator: 'original-generator',
      generatorVersion: 'original-v1'
    });
    expect(legacySnapshotTolerance({ integratorId: 'integrator:rk4', tolerance: 1e-9 })).toBe(1e-9);
    model.dispose();
  });

  it('refuses invalid/cross-system/dormant-field/oversized scheduler patches before any commit', () => {
    const { model, provider } = planar();
    const original = provider.snapshot(),
      before = model.state.config;
    for (const invalid of [
      { ...original, dt: NaN },
      { ...original, stepsPerFrame: 61 },
      { ...original, systemType: 'compound-double' as const },
      { ...original, parameters: { ...original.parameters, m3: 1, l3: 1 } },
      { ...original, parameters: { ...original.parameters, m1: -1 } }
    ]) {
      expect(() => provider.applySnapshot(invalid)).toThrow();
      expect(provider.snapshot()).toEqual(original);
      expect(model.state.config).toEqual(before);
    }
    model.dispose();
  });

  it('retains all seven triple parameters and refuses a nonrepresentable N-chain or string seed', () => {
    const model = createChainModel(defaultChainConfig('system:triple'));
    model.setPlayback(DEFAULT_PLAYBACK);
    const provider = createWorkspaceRuntimeProvider<ChainConfig>({
      model,
      readTiming: () => model.state.playback!,
      restore(next, timing) {
        model.configure(next);
        model.setPlayback({ ...DEFAULT_PLAYBACK, ...timing });
      }
    });
    const snapshot = provider.snapshot();
    expect(snapshot.systemType).toBe('triple');
    expect(Object.keys(snapshot.parameters).sort()).toEqual(['g', 'l1', 'l2', 'l3', 'm1', 'm2', 'm3']);
    provider.applySnapshot({ ...snapshot, parameters: { ...snapshot.parameters, m3: 2.5 } });
    expect(model.state.config.parameters.masses[2]).toBe(2.5);
    model.configure(defaultChainConfig('system:chain', 4));
    expect(() => provider.snapshot()).toThrow('N중 사슬');
    model.dispose();
    const noninteger = planar({
      ...defaultPlanarConfig(),
      seed: { value: 'opaque-seed', generator: 'test', generatorVersion: 'v1' }
    });
    expect(() => noninteger.provider.snapshot()).toThrow('정수 seed');
    noninteger.model.dispose();
  });
});
