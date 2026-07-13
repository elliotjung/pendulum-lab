import { continueNeimarkSackerTorus, type PlanarMapSystem } from './neimarkSacker';

/**
 * Self-consistency analysis of the Neimark–Sacker invariant torus:
 *
 *   • {@link torusLyapunovSpectrum} — the map-Lyapunov exponents on the invariant
 *     circle. A quasi-periodic torus is *not* chaotic: its largest exponent is
 *     ≈ 0 (the neutral on-circle direction), so a positive value would falsify the
 *     "smooth invariant curve" picture the collocation solver assumes. This mirrors
 *     the Hamiltonian-spectrum self-consistency gate (`analyzeSpectrumConsistency`):
 *     an independent check on the same object, not the same computation twice. In
 *     the *flow* whose stroboscopic map this is, the on-circle zero is one of the
 *     two-torus's two zero Lyapunov exponents (the other being the trivial flow
 *     direction); on the 2-D map we additionally resolve the transverse exponent,
 *     which is < 0 for an attracting circle.
 *
 *   • {@link neimarkSackerSpectralConvergence} — the trigonometric-collocation
 *     truncation error vs the collocation count M. For a smooth invariant curve
 *     the convergence is *spectral* (geometric in M, faster than any algebraic
 *     order), so ln(residual) is linear in M. This is the convergence-order gate
 *     for the NS solver, the spectral analogue of the Richardson `empiricalOrder`
 *     certification used for the time integrators.
 */

/** Central-difference 2×2 Jacobian of the planar map at (x, y). */
function mapJacobian(
  system: PlanarMapSystem,
  parameter: number,
  x: number,
  y: number,
  h: number
): [[number, number], [number, number]] {
  const out = new Float64Array(2);
  system.map(Float64Array.of(x + h, y), parameter, out);
  const fpx0 = out[0]!;
  const fpx1 = out[1]!;
  system.map(Float64Array.of(x - h, y), parameter, out);
  const fmx0 = out[0]!;
  const fmx1 = out[1]!;
  system.map(Float64Array.of(x, y + h), parameter, out);
  const fpy0 = out[0]!;
  const fpy1 = out[1]!;
  system.map(Float64Array.of(x, y - h), parameter, out);
  const fmy0 = out[0]!;
  const fmy1 = out[1]!;
  return [
    [(fpx0 - fmx0) / (2 * h), (fpy0 - fmy0) / (2 * h)],
    [(fpx1 - fmx1) / (2 * h), (fpy1 - fmy1) / (2 * h)]
  ];
}

export interface TorusLyapunovOptions {
  /** Orbit length used for the Benettin average. Default 40000. */
  iterations?: number;
  /** Burn-in steps so the orbit settles onto the attracting circle. Default 4000. */
  transient?: number;
  /** Finite-difference step for the map Jacobian. Default 1e-6. */
  finiteDifferenceEpsilon?: number;
  /** |λ| below this counts as a zero exponent. Default 1e-3. */
  zeroTolerance?: number;
}

export interface TorusLyapunovResult {
  /** The two map-Lyapunov exponents, sorted descending. */
  exponents: [number, number];
  /** Largest exponent (≈ 0 on a quasi-periodic torus). */
  largest: number;
  /** Neutral on-circle exponent (the larger one). */
  onTorusExponent: number;
  /** Transverse exponent (the smaller one; < 0 for an attracting circle). */
  transverseExponent: number;
  /**
   * 'quasi-periodic-torus' (largest ≈ 0), 'phase-locked-or-attracting'
   * (largest < 0 — the circle map contracts onto a periodic orbit / point), or
   * 'chaotic' (largest > 0 — not a torus).
   */
  verdict: 'quasi-periodic-torus' | 'phase-locked-or-attracting' | 'chaotic';
  iterations: number;
  method: string;
  caveat: string;
}

/**
 * Lyapunov spectrum of a planar stroboscopic map restricted to its invariant
 * circle, by the Benettin algorithm with continuous Gram–Schmidt (QR)
 * reorthonormalisation of two tangent vectors along an orbit on the circle.
 */
export function torusLyapunovSpectrum(
  system: PlanarMapSystem,
  parameter: number,
  seed: readonly [number, number],
  options: TorusLyapunovOptions = {}
): TorusLyapunovResult {
  const iterations = options.iterations ?? 40000;
  const transient = options.transient ?? 4000;
  const h = options.finiteDifferenceEpsilon ?? 1e-6;
  const zeroTol = options.zeroTolerance ?? 1e-3;

  let x = seed[0];
  let y = seed[1];
  const out = new Float64Array(2);
  // Orthonormal tangent frame q = [q0 | q1] (columns), row-major 2×2.
  let q00 = 1;
  let q10 = 0;
  let q01 = 0;
  let q11 = 1;
  let sum0 = 0;
  let sum1 = 0;
  let counted = 0;

  for (let n = 0; n < transient + iterations; n += 1) {
    const J = mapJacobian(system, parameter, x, y, h);
    // v_i = J q_i.
    const a0 = J[0][0] * q00 + J[0][1] * q10;
    const a1 = J[1][0] * q00 + J[1][1] * q10;
    const b0 = J[0][0] * q01 + J[0][1] * q11;
    const b1 = J[1][0] * q01 + J[1][1] * q11;
    // Modified Gram–Schmidt.
    const r0 = Math.hypot(a0, a1) || Number.MIN_VALUE;
    const u00 = a0 / r0;
    const u10 = a1 / r0;
    const proj = b0 * u00 + b1 * u10;
    const c0 = b0 - proj * u00;
    const c1 = b1 - proj * u10;
    const r1 = Math.hypot(c0, c1) || Number.MIN_VALUE;
    const u01 = c0 / r1;
    const u11 = c1 / r1;
    q00 = u00;
    q10 = u10;
    q01 = u01;
    q11 = u11;
    if (n >= transient) {
      sum0 += Math.log(r0);
      sum1 += Math.log(r1);
      counted += 1;
    }
    system.map(Float64Array.of(x, y), parameter, out);
    x = out[0]!;
    y = out[1]!;
  }

  const lambdaA = sum0 / counted;
  const lambdaB = sum1 / counted;
  const exponents: [number, number] = lambdaA >= lambdaB ? [lambdaA, lambdaB] : [lambdaB, lambdaA];
  const largest = exponents[0];
  const verdict: TorusLyapunovResult['verdict'] =
    largest > zeroTol ? 'chaotic' : largest < -zeroTol ? 'phase-locked-or-attracting' : 'quasi-periodic-torus';

  return {
    exponents,
    largest,
    onTorusExponent: exponents[0],
    transverseExponent: exponents[1],
    verdict,
    iterations: counted,
    method:
      'Benettin QR (two tangent vectors, continuous Gram–Schmidt) along an orbit on the invariant circle; central-difference map Jacobian',
    caveat:
      'Assumes the orbit has settled onto the attracting invariant circle. A quasi-periodic torus has a neutral (≈0) on-circle exponent; a strictly positive largest exponent indicates the object is not a smooth torus (chaos), a strictly negative one indicates phase-locking/attraction to a periodic orbit.'
  };
}

/** Ordinary-least-squares slope, intercept and R² of y vs x. */
function linearFit(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i]!;
    sy += ys[i]!;
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const r2 = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 1;
  return { slope, intercept, r2 };
}

export interface NeimarkSackerConvergenceSample {
  collocation: number;
  invarianceResidual: number;
  converged: boolean;
}

export interface NeimarkSackerConvergenceResult {
  parameter: number;
  samples: NeimarkSackerConvergenceSample[];
  /** Slope of ln(residual) vs M (more negative ⇒ faster spectral decay). */
  geometricRate: number;
  /** R² of the spectral fit ln(res) ~ M. */
  spectralR2: number;
  /** R² of the algebraic fit ln(res) ~ ln(M). */
  algebraicR2: number;
  /** residual(M_min) / residual(M_max) over the converged samples. */
  dropFactor: number;
  /** True iff the decay is geometric (spectral fit ≥ algebraic fit) and reaches the floor. */
  spectral: boolean;
  method: string;
  caveat: string;
}

/**
 * Spectral-convergence gate for the NS torus solver: continue the invariant
 * circle at a fixed parameter for an increasing collocation count M and measure
 * the off-grid invariance residual (the genuine truncation error). For a smooth
 * curve trigonometric collocation converges geometrically, so ln(residual) is
 * linear in M (spectral) rather than in ln(M) (algebraic) — the criterion checked
 * here, alongside a large overall drop to a near-machine floor.
 */
export function neimarkSackerSpectralConvergence(
  system: PlanarMapSystem,
  parameter: number,
  options: {
    collocations?: readonly number[];
    initialAmplitude: number;
    tolerance?: number;
    maxIterations?: number;
    floor?: number;
  }
): NeimarkSackerConvergenceResult {
  const collocations = options.collocations ?? [9, 13, 17, 21, 25, 29, 33];
  const tolerance = options.tolerance ?? 1e-12;
  const maxIterations = options.maxIterations ?? 60;
  const floor = options.floor ?? 1e-8;

  const samples: NeimarkSackerConvergenceSample[] = [];
  for (const m of collocations) {
    const run = continueNeimarkSackerTorus(system, {
      start: parameter,
      end: parameter,
      step: 1,
      initialAmplitude: options.initialAmplitude,
      collocation: m,
      tolerance,
      maxIterations
    });
    const point = run.points[0]!;
    samples.push({ collocation: m, invarianceResidual: point.invarianceResidual, converged: point.converged });
  }

  // Fit over converged samples with a strictly positive residual (above the float64 floor).
  const usable = samples.filter(
    (s) => s.converged && s.invarianceResidual > 0 && Number.isFinite(s.invarianceResidual)
  );
  const ms = usable.map((s) => s.collocation);
  const lnRes = usable.map((s) => Math.log(s.invarianceResidual));
  const lnMs = usable.map((s) => Math.log(s.collocation));
  const spectralFit = linearFit(ms, lnRes);
  const algebraicFit = linearFit(lnMs, lnRes);

  const residuals = usable.map((s) => s.invarianceResidual);
  const maxRes = residuals.length ? Math.max(...residuals) : Infinity;
  const minRes = residuals.length ? Math.min(...residuals) : Infinity;
  const dropFactor = minRes > 0 ? maxRes / minRes : Infinity;
  const spectral = usable.length >= 3 && spectralFit.slope < 0 && spectralFit.r2 >= algebraicFit.r2 && minRes < floor;

  return {
    parameter,
    samples,
    geometricRate: spectralFit.slope,
    spectralR2: spectralFit.r2,
    algebraicR2: algebraicFit.r2,
    dropFactor,
    spectral,
    method:
      'off-grid invariance residual vs collocation count M; ln(res)~M (spectral) vs ln(res)~ln(M) (algebraic) least-squares fits',
    caveat:
      'Spectral convergence holds only for a smooth (analytic) invariant curve near onset; phase-locked or strongly deformed curves lose it. The residual floors at the Newton tolerance / float64 round-off, so very high M shows a flat tail rather than continued decay.'
  };
}
