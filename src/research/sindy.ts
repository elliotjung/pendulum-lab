/**
 * SINDy — Sparse Identification of Nonlinear Dynamics (Brunton, Proctor & Kutz,
 * PNAS 2016). Where {@link parameterEstimation} recovers the *values* of known
 * physical parameters, SINDy recovers the *functional form* of the governing
 * equations: given samples of the state x and its derivative ẋ, it finds a
 * sparse coefficient matrix Ξ in
 *
 *     ẋ = Θ(x) Ξ
 *
 * where Θ(x) is a library of candidate functions (polynomials, optionally
 * sines/cosines). The sparsity is found by Sequential Thresholded Least Squares
 * (STLSQ): solve the least-squares problem, zero every coefficient below a
 * threshold λ, and refit on the surviving terms — repeating until the support
 * stops changing. The result is the *smallest* model consistent with the data,
 * which for a true polynomial/trig system is the exact governing equation.
 *
 * This is the data-driven mirror of the rest of the engine: feed it a trajectory
 * (or a sampled vector field) produced by `rhsDuffing`, `rhsDouble`, a pendulum,
 * etc., and it reconstructs the very RHS that generated the data, recovering the
 * published coefficients to round-off when the derivatives are exact. It is
 * dependency-free apart from the engine's own SPD linear solver.
 *
 * Scope/limitations: the basis is fixed (total-degree polynomials + optional
 * single-argument trig); strongly non-polynomial responses, correlated/redundant
 * libraries, or noisy derivatives need a richer basis, a ridge term, or
 * derivative smoothing. STLSQ is a greedy thresholding heuristic, not a global
 * sparse optimum.
 */
import { solveCholeskyInPlace } from '../physics/linearSolve';

/** Candidate-function library specification. */
export interface SindyLibrarySpec {
  /** Maximum total polynomial degree (≥ 0). Degree 0 is the constant term only. */
  polynomialDegree: number;
  /** Also include sin(x_i) and cos(x_i) for every state coordinate. Default false. */
  includeTrig?: boolean;
}

/** One column of the feature library Θ. */
export interface SindyTerm {
  /** Human-readable name, e.g. "1", "x0", "x0 x1", "x1^2", "sin(x0)". */
  name: string;
  /** Polynomial exponents per state dimension; present for polynomial terms. */
  exponents?: number[];
  /** Trig descriptor; present for sin/cos terms. */
  trig?: { fn: 'sin' | 'cos'; state: number };
}

/** STLSQ controls. */
export interface SindyOptions {
  /** Sparsity threshold λ: coefficients with |ξ| < λ are pruned between refits. */
  threshold: number;
  /** Maximum STLSQ refit iterations. Default 10. */
  maxIterations?: number;
  /** Tikhonov (ridge) value added to the normal-equations diagonal. Default 0. */
  ridge?: number;
}

/** A single identified equation ẋ_j = Σ ξ_c Θ_c(x). */
export interface SindyEquation {
  /** Index of the state coordinate whose derivative this equation models. */
  stateIndex: number;
  /** Coefficient per library term, aligned with {@link SindyResult.terms} (0 = pruned). */
  coefficients: number[];
  /** Surviving (nonzero) terms with their coefficients, for readability. */
  activeTerms: Array<{ term: string; coefficient: number }>;
  /** Coefficient of determination R² of the sparse fit on the supplied data. */
  rSquared: number;
  /** Euclidean norm of the residual Θξ − ẋ_j over the samples. */
  residualNorm: number;
}

/** Full SINDy identification result. */
export interface SindyResult {
  /** Library term descriptors (the columns of Θ, shared by every equation). */
  terms: SindyTerm[];
  /** One identified equation per state dimension. */
  equations: SindyEquation[];
  /** The sparsity threshold used. */
  threshold: number;
}

function rectangular(rows: readonly number[][], what: string): number {
  if (rows.length === 0) throw new Error(`SINDy: ${what} is empty.`);
  const width = rows[0]!.length;
  if (width === 0) throw new Error(`SINDy: ${what} rows have zero width.`);
  for (const row of rows) {
    if (row.length !== width) throw new Error(`SINDy: ${what} is not rectangular.`);
  }
  return width;
}

/** All exponent tuples over `dim` states with total degree ≤ `maxDegree`. */
function polynomialExponents(dim: number, maxDegree: number): number[][] {
  if (!Number.isInteger(maxDegree) || maxDegree < 0) {
    throw new Error('SINDy: polynomialDegree must be a non-negative integer.');
  }
  if (dim === 0) return [[]];
  const out: number[][] = [];
  const current = new Array<number>(dim).fill(0);
  const recurse = (pos: number, remaining: number): void => {
    if (pos === dim - 1) {
      for (let e = 0; e <= remaining; e += 1) {
        const tuple = current.slice();
        tuple[pos] = e;
        out.push(tuple);
      }
      return;
    }
    for (let e = 0; e <= remaining; e += 1) {
      current[pos] = e;
      recurse(pos + 1, remaining - e);
    }
    current[pos] = 0;
  };
  recurse(0, maxDegree);
  // Order by total degree, then by exponents — constant first, neat naming.
  const total = (t: number[]): number => t.reduce((s, e) => s + e, 0);
  out.sort((a, b) => {
    const da = total(a);
    const db = total(b);
    if (da !== db) return da - db;
    for (let i = 0; i < dim; i += 1) {
      if (a[i] !== b[i]) return (b[i] ?? 0) - (a[i] ?? 0);
    }
    return 0;
  });
  return out;
}

function polynomialName(exponents: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < exponents.length; i += 1) {
    const e = exponents[i] ?? 0;
    if (e === 0) continue;
    parts.push(e === 1 ? `x${i}` : `x${i}^${e}`);
  }
  return parts.length === 0 ? '1' : parts.join(' ');
}

function evaluateTerm(term: SindyTerm, state: readonly number[]): number {
  if (term.trig) {
    const arg = state[term.trig.state] ?? 0;
    return term.trig.fn === 'sin' ? Math.sin(arg) : Math.cos(arg);
  }
  const exponents = term.exponents ?? [];
  let value = 1;
  for (let i = 0; i < exponents.length; i += 1) {
    const e = exponents[i] ?? 0;
    if (e !== 0) value *= Math.pow(state[i] ?? 0, e);
  }
  return value;
}

/**
 * Build the feature library Θ for a set of state samples: returns the term
 * descriptors and the N×M design matrix Θ (row per sample, column per term).
 */
export function buildFeatureLibrary(
  states: readonly number[][],
  spec: SindyLibrarySpec
): { terms: SindyTerm[]; theta: number[][] } {
  const dim = rectangular(states, 'states');
  const terms: SindyTerm[] = polynomialExponents(dim, spec.polynomialDegree).map((exponents) => ({
    name: polynomialName(exponents),
    exponents
  }));
  if (spec.includeTrig) {
    for (let i = 0; i < dim; i += 1) {
      terms.push({ name: `sin(x${i})`, trig: { fn: 'sin', state: i } });
      terms.push({ name: `cos(x${i})`, trig: { fn: 'cos', state: i } });
    }
  }
  const theta = states.map((row) => terms.map((term) => evaluateTerm(term, row)));
  return { terms, theta };
}

/** Ordinary least squares on a subset of columns via the SPD normal equations. */
function leastSquaresActive(
  theta: readonly number[][],
  target: readonly number[],
  activeCols: readonly number[],
  ridge: number
): number[] {
  const n = theta.length;
  const k = activeCols.length;
  const gram = new Float64Array(k * k);
  const rhs = new Float64Array(k);
  for (let p = 0; p < k; p += 1) {
    const cp = activeCols[p]!;
    let r = 0;
    for (let row = 0; row < n; row += 1) r += (theta[row]![cp] ?? 0) * (target[row] ?? 0);
    rhs[p] = r;
    for (let q = p; q < k; q += 1) {
      const cq = activeCols[q]!;
      let g = 0;
      for (let row = 0; row < n; row += 1) g += (theta[row]![cp] ?? 0) * (theta[row]![cq] ?? 0);
      if (p === q) g += ridge;
      gram[p * k + q] = g;
      gram[q * k + p] = g;
    }
  }
  const factor = new Float64Array(k * k);
  const result = solveCholeskyInPlace(gram, rhs, k, factor, { fallbackPolicy: 'return-diagnostics' });
  if (!result.ok) {
    throw new Error(
      `SINDy least squares: normal equations are not positive-definite (${result.reason}); the library is rank-deficient on this data — supply richer/more samples, lower polynomialDegree, or add a ridge term.`
    );
  }
  return Array.from(rhs);
}

/** Sequential Thresholded Least Squares for one target column. */
function stlsq(
  theta: readonly number[][],
  target: readonly number[],
  termCount: number,
  threshold: number,
  maxIterations: number,
  ridge: number
): number[] {
  let active: number[] = Array.from({ length: termCount }, (_, i) => i);
  let xi = new Array<number>(termCount).fill(0);
  const seed = leastSquaresActive(theta, target, active, ridge);
  for (let p = 0; p < active.length; p += 1) xi[active[p]!] = seed[p]!;

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const nextActive = active.filter((i) => Math.abs(xi[i]!) >= threshold);
    if (nextActive.length === active.length) break; // support unchanged → converged
    active = nextActive;
    xi = new Array<number>(termCount).fill(0);
    if (active.length === 0) break;
    const refit = leastSquaresActive(theta, target, active, ridge);
    for (let p = 0; p < active.length; p += 1) xi[active[p]!] = refit[p]!;
  }
  return xi;
}

/**
 * Identify a sparse dynamical model ẋ = Θ(x) Ξ from state samples and their
 * derivatives. `states[n]` and `derivatives[n]` are the n-th sample of x and ẋ
 * (same length and dimension); the derivatives can be exact (from the engine
 * RHS) or estimated (see {@link finiteDifferenceDerivatives}).
 */
export function identifyDynamics(
  states: readonly number[][],
  derivatives: readonly number[][],
  spec: SindyLibrarySpec,
  options: SindyOptions
): SindyResult {
  rectangular(states, 'states');
  const stateDim = rectangular(derivatives, 'derivatives');
  if (states.length !== derivatives.length) {
    throw new Error('SINDy: states and derivatives must have the same number of samples.');
  }
  if (!(options.threshold >= 0)) throw new Error('SINDy: threshold must be ≥ 0.');
  const maxIterations = options.maxIterations ?? 10;
  const ridge = options.ridge ?? 0;
  const { terms, theta } = buildFeatureLibrary(states, spec);
  const termCount = terms.length;

  const equations: SindyEquation[] = [];
  for (let j = 0; j < stateDim; j += 1) {
    const target = derivatives.map((row) => row[j] ?? 0);
    const coefficients = stlsq(theta, target, termCount, options.threshold, maxIterations, ridge);

    const mean = target.reduce((s, t) => s + t, 0) / target.length;
    let ssRes = 0;
    let ssTot = 0;
    for (let row = 0; row < theta.length; row += 1) {
      let predicted = 0;
      for (let c = 0; c < termCount; c += 1) predicted += coefficients[c]! * (theta[row]![c] ?? 0);
      const residual = predicted - (target[row] ?? 0);
      ssRes += residual * residual;
      ssTot += (target[row]! - mean) ** 2;
    }
    const residualNorm = Math.sqrt(ssRes);
    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : ssRes < 1e-20 ? 1 : 0;
    const activeTerms = terms
      .map((t, c) => ({ term: t.name, coefficient: coefficients[c]! }))
      .filter((entry) => entry.coefficient !== 0);
    equations.push({ stateIndex: j, coefficients, activeTerms, rSquared, residualNorm });
  }

  return { terms, equations, threshold: options.threshold };
}

/**
 * Central-difference estimate of ẋ from a uniformly-sampled trajectory (forward
 * / backward differences at the endpoints). O(dt²) interior accuracy — the
 * realistic SINDy input when only x(t) is observed.
 */
export function finiteDifferenceDerivatives(states: readonly number[][], dt: number): number[][] {
  const n = states.length;
  if (n < 2) throw new Error('finiteDifferenceDerivatives: need at least two samples.');
  if (!(dt > 0)) throw new Error('finiteDifferenceDerivatives: dt must be positive.');
  const dim = rectangular(states, 'states');
  const out: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    const d = new Array<number>(dim).fill(0);
    for (let k = 0; k < dim; k += 1) {
      if (i === 0) d[k] = ((states[1]![k] ?? 0) - (states[0]![k] ?? 0)) / dt;
      else if (i === n - 1) d[k] = ((states[n - 1]![k] ?? 0) - (states[n - 2]![k] ?? 0)) / dt;
      else d[k] = ((states[i + 1]![k] ?? 0) - (states[i - 1]![k] ?? 0)) / (2 * dt);
    }
    out.push(d);
  }
  return out;
}
