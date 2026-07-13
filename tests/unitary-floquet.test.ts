import { describe, expect, it } from 'vitest';
import {
  complexUnitaryFloquetArnoldiSchurSpectrum,
  complexUnitaryFloquetKrylovSpectrum,
  complexUnitaryFloquetSpectrum,
  unitaryDefect,
  type ComplexMatrix,
  type ComplexVector
} from '../src/research/unitaryFloquet';

function diagonalUnitary(phases: readonly number[]): ComplexMatrix {
  const n = phases.length;
  return {
    re: Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? Math.cos(phases[i]!) : 0))),
    im: Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? Math.sin(phases[i]!) : 0)))
  };
}

describe('complex unitary Floquet spectrum', () => {
  it('recovers eigenphases and quasi-energies of a diagonal unitary', () => {
    const phases = [-1.2, 0.3, 2.4];
    const r = complexUnitaryFloquetSpectrum(diagonalUnitary(phases), { period: 2, hbar: 0.5 });
    expect(r.unitarityDefect).toBeLessThan(1e-14);
    expect(r.maxUnitCircleDrift).toBeLessThan(1e-10);
    expect(r.phases).toHaveLength(phases.length);
    for (let i = 0; i < phases.length; i += 1) {
      expect(r.phases[i]!).toBeCloseTo(phases[i]!, 9);
      expect(r.quasiEnergies[i]!).toBeCloseTo((-0.5 * phases[i]!) / 2, 9);
    }
  });

  it('measures non-unitarity as a Frobenius defect', () => {
    const u = diagonalUnitary([0.1, 0.4]);
    expect(unitaryDefect(u)).toBeLessThan(1e-14);
    const leaky: ComplexMatrix = {
      re: [
        [0.9, 0],
        [0, 1]
      ],
      im: [
        [0, 0],
        [0, 0]
      ]
    };
    expect(unitaryDefect(leaky)).toBeGreaterThan(0.1);
  });

  it('recovers a diagonal unitary spectrum from a matrix-free Krylov projection', () => {
    const phases = [-1.1, 0.2, 1.6];
    const apply = (vector: ComplexVector): ComplexVector => ({
      re: phases.map((phase, i) => Math.cos(phase) * (vector.re[i] ?? 0) - Math.sin(phase) * (vector.im[i] ?? 0)),
      im: phases.map((phase, i) => Math.sin(phase) * (vector.re[i] ?? 0) + Math.cos(phase) * (vector.im[i] ?? 0))
    });
    const r = complexUnitaryFloquetKrylovSpectrum(apply, {
      dimension: 3,
      krylovDim: 3,
      seed: { re: [1, 1, 1], im: [0, 0, 0] },
      period: 2,
      hbar: 0.5
    });
    expect(r.basisSize).toBe(3);
    expect(r.residualNorms.at(-1) ?? 1).toBeLessThan(1e-10);
    expect(r.spectrum.unitarityDefect).toBeLessThan(1e-10);
    expect(r.spectrum.phases).toHaveLength(phases.length);
    for (let i = 0; i < phases.length; i += 1) {
      expect(r.spectrum.phases[i]!).toBeCloseTo(phases[i]!, 8);
      expect(r.spectrum.quasiEnergies[i]!).toBeCloseTo((-0.5 * phases[i]!) / 2, 8);
    }
  });

  it('reports selected large-Floquet Ritz phases with an Arnoldi-Schur residual bound', () => {
    const phases = [-1.1, 0.2, 1.6, 2.4];
    const apply = (vector: ComplexVector): ComplexVector => ({
      re: phases.map((phase, i) => Math.cos(phase) * (vector.re[i] ?? 0) - Math.sin(phase) * (vector.im[i] ?? 0)),
      im: phases.map((phase, i) => Math.sin(phase) * (vector.re[i] ?? 0) + Math.cos(phase) * (vector.im[i] ?? 0))
    });
    const r = complexUnitaryFloquetArnoldiSchurSpectrum(apply, {
      dimension: phases.length,
      krylovDim: phases.length,
      seed: { re: [1, 1, 1, 1], im: [0, 0, 0, 0] },
      targetCount: 2,
      targetPhases: [0.2],
      period: 2,
      hbar: 0.5,
      residualTolerance: 1e-10
    });
    expect(r.converged).toBe(true);
    expect(r.selected).toHaveLength(2);
    expect(r.selected[0]!.phase).toBeCloseTo(0.2, 8);
    expect(r.selected[0]!.quasiEnergy).toBeCloseTo((-0.5 * 0.2) / 2, 8);
    expect(r.selected[0]!.residualBound).toBeLessThan(1e-10);
    expect(r.caveat).toContain('matrix-free');
  });
});
