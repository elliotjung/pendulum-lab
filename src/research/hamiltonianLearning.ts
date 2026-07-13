/**
 * **Hamiltonian learning** — recover the Hamiltonian H(q, p) of a conservative
 * system from sampled phase-space states and their time derivatives, by fitting
 * the canonical equations
 *
 *     q̇_i = +∂H/∂p_i,     ṗ_i = −∂H/∂q_i.
 *
 * Writing H = Σ_k c_k φ_k(q, p) in a fixed feature library makes both equations
 * **linear in the coefficients c_k**, so the fit is a single closed-form
 * (ridge) least-squares solve — the convex, deterministic cousin of a
 * Hamiltonian Neural Network (Greydanus et al. 2019). The HNN learns H with a
 * neural net trained by gradient descent to make the *same* canonical-equation
 * residual small; here the network is replaced by a linear-in-parameters
 * expansion, so the global optimum is reached in one solve with no iterative
 * training, no learning-rate tuning, and no random initialisation. It is the
 * energy-conserving sibling of {@link identifyDynamics} (SINDy): SINDy fits ẋ
 * freely, this fits ẋ *through a scalar potential*, so the recovered flow is
 * symplectic by construction and conserves the learned H exactly.
 *
 * The additive constant of H is unobservable (it drops out of every derivative),
 * so the constant feature is excluded and H is recovered up to that gauge. With
 * exact derivatives — e.g. sampled directly from a known field on a phase-space
 * grid — the published coefficients come back to round-off; the pendulum
 * (½p² + mgl(1−cos q)), the harmonic oscillator and the Duffing double well are
 * all recovered from their own canonical fields.
 *
 * Scope: a fixed library of total-degree monomials in (q, p) plus optional
 * single-coordinate cos/sin terms; strongly non-polynomial Hamiltonians need a
 * richer basis, and noisy derivatives need a ridge term or smoothing — exactly
 * as for SINDy. Dependency-free apart from the engine's SPD linear solver.
 */
import { solveCholeskyInPlace } from '../physics/linearSolve';

export interface HamiltonianLibrarySpec {
  /** Degrees of freedom n: q and p are each length-n vectors. */
  degreesOfFreedom: number;
  /** Maximum total polynomial degree in the 2n variables (q…, p…), ≥ 1. */
  polynomialDegree: number;
  /** Coordinates q_i (0-based) to also expand with cos(q_i) and sin(q_i). */
  trigCoordinates?: number[];
}

export interface HamiltonianTerm {
  /** Human-readable name, e.g. "p0^2", "q0 q1", "cos(q0)". */
  name: string;
  kind: 'poly' | 'cos' | 'sin';
  /** Exponents over the 2n variables [q_0..q_{n-1}, p_0..p_{n-1}] (poly terms). */
  exponents?: number[];
  /** Coordinate index of a trig term. */
  coordinate?: number;
}

export interface HamiltonianModel {
  /** Degrees of freedom. */
  degreesOfFreedom: number;
  /** Gradient-contributing feature terms (the unobservable constant is excluded). */
  terms: HamiltonianTerm[];
  /** Fitted coefficient per term, aligned with {@link terms}. */
  coefficients: number[];
  /** Euclidean norm of the canonical-equation residual over all samples. */
  residualNorm: number;
  /** Coefficient of determination R² of the canonical-equation fit. */
  rSquared: number;
}

export interface HamiltonianLearningOptions {
  /** Tikhonov ridge β added to the normal-equations diagonal. Default 0. */
  ridge?: number;
}

/** All exponent tuples over `vars` variables with total degree in [0, maxDegree]. */
function totalDegreeExponents(vars: number, maxDegree: number): number[][] {
  if (!Number.isInteger(maxDegree) || maxDegree < 1) {
    throw new Error('learnHamiltonian: polynomialDegree must be an integer ≥ 1.');
  }
  const out: number[][] = [];
  const current = new Array<number>(vars).fill(0);
  const recurse = (pos: number, remaining: number): void => {
    if (pos === vars - 1) {
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
  const total = (t: number[]): number => t.reduce((s, e) => s + e, 0);
  out.sort((a, b) => {
    const da = total(a);
    const db = total(b);
    if (da !== db) return da - db;
    for (let i = 0; i < vars; i += 1) if (a[i] !== b[i]) return (b[i] ?? 0) - (a[i] ?? 0);
    return 0;
  });
  return out;
}

function polyName(exponents: number[], n: number): string {
  const parts: string[] = [];
  for (let v = 0; v < exponents.length; v += 1) {
    const e = exponents[v] ?? 0;
    if (e === 0) continue;
    const label = v < n ? `q${v}` : `p${v - n}`;
    parts.push(e === 1 ? label : `${label}^${e}`);
  }
  return parts.length === 0 ? '1' : parts.join(' ');
}

/** Value of a polynomial term at variable vector x (length 2n). */
function polyValue(exponents: number[], x: readonly number[]): number {
  let value = 1;
  for (let v = 0; v < exponents.length; v += 1) {
    const e = exponents[v] ?? 0;
    if (e !== 0) value *= Math.pow(x[v] ?? 0, e);
  }
  return value;
}

/** Partial derivative ∂(poly)/∂x_w at x. */
function polyDerivative(exponents: number[], x: readonly number[], w: number): number {
  const ew = exponents[w] ?? 0;
  if (ew === 0) return 0;
  let value = ew;
  for (let v = 0; v < exponents.length; v += 1) {
    const e = exponents[v] ?? 0;
    if (e === 0) continue;
    const power = v === w ? e - 1 : e;
    if (power !== 0) value *= Math.pow(x[v] ?? 0, power);
  }
  return value;
}

/** ∂φ_term/∂x_w at x (covers poly, cos, sin). */
function termDerivative(term: HamiltonianTerm, x: readonly number[], w: number): number {
  if (term.kind === 'poly') return polyDerivative(term.exponents ?? [], x, w);
  const c = term.coordinate ?? 0;
  if (w !== c) return 0;
  return term.kind === 'cos' ? -Math.sin(x[c] ?? 0) : Math.cos(x[c] ?? 0);
}

/** φ_term value at x (covers poly, cos, sin). */
function termValue(term: HamiltonianTerm, x: readonly number[]): number {
  if (term.kind === 'poly') return polyValue(term.exponents ?? [], x);
  const c = term.coordinate ?? 0;
  return term.kind === 'cos' ? Math.cos(x[c] ?? 0) : Math.sin(x[c] ?? 0);
}

function buildTerms(spec: HamiltonianLibrarySpec): HamiltonianTerm[] {
  const n = spec.degreesOfFreedom;
  if (!Number.isInteger(n) || n < 1) throw new Error('learnHamiltonian: degreesOfFreedom must be a positive integer.');
  const vars = 2 * n;
  const terms: HamiltonianTerm[] = [];
  for (const exponents of totalDegreeExponents(vars, spec.polynomialDegree)) {
    if (exponents.every((e) => e === 0)) continue; // drop the unobservable constant
    terms.push({ name: polyName(exponents, n), kind: 'poly', exponents });
  }
  for (const c of spec.trigCoordinates ?? []) {
    if (!Number.isInteger(c) || c < 0 || c >= n)
      throw new Error(`learnHamiltonian: trig coordinate ${c} out of range.`);
    terms.push({ name: `cos(q${c})`, kind: 'cos', coordinate: c });
    terms.push({ name: `sin(q${c})`, kind: 'sin', coordinate: c });
  }
  if (terms.length === 0) throw new Error('learnHamiltonian: empty feature library.');
  return terms;
}

function rectangular(rows: readonly (readonly number[])[], what: string, dim: number): void {
  for (const row of rows)
    if (row.length !== dim) throw new Error(`learnHamiltonian: every ${what} row must have length ${dim}.`);
}

/**
 * Learn H(q, p) from phase-space samples and their derivatives. Each `q[i]`,
 * `p[i]`, `qDot[i]`, `pDot[i]` is the i-th sample (length = degreesOfFreedom).
 * The derivatives can be exact (sampled from a known field) or estimated.
 */
export function learnHamiltonian(
  q: readonly (readonly number[])[],
  p: readonly (readonly number[])[],
  qDot: readonly (readonly number[])[],
  pDot: readonly (readonly number[])[],
  spec: HamiltonianLibrarySpec,
  options: HamiltonianLearningOptions = {}
): HamiltonianModel {
  const n = spec.degreesOfFreedom;
  const samples = q.length;
  if (samples === 0) throw new Error('learnHamiltonian: no samples.');
  if (p.length !== samples || qDot.length !== samples || pDot.length !== samples) {
    throw new Error('learnHamiltonian: q, p, qDot, pDot must have the same number of samples.');
  }
  rectangular(q, 'q', n);
  rectangular(p, 'p', n);
  rectangular(qDot, 'qDot', n);
  rectangular(pDot, 'pDot', n);
  const ridge = options.ridge ?? 0;
  const terms = buildTerms(spec);
  const F = terms.length;
  const vars = 2 * n;

  // Stack rows: for each sample and each DOF i, a q̇_i row (∂φ/∂p_i) and a ṗ_i
  // row (−∂φ/∂q_i). Solve the normal equations (AᵀA + βI) c = Aᵀb directly.
  const gram = new Float64Array(F * F);
  const rhs = new Float64Array(F);
  const x = new Array<number>(vars).fill(0);
  const rowQ = new Float64Array(F); // ∂φ_k/∂p_i for the current (sample, i)
  const rowP = new Float64Array(F); // −∂φ_k/∂q_i
  let ssTot = 0;
  let bMean = 0;
  let bCount = 0;
  // First pass for the target mean (for R²).
  for (let s = 0; s < samples; s += 1) {
    for (let i = 0; i < n; i += 1) {
      bMean += (qDot[s]![i] ?? 0) + (pDot[s]![i] ?? 0);
      bCount += 2;
    }
  }
  bMean /= bCount;

  for (let s = 0; s < samples; s += 1) {
    for (let v = 0; v < n; v += 1) {
      x[v] = q[s]![v] ?? 0;
      x[n + v] = p[s]![v] ?? 0;
    }
    for (let i = 0; i < n; i += 1) {
      for (let k = 0; k < F; k += 1) {
        rowQ[k] = termDerivative(terms[k]!, x, n + i); // ∂φ_k/∂p_i
        rowP[k] = -termDerivative(terms[k]!, x, i); // −∂φ_k/∂q_i
      }
      const bQ = qDot[s]![i] ?? 0;
      const bP = pDot[s]![i] ?? 0;
      ssTot += (bQ - bMean) ** 2 + (bP - bMean) ** 2;
      for (let a = 0; a < F; a += 1) {
        rhs[a] = (rhs[a] ?? 0) + (rowQ[a] ?? 0) * bQ + (rowP[a] ?? 0) * bP;
        const ga = a * F;
        for (let b = a; b < F; b += 1) {
          gram[ga + b] = (gram[ga + b] ?? 0) + (rowQ[a] ?? 0) * (rowQ[b] ?? 0) + (rowP[a] ?? 0) * (rowP[b] ?? 0);
        }
      }
    }
  }
  // Symmetrise + ridge.
  for (let a = 0; a < F; a += 1) {
    gram[a * F + a] = (gram[a * F + a] ?? 0) + ridge;
    for (let b = a + 1; b < F; b += 1) gram[b * F + a] = gram[a * F + b] ?? 0;
  }

  const factor = new Float64Array(F * F);
  const solution = solveCholeskyInPlace(gram, rhs, F, factor, { fallbackPolicy: 'return-diagnostics' });
  if (!solution.ok) {
    throw new Error(
      `learnHamiltonian: canonical normal equations not positive-definite (${solution.reason}); the library is rank-deficient on this data — add samples, lower the degree, drop redundant trig terms, or add a ridge term.`
    );
  }
  const coefficients = Array.from(rhs.subarray(0, F));

  // Residual + R² of the canonical-equation fit.
  let ssRes = 0;
  for (let s = 0; s < samples; s += 1) {
    for (let v = 0; v < n; v += 1) {
      x[v] = q[s]![v] ?? 0;
      x[n + v] = p[s]![v] ?? 0;
    }
    for (let i = 0; i < n; i += 1) {
      let predQ = 0;
      let predP = 0;
      for (let k = 0; k < F; k += 1) {
        predQ += (coefficients[k] ?? 0) * termDerivative(terms[k]!, x, n + i);
        predP += (coefficients[k] ?? 0) * -termDerivative(terms[k]!, x, i);
      }
      ssRes += (predQ - (qDot[s]![i] ?? 0)) ** 2 + (predP - (pDot[s]![i] ?? 0)) ** 2;
    }
  }
  return {
    degreesOfFreedom: n,
    terms,
    coefficients,
    residualNorm: Math.sqrt(ssRes),
    rSquared: ssTot > 0 ? 1 - ssRes / ssTot : ssRes < 1e-20 ? 1 : 0
  };
}

/** Evaluate the learned Hamiltonian H(q, p) (up to its unobservable constant). */
export function evaluateHamiltonian(model: HamiltonianModel, q: readonly number[], p: readonly number[]): number {
  const n = model.degreesOfFreedom;
  if (q.length !== n || p.length !== n)
    throw new Error('evaluateHamiltonian: q and p must have length degreesOfFreedom.');
  const x = new Array<number>(2 * n).fill(0);
  for (let v = 0; v < n; v += 1) {
    x[v] = q[v] ?? 0;
    x[n + v] = p[v] ?? 0;
  }
  let h = 0;
  for (let k = 0; k < model.terms.length; k += 1) h += (model.coefficients[k] ?? 0) * termValue(model.terms[k]!, x);
  return h;
}

/**
 * Canonical vector field of the learned H: q̇_i = ∂H/∂p_i, ṗ_i = −∂H/∂q_i —
 * the symplectic flow the model predicts (the natural integrand for checking
 * energy conservation against the recovered H).
 */
export function hamiltonianVectorField(
  model: HamiltonianModel,
  q: readonly number[],
  p: readonly number[]
): { qDot: number[]; pDot: number[] } {
  const n = model.degreesOfFreedom;
  if (q.length !== n || p.length !== n)
    throw new Error('hamiltonianVectorField: q and p must have length degreesOfFreedom.');
  const x = new Array<number>(2 * n).fill(0);
  for (let v = 0; v < n; v += 1) {
    x[v] = q[v] ?? 0;
    x[n + v] = p[v] ?? 0;
  }
  const qDot = new Array<number>(n).fill(0);
  const pDot = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    let dq = 0;
    let dp = 0;
    for (let k = 0; k < model.terms.length; k += 1) {
      const c = model.coefficients[k] ?? 0;
      dq += c * termDerivative(model.terms[k]!, x, n + i);
      dp += c * -termDerivative(model.terms[k]!, x, i);
    }
    qDot[i] = dq;
    pDot[i] = dp;
  }
  return { qDot, pDot };
}

/** Coefficient of a named term in the model (0 if absent) — convenience for tests/inspection. */
export function hamiltonianCoefficient(model: HamiltonianModel, termName: string): number {
  const idx = model.terms.findIndex((t) => t.name === termName);
  return idx < 0 ? 0 : (model.coefficients[idx] ?? 0);
}

/**
 * Estimate (q̇, ṗ) from a uniformly-sampled phase-space *trajectory* by
 * second-order central differences (forward/backward at the endpoints), the
 * realistic input when only (q(t), p(t)) is observed rather than the exact
 * field. Apply it per trajectory (do not difference across the join of two
 * separate runs) and feed the result to {@link learnHamiltonian}.
 *
 * Identifiability note: a *single* bounded orbit lies on one energy contour,
 * where features can be linearly dependent (e.g. ½p² and −cos q satisfy
 * ½p² − cos q = E along a pendulum orbit), so the normal equations are
 * rank-deficient — concatenate trajectories from **several energies** to pin H.
 */
export function estimatePhaseSpaceDerivatives(
  q: readonly (readonly number[])[],
  p: readonly (readonly number[])[],
  dt: number
): { qDot: number[][]; pDot: number[][] } {
  const n = q.length;
  if (n < 2) throw new Error('estimatePhaseSpaceDerivatives: need at least two samples.');
  if (p.length !== n) throw new Error('estimatePhaseSpaceDerivatives: q and p must have the same number of samples.');
  if (!(dt > 0)) throw new Error('estimatePhaseSpaceDerivatives: dt must be positive.');
  const central = (series: readonly (readonly number[])[]): number[][] => {
    const dim = series[0]!.length;
    const out: number[][] = [];
    for (let i = 0; i < n; i += 1) {
      const row = new Array<number>(dim).fill(0);
      for (let k = 0; k < dim; k += 1) {
        if (i === 0) row[k] = ((series[1]![k] ?? 0) - (series[0]![k] ?? 0)) / dt;
        else if (i === n - 1) row[k] = ((series[n - 1]![k] ?? 0) - (series[n - 2]![k] ?? 0)) / dt;
        else row[k] = ((series[i + 1]![k] ?? 0) - (series[i - 1]![k] ?? 0)) / (2 * dt);
      }
      out.push(row);
    }
    return out;
  };
  return { qDot: central(q), pDot: central(p) };
}
