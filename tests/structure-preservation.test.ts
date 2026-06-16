import { describe, expect, test } from 'vitest';
import { energyDriftProfile } from '../src/research/structurePreservation';
import { rhsChain, energyChain, createChainWorkspace, type ChainParameters } from '../src/physics/nPendulum';
import type { Derivative, StateVector } from '../src/physics/types';

/**
 * Structure preservation on a long conservative run of the planar double
 * pendulum. The non-symmetric rk4 accumulates a *secular* (monotone) energy
 * drift over ~1000 periods, while the time-symmetric implicit methods (the
 * 2-stage Gauss collocation `gauss2` and implicit-midpoint `hmidpoint`) keep the
 * energy error *bounded* — the defining structure-preserving signature. The same
 * `method` selection is available on the chain integrators (`SphericalChain`).
 */

const params: ChainParameters = { masses: [1, 1], lengths: [1, 1], g: 9.81 };
const ws = createChainWorkspace(2);
const rhs: Derivative = (s, o) => {
  rhsChain(s, params, 0, o, ws);
};
const energy = (s: StateVector): number => energyChain(s, params).total;
const initialState = [0.9, 1.3, 0, 0]; // moderate-amplitude regular orbit
const common = { rhs, energy, initialState, dt: 0.02, totalTime: 2000, samples: 8 } as const;

describe('structure preservation — bounded vs secular energy drift (planar double pendulum)', () => {
  const rk4 = energyDriftProfile({ ...common, method: 'rk4' });
  const gauss2 = energyDriftProfile({ ...common, method: 'gauss2' });
  const hmidpoint = energyDriftProfile({ ...common, method: 'hmidpoint' });

  test('rk4 drifts secularly (monotone energy trend over ~1000 periods)', () => {
    expect(rk4.secular).toBe(true);
    // The drift grows monotonically: the last sample's magnitude dwarfs the first.
    const first = Math.abs(rk4.drift[0]!);
    const last = Math.abs(rk4.drift[rk4.drift.length - 1]!);
    expect(last).toBeGreaterThan(first * 3);
  });

  test('the Gauss collocation method bounds the energy error (no secular trend)', () => {
    expect(gauss2.secular).toBe(false);
    expect(gauss2.maxAbsDrift).toBeLessThan(1e-6); // observed ≈ 7e-8
    // Bounded oscillation: the accumulated secular component is a small fraction of the band.
    expect(gauss2.secularComponent).toBeLessThan(gauss2.maxAbsDrift);
  });

  test('implicit midpoint is also bounded (time-symmetric)', () => {
    expect(hmidpoint.secular).toBe(false);
    expect(hmidpoint.maxAbsDrift).toBeLessThan(1e-3);
  });

  test('the symmetric method bounds the drift far below rk4 over the same run', () => {
    // rk4's secular drift is orders of magnitude larger than the Gauss method's bounded band.
    expect(rk4.maxAbsDrift / gauss2.maxAbsDrift).toBeGreaterThan(100);
  });
});
