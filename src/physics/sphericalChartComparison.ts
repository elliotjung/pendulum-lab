import { SphericalChain, type SphericalChainParams } from './sphericalChain';
import { EmbeddedSphericalChain } from './sphericalEmbeddedChain';

/**
 * Educational chart-verification run: integrate the SAME spherical N-chain
 * initial condition through both charts side by side -
 *
 * - polar chart (`SphericalChain`, angles (theta, phi) per bob, clamped near
 *   the poles), and
 * - embedded chart (`EmbeddedSphericalChain`, unit vectors + tangent
 *   velocities with per-step projection, regular at the poles),
 *
 * and report how far the bob positions drift apart together with each chart's
 * own energy / L_z conservation. Two independent formulations of the same
 * mechanics agreeing in position space is the verification claim; their
 * divergence growing with the Lyapunov time (not staying at round-off) is the
 * expected behaviour for chaotic initial conditions and is stated as such.
 */

export interface ChartComparisonOptions {
  /** Integrator step for both charts (RK4). */
  dt?: number;
  totalTime?: number;
  /** Record a sample every this many seconds of simulated time. */
  sampleEvery?: number;
}

export interface ChartComparisonSample {
  time: number;
  /** Max over bobs of the 3D distance between the two charts' positions. */
  maxBobDistance: number;
  polarEnergyDrift: number;
  embeddedEnergyDrift: number;
}

export interface ChartComparisonResult {
  n: number;
  dt: number;
  totalTime: number;
  samples: ChartComparisonSample[];
  maxBobDistance: number;
  finalBobDistance: number;
  polar: { energyDrift: number; lzDrift: number };
  embedded: {
    energyDrift: number;
    lzDrift: number;
    unitConstraintError: number;
    tangentConstraintError: number;
  };
  caveat: string;
}

function maxPairDistance(
  a: Array<{ x: number; y: number; z: number }>,
  b: Array<{ x: number; y: number; z: number }>
): number {
  let max = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const p = a[i]!;
    const q = b[i]!;
    max = Math.max(max, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
  }
  return max;
}

/**
 * Run both charts from the same polar initial condition
 * [theta_0, phi_0, ..., thetaDot_0, phiDot_0, ...] (length 4N) and compare.
 */
export function compareSphericalCharts(
  params: SphericalChainParams,
  polarState0: ArrayLike<number>,
  options: ChartComparisonOptions = {}
): ChartComparisonResult {
  const dt = options.dt ?? 0.001;
  const totalTime = options.totalTime ?? 5;
  const sampleEvery = options.sampleEvery ?? Math.max(dt, totalTime / 10);
  if (!(dt > 0 && totalTime > 0 && sampleEvery > 0)) {
    throw new Error('compareSphericalCharts: dt, totalTime and sampleEvery must be positive.');
  }
  const n = params.masses.length;
  const polar = new SphericalChain(params, polarState0, dt);
  const embedded = EmbeddedSphericalChain.fromAngles(params, polarState0, dt);

  const samples: ChartComparisonSample[] = [];
  let maxBobDistance = maxPairDistance(polar.positions(), embedded.positions());
  let time = 0;
  while (time < totalTime - 1e-12) {
    const interval = Math.min(sampleEvery, totalTime - time);
    polar.step(interval);
    embedded.step(interval);
    time += interval;
    const distance = maxPairDistance(polar.positions(), embedded.positions());
    maxBobDistance = Math.max(maxBobDistance, distance);
    samples.push({
      time,
      maxBobDistance: distance,
      polarEnergyDrift: polar.diagnostics().energyDrift,
      embeddedEnergyDrift: embedded.diagnostics().energyDrift
    });
  }

  const polarDiag = polar.diagnostics();
  const embeddedDiag = embedded.diagnostics();
  return {
    n,
    dt,
    totalTime,
    samples,
    maxBobDistance,
    finalBobDistance: samples.length ? samples[samples.length - 1]!.maxBobDistance : maxBobDistance,
    polar: { energyDrift: polarDiag.energyDrift, lzDrift: polarDiag.lzDrift },
    embedded: {
      energyDrift: embeddedDiag.energyDrift,
      lzDrift: embeddedDiag.lzDrift,
      unitConstraintError: embeddedDiag.unitConstraintError,
      tangentConstraintError: embeddedDiag.tangentConstraintError
    },
    caveat: params.damping > 0
      ? 'Damped run: both charts dissipate physically; position agreement is the verification metric, energy drift is not an error here.'
      : 'Conservative run: both charts integrate the same mechanics with independent formulations. Position divergence grows with the Lyapunov time for chaotic initial conditions; each chart\'s own E/L_z drift bounds its integrator error. Near-pole trajectories stress the polar chart\'s clamp while the embedded chart stays regular.'
  };
}
