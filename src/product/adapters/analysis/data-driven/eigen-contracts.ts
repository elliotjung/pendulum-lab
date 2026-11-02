export interface DenseEigenOperator {
  readonly kind: 'dense';
  readonly matrix: readonly (readonly number[])[];
}
export interface SparseEigenOperator {
  readonly kind: 'sparse';
  readonly dimension: number;
  readonly entries: readonly { readonly row: number; readonly column: number; readonly value: number }[];
}
/** Data only: imported operators never contain executable callbacks. */
export type EigenOperator = DenseEigenOperator | SparseEigenOperator;
export interface EigenSettings {
  readonly method: 'arnoldi' | 'lanczos' | 'general-eigensolver';
  readonly k: number;
  readonly krylovDim: number;
  readonly maxRestarts: number;
  readonly tolerance: number;
  readonly seed: string;
  readonly which: 'LA' | 'SA' | 'LM';
}
export interface EigenPair {
  readonly value: { readonly re: number; readonly im: number };
  readonly vector: { readonly re: readonly number[]; readonly im: readonly number[] };
  readonly nativeResidual: number;
  readonly residual: number;
}
export interface KrylovModel {
  readonly kind: 'krylov';
  readonly method: 'arnoldi' | 'lanczos';
  readonly eigenpairs: readonly EigenPair[];
  readonly nativeConverged: boolean;
  /** Native reported cycle count, including its documented exhaustion off-by-one. */
  readonly nativeRestarts: number;
  readonly matVecs: number;
  /** Actual operator application counts; native solvers expose no cycle-residual history. */
  readonly trace: readonly { readonly work: number }[];
}
export interface DenseSpectrumModel {
  readonly kind: 'dense-spectrum';
  readonly method: 'general-eigensolver';
  readonly values: readonly { readonly re: number; readonly im: number }[];
}
export type EigenModel = KrylovModel | DenseSpectrumModel;
export interface EigenOutput {
  readonly model: EigenModel;
  readonly metrics: Record<string, number>;
  readonly columns: string[];
  readonly units: string[];
  readonly rows: number[][];
  readonly warnings: string[];
  readonly details: string[];
}
export const EIGEN_LIMITS = Object.freeze({
  denseDimension: 64,
  sparseDimension: 2048,
  nonzeros: 32768,
  eigenpairs: 16,
  krylovDimension: 64,
  restarts: 40,
  estimatedWork: 100_000_000,
  maxCoefficient: 1_000_000,
  minNonzeroCoefficient: 1e-12,
  minTolerance: 1e-12,
  maxTolerance: 1e-2
});
