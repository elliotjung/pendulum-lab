import type { FloquetMultiplier } from './floquet';

/**
 * Neimark–Sacker (torus) bifurcation detection along a periodic-orbit branch.
 * A NS bifurcation occurs where a complex-conjugate multiplier pair crosses the
 * unit circle with non-real critical multipliers; past the crossing the orbit
 * sheds an invariant torus whose rotation number is arg(μ)/2π at criticality.
 */

export interface BranchSample {
  /** Continuation parameter (e.g. drive amplitude). */
  param: number;
  multipliers: FloquetMultiplier[];
}

export interface NeimarkSackerPoint {
  /** Bracketing parameters: the crossing lies in (paramBefore, paramAfter]. */
  paramBefore: number;
  paramAfter: number;
  /** Linear interpolation estimate of the critical parameter. */
  paramCritical: number;
  /** |μ| just before and after the crossing. */
  modulusBefore: number;
  modulusAfter: number;
  /** Rotation number arg(μ)/2π at the sample nearest criticality. */
  rotationNumber: number;
  /** Strong-resonance flag: rotation number near 0, 1/2, 1/3, 1/4 invalidates the generic NS normal form. */
  strongResonance: boolean;
  direction: 'destabilising' | 'stabilising';
}

export interface NeimarkSackerScan {
  points: NeimarkSackerPoint[];
  method: string;
  caveat: string;
}

function dominantComplexPair(multipliers: readonly FloquetMultiplier[]): FloquetMultiplier | null {
  let best: FloquetMultiplier | null = null;
  let bestModulus = -1;
  for (const mu of multipliers) {
    if (Math.abs(mu.im) < 1e-9) continue;
    const modulus = Math.hypot(mu.re, mu.im);
    if (modulus > bestModulus) {
      bestModulus = modulus;
      best = mu;
    }
  }
  return best;
}

const STRONG_RESONANCES = [0, 1 / 2, 1 / 3, 1 / 4];

export function detectNeimarkSacker(branch: readonly BranchSample[], resonanceTolerance = 0.02): NeimarkSackerScan {
  const points: NeimarkSackerPoint[] = [];
  for (let i = 1; i < branch.length; i += 1) {
    const before = branch[i - 1]!;
    const after = branch[i]!;
    const pairBefore = dominantComplexPair(before.multipliers);
    const pairAfter = dominantComplexPair(after.multipliers);
    if (!pairBefore || !pairAfter) continue;
    const modulusBefore = Math.hypot(pairBefore.re, pairBefore.im);
    const modulusAfter = Math.hypot(pairAfter.re, pairAfter.im);
    const crossesOut = modulusBefore < 1 && modulusAfter >= 1;
    const crossesIn = modulusBefore >= 1 && modulusAfter < 1;
    if (!crossesOut && !crossesIn) continue;
    const t = Math.abs(modulusAfter - modulusBefore) > 1e-12 ? (1 - modulusBefore) / (modulusAfter - modulusBefore) : 0.5;
    const critical = Math.abs(1 - modulusBefore) <= Math.abs(modulusAfter - 1) ? pairBefore : pairAfter;
    const rotation = Math.abs(Math.atan2(critical.im, critical.re)) / (2 * Math.PI);
    points.push({
      paramBefore: before.param,
      paramAfter: after.param,
      paramCritical: before.param + Math.max(0, Math.min(1, t)) * (after.param - before.param),
      modulusBefore,
      modulusAfter,
      rotationNumber: rotation,
      strongResonance: STRONG_RESONANCES.some((target) => Math.abs(rotation - target) < resonanceTolerance),
      direction: crossesOut ? 'destabilising' : 'stabilising'
    });
  }
  return {
    points,
    method: 'dominant complex Floquet pair |mu| crossing 1 between adjacent branch samples; critical parameter by linear interpolation of |mu|',
    caveat: 'Detection brackets crossings between continuation samples; strong resonances (rotation number near 0, 1/2, 1/3, 1/4) require dedicated normal-form analysis. Torus existence past the crossing assumes the generic non-degenerate NS scenario.'
  };
}

/**
 * Torus indicator from stroboscopic samples: the 0–1-test-like growth of the
 * angular spread distinguishes a closed invariant curve (quasi-periodic torus
 * section: dense, bounded, non-repeating) from a periodic orbit (finite point
 * set) and chaos (area-filling).
 */
export interface TorusIndicator {
  distinctClusters: number;
  fillRatio: number;
  verdict: 'periodic' | 'torus-like' | 'chaotic-or-noisy';
}

export function torusIndicator(angles: readonly number[], clusterTolerance = 1e-3, fillBins = 64): TorusIndicator {
  if (angles.length === 0) return { distinctClusters: 0, fillRatio: 0, verdict: 'periodic' };
  const wrapped = angles.map((angle) => ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((a, b) => a - b);
  let clusters = 1;
  for (let i = 1; i < wrapped.length; i += 1) {
    if (wrapped[i]! - wrapped[i - 1]! > clusterTolerance) clusters += 1;
  }
  const bins = new Uint8Array(fillBins);
  for (const angle of wrapped) bins[Math.min(fillBins - 1, Math.floor((angle / (2 * Math.PI)) * fillBins))] = 1;
  let filled = 0;
  for (let i = 0; i < fillBins; i += 1) filled += bins[i]!;
  const fillRatio = filled / fillBins;
  const verdict = clusters <= 16 ? 'periodic' : fillRatio > 0.9 ? 'torus-like' : 'chaotic-or-noisy';
  return { distinctClusters: clusters, fillRatio, verdict };
}

// ---------------------------------------------------------------------------
// Invariant-circle (Neimark–Sacker torus) continuation
//
// Past a generic NS bifurcation a 2D stroboscopic map sheds a closed invariant
// curve K on which the dynamics is conjugate to a rigid rotation by the
// rotation number ρ:   F(u(θ); λ) = u(θ + 2πρ).
//
// We solve this invariance equation by trigonometric collocation. The curve is
// sampled at M (odd) equispaced phases θ_j; the rotated point u(θ_j + 2πρ) is
// the *exact* trigonometric interpolant of the samples evaluated at the shifted
// phase (Dirichlet-kernel synthesis, so the rotation operator is linear in the
// samples for fixed ρ). Newton iterates the M curve points and ρ together. A
// Poincaré phase condition relative to a reference curve removes the rotational
// gauge (the invariance equation is invariant under θ → θ + const).
//
// The first curve is seeded as the critical-eigenspace ellipse of the map's
// fixed point with ρ₀ = arg(λ)/2π, and warm-started in the parameter thereafter.
// Verified on the delayed-logistic map (NS at a = 2, ρ → 1/6); the reported
// `invarianceResidual` is measured BETWEEN collocation nodes, so it is a genuine
// (gauge-free) truncation error rather than the Newton residual driven to zero.
// ---------------------------------------------------------------------------

export interface PlanarMapSystem {
  /** One stroboscopic-map step at fixed parameter, writing F(state) into out. */
  map(state: Float64Array, parameter: number, out: Float64Array): void;
  /** Analytic fixed point at a parameter (the curve's centre). Found by Newton when absent. */
  center?: (parameter: number) => readonly [number, number];
}

export interface InvariantTorusOptions {
  start: number;
  end: number;
  step: number;
  /** Size of the seeded curve at `start` (radius of the critical-eigenspace ellipse). */
  initialAmplitude: number;
  /** Odd number of collocation phases (>= 9). Default 31. */
  collocation?: number;
  /** Seed for the fixed-point Newton when `center` is not supplied. Default [0, 0]. */
  centerGuess?: readonly [number, number];
  tolerance?: number;
  maxIterations?: number;
  finiteDifferenceEpsilon?: number;
}

export interface InvariantTorusPoint {
  parameter: number;
  /** Rotation number ρ of the conjugate rigid rotation. */
  rotationNumber: number;
  /** Mean distance of the curve from the fixed point (a scalar torus "radius"). */
  amplitude: number;
  /** Genuine invariance error max|F(u(θ)) − u(θ+2πρ)| sampled BETWEEN collocation nodes. */
  invarianceResidual: number;
  /** Collocation samples of the curve, packed [x0,y0, x1,y1, …, x_{M-1},y_{M-1}]. */
  curve: Float64Array;
  /** Fixed point the curve encloses. */
  center: readonly [number, number];
  converged: boolean;
  iterations: number;
}

export interface InvariantTorusContinuation {
  points: InvariantTorusPoint[];
  collocation: number;
  method: string;
  caveat: string;
}

/** Trigonometric-interpolation (Dirichlet) kernel for odd node count m: K(0)=1, K(2πk/m)=δ_{k0}, 2π-periodic. */
function dirichletKernel(phi: number, m: number): number {
  const half = phi / 2;
  const s = Math.sin(half);
  if (Math.abs(s) < 1e-12) return 1; // φ ≡ 0 (mod 2π); the kernel is 2π-periodic for odd m
  return Math.sin(m * half) / (m * s);
}

/** Evaluate F at a planar point and return it as a tuple. */
function applyMap(system: PlanarMapSystem, x0: number, x1: number, parameter: number): [number, number] {
  const out = new Float64Array(2);
  system.map(Float64Array.of(x0, x1), parameter, out);
  return [out[0]!, out[1]!];
}

/** Central-difference 2×2 Jacobian DF of the map at x (rows i, cols k: ∂F_i/∂x_k). */
function mapJacobian(system: PlanarMapSystem, parameter: number, x: readonly [number, number], h: number): number[][] {
  const fpx = applyMap(system, x[0] + h, x[1], parameter);
  const fmx = applyMap(system, x[0] - h, x[1], parameter);
  const fpy = applyMap(system, x[0], x[1] + h, parameter);
  const fmy = applyMap(system, x[0], x[1] - h, parameter);
  return [
    [(fpx[0] - fmx[0]) / (2 * h), (fpy[0] - fmy[0]) / (2 * h)],
    [(fpx[1] - fmx[1]) / (2 * h), (fpy[1] - fmy[1]) / (2 * h)]
  ];
}

/** Newton fixed point of F (solve F(x) − x = 0) from a seed. */
function mapFixedPoint(system: PlanarMapSystem, parameter: number, seed: readonly [number, number], h: number): [number, number] {
  let x: [number, number] = [seed[0], seed[1]];
  for (let it = 0; it < 60; it += 1) {
    const fx = applyMap(system, x[0], x[1], parameter);
    const g0 = fx[0] - x[0];
    const g1 = fx[1] - x[1];
    if (Math.hypot(g0, g1) < 1e-13) break;
    const J = mapJacobian(system, parameter, x, h);
    const a = J[0]![0]! - 1;
    const b = J[0]![1]!;
    const c = J[1]![0]!;
    const d = J[1]![1]! - 1;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-300) break;
    // (J − I) [dx, dy] = [−g0, −g1]
    const dx = (-g0 * d + b * g1) / det;
    const dy = (-g1 * a + c * g0) / det;
    x = [x[0] + dx, x[1] + dy];
  }
  return x;
}

/** Complex eigenpair of a 2×2 focus (complex eigenvalues); null when eigenvalues are real. */
function focusEigenpair(J: number[][]): { alpha: number; vR: [number, number]; vI: [number, number] } | null {
  const a = J[0]![0]!;
  const b = J[0]![1]!;
  const c = J[1]![0]!;
  const d = J[1]![1]!;
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc >= 0) return null;
  const re = tr / 2;
  const im = Math.sqrt(-disc) / 2;
  const alpha = Math.atan2(im, re);
  // Eigenvector of λ = re + i·im: (J − λI)v = 0.
  let v0re: number;
  let v0im: number;
  let v1re: number;
  let v1im: number;
  if (Math.abs(b) > 1e-12) {
    v0re = b; v0im = 0; v1re = re - a; v1im = im;
  } else {
    v0re = re - d; v0im = im; v1re = c; v1im = 0;
  }
  const nrm = Math.hypot(v0re, v0im, v1re, v1im) || 1;
  return { alpha, vR: [v0re / nrm, v1re / nrm], vI: [v0im / nrm, v1im / nrm] };
}

/** Solve A·x = b (A row-major m×m) by Gaussian elimination with partial pivoting; null if singular. */
function solveDense(A: number[][], b: number[]): number[] | null {
  const m = b.length;
  const M = A.map((row, i) => [...row, b[i] ?? 0]);
  for (let col = 0; col < m; col += 1) {
    let pivot = col;
    let best = Math.abs(M[col]![col] ?? 0);
    for (let r = col + 1; r < m; r += 1) {
      const v = Math.abs(M[r]![col] ?? 0);
      if (v > best) { best = v; pivot = r; }
    }
    if (best < 1e-300) return null;
    if (pivot !== col) { const t = M[col]!; M[col] = M[pivot]!; M[pivot] = t; }
    const diag = M[col]![col] ?? 0;
    for (let r = col + 1; r < m; r += 1) {
      const f = (M[r]![col] ?? 0) / diag;
      if (f === 0) continue;
      for (let cc = col; cc <= m; cc += 1) M[r]![cc] = (M[r]![cc] ?? 0) - f * (M[col]![cc] ?? 0);
    }
  }
  const x = new Array<number>(m).fill(0);
  for (let i = m - 1; i >= 0; i -= 1) {
    let acc = M[i]![m] ?? 0;
    for (let j = i + 1; j < m; j += 1) acc -= (M[i]![j] ?? 0) * (x[j] ?? 0);
    x[i] = acc / (M[i]![i] ?? 1);
  }
  return x;
}

function vecNorm(v: readonly number[]): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

/** Spectral first derivative du/dθ at each node (Fourier differentiation matrix, odd m). */
function spectralTangent(curve: readonly number[], m: number): number[] {
  const t = new Array<number>(2 * m).fill(0);
  for (let j = 0; j < m; j += 1) {
    let dx = 0;
    let dy = 0;
    for (let l = 0; l < m; l += 1) {
      if (l === j) continue;
      const w = 0.5 * (((j - l) % 2 === 0) ? 1 : -1) / Math.tan((Math.PI * (j - l)) / m);
      dx += w * curve[2 * l]!;
      dy += w * curve[2 * l + 1]!;
    }
    t[2 * j] = dx;
    t[2 * j + 1] = dy;
  }
  return t;
}

/** Invariance + phase residual: [F(u_j) − u(θ_j+2πρ) for all j, phase condition]. */
function invarianceResidualVector(
  system: PlanarMapSystem,
  parameter: number,
  vars: readonly number[],
  uRef: readonly number[],
  tRef: readonly number[],
  m: number,
  thetas: readonly number[]
): number[] {
  const rho = vars[2 * m]!;
  const res = new Array<number>(2 * m + 1).fill(0);
  for (let j = 0; j < m; j += 1) {
    const img = applyMap(system, vars[2 * j]!, vars[2 * j + 1]!, parameter);
    let sx = 0;
    let sy = 0;
    for (let l = 0; l < m; l += 1) {
      const k = dirichletKernel(thetas[j]! - thetas[l]! + 2 * Math.PI * rho, m);
      sx += k * vars[2 * l]!;
      sy += k * vars[2 * l + 1]!;
    }
    res[2 * j] = img[0] - sx;
    res[2 * j + 1] = img[1] - sy;
  }
  let phase = 0;
  for (let j = 0; j < m; j += 1) {
    phase += (vars[2 * j]! - uRef[2 * j]!) * tRef[2 * j]! + (vars[2 * j + 1]! - uRef[2 * j + 1]!) * tRef[2 * j + 1]!;
  }
  res[2 * m] = phase;
  return res;
}

/** True invariance error, sampled at phases offset from the collocation nodes (the genuine truncation error). */
function offGridInvariance(
  system: PlanarMapSystem,
  parameter: number,
  vars: readonly number[],
  m: number,
  thetas: readonly number[],
  rho: number,
  samples: number
): number {
  let maxErr = 0;
  for (let sidx = 0; sidx < samples; sidx += 1) {
    const phi = (2 * Math.PI * (sidx + 0.5)) / samples;
    let ux = 0;
    let uy = 0;
    let tx = 0;
    let ty = 0;
    for (let l = 0; l < m; l += 1) {
      const ku = dirichletKernel(phi - thetas[l]!, m);
      ux += ku * vars[2 * l]!;
      uy += ku * vars[2 * l + 1]!;
      const kt = dirichletKernel(phi + 2 * Math.PI * rho - thetas[l]!, m);
      tx += kt * vars[2 * l]!;
      ty += kt * vars[2 * l + 1]!;
    }
    const img = applyMap(system, ux, uy, parameter);
    maxErr = Math.max(maxErr, Math.hypot(img[0] - tx, img[1] - ty));
  }
  return maxErr;
}

/**
 * Continue the closed invariant curve born at a generic Neimark–Sacker
 * bifurcation of a 2D stroboscopic map, by trigonometric collocation of the
 * invariance equation F(u(θ)) = u(θ + 2πρ).
 */
export function continueNeimarkSackerTorus(system: PlanarMapSystem, options: InvariantTorusOptions): InvariantTorusContinuation {
  if (!(options.initialAmplitude > 0)) throw new Error('continueNeimarkSackerTorus: initialAmplitude must be positive.');
  if (options.step === 0 || !Number.isFinite(options.step)) throw new Error('continueNeimarkSackerTorus: step must be finite and non-zero.');
  const m = options.collocation ?? 31;
  if (!Number.isInteger(m) || m < 9 || m % 2 === 0) throw new Error('continueNeimarkSackerTorus: collocation must be an odd integer >= 9.');
  const tol = options.tolerance ?? 1e-10;
  const maxIter = options.maxIterations ?? 25;
  const fd = options.finiteDifferenceEpsilon ?? 1e-6;
  const centerGuess = options.centerGuess ?? ([0, 0] as const);

  const thetas = Array.from({ length: m }, (_, j) => (2 * Math.PI * j) / m);
  const dir = options.end >= options.start ? 1 : -1;
  const stepMag = Math.abs(options.step);
  const count = Math.max(0, Math.round(Math.abs(options.end - options.start) / stepMag));
  const signedStep = stepMag * dir;

  const points: InvariantTorusPoint[] = [];
  let warmVars: number[] | null = null;
  let warmRef: number[] | null = null;
  let centerSeed: [number, number] = [centerGuess[0], centerGuess[1]];

  for (let i = 0; i <= count; i += 1) {
    const parameter = i === count ? options.end : options.start + i * signedStep;
    const star = system.center ? system.center(parameter) : mapFixedPoint(system, parameter, centerSeed, fd);
    const xStar: [number, number] = [star[0]!, star[1]!];
    centerSeed = xStar;

    let vars: number[];
    if (warmVars) {
      vars = warmVars.slice();
    } else {
      const eig = focusEigenpair(mapJacobian(system, parameter, xStar, fd));
      const rho0 = eig ? eig.alpha / (2 * Math.PI) : 0.1;
      vars = new Array<number>(2 * m + 1).fill(0);
      for (let j = 0; j < m; j += 1) {
        const c = Math.cos(thetas[j]!);
        const sn = Math.sin(thetas[j]!);
        const ex = eig ? eig.vR[0] * c - eig.vI[0] * sn : c;
        const ey = eig ? eig.vR[1] * c - eig.vI[1] * sn : sn;
        vars[2 * j] = xStar[0] + options.initialAmplitude * ex;
        vars[2 * j + 1] = xStar[1] + options.initialAmplitude * ey;
      }
      vars[2 * m] = rho0;
    }

    const uRef = warmRef ? warmRef.slice() : vars.slice(0, 2 * m);
    const tRef = spectralTangent(uRef, m);
    const n = 2 * m + 1;

    let converged = false;
    let iterations = 0;
    for (let it = 0; it < maxIter; it += 1) {
      iterations = it + 1;
      const r = invarianceResidualVector(system, parameter, vars, uRef, tRef, m, thetas);
      const r0 = vecNorm(r);
      if (r0 <= tol) { converged = true; break; }
      const Jmat: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      for (let kcol = 0; kcol < n; kcol += 1) {
        const h = fd * Math.max(1, Math.abs(vars[kcol]!));
        const vp = vars.slice(); vp[kcol] = vp[kcol]! + h;
        const vm = vars.slice(); vm[kcol] = vm[kcol]! - h;
        const rp = invarianceResidualVector(system, parameter, vp, uRef, tRef, m, thetas);
        const rm = invarianceResidualVector(system, parameter, vm, uRef, tRef, m, thetas);
        for (let irow = 0; irow < n; irow += 1) Jmat[irow]![kcol] = (rp[irow]! - rm[irow]!) / (2 * h);
      }
      const delta = solveDense(Jmat, r.map((v) => -v));
      if (!delta) break;
      // Damped Newton: backtrack until the residual decreases (keeps far-from-onset steps stable).
      let lambda = 1;
      let accepted = false;
      for (let ls = 0; ls < 8; ls += 1) {
        const trial = vars.map((v, idx) => v + lambda * delta[idx]!);
        if (vecNorm(invarianceResidualVector(system, parameter, trial, uRef, tRef, m, thetas)) < r0) {
          vars = trial;
          accepted = true;
          break;
        }
        lambda *= 0.5;
      }
      if (!accepted) for (let idx = 0; idx < n; idx += 1) vars[idx] = vars[idx]! + delta[idx]!;
    }

    const rho = vars[2 * m]!;
    let ampSum = 0;
    for (let j = 0; j < m; j += 1) ampSum += Math.hypot(vars[2 * j]! - xStar[0], vars[2 * j + 1]! - xStar[1]);
    points.push({
      parameter,
      rotationNumber: rho,
      amplitude: ampSum / m,
      invarianceResidual: offGridInvariance(system, parameter, vars, m, thetas, rho, 4 * m),
      curve: Float64Array.from(vars.slice(0, 2 * m)),
      center: xStar,
      converged,
      iterations
    });
    if (converged) {
      warmVars = vars.slice();
      warmRef = vars.slice(0, 2 * m);
    }
  }

  return {
    points,
    collocation: m,
    method:
      'trigonometric-collocation invariant-circle continuation: damped Newton on the M curve samples and rotation number ρ enforcing F(u(θ_j)) = u(θ_j + 2πρ), with a Dirichlet-kernel rotation operator and a Poincaré phase condition',
    caveat:
      'Assumes a smooth, non-folded invariant circle conjugate to rigid rotation. Phase-locked (Arnold-tongue) and strongly resonant parameters break that conjugacy; the off-grid invarianceResidual quantifies truncation at the chosen collocation order.'
  };
}
