import { describe, expect, it } from 'vitest';
import { runChaosJob, type LyapunovSpectrumRequest } from '../src/workers/chaosProtocol';
import { ChaosClient } from '../src/runtime/ChaosClient';
import type { SystemSpec } from '../src/physics/systemSpec';

const DOUBLE_SPEC: SystemSpec = { kind: 'double', m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 };

describe('lyapunovSpectrum chaos job', () => {
  it('returns a descending spectrum that sums to ≈0 for the conservative double pendulum', () => {
    const req: LyapunovSpectrumRequest = {
      id: 'test-1',
      kind: 'lyapunovSpectrum',
      spec: DOUBLE_SPEC,
      state0: [2.0, 2.5, 0, 0],
      count: 4,
      settings: { dt: 0.01, steps: 8000, renormEvery: 10, transientSteps: 1000 }
    };
    const res = runChaosJob(req);
    expect(res.ok).toBe(true);
    if (!res.ok || res.kind !== 'lyapunovSpectrum') throw new Error('unexpected response');

    expect(res.spectrum).toHaveLength(4);
    // Descending order.
    for (let i = 1; i < res.spectrum.length; i += 1)
      expect(res.spectrum[i - 1]!).toBeGreaterThanOrEqual(res.spectrum[i]!);
    // Largest exponent is positive (chaotic preset).
    expect(res.spectrum[0]!).toBeGreaterThan(0.1);
    // Hamiltonian system: the spectrum sums to ≈0 (finite-time, so a loose bound).
    expect(Math.abs(res.sum)).toBeLessThan(0.5);
    // Kaplan-Yorke dimension lies within the state dimension.
    expect(res.kaplanYorkeDimension).toBeGreaterThan(0);
    expect(res.kaplanYorkeDimension).toBeLessThanOrEqual(4);
  });

  it('resolves through the ChaosClient main-thread fallback (no Worker)', async () => {
    const client = new ChaosClient(() => null); // force fallback
    expect(client.usesWorker()).toBe(false);
    const res = await client.lyapunovSpectrum(DOUBLE_SPEC, [2.0, 2.5, 0, 0], 4, {
      dt: 0.01,
      steps: 4000,
      renormEvery: 10,
      transientSteps: 500
    });
    expect(res.kind).toBe('lyapunovSpectrum');
    expect(res.spectrum).toHaveLength(4);
    expect(Number.isFinite(res.kaplanYorkeDimension)).toBe(true);
  });

  it('reports errors as a rejected promise', async () => {
    const client = new ChaosClient(() => null);
    // A bogus spec kind triggers buildRhs to throw inside the job.
    await expect(
      client.lyapunovSpectrum({ kind: 'nonsense' } as unknown as SystemSpec, [0, 0, 0, 0], 4)
    ).rejects.toThrow();
  });
});
