import { describe, expect, it } from 'vitest';
import {
  huygensLockedPhaseDifference,
  kuramotoCriticalCoupling,
  kuramotoCriticalCouplingGaussian,
  kuramotoCriticalCouplingLorentzian,
  kuramotoLocalOrderParameters,
  kuramotoOrderParameter,
  nonlocalRingAdjacency,
  rhsHuygensPhasePair,
  rhsKuramoto
} from '../src/physics/kuramoto';
import { chimeraDiagnostics, chimeraSpaceTimeProfile } from '../src/chaos/chimera';

describe('Kuramoto/Huygens phase network', () => {
  it('reduces to independent natural frequencies when K=0', () => {
    const out = new Float64Array(3);
    rhsKuramoto([0.1, 1.2, -0.4], { naturalFrequencies: [-1, 0.25, 2], coupling: 0 }, out);
    expect(Array.from(out)).toEqual([-1, 0.25, 2]);
  });

  it('reports exact coherent and uniformly-spaced global order', () => {
    expect(kuramotoOrderParameter([0.7, 0.7, 0.7]).magnitude).toBeCloseTo(1, 14);
    expect(kuramotoOrderParameter([0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]).magnitude).toBeLessThan(1e-14);
  });

  it('builds a symmetric nonlocal ring and resolves local coherence', () => {
    const adjacency = nonlocalRingAdjacency(8, 2);
    for (let i = 0; i < 8; i += 1) {
      expect(Array.from(adjacency.slice(i * 8, (i + 1) * 8)).reduce((a, b) => a + b, 0)).toBe(4);
      for (let j = 0; j < 8; j += 1) expect(adjacency[i * 8 + j]).toBe(adjacency[j * 8 + i]);
    }
    const local = kuramotoLocalOrderParameters(new Array(8).fill(0.3), adjacency);
    expect(local.every((entry) => Math.abs(entry.magnitude - 1) < 1e-14)).toBe(true);
  });

  it('matches analytic continuum critical-coupling formulas', () => {
    expect(kuramotoCriticalCoupling(1 / Math.PI)).toBeCloseTo(2, 14);
    expect(kuramotoCriticalCouplingLorentzian(0.4)).toBeCloseTo(0.8, 14);
    expect(kuramotoCriticalCouplingGaussian(0.7)).toBeCloseTo(Math.sqrt(8 / Math.PI) * 0.7, 14);
  });

  it('locks the Huygens phase difference at Delta omega = 2K sin Delta', () => {
    const parameters = { frequencies: [1, 1.2] as const, coupling: 0.4 };
    const delta = huygensLockedPhaseDifference(parameters);
    expect(delta).not.toBeNull();
    const out = new Float64Array(2);
    rhsHuygensPhasePair([0, delta!], parameters, out);
    expect(out[1]! - out[0]!).toBeCloseTo(0, 13);
    expect(huygensLockedPhaseDifference({ frequencies: [0, 2], coupling: 0.4 })).toBeNull();
  });
});

describe('chimera local-order diagnostics', () => {
  it('distinguishes globally coherent and incoherent profiles', () => {
    expect(chimeraDiagnostics(new Array(24).fill(0), { radius: 3 }).classification).toBe('coherent');
    const alternating = Array.from({ length: 24 }, (_, i) => (i % 2) * Math.PI);
    const incoherent = chimeraDiagnostics(alternating, { radius: 2, coherentThreshold: 0.9, incoherentThreshold: 0.1 });
    expect(incoherent.classification).toBe('incoherent');
    expect(incoherent.meanLocalOrder).toBeLessThan(1e-12);
  });

  it('flags spatial coexistence as a finite-size chimera candidate', () => {
    const phases = [...new Array(24).fill(0), ...Array.from({ length: 24 }, (_, i) => (i % 2) * Math.PI)];
    const result = chimeraDiagnostics(phases, { radius: 2, coherentThreshold: 0.9, incoherentThreshold: 0.2 });
    expect(result.classification).toBe('chimera-candidate');
    expect(result.coherentFraction).toBeGreaterThan(0.25);
    expect(result.incoherentFraction).toBeGreaterThan(0.25);
    expect(result.spatialVariance).toBeGreaterThan(0.05);
    expect(result.caveat).toContain('Finite-size');
  });

  it('packs deterministic space-time profiles row-major', () => {
    const profile = chimeraSpaceTimeProfile([new Array(8).fill(0), new Array(8).fill(Math.PI / 4)], { radius: 2 });
    expect(profile).toMatchObject({ width: 8, height: 2 });
    expect(Array.from(profile.values).every((value) => Math.abs(value - 1) < 1e-14)).toBe(true);
  });
});
