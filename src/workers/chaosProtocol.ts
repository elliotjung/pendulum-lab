import {
  maximalLyapunov,
  lyapunovSpectrum,
  bifurcationDiagram,
  zeroOneTest,
  sampleObservable,
  covariantLyapunovVectors,
  doublePendulumFlipBasin,
  basinEntropy,
  boundaryMask,
  boxCountingDimension,
  recurrenceQuantification,
  recurrenceMatrix,
  rqaBlockUncertainty,
  doublePendulumFtleField,
  finiteTimeLyapunov,
  wadaCandidate,
  type LyapunovSettings,
  type SpectrumConsistency,
  type ClvSettings,
  type FlipBasinOptions,
  type RqaOptions,
  type FtleFieldOptions
} from '../chaos';
import { buildRhs, buildJacobian, type SystemSpec } from '../physics/systemSpec';

/**
 * Typed, data-only message protocol for the chaos worker. Requests describe the
 * job declaratively (a `SystemSpec` plus numeric arrays), and `runChaosJob`
 * performs the actual computation. Keeping the handler a pure function means it
 * is exercised both inside the worker and as the main-thread fallback, so the
 * two paths can never diverge — and it unit-tests without a Worker.
 */

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

export type ChaosRequest =
  | LyapunovRequest
  | BifurcationRequest
  | LyapunovSpectrumRequest
  | ZeroOneRequest
  | ClvRequest
  | BasinRequest
  | RqaRequest
  | FtleRequest
  | StudyPointRequest;

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
  /** Median asymptotic growth rate K ∈ [0,1]: ≈1 chaotic, ≈0 regular. */
  K: number;
  /** Per-frequency growth rates K_c. */
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
  | ChaosErrorResponse;

const wrapPi = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x));

function runLyapunov(req: LyapunovRequest): LyapunovResponse {
  const rhs = buildRhs(req.spec);
  const result = maximalLyapunov(new Float64Array(req.state0), rhs, req.settings ?? {});
  return { id: req.id, kind: 'lyapunov', ok: true, lambdaMax: result.lambdaMax, convergence: result.convergence };
}

function runBifurcation(req: BifurcationRequest): BifurcationResponse {
  const columns = bifurcationDiagram<number>({
    parameters: req.amplitudes,
    makeRhs: (A) => buildRhs({ ...req.base, driveAmplitude: A }),
    makeState0: () => new Float64Array(req.state0),
    // Stroboscopic driven section + wrapped-angle observable.
    section: (s) => Math.sin(0.5 * (s[2] ?? 0)),
    direction: 'rising',
    observable: (s) => wrapPi(s[0] ?? 0),
    dt: req.settings.dt,
    maxTime: req.settings.maxTime,
    transientCrossings: req.settings.transientCrossings,
    maxPointsPerParam: req.settings.maxPointsPerParam
  });
  return { id: req.id, kind: 'bifurcation', ok: true, columns: columns.map((c) => ({ param: c.param, values: c.values })) };
}

function runLyapunovSpectrum(req: LyapunovSpectrumRequest): LyapunovSpectrumResponse {
  const rhs = buildRhs(req.spec);
  const count = req.count ?? req.state0.length;
  const result = lyapunovSpectrum(new Float64Array(req.state0), rhs, count, req.settings ?? {}, buildJacobian(req.spec));
  return {
    id: req.id,
    kind: 'lyapunovSpectrum',
    ok: true,
    spectrum: result.spectrum,
    stdError: result.stdError,
    blockStdError: result.blockStdError,
    sum: result.sum,
    kaplanYorkeDimension: result.kaplanYorkeDimension,
    consistency: result.consistency
  };
}

/** Cumulative translation variables (p_c, q_c) of a scalar series for one frequency c. */
function translationPath(series: readonly number[], c: number): { p: number[]; q: number[] } {
  const N = series.length;
  const p = new Array<number>(N);
  const q = new Array<number>(N);
  let P = 0;
  let Q = 0;
  for (let k = 1; k <= N; k += 1) {
    const phi = series[k - 1] ?? 0;
    P += phi * Math.cos(k * c);
    Q += phi * Math.sin(k * c);
    p[k - 1] = P;
    q[k - 1] = Q;
  }
  return { p, q };
}

/** Index of the value nearest the median of `values`. */
function medianIndex(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const diff = Math.abs((values[i] ?? 0) - med);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return best;
}

/** Downsample an array to at most `maxLen` points (stride-decimated). */
function decimate(values: readonly number[], maxLen: number): number[] {
  if (values.length <= maxLen) return [...values];
  const stride = Math.ceil(values.length / maxLen);
  const out: number[] = [];
  for (let i = 0; i < values.length; i += stride) out.push(values[i] ?? 0);
  return out;
}

function runZeroOne(req: ZeroOneRequest): ZeroOneResponse {
  const rhs = buildRhs(req.spec);
  const s = req.settings ?? {};
  // A bounded scalar observable: cos(θ₁) is bounded for every system (so an
  // unbounded whirling angle cannot spuriously inflate the displacement growth).
  const series = sampleObservable(rhs, req.state0, {
    dt: s.dt ?? 0.01,
    sampleEvery: s.sampleEvery ?? 30,
    samples: s.samples ?? 3000,
    transientSteps: s.transientSteps ?? 2000,
    observable: (state) => Math.cos(state[0] ?? 0)
  });
  const result = zeroOneTest(series);
  const medIdx = medianIndex(result.kValues);
  const c = result.cValues[medIdx] ?? Math.PI / 2;
  const { p, q } = translationPath(series, c);
  return {
    id: req.id,
    kind: 'zeroOne',
    ok: true,
    K: result.K,
    kValues: result.kValues,
    pPath: decimate(p, 2000),
    qPath: decimate(q, 2000),
    kStdError: result.kStdError,
    kCi95: result.kCi95
  };
}

function runClv(req: ClvRequest): ClvResponse {
  const rhs = buildRhs(req.spec);
  const count = req.count ?? req.state0.length;
  const result = covariantLyapunovVectors(req.state0, rhs, count, req.settings ?? {}, buildJacobian(req.spec));
  return {
    id: req.id,
    kind: 'clv',
    ok: true,
    exponents: result.exponents,
    hyperbolicityAngles: result.hyperbolicityAngles,
    meanHyperbolicityAngle: result.meanHyperbolicityAngle,
    minHyperbolicityAngle: result.minHyperbolicityAngle
  };
}

function runBasin(req: BasinRequest): BasinResponse {
  const params = { m1: req.spec.m1, m2: req.spec.m2, l1: req.spec.l1, l2: req.spec.l2, g: req.spec.g };
  const grid = doublePendulumFlipBasin(params, req.settings ?? {});
  const entropy = basinEntropy(grid);
  const box = boxCountingDimension(boundaryMask(grid), grid.width, grid.height);
  const wada = wadaCandidate(grid);
  return {
    id: req.id,
    kind: 'basin',
    ok: true,
    labels: Array.from(grid.labels),
    width: grid.width,
    height: grid.height,
    numColors: entropy.numColors,
    basinEntropy: entropy.basinEntropy,
    boundaryBasinEntropy: entropy.boundaryBasinEntropy,
    fractalBoundary: entropy.fractalBoundary,
    boxCountingDimension: box.dimension,
    basinEntropyStdError: entropy.basinEntropyStdError,
    boundaryBasinEntropyStdError: entropy.boundaryBasinEntropyStdError,
    boxCountingStdError: box.stdError,
    boxCountingR2: box.r2,
    wadaFraction: wada.wadaFraction,
    wadaCandidate: wada.wadaCandidate
  };
}

function runRqa(req: RqaRequest): RqaResponse {
  const rhs = buildRhs(req.spec);
  const s = req.settings ?? {};
  // Bounded observable cos(θ₁); RQA is O(N²) so the series is kept short.
  const series = sampleObservable(rhs, req.state0, {
    dt: s.dt ?? 0.01,
    sampleEvery: s.sampleEvery ?? 20,
    samples: s.samples ?? 360,
    transientSteps: s.transientSteps ?? 2000,
    observable: (state) => Math.cos(state[0] ?? 0)
  });
  const rqaOptions: RqaOptions = {
    dimension: s.dimension ?? 2,
    delay: s.delay ?? 5,
    targetRecurrenceRate: s.targetRecurrenceRate ?? 0.1,
    ...(s.epsilon === undefined ? {} : { epsilon: s.epsilon }),
    ...(s.lMin === undefined ? {} : { lMin: s.lMin }),
    ...(s.vMin === undefined ? {} : { vMin: s.vMin }),
    ...(s.theiler === undefined ? {} : { theiler: s.theiler })
  };
  const r = recurrenceQuantification(series, rqaOptions);
  // Same series + options ⇒ identical embedding/threshold, so the plot matches.
  const mat = recurrenceMatrix(series, rqaOptions);
  // Block-resampled error bars (4 contiguous blocks ≈ 1/4 the O(N²) cost).
  const unc = rqaBlockUncertainty(series, rqaOptions, 4);
  return {
    id: req.id,
    kind: 'rqa',
    ok: true,
    recurrenceRate: r.recurrenceRate,
    determinism: r.determinism,
    laminarity: r.laminarity,
    longestDiagonal: r.longestDiagonal,
    divergence: r.divergence,
    meanDiagonal: r.meanDiagonal,
    entropy: r.entropy,
    trappingTime: r.trappingTime,
    epsilon: r.epsilon,
    plot: Array.from(mat.matrix),
    plotSize: mat.size,
    determinismStdError: unc.determinism.stdError,
    divergenceStdError: unc.divergence.stdError,
    uncertaintyBlocks: unc.blocks
  };
}

function runFtle(req: FtleRequest): FtleResponse {
  const params = { m1: req.spec.m1, m2: req.spec.m2, l1: req.spec.l1, l2: req.spec.l2, g: req.spec.g };
  const field = doublePendulumFtleField(params, req.settings ?? {});
  return {
    id: req.id,
    kind: 'ftle',
    ok: true,
    values: Array.from(field.values),
    width: field.width,
    height: field.height,
    min: field.min,
    max: field.max
  };
}

function runStudyPoint(req: StudyPointRequest): StudyPointResponse {
  const rhs = buildRhs(req.spec);
  const jacobian = buildJacobian(req.spec);
  const s = req.settings ?? {};

  // Shorter default run than the Lyapunov tab (steps 8000 vs 20000): a study
  // batch runs many points back-to-back, and the per-point trend matters more
  // than squeezing the last digit out of each exponent.
  const lyap = maximalLyapunov(new Float64Array(req.state0), rhs, {
    steps: 8000,
    ...(s.lyapunov ?? {})
  });

  const rq = s.rqa ?? {};
  const series = sampleObservable(rhs, req.state0, {
    dt: rq.dt ?? 0.01,
    sampleEvery: rq.sampleEvery ?? 20,
    samples: rq.samples ?? 360,
    transientSteps: rq.transientSteps ?? 2000,
    observable: (state) => Math.cos(state[0] ?? 0)
  });
  const rqa = recurrenceQuantification(series, {
    dimension: rq.dimension ?? 2,
    delay: rq.delay ?? 5,
    targetRecurrenceRate: rq.targetRecurrenceRate ?? 0.1
  });

  const horizon = s.ftleHorizon ?? 5;
  const ftle = finiteTimeLyapunov(req.state0, rhs, horizon, { dt: s.ftleDt ?? 0.01 }, jacobian);

  return {
    id: req.id,
    kind: 'studyPoint',
    ok: true,
    lambdaMax: lyap.lambdaMax,
    lambdaBlockStdError: lyap.blockStdError,
    rqaDeterminism: rqa.determinism,
    rqaDivergence: rqa.divergence,
    ftle,
    ftleHorizon: horizon
  };
}

/** Execute a chaos job, converting any thrown error into an error response. */
export function runChaosJob(req: ChaosRequest): ChaosResponse {
  try {
    if (req.kind === 'lyapunov') return runLyapunov(req);
    if (req.kind === 'bifurcation') return runBifurcation(req);
    if (req.kind === 'lyapunovSpectrum') return runLyapunovSpectrum(req);
    if (req.kind === 'zeroOne') return runZeroOne(req);
    if (req.kind === 'clv') return runClv(req);
    if (req.kind === 'basin') return runBasin(req);
    if (req.kind === 'rqa') return runRqa(req);
    if (req.kind === 'ftle') return runFtle(req);
    if (req.kind === 'studyPoint') return runStudyPoint(req);
    const exhaustive: never = req;
    return { id: (req as ChaosRequest).id, ok: false, error: `unknown request: ${JSON.stringify(exhaustive)}` };
  } catch (err) {
    return { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
