/**
 * Polynomial-chaos surrogate — a cheap spectral emulator of an expensive model.
 *
 * The Sobol module (`sobolSensitivity.ts`) estimates variance-based sensitivity
 * by *sampling* the model O(N·(d+2)) times. This module fits a closed-form
 * surrogate instead: a Polynomial Chaos Expansion (PCE)
 *
 *     f(ξ) ≈ Σ_α c_α Ψ_α(ξ),     Ψ_α(ξ) = Π_j φ_{α_j}(ξ_j),
 *
 * where the inputs ξ_j are independent and uniform on their ranges and the
 * φ_n are the *normalised Legendre* polynomials (orthonormal w.r.t. the uniform
 * measure, so E[φ_m φ_n] = δ_mn). The coefficients are found by least-squares
 * regression on a sample set (regression PCE), and the basis is the total-degree
 * set {α : Σ α_j ≤ p}.
 *
 * Because the basis is orthonormal, the post-processing is exact and free:
 *   - mean      = c_0,
 *   - variance  = Σ_{α≠0} c_α²,
 *   - Sobol S_i = (Σ_{α: only i active} c_α²) / variance        (first order),
 *   - Sobol S_Ti = (Σ_{α: i active} c_α²) / variance            (total effect).
 *
 * So one regression yields a fast emulator *and* the full Sobol decomposition
 * analytically — no extra model runs. This is exactly the surrogate/UQ workflow
 * used to make expensive TCAD/device sweeps tractable.
 *
 * The module is pure and deterministic: callers supply the (input, output)
 * samples (e.g. from a Sobol/Latin-hypercube design), and the fit is a plain
 * linear solve with no randomness of its own.
 */

import { solveLinearInPlace } from '../physics/linearSolve';

export interface SurrogateVariable {
  name: string;
  min: number;
  max: number;
}

export interface PolynomialChaosSample {
  /** Input point in physical coordinates, one per variable. */
  inputs: readonly number[];
  /** Scalar model output at that point. */
  output: number;
}

export interface PolynomialChaosOptions {
  /** Maximum total polynomial degree p. */
  degree: number;
}

export interface PolynomialChaosModel {
  variables: SurrogateVariable[];
  degree: number;
  /** Total-degree multi-indices, row-aligned with `coefficients`. */
  multiIndices: number[][];
  /** Spectral coefficients c_α. */
  coefficients: number[];
  /** Surrogate mean E[f] = c_0. */
  mean: number;
  /** Surrogate variance Var[f] = Σ_{α≠0} c_α². */
  variance: number;
  /** First-order Sobol index per variable. */
  firstOrderSobol: number[];
  /** Total-effect Sobol index per variable. */
  totalSobol: number[];
  /** Coefficient of determination of the fit on the training samples. */
  rSquared: number;
  /** Condition-number estimate of the regression normal matrix. */
  conditionEstimate: number;
  /** Evaluate the surrogate at a physical-coordinate input point. */
  predict(inputs: readonly number[]): number;
}

/** All multi-indices α ∈ ℕ^d with Σ α_j ≤ p, in graded order. */
export function totalDegreeMultiIndices(dimension: number, degree: number): number[][] {
  if (dimension <= 0) throw new Error('totalDegreeMultiIndices: dimension must be ≥ 1.');
  if (degree < 0) throw new Error('totalDegreeMultiIndices: degree must be ≥ 0.');
  const result: number[][] = [];
  const current = new Array<number>(dimension).fill(0);
  const recurse = (position: number, remaining: number): void => {
    if (position === dimension - 1) {
      for (let v = 0; v <= remaining; v += 1) {
        current[position] = v;
        result.push(current.slice());
      }
      return;
    }
    for (let v = 0; v <= remaining; v += 1) {
      current[position] = v;
      recurse(position + 1, remaining - v);
    }
  };
  recurse(0, degree);
  return result;
}

/** Normalised Legendre values φ_0..φ_maxDeg at ξ ∈ [−1, 1] (orthonormal basis). */
function legendreNormalized(xi: number, maxDegree: number): number[] {
  const raw = new Array<number>(maxDegree + 1).fill(0);
  raw[0] = 1;
  if (maxDegree >= 1) raw[1] = xi;
  for (let n = 1; n < maxDegree; n += 1) {
    raw[n + 1] = ((2 * n + 1) * xi * raw[n]! - n * raw[n - 1]!) / (n + 1);
  }
  return raw.map((p, n) => Math.sqrt(2 * n + 1) * p);
}

function toUnitInterval(value: number, variable: SurrogateVariable): number {
  const span = variable.max - variable.min;
  if (span === 0) throw new Error(`surrogate: variable "${variable.name}" has zero range.`);
  return (2 * (value - variable.min)) / span - 1;
}

function basisRow(
  inputs: readonly number[],
  variables: SurrogateVariable[],
  multiIndices: number[][],
  maxDegree: number
): number[] {
  const perVariable = variables.map((variable, j) => legendreNormalized(toUnitInterval(inputs[j]!, variable), maxDegree));
  return multiIndices.map((alpha) => {
    let product = 1;
    for (let j = 0; j < alpha.length; j += 1) product *= perVariable[j]![alpha[j]!]!;
    return product;
  });
}

/**
 * Fit a regression Polynomial Chaos Expansion to `samples` over the given
 * `variables`. Requires at least as many samples as basis terms; an
 * over-determined, well-spread design (Sobol/LHS) is recommended.
 */
export function fitPolynomialChaos(
  variables: SurrogateVariable[],
  samples: readonly PolynomialChaosSample[],
  options: PolynomialChaosOptions
): PolynomialChaosModel {
  const dimension = variables.length;
  if (dimension === 0) throw new Error('fitPolynomialChaos: need at least one variable.');
  const degree = options.degree;
  const multiIndices = totalDegreeMultiIndices(dimension, degree);
  const terms = multiIndices.length;
  if (samples.length < terms) {
    throw new Error(`fitPolynomialChaos: ${samples.length} samples < ${terms} basis terms (under-determined).`);
  }

  // Assemble the design matrix Ψ (N×P) and the normal equations ΨᵀΨ c = Ψᵀy.
  const rows: number[][] = samples.map((sample) => {
    if (sample.inputs.length !== dimension) {
      throw new Error('fitPolynomialChaos: sample input dimension mismatch.');
    }
    return basisRow(sample.inputs, variables, multiIndices, degree);
  });

  const normal = new Float64Array(terms * terms);
  const rhs = new Float64Array(terms);
  for (let s = 0; s < rows.length; s += 1) {
    const row = rows[s]!;
    const y = samples[s]!.output;
    for (let a = 0; a < terms; a += 1) {
      rhs[a] = rhs[a]! + row[a]! * y;
      for (let b = a; b < terms; b += 1) normal[a * terms + b] = normal[a * terms + b]! + row[a]! * row[b]!;
    }
  }
  for (let a = 0; a < terms; a += 1) {
    for (let b = a + 1; b < terms; b += 1) normal[b * terms + a] = normal[a * terms + b]!;
  }

  const solve = solveLinearInPlace(normal, rhs, terms, { fallbackPolicy: 'return-diagnostics' });
  if (!solve.ok) {
    throw new Error(`fitPolynomialChaos: regression matrix is singular (${solve.reason ?? 'unknown'}); add samples or lower the degree.`);
  }
  const coefficients = Array.from(rhs.subarray(0, terms));

  // Orthonormal-basis post-processing.
  const mean = coefficients[0]!;
  let variance = 0;
  for (let k = 1; k < terms; k += 1) variance += coefficients[k]! * coefficients[k]!;
  const varianceTolerance = 32 * Number.EPSILON * Math.max(1, mean * mean) * terms;
  if (variance <= varianceTolerance) variance = 0;

  const firstOrderSobol = new Array<number>(dimension).fill(0);
  const totalSobol = new Array<number>(dimension).fill(0);
  if (variance > 0) {
    for (let k = 1; k < terms; k += 1) {
      const alpha = multiIndices[k]!;
      const active: number[] = [];
      for (let j = 0; j < dimension; j += 1) if (alpha[j]! > 0) active.push(j);
      const contribution = (coefficients[k]! * coefficients[k]!) / variance;
      for (const j of active) totalSobol[j]! += contribution;
      if (active.length === 1) firstOrderSobol[active[0]!]! += contribution;
    }
  }

  // R² on the training samples.
  const predictRow = (row: number[]): number => {
    let acc = 0;
    for (let k = 0; k < terms; k += 1) acc += coefficients[k]! * row[k]!;
    return acc;
  };
  let ssRes = 0;
  let ssTot = 0;
  const yMean = samples.reduce((sum, s) => sum + s.output, 0) / samples.length;
  for (let s = 0; s < rows.length; s += 1) {
    const predicted = predictRow(rows[s]!);
    const actual = samples[s]!.output;
    ssRes += (actual - predicted) ** 2;
    ssTot += (actual - yMean) ** 2;
  }
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 1;

  return {
    variables,
    degree,
    multiIndices,
    coefficients,
    mean,
    variance,
    firstOrderSobol,
    totalSobol,
    rSquared,
    conditionEstimate: solve.conditionEstimate ?? Infinity,
    predict: (inputs: readonly number[]) => predictRow(basisRow(inputs, variables, multiIndices, degree))
  };
}
