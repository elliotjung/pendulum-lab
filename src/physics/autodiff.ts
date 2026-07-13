/**
 * Forward-mode automatic differentiation on multi-directional dual numbers.
 *
 * A dual scalar is a Float64Array of length nv+1 laid out as
 * [value, ∂/∂x_0, …, ∂/∂x_{nv−1}]: the value plus its exact gradient with
 * respect to nv independent seed variables. Every arithmetic helper applies
 * the corresponding chain rule to the gradient block, so any computation
 * written with these ops yields machine-precision derivatives — no
 * finite-difference truncation, no hand-derived formulas to transcribe wrong.
 *
 * This powers the exact mass-matrix Jacobians in `jacobians.ts`: the matrix /
 * force assembly of the chain systems is re-expressed in dual arithmetic
 * (mirroring the primal RHS operation by operation, which tests pin against
 * the primal implementation), and the linear solve is then differentiated
 * analytically via ∂(M⁻¹f) = M⁻¹(∂f − ∂M·M⁻¹f).
 *
 * All helpers are aliasing-safe (out may be a or b) because primal values are
 * read into locals before the output is written. Allocation is delegated to
 * {@link DualArena} so hot callers run allocation-free after warm-up.
 */

/** [value, grad_0 … grad_{nv−1}] — see module docs. */
export type DualScalar = Float64Array;

/** Fixed-size pool of dual scalars, reset (not reallocated) per evaluation. */
export class DualArena {
  private readonly slots: DualScalar[];
  private next = 0;

  constructor(
    readonly nv: number,
    capacity: number
  ) {
    const stride = nv + 1;
    const buffer = new Float64Array(stride * capacity);
    this.slots = Array.from({ length: capacity }, (_, i) => buffer.subarray(i * stride, (i + 1) * stride));
  }

  /** Next pooled slot (zeroed). Throws when the arena is exhausted. */
  alloc(): DualScalar {
    const slot = this.slots[this.next];
    if (!slot) throw new Error(`DualArena: capacity ${this.slots.length} exhausted`);
    this.next += 1;
    slot.fill(0);
    return slot;
  }

  reset(): void {
    this.next = 0;
  }
}

/** out ← constant c (zero gradient). */
export function dConst(out: DualScalar, c: number): DualScalar {
  out.fill(0);
  out[0] = c;
  return out;
}

/** out ← seed variable: value v with ∂/∂x_index = 1. */
export function dVar(out: DualScalar, v: number, index: number): DualScalar {
  out.fill(0);
  out[0] = v;
  out[index + 1] = 1;
  return out;
}

export function dAdd(out: DualScalar, a: DualScalar, b: DualScalar): DualScalar {
  for (let i = 0; i < out.length; i += 1) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

export function dSub(out: DualScalar, a: DualScalar, b: DualScalar): DualScalar {
  for (let i = 0; i < out.length; i += 1) out[i] = (a[i] ?? 0) - (b[i] ?? 0);
  return out;
}

/** out ← a·b (product rule on the gradient block). */
export function dMul(out: DualScalar, a: DualScalar, b: DualScalar): DualScalar {
  const av = a[0] ?? 0;
  const bv = b[0] ?? 0;
  out[0] = av * bv;
  for (let i = 1; i < out.length; i += 1) out[i] = av * (b[i] ?? 0) + bv * (a[i] ?? 0);
  return out;
}

/** out ← k·a for a plain number k. */
export function dScale(out: DualScalar, a: DualScalar, k: number): DualScalar {
  for (let i = 0; i < out.length; i += 1) out[i] = k * (a[i] ?? 0);
  return out;
}

/** out ← out + k·a (fused accumulate, the workhorse of matrix assembly). */
export function dAddScaled(out: DualScalar, a: DualScalar, k: number): DualScalar {
  for (let i = 0; i < out.length; i += 1) out[i] = (out[i] ?? 0) + k * (a[i] ?? 0);
  return out;
}

export function dNeg(out: DualScalar, a: DualScalar): DualScalar {
  for (let i = 0; i < out.length; i += 1) out[i] = -(a[i] ?? 0);
  return out;
}

export function dSin(out: DualScalar, a: DualScalar): DualScalar {
  const av = a[0] ?? 0;
  const cos = Math.cos(av);
  out[0] = Math.sin(av);
  for (let i = 1; i < out.length; i += 1) out[i] = cos * (a[i] ?? 0);
  return out;
}

export function dCos(out: DualScalar, a: DualScalar): DualScalar {
  const av = a[0] ?? 0;
  const sin = Math.sin(av);
  out[0] = Math.cos(av);
  for (let i = 1; i < out.length; i += 1) out[i] = -sin * (a[i] ?? 0);
  return out;
}

/**
 * out ← a clamped away from zero: |value| ≥ eps. Mirrors the pole-chart
 * regularisation of the spherical systems: inside the clamp the value is the
 * signed eps and the gradient is zero (the derivative of the *implemented*
 * piecewise function, which is what a Newton solver or variational flow of
 * the regularised RHS needs — not the derivative of the unclamped ideal).
 */
export function dClampAbsMin(out: DualScalar, a: DualScalar, eps: number): DualScalar {
  const av = a[0] ?? 0;
  if (Math.abs(av) < eps) {
    out.fill(0);
    out[0] = av >= 0 ? eps : -eps;
    return out;
  }
  if (out !== a) out.set(a);
  return out;
}

/** Dot product of two dual 3-vectors: out ← Σ aᵢ·bᵢ. */
export function dDot3(
  out: DualScalar,
  a: readonly DualScalar[],
  b: readonly DualScalar[],
  tmp: DualScalar
): DualScalar {
  dMul(out, a[0]!, b[0]!);
  dAdd(out, out, dMul(tmp, a[1]!, b[1]!));
  dAdd(out, out, dMul(tmp, a[2]!, b[2]!));
  return out;
}
