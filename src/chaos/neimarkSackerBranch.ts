/**
 * Driven-pendulum stroboscopic map adapter for Neimark–Sacker torus continuation.
 *
 * The driven pendulum is a 3D autonomous system [θ, ω, φ=ωt]. One period of the
 * drive (T = 2π/Ω) defines a 2D stroboscopic return map [θ, ω] → [θ_T, ω_T].
 * This wraps that map as a `PlanarMapSystem` so `continueNeimarkSackerTorus` can
 * continue the invariant circle born at a Neimark–Sacker bifurcation on the
 * driven-pendulum stroboscopic Poincaré section.
 */
import { rhsDriven, type DrivenParameters } from '../physics/driven';
import { rk4Step } from '../physics/integrators';
import { drivenPeriodicOrbit } from './floquet';
import {
  continueNeimarkSackerTorus,
  type PlanarMapSystem,
  type InvariantTorusOptions,
  type InvariantTorusContinuation
} from './neimarkSacker';
import type { StateVector } from '../physics/types';

/**
 * Build a `PlanarMapSystem` from the driven pendulum's stroboscopic return map
 * at a given drive amplitude. The `parameter` argument passed to `map` overrides
 * `baseParams.driveAmplitude` so the torus continuation can scan along A.
 *
 * @param baseParams  Physical parameters; `driveAmplitude` is the sweep variable.
 * @param stepsPerPeriod  RK4 steps per drive period. 256 is typically sufficient;
 *                        increase if the map becomes non-smooth.
 */
export function createDrivenStroboscopicMap(
  baseParams: DrivenParameters,
  stepsPerPeriod = 256
): PlanarMapSystem {
  const period = (2 * Math.PI) / baseParams.driveFrequency;
  const dt = period / stepsPerPeriod;

  return {
    map(state: Float64Array, amplitude: number, out: Float64Array): void {
      const params: DrivenParameters = { ...baseParams, driveAmplitude: amplitude };
      // Augmented 3D state: [theta, omega, phi=0] at the strobe
      const s = new Float64Array([state[0]!, state[1]!, 0]) as StateVector;
      const o = new Float64Array(3) as StateVector;
      const rhs = (sv: StateVector, ov: StateVector): void => {
        rhsDriven(sv, params, ov);
      };
      for (let i = 0; i < stepsPerPeriod; i += 1) {
        rk4Step(s, dt, rhs, o);
        s.set(o);
      }
      out[0] = s[0]!;
      out[1] = s[1]!;
    },

    center(amplitude: number): readonly [number, number] {
      const params: DrivenParameters = { ...baseParams, driveAmplitude: amplitude };
      const result = drivenPeriodicOrbit(params, [0, 0], { dt: period / stepsPerPeriod, tolerance: 1e-9 });
      return [result.orbit[0]!, result.orbit[1]!];
    }
  };
}

/**
 * Continue the Neimark–Sacker invariant circle of the driven pendulum's
 * stroboscopic return map across the drive amplitude axis.
 *
 * @param baseParams      Physical parameters; `driveAmplitude` is scanned.
 * @param options         Passed to `continueNeimarkSackerTorus`; also accepts
 *                        `stepsPerPeriod` for the underlying RK4 strobe.
 */
export function continueExpansionNSBranch(
  baseParams: DrivenParameters,
  options: InvariantTorusOptions & { stepsPerPeriod?: number }
): InvariantTorusContinuation {
  const { stepsPerPeriod = 256, ...torusOptions } = options;
  const system = createDrivenStroboscopicMap(baseParams, stepsPerPeriod);
  return continueNeimarkSackerTorus(system, torusOptions);
}
