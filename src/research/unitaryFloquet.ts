import { complexAbs, type Complex } from './complexEig';

export interface ComplexMatrix {
  re: readonly (readonly number[])[];
  im: readonly (readonly number[])[];
}

export interface ComplexVector {
  re: readonly number[];
  im: readonly number[];
}

export type ComplexLinearOperator = (vector: ComplexVector) => ComplexVector;

export interface UnitaryFloquetSpectrum {
  eigenvalues: Complex[];
  phases: number[];
  quasiEnergies: number[];
  unitarityDefect: number;
  maxUnitCircleDrift: number;
}

export interface UnitaryFloquetOptions {
  period?: number;
  hbar?: number;
  maxIterations?: number;
  tolerance?: number;
  projectToUnitCircle?: boolean;
}

export interface UnitaryFloquetKrylovOptions extends UnitaryFloquetOptions {
  dimension: number;
  krylovDim?: number;
  seed?: ComplexVector;
  reorthogonalize?: boolean;
}

export interface UnitaryFloquetKrylovSpectrum {
  projectedMatrix: ComplexMatrix;
  spectrum: UnitaryFloquetSpectrum;
  residualNorms: number[];
  basisSize: number;
}

export interface UnitaryFloquetArnoldiSchurOptions extends UnitaryFloquetKrylovOptions {
  /** Number of Ritz values to keep from the projected Schur/Ritz spectrum. */
  targetCount?: number;
  /** Residual bound required for the projected subspace to be accepted. */
  residualTolerance?: number;
  /** Optional phase window; values nearest these target phases are reported first. */
  targetPhases?: readonly number[];
}

export interface UnitaryFloquetArnoldiSchurPair {
  eigenvalue: Complex;
  phase: number;
  quasiEnergy: number;
  /** Shared Arnoldi residual bound from the final Krylov step. */
  residualBound: number;
}

export interface UnitaryFloquetArnoldiSchurSpectrum {
  projectedMatrix: ComplexMatrix;
  selected: UnitaryFloquetArnoldiSchurPair[];
  spectrum: UnitaryFloquetSpectrum;
  residualNorms: number[];
  basisSize: number;
  converged: boolean;
  caveat: string;
}

const c = (re = 0, im = 0): Complex => ({ re, im });
const cAdd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
const cSub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });
const cMul = (a: Complex, b: Complex): Complex => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });

function cDiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) throw new Error('complex division by zero');
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
}

function assertComplexSquare(matrix: ComplexMatrix, who: string): number {
  const n = matrix.re.length;
  if (n === 0 || matrix.im.length !== n) throw new Error(`${who}: matrix must be non-empty and square.`);
  for (let i = 0; i < n; i += 1) {
    if ((matrix.re[i] ?? []).length !== n || (matrix.im[i] ?? []).length !== n) {
      throw new Error(`${who}: matrix must be square with matching real/imaginary blocks.`);
    }
  }
  return n;
}

function cloneComplexMatrix(matrix: ComplexMatrix): Complex[][] {
  const n = assertComplexSquare(matrix, 'cloneComplexMatrix');
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => c(matrix.re[i]![j] ?? 0, matrix.im[i]![j] ?? 0))
  );
}

function identity(n: number): Complex[][] {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => c(i === j ? 1 : 0, 0)));
}

function matMul(a: readonly (readonly Complex[])[], b: readonly (readonly Complex[])[], n: number): Complex[][] {
  const out = Array.from({ length: n }, () => Array.from({ length: n }, () => c()));
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < n; k += 1) {
      const aik = a[i]![k]!;
      if (aik.re === 0 && aik.im === 0) continue;
      for (let j = 0; j < n; j += 1) out[i]![j] = cAdd(out[i]![j]!, cMul(aik, b[k]![j]!));
    }
  }
  return out;
}

function assertComplexVector(vector: ComplexVector, n: number, who: string): void {
  if (vector.re.length !== n || vector.im.length !== n) {
    throw new Error(`${who}: vector length must match dimension.`);
  }
}

function defaultSeed(n: number): ComplexVector {
  return {
    re: Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0)),
    im: Array.from({ length: n }, () => 0)
  };
}

function vectorNorm(vector: ComplexVector): number {
  let sum = 0;
  for (let i = 0; i < vector.re.length; i += 1) {
    const re = vector.re[i] ?? 0;
    const im = vector.im[i] ?? 0;
    sum += re * re + im * im;
  }
  return Math.sqrt(sum);
}

function normalizeVector(vector: ComplexVector, who: string): ComplexVector {
  const norm = vectorNorm(vector);
  if (!(norm > 0)) throw new Error(`${who}: seed vector must be non-zero.`);
  return {
    re: vector.re.map((value) => value / norm),
    im: vector.im.map((value) => value / norm)
  };
}

function cloneVector(vector: ComplexVector): { re: number[]; im: number[] } {
  return { re: Array.from(vector.re), im: Array.from(vector.im) };
}

function dotConj(a: ComplexVector, b: ComplexVector): Complex {
  let re = 0;
  let im = 0;
  for (let i = 0; i < a.re.length; i += 1) {
    const ar = a.re[i] ?? 0;
    const ai = -(a.im[i] ?? 0);
    const br = b.re[i] ?? 0;
    const bi = b.im[i] ?? 0;
    re += ar * br - ai * bi;
    im += ar * bi + ai * br;
  }
  return c(re, im);
}

function subtractScaled(target: { re: number[]; im: number[] }, scale: Complex, basis: ComplexVector): void {
  for (let i = 0; i < target.re.length; i += 1) {
    const product = cMul(scale, c(basis.re[i] ?? 0, basis.im[i] ?? 0));
    target.re[i] = (target.re[i] ?? 0) - product.re;
    target.im[i] = (target.im[i] ?? 0) - product.im;
  }
}

/**
 * Characteristic polynomial of a dense complex matrix by the
 * Faddeev-LeVerrier recursion. Coefficients are ascending powers and monic:
 * p(z) = coeffs[0] + coeffs[1] z + ... + coeffs[n] z^n.
 */
export function complexCharacteristicPolynomial(matrix: ComplexMatrix): Complex[] {
  const n = assertComplexSquare(matrix, 'complexCharacteristicPolynomial');
  const a = cloneComplexMatrix(matrix);
  const coeffs = Array.from({ length: n + 1 }, () => c());
  coeffs[n] = c(1, 0);
  let m = identity(n);
  for (let k = 1; k <= n; k += 1) {
    const am = matMul(a, m, n);
    let trace = c();
    for (let i = 0; i < n; i += 1) trace = cAdd(trace, am[i]![i]!);
    const ck = c(-trace.re / k, -trace.im / k);
    coeffs[n - k] = ck;
    for (let i = 0; i < n; i += 1) am[i]![i] = cAdd(am[i]![i]!, ck);
    m = am;
  }
  return coeffs;
}

export function complexPolynomialRoots(coeffs: readonly Complex[], maxIterations = 1200, tolerance = 1e-13): Complex[] {
  const n = coeffs.length - 1;
  if (n < 1) return [];
  const lead = coeffs[n] ?? c(1);
  if (complexAbs(cSub(lead, c(1))) > 1e-12) throw new Error('complexPolynomialRoots: polynomial must be monic.');
  if (n === 1) return [c(-(coeffs[0] ?? c()).re, -(coeffs[0] ?? c()).im)];

  const evalPoly = (z: Complex): Complex => {
    let result = coeffs[n] ?? c(1);
    for (let k = n - 1; k >= 0; k -= 1) result = cAdd(cMul(result, z), coeffs[k] ?? c());
    return result;
  };

  const seed = c(0.4, 0.9);
  let cur = c(1, 0);
  let roots: Complex[] = [];
  for (let i = 0; i < n; i += 1) {
    cur = cMul(cur, seed);
    roots.push(cur);
  }

  for (let iter = 0; iter < maxIterations; iter += 1) {
    let maxDelta = 0;
    const next = roots.map((zi, i) => {
      let denom = c(1, 0);
      for (let j = 0; j < n; j += 1) {
        if (j !== i) denom = cMul(denom, cSub(zi, roots[j]!));
      }
      const delta = cDiv(evalPoly(zi), denom);
      maxDelta = Math.max(maxDelta, complexAbs(delta));
      return cSub(zi, delta);
    });
    roots = next;
    if (maxDelta < tolerance) break;
  }
  return roots;
}

export function complexMatrixEigenvalues(
  matrix: ComplexMatrix,
  options: { maxIterations?: number; tolerance?: number } = {}
): Complex[] {
  return complexPolynomialRoots(
    complexCharacteristicPolynomial(matrix),
    options.maxIterations ?? 1200,
    options.tolerance ?? 1e-13
  );
}

export function unitaryDefect(matrix: ComplexMatrix): number {
  const n = assertComplexSquare(matrix, 'unitaryDefect');
  let fro2 = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      let re = 0;
      let im = 0;
      for (let k = 0; k < n; k += 1) {
        const ar = matrix.re[k]![i] ?? 0;
        const ai = -(matrix.im[k]![i] ?? 0);
        const br = matrix.re[k]![j] ?? 0;
        const bi = matrix.im[k]![j] ?? 0;
        re += ar * br - ai * bi;
        im += ar * bi + ai * br;
      }
      if (i === j) re -= 1;
      fro2 += re * re + im * im;
    }
  }
  return Math.sqrt(fro2 / n);
}

/**
 * Eigenphases of a finite-dimensional unitary Floquet operator U.
 *
 * Quantum convention: if U psi = exp(-i E T / hbar) psi, then
 * quasiEnergy E = -hbar * arg(lambda) / T on the principal phase branch.
 */
export function complexUnitaryFloquetSpectrum(
  matrix: ComplexMatrix,
  options: UnitaryFloquetOptions = {}
): UnitaryFloquetSpectrum {
  const period = options.period ?? 1;
  const hbar = options.hbar ?? 1;
  if (!(period > 0)) throw new Error('complexUnitaryFloquetSpectrum: period must be positive.');
  if (!(hbar > 0)) throw new Error('complexUnitaryFloquetSpectrum: hbar must be positive.');
  const raw = complexMatrixEigenvalues(matrix, options);
  let maxUnitCircleDrift = 0;
  const eigenvalues = raw.map((z) => {
    const mag = complexAbs(z);
    maxUnitCircleDrift = Math.max(maxUnitCircleDrift, Math.abs(mag - 1));
    return options.projectToUnitCircle === false || mag === 0 ? z : { re: z.re / mag, im: z.im / mag };
  });
  const rows = eigenvalues.map((z) => {
    const phase = Math.atan2(z.im, z.re);
    return { eigenvalue: z, phase, quasiEnergy: (-hbar * phase) / period };
  });
  rows.sort((a, b) => a.phase - b.phase);
  return {
    eigenvalues: rows.map((row) => row.eigenvalue),
    phases: rows.map((row) => row.phase),
    quasiEnergies: rows.map((row) => row.quasiEnergy),
    unitarityDefect: unitaryDefect(matrix),
    maxUnitCircleDrift
  };
}

/**
 * Matrix-free Krylov projection of a unitary Floquet operator.
 *
 * This is intended for large grids where constructing the full dense unitary is
 * too expensive. The returned spectrum is the dense eigenspectrum of the small
 * Arnoldi-projected matrix V* U V, with residual norms reporting how much of
 * each Krylov step fell outside the current basis.
 */
export function complexUnitaryFloquetKrylovSpectrum(
  apply: ComplexLinearOperator,
  options: UnitaryFloquetKrylovOptions
): UnitaryFloquetKrylovSpectrum {
  const n = Math.trunc(options.dimension);
  if (!(n > 0)) throw new Error('complexUnitaryFloquetKrylovSpectrum: dimension must be positive.');
  const krylovDim = Math.max(1, Math.min(n, Math.trunc(options.krylovDim ?? Math.min(n, 24))));
  const tolerance = options.tolerance ?? 1e-13;
  const seed = options.seed ?? defaultSeed(n);
  assertComplexVector(seed, n, 'complexUnitaryFloquetKrylovSpectrum');

  const basis: ComplexVector[] = [normalizeVector(seed, 'complexUnitaryFloquetKrylovSpectrum')];
  const hRe = Array.from({ length: krylovDim }, () => Array.from({ length: krylovDim }, () => 0));
  const hIm = Array.from({ length: krylovDim }, () => Array.from({ length: krylovDim }, () => 0));
  const residualNorms: number[] = [];
  let basisSize = 0;

  for (let j = 0; j < krylovDim; j += 1) {
    const vj = basis[j];
    if (!vj) break;
    const applied = apply(vj);
    assertComplexVector(applied, n, 'complexUnitaryFloquetKrylovSpectrum');
    const w = cloneVector(applied);

    for (let i = 0; i <= j; i += 1) {
      const hij = dotConj(basis[i]!, w);
      hRe[i]![j] = (hRe[i]![j] ?? 0) + hij.re;
      hIm[i]![j] = (hIm[i]![j] ?? 0) + hij.im;
      subtractScaled(w, hij, basis[i]!);
    }

    if (options.reorthogonalize !== false) {
      for (let i = 0; i <= j; i += 1) {
        const correction = dotConj(basis[i]!, w);
        hRe[i]![j] = (hRe[i]![j] ?? 0) + correction.re;
        hIm[i]![j] = (hIm[i]![j] ?? 0) + correction.im;
        subtractScaled(w, correction, basis[i]!);
      }
    }

    const beta = vectorNorm(w);
    residualNorms.push(beta);
    basisSize = j + 1;
    if (j + 1 >= krylovDim || beta <= tolerance) break;
    hRe[j + 1]![j] = beta;
    basis.push({
      re: w.re.map((value) => value / beta),
      im: w.im.map((value) => value / beta)
    });
  }

  const projectedMatrix: ComplexMatrix = {
    re: hRe.slice(0, basisSize).map((row) => row.slice(0, basisSize)),
    im: hIm.slice(0, basisSize).map((row) => row.slice(0, basisSize))
  };
  return {
    projectedMatrix,
    spectrum: complexUnitaryFloquetSpectrum(projectedMatrix, options),
    residualNorms,
    basisSize
  };
}

function principalPhaseDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

/**
 * Matrix-free Arnoldi-Schur style Floquet spectrum for sparse/large unitary
 * operators. The large operator is accessed only through `apply(v) = Uv`; the
 * small projected Hessenberg matrix is diagonalised densely, then the selected
 * Ritz values are reported with the final Arnoldi residual bound. This is the
 * publication-facing large-Floquet path: dense `complexUnitaryFloquetSpectrum`
 * remains the small-matrix oracle, while this function carries the explicit
 * subspace size, convergence flag, and caveat expected by Trust Inspector.
 */
export function complexUnitaryFloquetArnoldiSchurSpectrum(
  apply: ComplexLinearOperator,
  options: UnitaryFloquetArnoldiSchurOptions
): UnitaryFloquetArnoldiSchurSpectrum {
  const projected = complexUnitaryFloquetKrylovSpectrum(apply, options);
  const residualBound = projected.residualNorms.at(-1) ?? Infinity;
  const residualTolerance = options.residualTolerance ?? options.tolerance ?? 1e-10;
  const hbar = options.hbar ?? 1;
  const period = options.period ?? 1;
  const rows = projected.spectrum.eigenvalues.map((eigenvalue, index) => ({
    eigenvalue,
    phase: projected.spectrum.phases[index] ?? Math.atan2(eigenvalue.im, eigenvalue.re),
    quasiEnergy: projected.spectrum.quasiEnergies[index] ?? (-hbar * Math.atan2(eigenvalue.im, eigenvalue.re)) / period,
    residualBound
  }));
  const targetPhases = options.targetPhases ?? [];
  rows.sort((a, b) => {
    if (targetPhases.length) {
      const da = Math.min(...targetPhases.map((phase) => principalPhaseDistance(a.phase, phase)));
      const db = Math.min(...targetPhases.map((phase) => principalPhaseDistance(b.phase, phase)));
      if (da !== db) return da - db;
    }
    return a.phase - b.phase;
  });
  const targetCount = Math.max(1, Math.min(rows.length, Math.trunc(options.targetCount ?? rows.length)));
  const selected = rows.slice(0, targetCount);
  return {
    projectedMatrix: projected.projectedMatrix,
    selected,
    spectrum: projected.spectrum,
    residualNorms: projected.residualNorms,
    basisSize: projected.basisSize,
    converged: residualBound <= residualTolerance,
    caveat:
      'Arnoldi-Schur projection of a matrix-free unitary operator; increase krylovDim or use shift/filtering for crowded phase windows.'
  };
}
