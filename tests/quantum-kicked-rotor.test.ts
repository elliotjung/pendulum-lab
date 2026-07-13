import { describe, expect, it } from 'vitest';
import { fftInPlace, ifftInPlace } from '../src/physics/fft';
import {
  createQkrPlan,
  createQkrState,
  qkrNorm,
  qkrStep,
  runQuantumKickedRotor
} from '../src/physics/quantumKickedRotor';
import { standardMapEnsembleEnergy } from '../src/physics/standardMap';
import { qkrFloquetMatrix, qkrQuasiEnergySpectrum } from '../src/research/qkrFloquet';

describe('headless FFT', () => {
  it('transforms a known signal and inverts to identity', () => {
    // FFT of a unit impulse is all-ones.
    const re = Float64Array.from([1, 0, 0, 0]);
    const im = new Float64Array(4);
    fftInPlace(re, im);
    for (let k = 0; k < 4; k += 1) {
      expect(re[k]!).toBeCloseTo(1, 12);
      expect(im[k]!).toBeCloseTo(0, 12);
    }
    // ifft ∘ fft = identity.
    const x = Float64Array.from([0.3, -1.2, 2.5, 0.7, -0.4, 1.1, 0.9, -2.0]);
    const xi = new Float64Array(8);
    const r = Float64Array.from(x);
    const i = Float64Array.from(xi);
    fftInPlace(r, i);
    ifftInPlace(r, i);
    let maxErr = 0;
    for (let k = 0; k < 8; k += 1) maxErr = Math.max(maxErr, Math.abs(r[k]! - x[k]!), Math.abs(i[k]!));
    expect(maxErr).toBeLessThan(1e-12);
  });

  it('rejects non-power-of-two lengths', () => {
    expect(() => fftInPlace(new Float64Array(3), new Float64Array(3))).toThrow(/power of two/);
  });
});

describe('quantum kicked rotor', () => {
  it('conserves the norm (unitary Floquet evolution)', () => {
    const plan = createQkrPlan({ gridSize: 256, kickStrength: 5, hbar: 1 });
    const state = createQkrState(256);
    expect(qkrNorm(state)).toBeCloseTo(1, 12);
    for (let t = 0; t < 50; t += 1) qkrStep(state, plan);
    expect(qkrNorm(state)).toBeCloseTo(1, 9);
  });

  it('shows dynamical localization: energy saturates while the classical map diffuses', () => {
    const K = 5;
    const hbar = 1;
    const periods = 200;
    const q = runQuantumKickedRotor({ gridSize: 512, kickStrength: K, hbar }, periods);
    expect(Math.abs(q.finalNorm - 1)).toBeLessThan(1e-9);

    // Classical momentum (p = ℏ̄ m, ℏ̄ = 1 ⇒ ⟨p²⟩ comparable to ⟨m²⟩).
    const classical = standardMapEnsembleEnergy(K, periods, 2000, 7);
    // Classical diffuses ~linearly: doubling the time ≈ doubles ⟨p²⟩.
    expect(classical[periods]! / classical[periods / 2]!).toBeGreaterThan(1.6);
    // Quantum energy is a small fraction of the classical (localization).
    expect(q.energyHistory[periods]! / classical[periods]!).toBeLessThan(0.25);
    // And the quantum energy is bounded, not diffusing like the classical map.
    expect(q.energyHistory[periods]!).toBeLessThan(2 * q.energyHistory[Math.floor(periods / 2)]!);
  });

  it('has an exponentially localized momentum distribution', () => {
    const q = runQuantumKickedRotor({ gridSize: 512, kickStrength: 5, hbar: 1 }, 200);
    // ln|ψ_m|² is linear in |m| (exponential localization), with ℓ ~ O(D).
    expect(q.localizationFitR2).toBeGreaterThan(0.8);
    expect(q.localizationLength).toBeGreaterThan(5);
    expect(q.localizationLength).toBeLessThan(40);
  });

  it('rejects an invalid grid size or Planck constant', () => {
    expect(() => createQkrPlan({ gridSize: 100, kickStrength: 5, hbar: 1 })).toThrow(/power of two/);
    expect(() => createQkrPlan({ gridSize: 256, kickStrength: 5, hbar: 0 })).toThrow(/hbar/);
  });

  it('builds the same one-period Floquet operator used by qkrStep', () => {
    const plan = createQkrPlan({ gridSize: 8, kickStrength: 1.7, hbar: 0.8 });
    const matrix = qkrFloquetMatrix(plan);
    const input = {
      re: Float64Array.from([0.2, -0.1, 0.4, 0.3, -0.2, 0.5, 0.1, -0.3]),
      im: Float64Array.from([0.1, 0.2, -0.3, 0.4, 0.5, -0.2, 0.3, -0.1])
    };
    const stepped = { re: Float64Array.from(input.re), im: Float64Array.from(input.im) };
    qkrStep(stepped, plan);
    for (let row = 0; row < plan.gridSize; row += 1) {
      let re = 0;
      let im = 0;
      for (let col = 0; col < plan.gridSize; col += 1) {
        const ar = matrix.re[row]![col]!;
        const ai = matrix.im[row]![col]!;
        const br = input.re[col]!;
        const bi = input.im[col]!;
        re += ar * br - ai * bi;
        im += ar * bi + ai * br;
      }
      expect(re).toBeCloseTo(stepped.re[row]!, 12);
      expect(im).toBeCloseTo(stepped.im[row]!, 12);
    }
  });

  it('reports quasi-energy bands from the unitary Floquet eigenphases', () => {
    const hbar = 1;
    const r = qkrQuasiEnergySpectrum({ gridSize: 2, kickStrength: 0, hbar });
    expect(r.unitarityDefect).toBeLessThan(1e-12);
    expect(r.maxUnitCircleDrift).toBeLessThan(1e-10);
    expect(r.phases).toHaveLength(2);
    expect(r.phases[0]!).toBeCloseTo(-0.5, 10);
    expect(r.phases[1]!).toBeCloseTo(0, 10);
    expect(r.quasiEnergies[0]!).toBeCloseTo(0.5, 10);
    expect(r.quasiEnergies[1]!).toBeCloseTo(0, 10);
  });
});
