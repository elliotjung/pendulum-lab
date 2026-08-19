/**
 * Numerical handlers for the data-only chaos worker protocol.
 *
 * Boundary validation lives in `chaosRequestValidation.ts` and shapes live in
 * `chaosProtocolSchema.ts`; this module is intentionally the only place that
 * binds a validated request to numerical routines.
 */
import {
  basinEntropy,
  bifurcationDiagram,
  boundaryMask,
  boxCountingDimension,
  codimTwoDiagram,
  covariantLyapunovVectors,
  doublePendulumFlipBasin,
  doublePendulumFtleField,
  finiteTimeLyapunov,
  lyapunovSpectrum,
  maximalLyapunov,
  recurrenceMatrix,
  recurrenceQuantification,
  rqaBlockUncertainty,
  sampleObservable,
  wadaCandidate,
  wadaResolutionConvergence,
  zeroOneTest,
  type RqaOptions
} from '../chaos';
import { buildJacobian, buildRhs } from '../physics/systemSpec';
import { boundedAngularObservable } from './angularObservable';
import { validateChaosRequestPayload } from './chaosRequestValidation';
import {
  type BasinRequest,
  type BasinResponse,
  type BifurcationRequest,
  type BifurcationResponse,
  type ChaosRequest,
  type ChaosResponse,
  type ClvRequest,
  type ClvResponse,
  type CodimTwoRequest,
  type CodimTwoResponse,
  type FtleRequest,
  type FtleResponse,
  type LyapunovRequest,
  type LyapunovResponse,
  type LyapunovSpectrumRequest,
  type LyapunovSpectrumResponse,
  type RqaJobSettings,
  type RqaRequest,
  type RqaResponse,
  type StudyPointRequest,
  type StudyPointResponse,
  type WadaConvergenceRequest,
  type WadaConvergenceResponse,
  type ZeroOneRequest,
  type ZeroOneResponse
} from './chaosProtocolSchema';
import { safeErrorMessage, safeRequestId } from './protocolSafety';
const wrapPi = (x: number): number => Math.atan2(Math.sin(x), Math.cos(x));

function rqaOptionsFromSettings(settings: RqaJobSettings): RqaOptions {
  return {
    dimension: settings.dimension ?? 2,
    delay: settings.delay ?? 5,
    targetRecurrenceRate: settings.targetRecurrenceRate ?? 0.1,
    ...(settings.epsilon === undefined ? {} : { epsilon: settings.epsilon }),
    ...(settings.lMin === undefined ? {} : { lMin: settings.lMin }),
    ...(settings.vMin === undefined ? {} : { vMin: settings.vMin }),
    ...(settings.theiler === undefined ? {} : { theiler: settings.theiler })
  };
}

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
    section: (s) => Math.sin(0.5 * (s[2] ?? 0)),
    direction: 'rising',
    observable: (s) => wrapPi(s[0] ?? 0),
    dt: req.settings.dt,
    maxTime: req.settings.maxTime,
    transientCrossings: req.settings.transientCrossings,
    maxPointsPerParam: req.settings.maxPointsPerParam
  });
  return {
    id: req.id,
    kind: 'bifurcation',
    ok: true,
    columns: columns.map((column) => ({ param: column.param, values: column.values }))
  };
}

function runLyapunovSpectrum(req: LyapunovSpectrumRequest): LyapunovSpectrumResponse {
  const rhs = buildRhs(req.spec);
  const count = req.count ?? req.state0.length;
  const result = lyapunovSpectrum(
    new Float64Array(req.state0),
    rhs,
    count,
    req.settings ?? {},
    buildJacobian(req.spec)
  );
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
  const p = new Array<number>(series.length);
  const q = new Array<number>(series.length);
  let P = 0;
  let Q = 0;
  for (let k = 1; k <= series.length; k += 1) {
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
  const settings = req.settings ?? {};
  const series = sampleObservable(rhs, req.state0, {
    dt: settings.dt ?? 0.01,
    sampleEvery: settings.sampleEvery ?? 30,
    samples: settings.samples ?? 3000,
    transientSteps: settings.transientSteps ?? 2000,
    observable: boundedAngularObservable(req.spec)
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
  const settings = req.settings ?? {};
  const series = sampleObservable(rhs, req.state0, {
    dt: settings.dt ?? 0.01,
    sampleEvery: settings.sampleEvery ?? 20,
    samples: settings.samples ?? 360,
    transientSteps: settings.transientSteps ?? 2000,
    observable: boundedAngularObservable(req.spec)
  });
  const rqaOptions = rqaOptionsFromSettings(settings);
  const result = recurrenceQuantification(series, rqaOptions);
  const matrix = recurrenceMatrix(series, rqaOptions);
  const uncertainty = rqaBlockUncertainty(series, rqaOptions, 4);
  return {
    id: req.id,
    kind: 'rqa',
    ok: true,
    recurrenceRate: result.recurrenceRate,
    determinism: result.determinism,
    laminarity: result.laminarity,
    longestDiagonal: result.longestDiagonal,
    divergence: result.divergence,
    meanDiagonal: result.meanDiagonal,
    entropy: result.entropy,
    trappingTime: result.trappingTime,
    epsilon: result.epsilon,
    plot: Array.from(matrix.matrix),
    plotSize: matrix.size,
    determinismStdError: uncertainty.determinism.stdError,
    divergenceStdError: uncertainty.divergence.stdError,
    uncertaintyBlocks: uncertainty.blocks
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
  const settings = req.settings ?? {};
  const lyap = maximalLyapunov(new Float64Array(req.state0), rhs, {
    steps: 8000,
    ...(settings.lyapunov ?? {})
  });
  const rqaSettings = settings.rqa ?? {};
  const series = sampleObservable(rhs, req.state0, {
    dt: rqaSettings.dt ?? 0.01,
    sampleEvery: rqaSettings.sampleEvery ?? 20,
    samples: rqaSettings.samples ?? 360,
    transientSteps: rqaSettings.transientSteps ?? 2000,
    observable: boundedAngularObservable(req.spec)
  });
  const rqa = recurrenceQuantification(series, rqaOptionsFromSettings(rqaSettings));
  const horizon = settings.ftleHorizon ?? 5;
  const ftle = finiteTimeLyapunov(req.state0, rhs, horizon, { dt: settings.ftleDt ?? 0.01 }, jacobian);
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

function runWadaConvergence(req: WadaConvergenceRequest): WadaConvergenceResponse {
  const params = { m1: req.spec.m1, m2: req.spec.m2, l1: req.spec.l1, l2: req.spec.l2, g: req.spec.g };
  return {
    id: req.id,
    kind: 'wadaConvergence',
    ok: true,
    result: wadaResolutionConvergence(params, req.settings ?? {})
  };
}

function runCodimTwo(req: CodimTwoRequest): CodimTwoResponse {
  const result = codimTwoDiagram(
    (x, y) => ({ ...req.base, driveAmplitude: x, damping: y }),
    req.state0,
    'driveAmplitude',
    req.xRange,
    'damping',
    req.yRange,
    req.settings ?? {}
  );
  return { id: req.id, kind: 'codim2', ok: true, result };
}

/** Execute a chaos job, converting malformed input or computation failures into an error response. */
export function runChaosJob(input: unknown): ChaosResponse {
  const id = safeRequestId(input);
  try {
    if (input === null || typeof input !== 'object') throw new TypeError('request must be an object');
    const req = input as ChaosRequest;
    if (typeof req.id !== 'string' || req.id.length === 0) throw new TypeError('request id must be a non-empty string');
    if (typeof req.kind !== 'string') throw new TypeError('request kind must be a string');
    const requestKind: string = req.kind;
    validateChaosRequestPayload(req);
    if (req.kind === 'lyapunov') return runLyapunov(req);
    if (req.kind === 'bifurcation') return runBifurcation(req);
    if (req.kind === 'lyapunovSpectrum') return runLyapunovSpectrum(req);
    if (req.kind === 'zeroOne') return runZeroOne(req);
    if (req.kind === 'clv') return runClv(req);
    if (req.kind === 'basin') return runBasin(req);
    if (req.kind === 'rqa') return runRqa(req);
    if (req.kind === 'ftle') return runFtle(req);
    if (req.kind === 'studyPoint') return runStudyPoint(req);
    if (req.kind === 'wadaConvergence') return runWadaConvergence(req);
    if (req.kind === 'codim2') return runCodimTwo(req);
    return { id, ok: false, error: `unknown request kind: ${requestKind}` };
  } catch (err) {
    return { id, ok: false, error: safeErrorMessage(err) };
  }
}
