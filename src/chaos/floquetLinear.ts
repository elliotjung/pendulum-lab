/**
 * **Classical Floquet theory for linear time-periodic systems** ẋ = A(t) x with
 * A(t + T) = A(t) — the textbook setting of Hill's / Mathieu's equation and
 * parametric resonance, and the classical limit of a periodically-driven lattice
 * (the "quasi-energy band" structure of Floquet–Bloch physics).
 *
 * The fundamental solution Φ(t) (Φ̇ = A(t)Φ, Φ(0) = I) integrated over one period
 * gives the **monodromy matrix** M = Φ(T). Its eigenvalues are the **Floquet
 * multipliers** ρ_k; the **Floquet exponents** are λ_k = ln(ρ_k)/T, whose real
 * part is the per-time growth rate and whose imaginary part (= arg(ρ_k)/T, folded
 * into the first "Brillouin zone" (−π/T, π/T] by the principal log) is the
 * quasi-frequency / quasi-energy. The orbit is (Lyapunov) stable iff every
 * |ρ_k| ≤ 1, and a multiplier crossing the unit circle marks an instability —
 * for a Hamiltonian/divergence-free A(t) (tr A ≡ 0) Liouville's theorem forces
 * det M = 1 exactly, so multipliers occur in reciprocal pairs (ρ, 1/ρ).
 *
 * This is distinct from `floquet.ts`, which linearises a *nonlinear* periodic
 * orbit via its state-transition matrix; here A(t) is supplied directly. The
 * monodromy is real, so its spectrum is obtained with the general non-symmetric
 * eigensolver (`research/eigenGeneral`). It self-validates against closed forms:
 * a constant A = [[0,ω],[−ω,0]] gives the exact rotation monodromy with
 * multipliers e^{±iωT}, and a constant A reproduces e^{T·spec(A)}.
 *
 * (The *quantum* driven quasi-energy bands — eigenphases of a complex unitary
 * Floquet operator — additionally need a complex-unitary eigensolver, the
 * documented remaining step.)
 */
import { complexAbs, complexLog, type Complex } from '../research/complexEig';
import { eigenvaluesGeneral } from '../research/eigenGeneral';

export interface FloquetLinearResult {
  /** Monodromy matrix M = Φ(T) (array of rows). */
  monodromy: number[][];
  /** Floquet multipliers ρ_k = eig(M). */
  multipliers: Complex[];
  /** Floquet exponents λ_k = ln(ρ_k)/T (Im = quasi-frequency in (−π/T, π/T]). */
  exponents: Complex[];
  /** Largest multiplier modulus max|ρ_k| (spectral radius of M). */
  spectralRadius: number;
  /** det M = Π ρ_k = exp(∫₀ᵀ tr A dt) — a Liouville check (= 1 if tr A ≡ 0). */
  determinant: number;
  /** Stability verdict: spectralRadius ≤ 1 + tol. */
  stable: boolean;
  diagnostics: FloquetLinearDiagnostics;
}

export interface FloquetLinearConvergenceDiagnostic {
  coarseSteps: number;
  fineSteps: number;
  maxEntryDelta: number;
  spectralRadiusDelta: number;
  determinantDelta: number;
}

export interface FloquetLinearDiagnostics {
  steps: number;
  unitDeterminantDrift: number;
  convergence?: FloquetLinearConvergenceDiagnostic;
}

export interface FloquetLinearOptions {
  steps?: number;
  stabilityTolerance?: number;
  convergenceCheck?: boolean | { coarseSteps?: number };
}

type CoefficientAt = (t: number) => readonly (readonly number[])[];

const matMul = (a: readonly (readonly number[])[], b: readonly (readonly number[])[], n: number): number[][] => {
  const out: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    const ai = a[i]!;
    const oi = out[i]!;
    for (let k = 0; k < n; k += 1) {
      const aik = ai[k] ?? 0;
      if (aik === 0) continue;
      const bk = b[k]!;
      for (let j = 0; j < n; j += 1) oi[j] = (oi[j] ?? 0) + aik * (bk[j] ?? 0);
    }
  }
  return out;
};

/** Φ + scale·D (n×n), returning a new matrix. */
const axpyMatrix = (
  phi: readonly (readonly number[])[],
  d: readonly (readonly number[])[],
  scale: number,
  n: number
): number[][] =>
  Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (phi[i]![j] ?? 0) + scale * (d[i]![j] ?? 0)));

/** Determinant of a real matrix via LU with partial pivoting (independent of the eigenvalues). */
function luDeterminant(matrix: readonly (readonly number[])[], n: number): number {
  const a = matrix.map((row) => row.slice());
  let det = 1;
  for (let col = 0; col < n; col += 1) {
    let piv = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(a[r]![col] ?? 0) > Math.abs(a[piv]![col] ?? 0)) piv = r;
    if ((a[piv]![col] ?? 0) === 0) return 0;
    if (piv !== col) {
      const tmp = a[piv]!;
      a[piv] = a[col]!;
      a[col] = tmp;
      det = -det;
    }
    const pivVal = a[col]![col]!;
    det *= pivVal;
    for (let r = col + 1; r < n; r += 1) {
      const f = (a[r]![col] ?? 0) / pivVal;
      if (f === 0) continue;
      for (let c = col; c < n; c += 1) a[r]![c] = (a[r]![c] ?? 0) - f * (a[col]![c] ?? 0);
    }
  }
  return det;
}

function maxMatrixDelta(a: readonly (readonly number[])[], b: readonly (readonly number[])[], n: number): number {
  let max = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) max = Math.max(max, Math.abs((a[i]![j] ?? 0) - (b[i]![j] ?? 0)));
  }
  return max;
}

function spectralRadiusOf(matrix: readonly (readonly number[])[]): number {
  let radius = 0;
  for (const rho of eigenvaluesGeneral(matrix)) radius = Math.max(radius, complexAbs(rho));
  return radius;
}

/**
 * Monodromy matrix M = Φ(T) of ẋ = A(t)x, integrating the matrix variational
 * equation Φ̇ = A(t)Φ from Φ(0) = I with classical RK4 over `steps` substeps.
 * `coefficientAt(t)` returns the `dimension`×`dimension` coefficient matrix.
 */
export function monodromyLinear(
  coefficientAt: CoefficientAt,
  period: number,
  dimension: number,
  steps = 4000
): number[][] {
  if (!Number.isInteger(dimension) || dimension < 1)
    throw new Error('monodromyLinear: dimension must be a positive integer.');
  if (!(period > 0)) throw new Error('monodromyLinear: period must be positive.');
  if (!Number.isInteger(steps) || steps < 1) throw new Error('monodromyLinear: steps must be a positive integer.');
  const n = dimension;
  const dt = period / steps;
  let phi: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let s = 0; s < steps; s += 1) {
    const t = s * dt;
    const k1 = matMul(coefficientAt(t), phi, n);
    const k2 = matMul(coefficientAt(t + dt / 2), axpyMatrix(phi, k1, dt / 2, n), n);
    const k3 = matMul(coefficientAt(t + dt / 2), axpyMatrix(phi, k2, dt / 2, n), n);
    const k4 = matMul(coefficientAt(t + dt), axpyMatrix(phi, k3, dt, n), n);
    const next = Array.from({ length: n }, (_, i) =>
      Array.from(
        { length: n },
        (_, j) =>
          (phi[i]![j] ?? 0) +
          (dt / 6) * ((k1[i]![j] ?? 0) + 2 * (k2[i]![j] ?? 0) + 2 * (k3[i]![j] ?? 0) + (k4[i]![j] ?? 0))
      )
    );
    phi = next;
  }
  return phi;
}

/**
 * Full Floquet spectrum of a linear T-periodic system: monodromy, multipliers
 * ρ_k, exponents ln(ρ_k)/T, spectral radius, Liouville determinant, and a
 * stability verdict. `coefficientAt(t)` supplies the `dimension`×`dimension`
 * coefficient matrix A(t).
 */
export function floquetLinearSpectrum(
  coefficientAt: CoefficientAt,
  period: number,
  dimension: number,
  options: FloquetLinearOptions = {}
): FloquetLinearResult {
  const n = dimension;
  const steps = options.steps ?? 4000;
  const monodromy = monodromyLinear(coefficientAt, period, n, steps);
  const multipliers = eigenvaluesGeneral(monodromy);
  const exponents = multipliers.map((rho) => {
    const log = complexLog(rho);
    return { re: log.re / period, im: log.im / period };
  });
  let spectralRadius = 0;
  for (const rho of multipliers) spectralRadius = Math.max(spectralRadius, complexAbs(rho));
  const determinant = luDeterminant(monodromy, n);
  const diagnostics: FloquetLinearDiagnostics = {
    steps,
    unitDeterminantDrift: determinant - 1
  };
  if (options.convergenceCheck) {
    const requested = typeof options.convergenceCheck === 'object' ? options.convergenceCheck.coarseSteps : undefined;
    const coarseSteps = Math.max(1, Math.min(steps - 1, requested ?? Math.max(1, Math.floor(steps / 2))));
    if (coarseSteps < steps) {
      const coarse = monodromyLinear(coefficientAt, period, n, coarseSteps);
      diagnostics.convergence = {
        coarseSteps,
        fineSteps: steps,
        maxEntryDelta: maxMatrixDelta(monodromy, coarse, n),
        spectralRadiusDelta: Math.abs(spectralRadius - spectralRadiusOf(coarse)),
        determinantDelta: Math.abs(determinant - luDeterminant(coarse, n))
      };
    }
  }
  const tol = options.stabilityTolerance ?? 1e-6;
  return {
    monodromy,
    multipliers,
    exponents,
    spectralRadius,
    determinant,
    stable: spectralRadius <= 1 + tol,
    diagnostics
  };
}
