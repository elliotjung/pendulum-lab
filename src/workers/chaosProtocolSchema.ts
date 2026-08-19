/**
 * Data-only request and response shapes for the chaos worker boundary.
 *
 * This module deliberately has no numerical/runtime imports.  Keeping its
 * contract separate from the handlers means the worker client, validator and
 * in-process fallback can all depend on the same stable schema without
 * accidentally pulling simulation code into their bundle.
 */
import type { SystemSpec } from '../physics/systemSpec';
import type {
  ClvSettings,
  CodimTwoOptions,
  CodimTwoResult,
  FlipBasinOptions,
  FtleFieldOptions,
  LyapunovSettings,
  RqaOptions,
  SpectrumConsistency,
  WadaConvergenceOptions,
  WadaConvergenceResult
} from '../chaos';
export interface LyapunovRequest {
  id: string;
  kind: 'lyapunov';
  spec: SystemSpec;
  state0: number[];
  settings?: Partial<LyapunovSettings>;
}

export interface BifurcationJobSettings {
  dt: number;
  maxTime: number;
  transientCrossings: number;
  maxPointsPerParam: number;
}

export interface BifurcationRequest {
  id: string;
  kind: 'bifurcation';
  /** Base driven-pendulum spec; `driveAmplitude` is overridden per sweep value. */
  base: Extract<SystemSpec, { kind: 'driven' }>;
  amplitudes: number[];
  state0: number[];
  settings: BifurcationJobSettings;
}

export interface LyapunovSpectrumRequest {
  id: string;
  kind: 'lyapunovSpectrum';
  spec: SystemSpec;
  state0: number[];
  /** Number of exponents to track (defaults to the state dimension). */
  count?: number;
  settings?: Partial<LyapunovSettings>;
}

export interface ZeroOneJobSettings {
  /** Integration step for the observable sampler. Default 0.01. */
  dt?: number;
  /** Steps between samples. Default 30 (under-sampling decorrelates the series, as the 0–1 test requires). */
  sampleEvery?: number;
  /** Number of samples in the series. Default 3000. */
  samples?: number;
  /** Steps discarded before sampling. Default 2000. */
  transientSteps?: number;
}

export interface ZeroOneRequest {
  id: string;
  kind: 'zeroOne';
  spec: SystemSpec;
  state0: number[];
  settings?: ZeroOneJobSettings;
}

export interface ClvRequest {
  id: string;
  kind: 'clv';
  spec: SystemSpec;
  state0: number[];
  /** Number of covariant vectors to track (defaults to the state dimension). */
  count?: number;
  settings?: Partial<ClvSettings>;
}

export interface BasinRequest {
  id: string;
  kind: 'basin';
  /** Double-pendulum spec; the flip basin is double-pendulum specific. */
  spec: Extract<SystemSpec, { kind: 'double' }>;
  settings?: FlipBasinOptions;
}

export interface RqaJobSettings extends RqaOptions {
  /** Integration step for the observable sampler. Default 0.01. */
  dt?: number;
  /** Steps between samples. Default 20. */
  sampleEvery?: number;
  /** Number of samples in the series. Default 360 (kept small: RQA is O(N²)). */
  samples?: number;
  /** Steps discarded before sampling. Default 2000. */
  transientSteps?: number;
}

export interface RqaRequest {
  id: string;
  kind: 'rqa';
  spec: SystemSpec;
  state0: number[];
  settings?: RqaJobSettings;
}

export interface FtleRequest {
  id: string;
  kind: 'ftle';
  /** Double-pendulum spec; the FTLE field is computed over its (θ₁, θ₂) section. */
  spec: Extract<SystemSpec, { kind: 'double' }>;
  settings?: FtleFieldOptions;
}

export interface StudyPointJobSettings {
  /** Maximal-Lyapunov settings; the batch default shortens `steps` to keep a multi-point queue responsive. */
  lyapunov?: Partial<LyapunovSettings>;
  /** RQA sampler/quantification settings (same defaults as the RQA tab). */
  rqa?: RqaJobSettings;
  /** Finite-time horizon T for the per-point FTLE. Default 5. */
  ftleHorizon?: number;
  /** Integration step for the FTLE flow map. Default 0.01. */
  ftleDt?: number;
}

/**
 * One parameter-study point: a single request that fills the three headline
 * diagnostics (maximal Lyapunov with uncertainty, RQA determinism/divergence,
 * per-point FTLE) so the Research Workbench batch queue makes exactly one
 * round-trip to the worker per point.
 */
export interface StudyPointRequest {
  id: string;
  kind: 'studyPoint';
  spec: SystemSpec;
  state0: number[];
  settings?: StudyPointJobSettings;
}

export interface WadaConvergenceRequest {
  id: string;
  kind: 'wadaConvergence';
  /** Double-pendulum spec; the flip basin is double-pendulum specific. */
  spec: Extract<SystemSpec, { kind: 'double' }>;
  settings?: WadaConvergenceOptions;
}

export interface CodimTwoRequest {
  id: string;
  kind: 'codim2';
  /** Base driven spec; `driveAmplitude` (x) and `damping` (y) vary per cell. */
  base: Extract<SystemSpec, { kind: 'driven' }>;
  state0: number[];
  xRange: [number, number];
  yRange: [number, number];
  settings?: CodimTwoOptions;
}

export type ChaosRequest =
  | LyapunovRequest
  | BifurcationRequest
  | LyapunovSpectrumRequest
  | ZeroOneRequest
  | ClvRequest
  | BasinRequest
  | RqaRequest
  | FtleRequest
  | StudyPointRequest
  | WadaConvergenceRequest
  | CodimTwoRequest;

export interface LyapunovResponse {
  id: string;
  kind: 'lyapunov';
  ok: true;
  lambdaMax: number;
  convergence: number[];
}

export interface BifurcationResponse {
  id: string;
  kind: 'bifurcation';
  ok: true;
  columns: { param: number; values: number[] }[];
}

export interface LyapunovSpectrumResponse {
  id: string;
  kind: 'lyapunovSpectrum';
  ok: true;
  /** Exponents in descending order. */
  spectrum: number[];
  /** One-sigma standard error per exponent, aligned with `spectrum`. */
  stdError: number[];
  /** Batched-means (decorrelated) standard error per exponent, aligned with `spectrum`. */
  blockStdError: number[];
  /** Sum of the spectrum (≈ 0 for a conservative/Hamiltonian system). */
  sum: number;
  kaplanYorkeDimension: number;
  /** Hamiltonian self-consistency verdict (sum-to-zero, symplectic pairing, zero-exponent count). */
  consistency: SpectrumConsistency;
}

export interface ZeroOneResponse {
  id: string;
  kind: 'zeroOne';
  ok: true;
  /** Median finite-sample correlation K in [-1,1]: near 1 chaotic, near 0 regular. */
  K: number;
  /** Per-frequency finite-sample correlations K_c in [-1,1]. */
  kValues: number[];
  /** The translation-variable trajectory (p_c, q_c) for the median frequency: bounded ⇒ regular, Brownian ⇒ chaotic. */
  pPath: number[];
  qPath: number[];
  /** Bootstrap standard error of the median K over the per-frequency K_c. */
  kStdError: number;
  /** Percentile-bootstrap 95% confidence interval for K. */
  kCi95: [number, number];
}

export interface ClvResponse {
  id: string;
  kind: 'clv';
  ok: true;
  /** Lyapunov exponents from the QR diagonals (descending). */
  exponents: number[];
  /** Minimum angle (radians) between expanding and contracting CLVs over the window. */
  hyperbolicityAngles: number[];
  meanHyperbolicityAngle: number;
  minHyperbolicityAngle: number;
}

export interface BasinResponse {
  id: string;
  kind: 'basin';
  ok: true;
  /** Row-major flip labels (0/1/2), length width*height. */
  labels: number[];
  width: number;
  height: number;
  numColors: number;
  /** Daza basin entropy Sb. */
  basinEntropy: number;
  /** Boundary basin entropy Sbb (Sbb > ln2 ⇒ fractal boundary). */
  boundaryBasinEntropy: number;
  fractalBoundary: boolean;
  /** Minkowski–Bouligand box-counting dimension of the classification boundary. */
  boxCountingDimension: number;
  /** SEM of Sb over boxes. */
  basinEntropyStdError: number;
  /** SEM of Sbb over boundary boxes. */
  boundaryBasinEntropyStdError: number;
  /** Regression slope standard error of the box-counting log-log fit. */
  boxCountingStdError: number;
  /** R² of the box-counting log-log fit (scaling quality). */
  boxCountingR2: number;
  /** Fraction of boundary cells whose neighbourhood touches ≥ 3 basins (grid Wada test). */
  wadaFraction: number;
  /** True when ≥ 3 basins and the Wada fraction clears the candidacy threshold. */
  wadaCandidate: boolean;
}

export interface RqaResponse {
  id: string;
  kind: 'rqa';
  ok: true;
  recurrenceRate: number;
  determinism: number;
  laminarity: number;
  longestDiagonal: number;
  divergence: number;
  meanDiagonal: number;
  entropy: number;
  trappingTime: number;
  epsilon: number;
  /** Row-major recurrence plot (0/1), `plotSize`×`plotSize`. */
  plot: number[];
  plotSize: number;
  /** Block-resampled standard error of DET (contiguous blocks; batched-means style). */
  determinismStdError: number;
  /** Block-resampled standard error of DIV. */
  divergenceStdError: number;
  /** Number of blocks used for the uncertainty estimates. */
  uncertaintyBlocks: number;
}

export interface FtleResponse {
  id: string;
  kind: 'ftle';
  ok: true;
  /** Row-major FTLE field, length width*height. */
  values: number[];
  width: number;
  height: number;
  min: number;
  max: number;
}

export interface StudyPointResponse {
  id: string;
  kind: 'studyPoint';
  ok: true;
  /** Maximal Lyapunov exponent (Benettin). */
  lambdaMax: number;
  /** Batched-means (decorrelated) standard error of lambdaMax. */
  lambdaBlockStdError: number;
  /** RQA determinism DET ∈ [0,1]. */
  rqaDeterminism: number;
  /** RQA divergence DIV = 1/Lmax (finite-size λ₁ proxy). */
  rqaDivergence: number;
  /** Finite-time Lyapunov exponent at the point over the configured horizon. */
  ftle: number;
  /** The FTLE horizon actually used (for reporting). */
  ftleHorizon: number;
}

export interface WadaConvergenceResponse {
  id: string;
  kind: 'wadaConvergence';
  ok: true;
  result: WadaConvergenceResult;
}

export interface CodimTwoResponse {
  id: string;
  kind: 'codim2';
  ok: true;
  result: CodimTwoResult;
}

export interface ChaosErrorResponse {
  id: string;
  ok: false;
  error: string;
}

export type ChaosResponse =
  | LyapunovResponse
  | BifurcationResponse
  | LyapunovSpectrumResponse
  | ZeroOneResponse
  | ClvResponse
  | BasinResponse
  | RqaResponse
  | FtleResponse
  | StudyPointResponse
  | WadaConvergenceResponse
  | CodimTwoResponse
  | ChaosErrorResponse;
