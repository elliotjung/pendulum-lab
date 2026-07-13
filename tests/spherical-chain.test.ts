import { describe, expect, it } from 'vitest';
import {
  SphericalChain,
  createSphericalChainWorkspace,
  rhsSphericalChain,
  sphericalChainEnergy,
  sphericalChainLz,
  sphericalChainMassMatrixDiagnostics,
  sphericalChainPositions,
  sphericalChainVelocities,
  type SphericalChainParams
} from '../src/physics/sphericalChain';
import { sphericalRhs, type SphericalState } from '../src/physics/spherical';
import { rhsDouble } from '../src/physics/double';
import { rhsChain, type ChainParameters } from '../src/physics/nPendulum';

const DOUBLE_3D: SphericalChainParams = {
  masses: [1.1, 0.9],
  lengths: [1.2, 1.0],
  g: 9.81,
  damping: 0
};

describe('spherical N-chain (3D double/triple pendulum)', () => {
  it('reduces exactly to the single spherical pendulum at N = 1 (with and without damping)', () => {
    const cases: Array<{ state: SphericalState; damping: number }> = [
      { state: [1.0, 0.3, 0.4, 1.5], damping: 0 },
      { state: [2.2, -1.1, -0.7, 0.9], damping: 0 },
      { state: [0.6, 2.0, 1.3, -2.1], damping: 0.25 }
    ];
    for (const { state, damping } of cases) {
      const params: SphericalChainParams = { masses: [1], lengths: [1.3], g: 9.81, damping };
      const expected = sphericalRhs(state, { l: 1.3, g: 9.81, damping });
      const out = rhsSphericalChain(state, params, new Float64Array(4));
      for (let i = 0; i < 4; i += 1) {
        expect(Math.abs((out[i] ?? 0) - expected[i]!)).toBeLessThan(1e-9);
      }
    }
  });

  it('reduces to the planar double pendulum when the motion lies in a vertical plane', () => {
    const planarStates = [
      [2.0, 2.5, 0.3, -0.5],
      [0.4, -0.2, 1.1, 0.7],
      [-2.8, 1.9, -0.6, 2.2]
    ];
    const chainParams: ChainParameters = { masses: [1.1, 0.9], lengths: [1.2, 1.0], g: 9.81 };
    for (const [t1, t2, w1, w2] of planarStates as Array<[number, number, number, number]>) {
      // Spherical state with all azimuths frozen at φ = 0, φ̇ = 0.
      const state3d = [t1, 0, t2, 0, w1, 0, w2, 0];
      const out3d = rhsSphericalChain(state3d, DOUBLE_3D, new Float64Array(8));

      const planar = rhsChain([t1, t2, w1, w2], chainParams, 0, new Float64Array(4));
      const closedForm = rhsDouble(
        [t1, t2, w1, w2],
        { m1: 1.1, m2: 0.9, l1: 1.2, l2: 1.0, g: 9.81 },
        0,
        new Float64Array(4)
      );

      // θ accelerations match both the generic planar chain and the
      // hand-derived closed-form double pendulum.
      expect(Math.abs((out3d[4] ?? 0) - (planar[2] ?? 0))).toBeLessThan(1e-9);
      expect(Math.abs((out3d[6] ?? 0) - (planar[3] ?? 0))).toBeLessThan(1e-9);
      expect(Math.abs((out3d[4] ?? 0) - (closedForm[2] ?? 0))).toBeLessThan(1e-9);
      expect(Math.abs((out3d[6] ?? 0) - (closedForm[3] ?? 0))).toBeLessThan(1e-9);
      // The azimuthal accelerations vanish: planar motion stays planar.
      expect(Math.abs(out3d[5] ?? 0)).toBeLessThan(1e-12);
      expect(Math.abs(out3d[7] ?? 0)).toBeLessThan(1e-12);
    }
  });

  it('conserves energy and vertical angular momentum in fully 3D chaotic motion (N = 2)', () => {
    // Large-amplitude, genuinely 3D initial condition (both azimuths active).
    // Fixed-step RK4 on this violent orbit leaves a measurable truncation
    // drift, so the assertion is twofold: a small absolute bound, and 4th-order
    // shrinkage when dt is halved (which a wrong RHS could not produce —
    // a non-Hamiltonian error term would leave a dt-independent drift floor).
    const initial = [2.0, 0.2, 2.6, 1.2, 0, 0.8, 0.4, -0.5];
    expect(Math.abs(sphericalChainLz(initial, DOUBLE_3D))).toBeGreaterThan(0.1);

    const coarse = new SphericalChain(DOUBLE_3D, initial, 0.0002);
    coarse.step(10);
    const coarseDiag = coarse.diagnostics();
    expect(coarseDiag.energyDrift).toBeLessThan(2e-5); // measured ~5.0e-6
    expect(coarseDiag.lzDrift).toBeLessThan(2e-5); // measured ~3.7e-6
    expect(coarseDiag.caveat).toContain('Conservative');

    const fine = new SphericalChain(DOUBLE_3D, initial, 0.0001);
    fine.step(10);
    const fineDiag = fine.diagnostics();
    // RK4: halving dt should cut the drift ~16×; require at least 4×.
    expect(fineDiag.energyDrift).toBeLessThan(coarseDiag.energyDrift / 4);
    expect(fineDiag.lzDrift).toBeLessThan(coarseDiag.lzDrift / 4);
  });

  it('conserves energy for the spherical triple pendulum (N = 3)', () => {
    const params: SphericalChainParams = {
      masses: [1.1, 0.9, 0.8],
      lengths: [1.2, 1.0, 0.8],
      g: 9.81,
      damping: 0
    };
    const initial = [1.8, 0.1, 2.3, 0.9, 2.7, -0.6, 0, 0.6, 0.3, -0.4, -0.2, 0.5];
    const chain = new SphericalChain(params, initial, 0.0002);
    chain.step(5);
    const diag = chain.diagnostics();
    expect(diag.energyDrift).toBeLessThan(5e-5); // measured ~1.2e-5 at dt = 2e-4
    expect(diag.lzDrift).toBeLessThan(5e-5); // measured ~8.3e-6
  });

  it('keeps planar initial conditions planar over time', () => {
    const initial = [1.2, 0, 1.9, 0, 0.5, 0, -0.3, 0];
    const chain = new SphericalChain(DOUBLE_3D, initial, 0.001);
    chain.step(3);
    const state = chain.current();
    expect(Math.abs(state[1] ?? 0)).toBeLessThan(1e-10); // φ₁
    expect(Math.abs(state[3] ?? 0)).toBeLessThan(1e-10); // φ₂
    const positions = chain.positions();
    for (const p of positions) expect(Math.abs(p.z)).toBeLessThan(1e-9);
  });

  it('is genuinely 3D for non-planar initial conditions: bobs leave every vertical plane', () => {
    const initial = [0.9, 0, 1.4, 0.5, 0, 1.0, 0.2, -0.6];
    const chain = new SphericalChain(DOUBLE_3D, initial, 0.001);
    const tipAzimuths: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      chain.step(0.1);
      const tip = chain.positions()[1]!;
      tipAzimuths.push(Math.atan2(tip.z, tip.x));
    }
    const spread = Math.max(...tipAzimuths) - Math.min(...tipAzimuths);
    expect(spread).toBeGreaterThan(0.5);
  });

  it('energy breakdown is consistent with the Cartesian kinematics', () => {
    const state = [1.7, 0.4, 2.1, -0.8, 0.3, 0.9, -0.5, 0.6];
    const energy = sphericalChainEnergy(state, DOUBLE_3D);
    const velocities = sphericalChainVelocities(state, DOUBLE_3D);
    const positions = sphericalChainPositions(state, DOUBLE_3D);
    let ke = 0;
    let pe = 0;
    for (let i = 0; i < 2; i += 1) {
      const m = DOUBLE_3D.masses[i]!;
      const v = velocities[i]!;
      ke += 0.5 * m * (v.x * v.x + v.y * v.y + v.z * v.z);
      pe += m * DOUBLE_3D.g * positions[i]!.y;
    }
    expect(energy.KE).toBeCloseTo(ke, 10);
    expect(energy.PE).toBeCloseTo(pe, 10);
    expect(energy.total).toBeCloseTo(ke + pe, 10);
  });

  it('damping decays the energy monotonically', () => {
    const damped: SphericalChainParams = { ...DOUBLE_3D, damping: 0.4 };
    const chain = new SphericalChain(damped, [1.5, 0.3, 2.0, 1.0, 0, 0.7, 0.3, -0.4], 0.001);
    let prev = chain.diagnostics().energy;
    for (let i = 0; i < 10; i += 1) {
      chain.step(0.5);
      const e = chain.diagnostics().energy;
      expect(e).toBeLessThan(prev + 1e-9);
      prev = e;
    }
    expect(chain.diagnostics().caveat).toContain('Damping');
  });

  it('rejects mismatched masses/lengths instead of silently changing N', () => {
    expect(() =>
      rhsSphericalChain([0, 0, 0, 0], { masses: [1, 1], lengths: [1], g: 9.81, damping: 0 }, new Float64Array(4))
    ).toThrow(/same length/);
  });

  it('workspace-backed RHS matches the allocation path', () => {
    const state = [1.7, 0.4, 2.1, -0.8, 0.3, 0.9, -0.5, 0.6];
    const a = rhsSphericalChain(state, DOUBLE_3D, new Float64Array(8));
    const b = rhsSphericalChain(state, DOUBLE_3D, new Float64Array(8), createSphericalChainWorkspace(2));
    for (let i = 0; i < 8; i += 1) expect(Math.abs((a[i] ?? 0) - (b[i] ?? 0))).toBeLessThan(1e-14);
  });

  it('reports mass-matrix conditioning in public diagnostics', () => {
    const state = [1.7, 0.4, 2.1, -0.8, 0.3, 0.9, -0.5, 0.6];
    const solve = sphericalChainMassMatrixDiagnostics(state, DOUBLE_3D);
    expect(solve.ok).toBe(true);
    expect(solve.conditionEstimate).toBeGreaterThanOrEqual(1);
    expect(solve.relativeResidual).toBeLessThan(1e-12);

    const chain = new SphericalChain(DOUBLE_3D, state, { dt: 0.001, method: 'rk4' });
    const diag = chain.diagnostics();
    expect(diag.conditionEstimate).toBeCloseTo(solve.conditionEstimate, 12);
    expect(diag.relativeResidual).toBeLessThan(1e-12);
    expect(diag.massMatrixScale).toBeGreaterThan(0);
  });

  it('can run with a non-RK4 integrator for reference studies', () => {
    const chain = new SphericalChain(DOUBLE_3D, [1.2, 0.1, 1.5, 0.5, 0.1, 0.4, -0.2, 0.3], {
      dt: 0.001,
      method: 'dopri5'
    });
    chain.step(0.05);
    const diag = chain.diagnostics();
    expect(diag.method).toBe('dopri5');
    expect(Number.isFinite(diag.energy)).toBe(true);
  });
});
