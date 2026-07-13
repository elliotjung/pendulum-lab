import { describe, expect, it } from 'vitest';
import { buildQkrFloquetViewModel } from '../src/research/qkrViewModel';

describe('QKR Floquet UI-ready view model', () => {
  it('packs the dense quasi-energy spectrum into sorted band points', () => {
    const view = buildQkrFloquetViewModel({ gridSize: 4, kickStrength: 1.2, hbar: 0.7 });
    expect(view.backend).toBe('dense');
    expect(view.bands).toHaveLength(4);
    expect(view.bands.map((band) => band.phase)).toEqual([...view.bands.map((band) => band.phase)].sort((a, b) => a - b));
    expect(view.maxUnitCircleDrift).toBeLessThan(1e-8);
    expect(view.phaseDomain).toEqual([-Math.PI, Math.PI]);
  });

  it('switches to the matrix-free projection above the dense limit', () => {
    const view = buildQkrFloquetViewModel(
      { gridSize: 16, kickStrength: 2, hbar: 0.8 },
      { denseLimit: 4, krylovDim: 8, targetCount: 4 }
    );
    expect(view.backend).toBe('arnoldi-schur');
    expect(view.bands).toHaveLength(4);
    expect(view.basisSize).toBeLessThanOrEqual(8);
    expect(view.bands.every((band) => band.residualBound !== null)).toBe(true);
    expect(view.caveat).toContain('Arnoldi');
  });
});
