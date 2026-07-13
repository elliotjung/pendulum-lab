import { describe, expect, it } from 'vitest';
import {
  detectConservedQuantities,
  detectPlanarChainConservedQuantities,
  detectSphericalChainConservedQuantities,
  rotateSphericalChainState,
  sphericalChainAngularMomentum
} from '../src/physics/conservedQuantities';
import { sphericalChainEnergy, sphericalChainLz } from '../src/physics/sphericalChain';

const CHAIN_PARAMS = { masses: [1, 0.8], lengths: [1, 0.8], g: 9.81, damping: 0 };
// A genuinely 3D state away from the chart poles.
const CHAIN_STATE = [1.6, 0, 2.2, 0.4, 0, 1.2, 0, -0.8];

describe('Noether conserved-quantity detection', () => {
  it('group action sanity: rotations preserve energy structure and the vertical momentum matches sphericalChainLz', () => {
    // Vertical-axis rotation must leave the energy bit-near identical.
    const rotated = rotateSphericalChainState(CHAIN_STATE, 2, [0, 1, 0], 0.37);
    const e0 = sphericalChainEnergy(CHAIN_STATE, CHAIN_PARAMS).total;
    const e1 = sphericalChainEnergy(rotated, CHAIN_PARAMS).total;
    expect(Math.abs(e1 - e0)).toBeLessThan(1e-9 * Math.max(1, Math.abs(e0)));
    // The detector's axis-projected momentum agrees with the module's own Lz.
    const lProjected = sphericalChainAngularMomentum(CHAIN_STATE, CHAIN_PARAMS, [0, 1, 0]);
    expect(lProjected).toBeCloseTo(sphericalChainLz(CHAIN_STATE, CHAIN_PARAMS), 10);
    // And the rotation preserves it (vectors rotate with the frame).
    expect(sphericalChainAngularMomentum(rotated, CHAIN_PARAMS, [0, 1, 0])).toBeCloseTo(lProjected, 8);
  });

  it('spherical chain with gravity: energy + vertical angular momentum only, Noether-consistent', () => {
    const report = detectSphericalChainConservedQuantities(CHAIN_PARAMS, CHAIN_STATE, { horizon: 5 });
    expect(report.conserved).toContain('energy');
    expect(report.conserved).toContain('angular-momentum-vertical');
    expect(report.conserved).not.toContain('angular-momentum-x');
    expect(report.conserved).not.toContain('angular-momentum-z');
    // Symmetry check and drift check must agree for every candidate — that
    // agreement IS the (numerical) Noether theorem statement.
    for (const candidate of report.candidates) {
      expect(candidate.noetherConsistent).toBe(true);
    }
    const vertical = report.candidates.find((candidate) => candidate.name === 'angular-momentum-vertical')!;
    const horizontal = report.candidates.find((candidate) => candidate.name === 'angular-momentum-x')!;
    expect(vertical.symmetryResidual).toBeLessThan(1e-7);
    expect(horizontal.symmetryResidual).toBeGreaterThan(1e-3);
  });

  it('spherical chain with g → 0: the full rotation group appears (all three axes conserved)', () => {
    const report = detectSphericalChainConservedQuantities({ ...CHAIN_PARAMS, g: 1e-8 }, CHAIN_STATE, { horizon: 5 });
    expect(report.conserved).toContain('angular-momentum-vertical');
    expect(report.conserved).toContain('angular-momentum-x');
    expect(report.conserved).toContain('angular-momentum-z');
    for (const candidate of report.candidates) {
      expect(candidate.noetherConsistent).toBe(true);
    }
  });

  it('damping destroys every Noether charge (and is reported as broken structure, not asymmetry)', () => {
    const report = detectSphericalChainConservedQuantities({ ...CHAIN_PARAMS, damping: 0.4 }, CHAIN_STATE, {
      horizon: 5
    });
    expect(report.conserved).toHaveLength(0);
    const energy = report.candidates.find((candidate) => candidate.name === 'energy')!;
    expect(energy.symmetric).toBe(false);
    expect(energy.detail).toContain('dissipative');
  });

  it('planar chain: gravity keeps only energy; g → 0 adds the planar angular momentum', () => {
    const params = { masses: [1, 0.8, 0.6], lengths: [1, 0.8, 0.6], g: 9.81 };
    const state = [1.2, 1.9, 2.4, 0, 0.5, -0.4];
    const withGravity = detectPlanarChainConservedQuantities(params, 0, state, { horizon: 5 });
    expect(withGravity.conserved).toContain('energy');
    expect(withGravity.conserved).not.toContain('angular-momentum-planar');
    // The chain validator requires g > 0, so "free-floating" is g = 1e-8.
    const freeFloating = detectPlanarChainConservedQuantities({ ...params, g: 1e-8 }, 0, state, { horizon: 5 });
    expect(freeFloating.conserved).toContain('energy');
    expect(freeFloating.conserved).toContain('angular-momentum-planar');
    for (const candidate of [...withGravity.candidates, ...freeFloating.candidates]) {
      expect(candidate.noetherConsistent).toBe(true);
    }
  });

  it('spec dispatcher covers spherical-chain and chain, and rejects others clearly', () => {
    const viaSpec = detectConservedQuantities(
      { kind: 'spherical-chain', masses: [1], lengths: [1], g: 9.81, damping: 0 },
      [1.0, 0, 0.3, 1.5],
      { horizon: 3 }
    );
    expect(viaSpec.conserved).toContain('angular-momentum-vertical');
    expect(() =>
      detectConservedQuantities({ kind: 'double', m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 }, [1, 2, 0, 0])
    ).toThrow(/unsupported kind/);
  });
});
