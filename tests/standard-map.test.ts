import { describe, expect, it } from 'vitest';
import {
  STANDARD_MAP_KC,
  standardMapDiffusionRate,
  standardMapEnsembleEnergy,
  standardMapStep
} from '../src/physics/standardMap';

describe('Chirikov standard map', () => {
  it('iterates p_{n+1}=p+K sinθ, θ_{n+1}=θ+p_{n+1} (mod 2π)', () => {
    const next = standardMapStep(1.0, 0.5, 2);
    const pExpected = 0.5 + 2 * Math.sin(1.0);
    expect(next.p).toBeCloseTo(pExpected, 12);
    expect(next.theta).toBeCloseTo((1.0 + pExpected) % (2 * Math.PI), 12);
  });

  it('confines momentum below the last-KAM-torus threshold (K < K_c)', () => {
    expect(STANDARD_MAP_KC).toBeCloseTo(0.971635, 6);
    const hist = standardMapEnsembleEnergy(0.5, 400, 2000, 7);
    // KAM tori block transport: ⟨p²⟩ stays bounded, no diffusion.
    expect(hist[hist.length - 1]!).toBeLessThan(3);
    expect(standardMapDiffusionRate(hist)).toBeLessThan(0.1);
  });

  it('diffuses with the quasilinear rate D ≈ K²/2 in the chaotic regime (K = 5)', () => {
    const K = 5;
    const hist = standardMapEnsembleEnergy(K, 400, 2000, 7);
    expect(hist[400]!).toBeGreaterThan(2000); // strongly diffusive
    const D = standardMapDiffusionRate(hist);
    // Random-phase estimate K²/2 = 12.5; measured ≈ 12.5.
    expect(D).toBeGreaterThan(8);
    expect(D).toBeLessThan(17);
  });
});
