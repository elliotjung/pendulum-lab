import type { Derivative, Jacobian, JacobianTrustMetadata, StateVector } from './types';

/**
 * Shared linear-tangent-space machinery for the chaos diagnostics: a
 * finite-difference Jacobian, an augmented "reference + tangent vectors" RHS
 * that propagates deviation vectors under the variational (linearized) flow,
 * and Gram-Schmidt reorthonormalization. Keeping this in one place means the
 * Lyapunov, SALI and FLI code all share exactly the same tangent dynamics.
 *
 * This lives in `physics/` because it depends only on the physics primitives
 * (a `Derivative`, an optional `Jacobian`, and the state buffers); `chaos/`
 * re-exports it so existing imports keep working.
 *
 * When an exact analytic Jacobian is available (e.g. `jacobianDouble`) it can
 * be injected into `makeVariationalRhs`; otherwise a central-difference
 * Jacobian is used. Central differencing is O(h^2) accurate (error floor
 * ~1e-11 at the optimal step) versus the O(h) forward difference it replaced.
 */

/** Deterministic mulberry32 PRNG so randomized initial frames are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Central-difference Jacobian J[i][j] = d f_i / d x_j, written row-major into
 * `jac` (length n*n). `scratch`, `fPlus` and `fMinus` are length-n work buffers
 * supplied by the caller to avoid per-call allocation. The step is scaled to
 * the cube-root of machine epsilon (~6e-6) where the truncation and round-off
 * errors of a central difference balance, giving ~1e-11 accuracy.
 */
export function numericalJacobian(
  rhs: Derivative,
  x: ArrayLike<number>,
  n: number,
  jac: Float64Array,
  scratch: StateVector,
  fPlus: StateVector,
  fMinus: StateVector
): void {
  for (let i = 0; i < n; i += 1) scratch[i] = Number(x[i] ?? 0);
  for (let j = 0; j < n; j += 1) {
    const xj = Number(x[j] ?? 0);
    const eps = 6e-6 * Math.max(1, Math.abs(xj));
    scratch[j] = xj + eps;
    rhs(scratch, fPlus);
    scratch[j] = xj - eps;
    rhs(scratch, fMinus);
    const inv = 0.5 / eps;
    for (let i = 0; i < n; i += 1) jac[i * n + j] = (Number(fPlus[i] ?? 0) - Number(fMinus[i] ?? 0)) * inv;
    scratch[j] = xj;
  }
}

/**
 * Build an augmented derivative over a state of dimension n*(k+1):
 * [ x (n) , v_1 (n) , ... , v_k (n) ]. The reference x follows f(x); each
 * tangent vector v follows the variational equation v' = J(x) v. If `jacobian`
 * is supplied it provides the exact J(x); otherwise a central-difference
 * approximation is formed each step.
 */
export function makeVariationalRhs(rhs: Derivative, n: number, k: number, jacobian?: Jacobian): Derivative {
  const resolvedJacobian = jacobian ?? rhs.jacobian;
  const fx = new Float64Array(n);
  const jac = new Float64Array(n * n);
  const scratch = new Float64Array(n);
  const fPlus = new Float64Array(n);
  const fMinus = new Float64Array(n);
  const refView = new Float64Array(n);
  return (aug: StateVector, out: StateVector): void => {
    for (let i = 0; i < n; i += 1) refView[i] = Number(aug[i] ?? 0);
    rhs(refView, fx);
    for (let i = 0; i < n; i += 1) out[i] = Number(fx[i] ?? 0);
    if (resolvedJacobian) resolvedJacobian(refView, jac);
    else numericalJacobian(rhs, refView, n, jac, scratch, fPlus, fMinus);
    for (let j = 0; j < k; j += 1) {
      const base = n + j * n;
      for (let r = 0; r < n; r += 1) {
        let acc = 0;
        for (let c = 0; c < n; c += 1) acc += Number(jac[r * n + c] ?? 0) * Number(aug[base + c] ?? 0);
        out[base + r] = acc;
      }
    }
  };
}

export function jacobianTrustMetadata(rhs: Derivative, jacobian?: Jacobian): JacobianTrustMetadata {
  const resolved = jacobian ?? rhs.jacobian;
  const provenance = resolved
    ? rhs.jacobian === resolved
      ? (rhs.jacobianProvenance ?? 'analytic-model')
      : 'analytic-model'
    : 'central-difference';
  return resolved
    ? {
        provenance,
        confidence: 'model-validated',
        caveat:
          'Tangent dynamics use a supplied model/AD Jacobian; model-specific derivative validation still bounds trust.'
      }
    : {
        provenance: 'central-difference',
        confidence: 'numerical-fallback',
        caveat:
          'No validated model Jacobian was supplied; FTLE/Lyapunov accuracy includes central-difference truncation and scale sensitivity.'
      };
}

/**
 * Modified Gram-Schmidt on the k tangent vectors stored as subarray views.
 * Returns the pre-normalization norms (the per-interval growth factors used to
 * accumulate Lyapunov exponents) and normalizes the vectors in place.
 */
export function gramSchmidt(vectors: readonly StateVector[], n: number): number[] {
  const norms: number[] = [];
  for (let i = 0; i < vectors.length; i += 1) {
    const vi = vectors[i]!;
    for (let j = 0; j < i; j += 1) {
      const vj = vectors[j]!;
      let dot = 0;
      for (let r = 0; r < n; r += 1) dot += Number(vi[r] ?? 0) * Number(vj[r] ?? 0);
      for (let r = 0; r < n; r += 1) vi[r] = Number(vi[r] ?? 0) - dot * Number(vj[r] ?? 0);
    }
    let norm = 0;
    for (let r = 0; r < n; r += 1) norm += Number(vi[r] ?? 0) ** 2;
    norm = Math.sqrt(norm);
    norms.push(norm);
    const inv = norm > 0 ? 1 / norm : 0;
    for (let r = 0; r < n; r += 1) vi[r] = Number(vi[r] ?? 0) * inv;
  }
  return norms;
}

/** Seed the k tangent-vector slots of `aug` with a reproducible orthonormal frame. */
export function seedTangentFrame(aug: StateVector, n: number, k: number, seed: number): void {
  const rng = mulberry32(seed);
  const views: StateVector[] = [];
  for (let j = 0; j < k; j += 1) {
    const base = n + j * n;
    for (let r = 0; r < n; r += 1) aug[base + r] = rng() - 0.5;
    views.push(aug.subarray(base, base + n));
  }
  gramSchmidt(views, n);
}
