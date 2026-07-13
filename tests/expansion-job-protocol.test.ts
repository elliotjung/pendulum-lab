import { describe, expect, test } from 'vitest';
import { runExpansionJob } from '../src/workers/expansionJobProtocol';

/**
 * The shared dispatcher backs both the Expansion worker and the main-thread
 * fallback for all three Expansion-family tabs, so it must route each job kind
 * to the right computation and return the discriminated result shape the client
 * narrows on.
 */
describe('expansion job protocol dispatcher', () => {
  test('suite job stays lightweight unless Lyapunov is explicitly requested', () => {
    const out = runExpansionJob({ kind: 'suite', config: { model: 'driven', methods: ['rk4'], horizon: 3 } });
    expect(out.kind).toBe('suite');
    if (out.kind === 'suite') {
      expect(out.result.lyapunov).toBeUndefined();
    }
  });

  test('suite job returns a suite result carrying the variational/QR Lyapunov spectrum', () => {
    const out = runExpansionJob({
      kind: 'suite',
      config: { model: 'driven', methods: ['rk4'], horizon: 3 },
      includeLyapunov: true
    });
    expect(out.kind).toBe('suite');
    if (out.kind === 'suite') {
      expect(out.result.model).toBe('driven');
      expect(out.result.lyapunov?.spectrum.length).toBeGreaterThan(0);
      expect(out.result.lyapunov?.consistency).toBeDefined();
    }
  });

  test('matrix job returns a research-matrix study', () => {
    const out = runExpansionJob({
      kind: 'matrix',
      config: { model: 'driven', methods: ['rk4', 'symplectic'], horizon: 2, dt: 0.012 },
      gridSize: 4
    });
    expect(out.kind).toBe('matrix');
    if (out.kind === 'matrix') {
      expect(out.result.schemaVersion).toBe('pendulum-research-matrix/v1');
      expect(out.result.diagnostics.lyapunovSpectrum.length).toBeGreaterThan(0);
    }
  });

  test('golden job returns a golden-center result', () => {
    const out = runExpansionJob({ kind: 'golden', presetIds: ['coupled-normal-mode'], methods: ['rk4', 'euler'] });
    expect(out.kind).toBe('golden');
    if (out.kind === 'golden') {
      expect(out.result.schemaVersion).toBe('pendulum-golden-center/v1');
      expect(out.result.presets).toHaveLength(1);
    }
  });
});
