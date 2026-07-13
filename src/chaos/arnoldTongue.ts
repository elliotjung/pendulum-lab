import { continueNeimarkSackerTorus } from './neimarkSacker';
import type { PlanarMapSystem, InvariantTorusOptions, InvariantTorusPoint } from './neimarkSacker';

/**
 * Arnold tongues and phase-locking — the rotation-number structure that the
 * Neimark–Sacker invariant-circle solver explicitly declares out of scope.
 *
 * Past a generic NS bifurcation the stroboscopic map carries a closed invariant
 * circle on which the dynamics is a circle homeomorphism with rotation number ρ.
 * When ρ is irrational the motion is quasi-periodic and `continueNeimarkSackerTorus`
 * resolves the curve by conjugacy to a rigid rotation; when ρ locks to a rational
 * p/q over a whole *interval* of the parameter (an "Arnold tongue" / mode-locking
 * step of the devil's staircase) that conjugacy fails and the collocation solver's
 * caveat names it as out of scope. This module turns that caveat into a feature:
 * the rotation number is measured directly (lift winding / orbit winding, valid
 * locked *or* unlocked), and mode-locked plateaus are detected as Arnold tongues.
 *
 * Anchored on the sine circle map θ ↦ θ + Ω − (K/2π)sin(2πθ) — the textbook
 * Arnold-tongue system, whose ρ(Ω,K) is the devil's staircase: ρ = Ω exactly at
 * K = 0, and at K > 0 each rational p/q opens a finite mode-locked tongue.
 * The same estimator runs on the NS invariant circle (orbit winding about the
 * enclosed fixed point), cross-checking the collocation solver's ρ.
 */

/** An orientation-preserving circle map, represented by its lift f: ℝ → ℝ (ρ = lim (fⁿθ − θ)/n). */
export interface CircleMap {
  /** The lift of one map step; must satisfy f(θ+1) = f(θ)+1 (degree-one circle map). */
  lift(theta: number): number;
}

/** The sine circle map lift f(θ) = θ + Ω − (K/2π) sin(2πθ). A diffeomorphism for K < 1. */
export function sineCircleMap(omega: number, couplingK: number): CircleMap {
  return { lift: (theta) => theta + omega - (couplingK / (2 * Math.PI)) * Math.sin(2 * Math.PI * theta) };
}

export interface RotationNumberOptions {
  /** Averaging length after the transient. Default 200000. */
  iterations?: number;
  /** Burn-in steps discarded before averaging. Default 2000. */
  transient?: number;
  /** Initial lift coordinate. Default 0.1. */
  theta0?: number;
}

/**
 * Rotation number ρ of a circle map from its lift: ρ = lim_{n→∞} (fⁿ(θ₀) − θ₀)/n.
 * The lift is iterated *without wrapping*, so the accumulated translation divided
 * by the iteration count is ρ directly — well-defined whether ρ is rational
 * (mode-locked) or irrational (quasi-periodic), unlike the collocation solver.
 */
export function rotationNumber(map: CircleMap, options: RotationNumberOptions = {}): number {
  const iterations = options.iterations ?? 200000;
  const transient = options.transient ?? 2000;
  let theta = options.theta0 ?? 0.1;
  for (let i = 0; i < transient; i += 1) theta = map.lift(theta);
  const start = theta;
  for (let i = 0; i < iterations; i += 1) theta = map.lift(theta);
  return (theta - start) / iterations;
}

/**
 * Rotation number of a planar map on its (NS) invariant circle, by accumulating
 * the signed winding angle of (state − center) about the enclosed fixed point.
 * Bridges this module to {@link continueNeimarkSackerTorus}: on the same curve it
 * must reproduce that solver's `rotationNumber`. Returned as a fraction in [0, 1).
 */
export function planarMapRotationNumber(
  system: PlanarMapSystem,
  parameter: number,
  center: readonly [number, number],
  seed: readonly [number, number],
  options: { iterations?: number; transient?: number } = {}
): number {
  const iterations = options.iterations ?? 200000;
  const transient = options.transient ?? 2000;
  const cx = center[0];
  const cy = center[1];
  const state = Float64Array.of(seed[0], seed[1]);
  const out = new Float64Array(2);
  const advance = (): void => {
    system.map(state, parameter, out);
    state[0] = out[0]!;
    state[1] = out[1]!;
  };
  for (let i = 0; i < transient; i += 1) advance();
  let prevX = state[0]! - cx;
  let prevY = state[1]! - cy;
  let winding = 0;
  for (let i = 0; i < iterations; i += 1) {
    advance();
    const x = state[0]! - cx;
    const y = state[1]! - cy;
    // Signed angle increment via atan2(cross, dot) of successive radius vectors.
    const cross = prevX * y - prevY * x;
    const dot = prevX * x + prevY * y;
    winding += Math.atan2(cross, dot);
    prevX = x;
    prevY = y;
  }
  const rho = winding / (2 * Math.PI * iterations);
  // Report in [0, 1) like the NS solver's |arg μ|/2π.
  const wrapped = ((rho % 1) + 1) % 1;
  return Math.min(wrapped, 1 - wrapped);
}

export interface RotationNumberSample {
  parameter: number;
  rotationNumber: number;
}

export interface ArnoldTongue {
  /** Locked rational p/q. */
  p: number;
  q: number;
  ratio: number;
  /** Parameter interval over which ρ ≈ p/q (the tongue's intersection with the scan line). */
  start: number;
  end: number;
  /** Number of consecutive scan samples inside the tongue. */
  sampleCount: number;
}

export interface ModeLockingScan {
  samples: RotationNumberSample[];
  tongues: ArnoldTongue[];
  /** True iff ρ(parameter) is non-decreasing within the estimator-noise tolerance (devil's staircase). */
  monotone: boolean;
  /** Largest backward step in the measured ρ(parameter) — the rotation-number estimator's noise floor. */
  maxDecrease: number;
  method: string;
  caveat: string;
}

/** Reduce a fraction p/q to lowest terms. */
function reduce(p: number, q: number): [number, number] {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(Math.abs(p), Math.abs(q)) || 1;
  return [p / g, q / g];
}

/**
 * Sweep a parameterised circle map, measure ρ(parameter), and detect the Arnold
 * tongues where ρ locks to one of the target rationals over a parameter interval.
 * A sample is "locked" to p/q when |ρ − p/q| < tolerance; maximal runs of
 * consecutive samples locked to the same reduced rational become a tongue.
 */
export function scanModeLocking(
  mapFactory: (parameter: number) => CircleMap,
  options: {
    start: number;
    end: number;
    steps: number;
    rationals: ReadonlyArray<readonly [number, number]>;
    tolerance?: number;
    /** A backward step in measured ρ below this counts as noise, not a real decrease. Default 1e-3. */
    monotoneTolerance?: number;
    rotationOptions?: RotationNumberOptions;
  }
): ModeLockingScan {
  if (options.steps < 1) throw new Error('scanModeLocking: steps must be ≥ 1.');
  const tolerance = options.tolerance ?? 1e-4;
  const monotoneTolerance = options.monotoneTolerance ?? 1e-3;
  const targets = options.rationals.map(([p, q]) => {
    const [rp, rq] = reduce(p, q);
    return { p: rp, q: rq, ratio: rp / rq };
  });
  const samples: RotationNumberSample[] = [];
  const lockedRatioOf: Array<{ p: number; q: number; ratio: number } | null> = [];
  for (let i = 0; i <= options.steps; i += 1) {
    const parameter = options.start + ((options.end - options.start) * i) / options.steps;
    const rho = rotationNumber(mapFactory(parameter), options.rotationOptions);
    samples.push({ parameter, rotationNumber: rho });
    let locked: { p: number; q: number; ratio: number } | null = null;
    for (const target of targets) {
      if (Math.abs(rho - target.ratio) < tolerance) {
        locked = target;
        break;
      }
    }
    lockedRatioOf.push(locked);
  }

  const tongues: ArnoldTongue[] = [];
  let run: { target: { p: number; q: number; ratio: number }; startIdx: number; count: number } | null = null;
  const flush = (endIdx: number): void => {
    if (!run) return;
    tongues.push({
      p: run.target.p,
      q: run.target.q,
      ratio: run.target.ratio,
      start: samples[run.startIdx]!.parameter,
      end: samples[endIdx]!.parameter,
      sampleCount: run.count
    });
    run = null;
  };
  for (let i = 0; i < samples.length; i += 1) {
    const locked = lockedRatioOf[i]!;
    if (run && locked && locked.p === run.target.p && locked.q === run.target.q) {
      run.count += 1;
    } else {
      flush(i - 1);
      run = locked ? { target: locked, startIdx: i, count: 1 } : null;
    }
  }
  flush(samples.length - 1);

  let maxDecrease = 0;
  for (let i = 1; i < samples.length; i += 1) {
    maxDecrease = Math.max(maxDecrease, samples[i - 1]!.rotationNumber - samples[i]!.rotationNumber);
  }

  return {
    samples,
    tongues: tongues.filter((t) => t.sampleCount >= 1),
    monotone: maxDecrease <= monotoneTolerance,
    maxDecrease,
    method:
      'direct rotation-number measurement (lift winding) across the parameter; maximal runs locked to a target rational p/q within tolerance are Arnold tongues',
    caveat:
      'Tongue widths are resolved only to the scan granularity, and high-q tongues are exponentially narrow (easily stepped over). Rotation-number averaging assumes an orientation-preserving (degree-one) circle map; above criticality (K > 1 for the sine map) the map folds and ρ is not single-valued.'
  };
}

// ---------------------------------------------------------------------------
// Robust invariant-circle continuation with an automatic winding fallback.
//
// `continueNeimarkSackerTorus` declares phase-locked (Arnold-tongue) parameters
// out of scope: trigonometric collocation needs a *smooth* conjugacy to rigid
// rotation, which fails on the non-smooth conjugacy of a mode-locked circle.
// Rather than leave those parameters with an unreliable collocation ρ behind a
// caveat flag, this wrapper measures the rotation number directly by orbit
// winding (`planarMapRotationNumber`) at every continued parameter — a quantity
// that is well-defined mode-locked *or* quasi-periodic — and substitutes it
// wherever the collocation solver did not converge to a low off-grid residual.
// ---------------------------------------------------------------------------

export interface RobustInvariantTorusOptions extends InvariantTorusOptions {
  /**
   * Off-grid invariance residual above which the collocation result is treated
   * as failed (so the winding number is the trusted ρ). Default 1e-3.
   */
  residualThreshold?: number;
  /** Iterations for the winding cross-check / fallback. Default 20000. */
  windingIterations?: number;
  /** Burn-in steps for the winding measurement. Default 2000. */
  windingTransient?: number;
}

export interface RobustInvariantTorusPoint extends InvariantTorusPoint {
  /**
   * Rotation number measured directly by orbit winding about the enclosed fixed
   * point — valid mode-locked or quasi-periodic, independent of the collocation
   * solver. Always populated (a cross-check on converged points, the trusted
   * value on failed ones).
   */
  windingRotationNumber: number;
  /** Which ρ estimate to trust at this parameter. */
  rotationNumberSource: 'collocation' | 'winding-fallback';
}

export interface RobustInvariantTorusContinuation {
  points: RobustInvariantTorusPoint[];
  collocation: number;
  method: string;
  caveat: string;
  /** Parameters where collocation failed and the winding rotation number was used. */
  fallbackParameters: number[];
}

/**
 * Continue the Neimark–Sacker invariant circle with an automatic winding
 * fallback at phase-locked parameters. Runs {@link continueNeimarkSackerTorus},
 * then for every point measures the orbit-winding rotation number; where the
 * collocation solve did not converge inside the residual threshold the winding
 * value is the trusted ρ (`rotationNumberSource: 'winding-fallback'`), turning
 * the Arnold-tongue out-of-scope caveat into a usable number.
 */
export function continueNeimarkSackerTorusRobust(
  system: PlanarMapSystem,
  options: RobustInvariantTorusOptions
): RobustInvariantTorusContinuation {
  const base = continueNeimarkSackerTorus(system, options);
  const residualThreshold = options.residualThreshold ?? 1e-3;
  const windingIterations = options.windingIterations ?? 20000;
  const windingTransient = options.windingTransient ?? 2000;
  const fallbackParameters: number[] = [];

  const points: RobustInvariantTorusPoint[] = base.points.map((pt) => {
    const failed = !pt.converged || !(pt.invarianceResidual <= residualThreshold);
    // Seed on (or near) the curve; the transient settles onto the true attractor
    // regardless of the seed, so even a garbage failed-Newton curve is fine.
    let seed: [number, number] = [pt.curve[0] ?? pt.center[0], pt.curve[1] ?? pt.center[1]];
    if (seed[0] === pt.center[0] && seed[1] === pt.center[1]) {
      seed = [pt.center[0] + (options.initialAmplitude || 1e-3), pt.center[1]];
    }
    const windingRotationNumber = planarMapRotationNumber(system, pt.parameter, pt.center, seed, {
      iterations: windingIterations,
      transient: windingTransient
    });
    if (failed) fallbackParameters.push(pt.parameter);
    return {
      ...pt,
      windingRotationNumber,
      rotationNumberSource: failed ? 'winding-fallback' : 'collocation'
    };
  });

  return {
    points,
    collocation: base.collocation,
    method:
      base.method +
      '; rotation number cross-checked (and, where collocation fails to converge inside an Arnold tongue, replaced) by direct orbit-winding measurement about the enclosed fixed point',
    caveat:
      'Phase-locked (Arnold-tongue) parameters where trigonometric collocation cannot represent the non-smooth conjugacy fall back to the winding rotation number, which is well-defined mode-locked or quasi-periodic; the winding estimate is resolved only to O(1/iterations).',
    fallbackParameters
  };
}
