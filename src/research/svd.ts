/**
 * Thin singular value decomposition for small dense matrices, via the cyclic
 * **Jacobi** eigendecomposition of the smaller Gram matrix (MMᵀ or MᵀM).
 *
 * This is the rank-revealing factorisation behind SVD-truncated ("exact") DMD
 * (`dmd.ts`): it denoises and, crucially, handles the *rank-deficient* case
 * (more observables than independent dynamic modes) where the normal-equations
 * DMD operator is singular. The Jacobi eigensolver is unconditionally convergent
 * and backward-stable for symmetric matrices, so the dominant singular triplets
 * — the only ones a low-rank truncation keeps — are accurate.
 *
 * The Gram route squares the singular values (σ = √λ), so the *smallest* σ lose
 * relative precision; that is irrelevant for the dominant-mode use case and is
 * the documented scope (a one-sided Jacobi SVD would be needed for tiny σ).
 */

/** Symmetric eigendecomposition A = V Λ Vᵀ (Λ descending), via cyclic Jacobi. */
export interface SymmetricEigenResult {
  /** Eigenvalues in descending order. */
  values: number[];
  /** Eigenvectors as columns, row-major n×n, aligned with `values`. */
  vectors: number[];
}

/**
 * Cyclic Jacobi eigendecomposition of a symmetric n×n matrix (row-major). The
 * input is not modified. Eigenpairs are returned sorted by descending eigenvalue.
 */
export function jacobiEigenSymmetric(
  input: readonly number[],
  n: number,
  maxSweeps = 100,
  tolerance = 1e-15
): SymmetricEigenResult {
  if (n < 1) throw new Error('jacobiEigenSymmetric: n must be ≥ 1.');
  const a = Float64Array.from(input);
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) v[i * n + i] = 1;

  const offDiagNorm = (): number => {
    let s = 0;
    for (let p = 0; p < n; p += 1) for (let q = p + 1; q < n; q += 1) s += (a[p * n + q] ?? 0) ** 2;
    return Math.sqrt(s);
  };

  for (let sweep = 0; sweep < maxSweeps; sweep += 1) {
    if (offDiagNorm() < tolerance) break;
    for (let p = 0; p < n; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = a[p * n + q] ?? 0;
        if (Math.abs(apq) < 1e-300) continue;
        const app = a[p * n + p] ?? 0;
        const aqq = a[q * n + q] ?? 0;
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        // Update the two pivot diagonals; zero the pivot off-diagonal.
        a[p * n + p] = app - t * apq;
        a[q * n + q] = aqq + t * apq;
        a[p * n + q] = 0;
        a[q * n + p] = 0;
        // Rotate the remaining entries of rows/cols p and q.
        for (let i = 0; i < n; i += 1) {
          if (i === p || i === q) continue;
          const aip = a[i * n + p] ?? 0;
          const aiq = a[i * n + q] ?? 0;
          a[i * n + p] = c * aip - s * aiq;
          a[p * n + i] = a[i * n + p]!;
          a[i * n + q] = s * aip + c * aiq;
          a[q * n + i] = a[i * n + q]!;
        }
        // Accumulate the rotation into the eigenvector matrix.
        for (let i = 0; i < n; i += 1) {
          const vip = v[i * n + p] ?? 0;
          const viq = v[i * n + q] ?? 0;
          v[i * n + p] = c * vip - s * viq;
          v[i * n + q] = s * vip + c * viq;
        }
      }
    }
  }

  const order = Array.from({ length: n }, (_, i) => i).sort((i, j) => (a[j * n + j] ?? 0) - (a[i * n + i] ?? 0));
  const values = order.map((i) => a[i * n + i] ?? 0);
  const vectors = new Array<number>(n * n).fill(0);
  for (let col = 0; col < n; col += 1) {
    const src = order[col]!;
    for (let row = 0; row < n; row += 1) vectors[row * n + col] = v[row * n + src] ?? 0;
  }
  return { values, vectors };
}

/** Thin SVD M = U diag(σ) Vᵀ, truncated to the numerically non-zero σ. */
export interface SvdResult {
  rows: number;
  cols: number;
  /** Number of retained singular values (the numerical rank, ≤ maxRank). */
  rank: number;
  /** Retained singular values, descending. */
  singularValues: number[];
  /** Left singular vectors as columns, row-major rows×rank. */
  u: number[];
  /** Right singular vectors as columns, row-major cols×rank. */
  v: number[];
}

/**
 * Thin SVD of a real `rows`×`cols` matrix (row-major) via the smaller Gram
 * matrix. Singular values below `tolerance`·σ_max (or beyond `maxRank`) are
 * dropped. Returns U (rows×rank), σ (rank), V (cols×rank) with M ≈ U Σ Vᵀ.
 */
export function thinSvd(
  matrix: readonly number[],
  rows: number,
  cols: number,
  options: { maxRank?: number; tolerance?: number } = {}
): SvdResult {
  if (rows < 1 || cols < 1) throw new Error('thinSvd: rows and cols must be ≥ 1.');
  if (matrix.length < rows * cols) throw new Error('thinSvd: matrix shorter than rows·cols.');
  const tol = options.tolerance ?? 1e-12;
  const maxRank = options.maxRank ?? Math.min(rows, cols);

  // Use the smaller Gram: MMᵀ (rows×rows) if rows ≤ cols, else MᵀM (cols×cols).
  const small = Math.min(rows, cols);
  const useLeft = rows <= cols; // eigen-decompose MMᵀ → left vectors
  const gram = new Array<number>(small * small).fill(0);
  for (let i = 0; i < small; i += 1) {
    for (let j = i; j < small; j += 1) {
      let s = 0;
      if (useLeft) {
        for (let k = 0; k < cols; k += 1) s += (matrix[i * cols + k] ?? 0) * (matrix[j * cols + k] ?? 0);
      } else {
        for (let k = 0; k < rows; k += 1) s += (matrix[k * cols + i] ?? 0) * (matrix[k * cols + j] ?? 0);
      }
      gram[i * small + j] = s;
      gram[j * small + i] = s;
    }
  }

  const { values, vectors } = jacobiEigenSymmetric(gram, small);
  const sigmaMax = Math.sqrt(Math.max(values[0] ?? 0, 0));
  const cutoff = sigmaMax > 0 ? tol * sigmaMax : 0;

  const singularValues: number[] = [];
  const baseVectors: number[][] = []; // the computed-side singular vectors (columns)
  for (let k = 0; k < small && singularValues.length < maxRank; k += 1) {
    const sigma = Math.sqrt(Math.max(values[k] ?? 0, 0));
    if (sigma <= cutoff) break;
    singularValues.push(sigma);
    const col = new Array<number>(small).fill(0);
    for (let i = 0; i < small; i += 1) col[i] = vectors[i * small + k] ?? 0;
    baseVectors.push(col);
  }
  const rank = singularValues.length;

  // baseVectors are U (length rows) if useLeft, else V (length cols).
  // Derive the other side by projection: V_j = Mᵀ u_j / σ_j  (or U_j = M v_j / σ_j).
  const u = new Array<number>(rows * rank).fill(0);
  const vOut = new Array<number>(cols * rank).fill(0);
  for (let j = 0; j < rank; j += 1) {
    const sigma = singularValues[j]!;
    const base = baseVectors[j]!;
    if (useLeft) {
      for (let i = 0; i < rows; i += 1) u[i * rank + j] = base[i]!;
      for (let c = 0; c < cols; c += 1) {
        let s = 0;
        for (let r = 0; r < rows; r += 1) s += (matrix[r * cols + c] ?? 0) * base[r]!;
        vOut[c * rank + j] = s / sigma;
      }
    } else {
      for (let c = 0; c < cols; c += 1) vOut[c * rank + j] = base[c]!;
      for (let r = 0; r < rows; r += 1) {
        let s = 0;
        for (let c = 0; c < cols; c += 1) s += (matrix[r * cols + c] ?? 0) * base[c]!;
        u[r * rank + j] = s / sigma;
      }
    }
  }

  return { rows, cols, rank, singularValues, u, v: vOut };
}
