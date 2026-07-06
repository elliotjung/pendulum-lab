import { matZeros } from './lqr';

/**
 * Exact solver for the box QP  min 1/2 u^T H u + g^T u  s.t. lo <= u <= hi by
 * active-set enumeration: with m inputs each dimension is free, at its lower,
 * or at its upper bound. Exhaustive and exact for the m <= 3 problems used by
 * the pendulum controllers.
 */
export function boxQpSolve(
  H: readonly (readonly number[])[],
  g: readonly number[],
  lo: readonly number[],
  hi: readonly number[]
): { u: number[]; free: boolean[] } | null {
  const m = g.length;
  if (m > 3) throw new Error('boxQpSolve: active-set enumeration is exact only for m <= 3');
  if (!cholSmall(H)) return null;
  const tol = 1e-12;
  const status = new Array<number>(m).fill(0); // 0 free, 1 lower, 2 upper
  const combos = 3 ** m;
  for (let combo = 0; combo < combos; combo += 1) {
    let rest = combo;
    for (let i = 0; i < m; i += 1) {
      status[i] = rest % 3;
      rest = Math.floor(rest / 3);
    }
    const freeIdx: number[] = [];
    const u = new Array<number>(m).fill(0);
    for (let i = 0; i < m; i += 1) {
      if (status[i] === 0) freeIdx.push(i);
      else u[i] = status[i] === 1 ? lo[i]! : hi[i]!;
    }
    if (freeIdx.length > 0) {
      // Solve H_FF u_F = -(g_F + H_FC u_C).
      const hff = freeIdx.map((r) => freeIdx.map((c) => H[r]![c] ?? 0));
      const rhs = freeIdx.map((r) => {
        let acc = -(g[r] ?? 0);
        for (let c = 0; c < m; c += 1) {
          if (status[c] !== 0) acc -= (H[r]![c] ?? 0) * (u[c] ?? 0);
        }
        return [acc];
      });
      const chol = cholSmall(hff);
      if (!chol) continue; // principal submatrix of PD is PD; defensive only
      const sol = cholSolve(chol, rhs);
      for (let f = 0; f < freeIdx.length; f += 1) u[freeIdx[f]!] = sol[f]![0] ?? 0;
    }
    // KKT check: free inside the box, clamped gradients push into the bound.
    let ok = true;
    for (let i = 0; i < m && ok; i += 1) {
      if (status[i] === 0) {
        ok = u[i]! >= lo[i]! - tol && u[i]! <= hi[i]! + tol;
      } else {
        let grad = g[i] ?? 0;
        for (let c = 0; c < m; c += 1) grad += (H[i]![c] ?? 0) * (u[c] ?? 0);
        ok = status[i] === 1 ? grad >= -tol : grad <= tol;
      }
    }
    if (ok) return { u, free: status.map((s) => s === 0) };
  }
  return null;
}

/** In-place Cholesky of a small symmetric matrix; returns null when not PD. */
export function cholSmall(a: readonly (readonly number[])[]): number[][] | null {
  const n = a.length;
  const l = matZeros(n, n);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let sum = a[i]![j] ?? 0;
      for (let k = 0; k < j; k += 1) sum -= (l[i]![k] ?? 0) * (l[j]![k] ?? 0);
      if (i === j) {
        if (sum <= 0) return null;
        l[i]![i] = Math.sqrt(sum);
      } else {
        l[i]![j] = sum / (l[j]![j] ?? 1);
      }
    }
  }
  return l;
}

/** Solve L L^T x = b for each column of b using a Cholesky factor. */
export function cholSolve(l: readonly (readonly number[])[], b: readonly (readonly number[])[]): number[][] {
  const n = l.length;
  const cols = b[0]?.length ?? 0;
  const x = b.map((row) => row.slice());
  for (let c = 0; c < cols; c += 1) {
    for (let i = 0; i < n; i += 1) {
      let sum = x[i]![c] ?? 0;
      for (let k = 0; k < i; k += 1) sum -= (l[i]![k] ?? 0) * (x[k]![c] ?? 0);
      x[i]![c] = sum / (l[i]![i] ?? 1);
    }
    for (let i = n - 1; i >= 0; i -= 1) {
      let sum = x[i]![c] ?? 0;
      for (let k = i + 1; k < n; k += 1) sum -= (l[k]![i] ?? 0) * (x[k]![c] ?? 0);
      x[i]![c] = sum / (l[i]![i] ?? 1);
    }
  }
  return x;
}
