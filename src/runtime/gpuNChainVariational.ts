import type { AccelerationComparison, AccelerationTolerance } from '../chaos/accelerationContract';
import { compareClvAcceleration } from '../chaos/accelerationContract';
import type { ClvResult, ClvSettings } from '../chaos/clv';
import { numericalJacobian } from '../physics/variational';
import { createChainWorkspace, rhsChain, validateChainParameters, type ChainParameters } from '../physics/nPendulum';
import { rk4Step } from '../physics/integrators';
import { runComputeKernel } from './gpuEnsemble';
import { WGSL_NCHAIN_VARIATIONAL_KERNEL } from './gpuNChainVariationalKernel';

const MAX_LINKS = 8;
const MAX_DIMENSION = MAX_LINKS * 2;
const MAX_WINDOW = 64;
const OUTPUT_VECTOR_OFFSET = 32;
const OUTPUT_FLOATS = OUTPUT_VECTOR_OFFSET + MAX_DIMENSION * MAX_DIMENSION;

export interface NChainVariationalOptions extends Partial<ClvSettings> {
  forceCpu?: boolean;
  ftleTolerance?: number;
  clvTolerances?: AccelerationTolerance;
}

export interface NChainVariationalSummary {
  dimension: number;
  links: number;
  clv: ClvResult;
  variationalFtle: number;
  horizon: number;
  method: 'piecewise-jacobian-rk2-stm-qr';
}

export interface WebgpuNChainVariationalCandidate {
  backend: 'webgpu';
  result: NChainVariationalSummary;
  elapsedMs: number;
  caveat: string;
}

export interface NChainVariationalComparison {
  passed: boolean;
  clv: AccelerationComparison;
  ftleAbsDiff: number;
  ftleTolerance: number;
}

export interface NChainVariationalPromotion {
  backend: 'webgpu' | 'cpu';
  result: NChainVariationalSummary;
  cpuOracle: NChainVariationalSummary;
  gpuCandidate: WebgpuNChainVariationalCandidate | null;
  comparison: NChainVariationalComparison | null;
  caveat: string;
}

interface ResolvedSettings extends ClvSettings {
  count: number;
}

const DEFAULTS: ResolvedSettings = {
  dt: 0.005,
  renormEvery: 4,
  forwardTransient: 6,
  window: 16,
  backwardTransient: 4,
  seed: 0,
  count: 0
};

function resolveSettings(dimension: number, options: NChainVariationalOptions): ResolvedSettings {
  return {
    dt: options.dt ?? DEFAULTS.dt,
    renormEvery: Math.floor(options.renormEvery ?? DEFAULTS.renormEvery),
    forwardTransient: Math.floor(options.forwardTransient ?? DEFAULTS.forwardTransient),
    window: Math.floor(options.window ?? DEFAULTS.window),
    backwardTransient: Math.floor(options.backwardTransient ?? DEFAULTS.backwardTransient),
    seed: options.seed ?? DEFAULTS.seed,
    count: dimension
  };
}

function validateInputs(parameters: ChainParameters, state0: ArrayLike<number>, settings: ResolvedSettings): number {
  validateChainParameters(parameters);
  const links = parameters.masses.length;
  const dimension = links * 2;
  if (links > MAX_LINKS)
    throw new Error(`N-chain WebGPU scope is limited to ${MAX_LINKS} links (${MAX_DIMENSION} state dimensions)`);
  if (state0.length !== dimension)
    throw new Error(`N-chain state length ${state0.length} does not match 2N=${dimension}`);
  if (!(settings.dt > 0) || settings.renormEvery <= 0 || settings.forwardTransient < 0 || settings.window <= 0) {
    throw new Error('N-chain variational settings require dt>0, renormEvery>0, forwardTransient>=0, and window>0');
  }
  if (settings.window > MAX_WINDOW)
    throw new Error(`N-chain WebGPU window exceeds the validated ceiling ${MAX_WINDOW}`);
  if (settings.backwardTransient < 0 || settings.backwardTransient >= settings.window) {
    throw new Error('N-chain backwardTransient must be in [0, window)');
  }
  return dimension;
}

/** Build the f64 reference trajectory and central-difference Jacobian tape. */
export function buildNChainJacobianTape(
  parameters: ChainParameters,
  state0: ArrayLike<number>,
  damping: number,
  settings: Pick<ResolvedSettings, 'dt' | 'renormEvery' | 'forwardTransient' | 'window'>
): Float64Array {
  const links = parameters.masses.length;
  const dimension = links * 2;
  const steps = (settings.forwardTransient + settings.window) * settings.renormEvery;
  const tape = new Float64Array(steps * dimension * dimension);
  const state = Float64Array.from(state0);
  const next = new Float64Array(dimension);
  const jacobian = new Float64Array(dimension * dimension);
  const scratch = new Float64Array(dimension);
  const plus = new Float64Array(dimension);
  const minus = new Float64Array(dimension);
  const workspace = createChainWorkspace(links);
  const rhs = (value: Float64Array, out: Float64Array): void => {
    rhsChain(value, parameters, damping, out, workspace);
  };
  for (let step = 0; step < steps; step += 1) {
    numericalJacobian(rhs, state, dimension, jacobian, scratch, plus, minus);
    tape.set(jacobian, step * dimension * dimension);
    rk4Step(state, settings.dt, rhs, next);
    state.set(next);
  }
  return tape;
}

function identity(dimension: number): Float64Array {
  const matrix = new Float64Array(dimension * dimension);
  for (let i = 0; i < dimension; i += 1) matrix[i * dimension + i] = 1;
  return matrix;
}

function tangentStep(matrix: Float64Array, jacobian: Float64Array, dimension: number, dt: number): void {
  const first = new Float64Array(matrix.length);
  const second = new Float64Array(matrix.length);
  for (let row = 0; row < dimension; row += 1) {
    for (let col = 0; col < dimension; col += 1) {
      let value = 0;
      for (let inner = 0; inner < dimension; inner += 1)
        value += (jacobian[row * dimension + inner] ?? 0) * (matrix[inner * dimension + col] ?? 0);
      first[row * dimension + col] = value;
    }
  }
  for (let row = 0; row < dimension; row += 1) {
    for (let col = 0; col < dimension; col += 1) {
      let value = 0;
      for (let inner = 0; inner < dimension; inner += 1)
        value += (jacobian[row * dimension + inner] ?? 0) * (first[inner * dimension + col] ?? 0);
      second[row * dimension + col] = value;
    }
  }
  const halfDtSquared = 0.5 * dt * dt;
  for (let i = 0; i < matrix.length; i += 1)
    matrix[i] = (matrix[i] ?? 0) + dt * (first[i] ?? 0) + halfDtSquared * (second[i] ?? 0);
}

function qrInPlace(matrix: Float64Array, dimension: number): Float64Array {
  const factor = new Float64Array(matrix.length);
  for (let col = 0; col < dimension; col += 1) {
    for (let previous = 0; previous < col; previous += 1) {
      let dot = 0;
      for (let row = 0; row < dimension; row += 1)
        dot += (matrix[row * dimension + col] ?? 0) * (matrix[row * dimension + previous] ?? 0);
      factor[previous * dimension + col] = dot;
      for (let row = 0; row < dimension; row += 1)
        matrix[row * dimension + col] =
          (matrix[row * dimension + col] ?? 0) - dot * (matrix[row * dimension + previous] ?? 0);
    }
    let normSquared = 0;
    for (let row = 0; row < dimension; row += 1) normSquared += (matrix[row * dimension + col] ?? 0) ** 2;
    const norm = Math.sqrt(normSquared);
    factor[col * dimension + col] = norm;
    const inverse = norm > 1e-20 ? 1 / norm : 0;
    for (let row = 0; row < dimension; row += 1)
      matrix[row * dimension + col] = (matrix[row * dimension + col] ?? 0) * inverse;
  }
  return factor;
}

function normalizeColumns(matrix: Float64Array, dimension: number): void {
  for (let col = 0; col < dimension; col += 1) {
    let normSquared = 0;
    for (let row = 0; row < dimension; row += 1) normSquared += (matrix[row * dimension + col] ?? 0) ** 2;
    const inverse = normSquared > 0 ? 1 / Math.sqrt(normSquared) : 0;
    for (let row = 0; row < dimension; row += 1)
      matrix[row * dimension + col] = (matrix[row * dimension + col] ?? 0) * inverse;
  }
}

function solveUpper(factor: Float64Array, coefficients: Float64Array, dimension: number): Float64Array {
  const solved = new Float64Array(coefficients.length);
  for (let col = 0; col < dimension; col += 1) {
    for (let row = dimension - 1; row >= 0; row -= 1) {
      let value = coefficients[row * dimension + col] ?? 0;
      for (let inner = row + 1; inner < dimension; inner += 1)
        value -= (factor[row * dimension + inner] ?? 0) * (solved[inner * dimension + col] ?? 0);
      const diagonal = factor[row * dimension + row] ?? 0;
      solved[row * dimension + col] = Math.abs(diagonal) > 1e-20 ? value / diagonal : 0;
    }
  }
  normalizeColumns(solved, dimension);
  return solved;
}

function clvVectors(frame: Float64Array, coefficients: Float64Array, dimension: number): Float64Array {
  const rowMajor = new Float64Array(frame.length);
  for (let row = 0; row < dimension; row += 1) {
    for (let col = 0; col < dimension; col += 1) {
      let value = 0;
      for (let inner = 0; inner < dimension; inner += 1)
        value += (frame[row * dimension + inner] ?? 0) * (coefficients[inner * dimension + col] ?? 0);
      rowMajor[row * dimension + col] = value;
    }
  }
  normalizeColumns(rowMajor, dimension);
  const columnPacked = new Float64Array(frame.length);
  for (let col = 0; col < dimension; col += 1) {
    for (let row = 0; row < dimension; row += 1)
      columnPacked[col * dimension + row] = rowMajor[row * dimension + col] ?? 0;
  }
  return columnPacked;
}

function hyperbolicityAngle(vectors: Float64Array, dimension: number, exponents: readonly number[]): number {
  const zeroTolerance = 1e-6 + 0.05 * Math.max(...exponents.map(Math.abs), 0);
  let minimum = Math.PI / 2;
  let found = false;
  for (let expanding = 0; expanding < dimension; expanding += 1) {
    if ((exponents[expanding] ?? 0) <= zeroTolerance) continue;
    for (let contracting = 0; contracting < dimension; contracting += 1) {
      if ((exponents[contracting] ?? 0) >= -zeroTolerance) continue;
      let dot = 0;
      for (let row = 0; row < dimension; row += 1)
        dot += (vectors[expanding * dimension + row] ?? 0) * (vectors[contracting * dimension + row] ?? 0);
      minimum = Math.min(minimum, Math.acos(Math.min(1, Math.abs(dot))));
      found = true;
    }
  }
  return found ? minimum : Number.NaN;
}

function largestSingularFtle(stm: Float64Array, dimension: number, horizon: number): number {
  const cauchyGreen = new Float64Array(stm.length);
  for (let row = 0; row < dimension; row += 1) {
    for (let col = 0; col < dimension; col += 1) {
      let value = 0;
      for (let inner = 0; inner < dimension; inner += 1)
        value += (stm[inner * dimension + row] ?? 0) * (stm[inner * dimension + col] ?? 0);
      cauchyGreen[row * dimension + col] = value;
    }
  }
  let vector = new Float64Array(dimension);
  vector.fill(1 / Math.sqrt(dimension));
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const next = new Float64Array(dimension);
    let normSquared = 0;
    for (let row = 0; row < dimension; row += 1) {
      for (let col = 0; col < dimension; col += 1)
        next[row] = (next[row] ?? 0) + (cauchyGreen[row * dimension + col] ?? 0) * (vector[col] ?? 0);
      normSquared += (next[row] ?? 0) ** 2;
    }
    const inverse = normSquared > 0 ? 1 / Math.sqrt(normSquared) : 0;
    for (let i = 0; i < dimension; i += 1) next[i] = (next[i] ?? 0) * inverse;
    vector = next;
  }
  let eigenvalue = 0;
  for (let row = 0; row < dimension; row += 1) {
    let value = 0;
    for (let col = 0; col < dimension; col += 1)
      value += (cauchyGreen[row * dimension + col] ?? 0) * (vector[col] ?? 0);
    eigenvalue += (vector[row] ?? 0) * value;
  }
  return (0.5 * Math.log(Math.max(eigenvalue, 1e-20))) / horizon;
}

/** CPU f64 oracle for the exact Jacobian-tape contract consumed by WebGPU. */
export function nChainVariationalCpuOracle(
  parameters: ChainParameters,
  state0: ArrayLike<number>,
  options: NChainVariationalOptions = {},
  damping = 0
): NChainVariationalSummary {
  const dimension = parameters.masses.length * 2;
  const settings = resolveSettings(dimension, options);
  validateInputs(parameters, state0, settings);
  const tape = buildNChainJacobianTape(parameters, state0, damping, settings);
  return evaluateTapeCpu(tape, parameters.masses.length, settings);
}

function evaluateTapeCpu(tape: Float64Array, links: number, settings: ResolvedSettings): NChainVariationalSummary {
  const dimension = links * 2;
  const matrixSize = dimension * dimension;
  const frame = identity(dimension);
  let stm = identity(dimension);
  const frames: Float64Array[] = [];
  const factors: Float64Array[] = [];
  const exponentSums = new Array<number>(dimension).fill(0);
  const totalIntervals = settings.forwardTransient + settings.window;
  if (settings.forwardTransient === 0) frames.push(frame.slice());
  for (let interval = 1; interval <= totalIntervals; interval += 1) {
    for (let localStep = 0; localStep < settings.renormEvery; localStep += 1) {
      const step = (interval - 1) * settings.renormEvery + localStep;
      const jacobian = tape.subarray(step * matrixSize, (step + 1) * matrixSize);
      tangentStep(frame, jacobian, dimension, settings.dt);
      tangentStep(stm, jacobian, dimension, settings.dt);
    }
    const factor = qrInPlace(frame, dimension);
    if (interval <= settings.forwardTransient) {
      if (interval === settings.forwardTransient) {
        stm = identity(dimension);
        frames.push(frame.slice());
      }
      continue;
    }
    factors.push(factor);
    frames.push(frame.slice());
    for (let col = 0; col < dimension; col += 1)
      exponentSums[col] = (exponentSums[col] ?? 0) + Math.log(Math.max(factor[col * dimension + col] ?? 0, 1e-20));
  }
  const horizon = settings.window * settings.renormEvery * settings.dt;
  const exponents = exponentSums.map((value) => value / horizon);
  let coefficients = identity(dimension);
  const analysisMax = settings.window - settings.backwardTransient;
  const angles: number[] = [];
  let firstVectors: Float64Array = new Float64Array(matrixSize);
  for (let index = settings.window - 1; index >= 0; index -= 1) {
    coefficients = solveUpper(factors[index]!, coefficients, dimension);
    if (index <= analysisMax) {
      const vectors = clvVectors(frames[index]!, coefficients, dimension);
      if (index === 0) firstVectors = vectors;
      const angle = hyperbolicityAngle(vectors, dimension, exponents);
      if (Number.isFinite(angle)) angles.push(angle);
    }
  }
  const meanAngle = angles.length ? angles.reduce((sum, value) => sum + value, 0) / angles.length : Number.NaN;
  const minAngle = angles.length ? Math.min(...angles) : Number.NaN;
  return {
    dimension,
    links,
    horizon,
    method: 'piecewise-jacobian-rk2-stm-qr',
    variationalFtle: largestSingularFtle(stm, dimension, horizon),
    clv: {
      exponents,
      times: [0],
      vectors: [firstVectors],
      hyperbolicityAngles: angles,
      meanHyperbolicityAngle: meanAngle,
      minHyperbolicityAngle: minAngle,
      settings
    }
  };
}

export async function webgpuNChainVariationalCandidate(
  parameters: ChainParameters,
  state0: ArrayLike<number>,
  options: NChainVariationalOptions = {},
  damping = 0
): Promise<WebgpuNChainVariationalCandidate | null> {
  const dimension = parameters.masses.length * 2;
  const settings = resolveSettings(dimension, options);
  validateInputs(parameters, state0, settings);
  if (options.forceCpu) return null;
  const tape = buildNChainJacobianTape(parameters, state0, damping, settings);
  const matrixSize = dimension * dimension;
  const jacobianOffset = OUTPUT_FLOATS;
  const framesOffset = jacobianOffset + tape.length;
  const factorsOffset = framesOffset + (settings.window + 1) * matrixSize;
  const io = new Float32Array(factorsOffset + settings.window * matrixSize);
  for (let i = 0; i < tape.length; i += 1) io[jacobianOffset + i] = tape[i] ?? 0;
  const uniform = new Float32Array([
    dimension,
    settings.renormEvery,
    settings.forwardTransient,
    settings.window,
    settings.backwardTransient,
    settings.dt,
    jacobianOffset,
    framesOffset,
    factorsOffset,
    OUTPUT_VECTOR_OFFSET,
    0,
    0,
    0,
    0,
    0,
    0
  ]);
  const started = typeof performance === 'undefined' ? Date.now() : performance.now();
  const reduced = await runComputeKernel(WGSL_NCHAIN_VARIATIONAL_KERNEL, uniform, io, 256);
  const elapsedMs = (typeof performance === 'undefined' ? Date.now() : performance.now()) - started;
  if (!reduced || (reduced[0] ?? -1) < 0) return null;
  const exponents = Array.from(reduced.slice(8, 8 + dimension), Number);
  const vectors = new Float64Array(matrixSize);
  for (let i = 0; i < matrixSize; i += 1) vectors[i] = Number(reduced[OUTPUT_VECTOR_OFFSET + i] ?? 0);
  const meanAngle = Number(reduced[3] ?? NaN);
  const minAngle = Number(reduced[4] ?? NaN);
  const angleCount = Math.round(Number(reduced[5] ?? 0));
  const ftle = Number(reduced[2] ?? NaN);
  if (![...exponents, meanAngle, minAngle, ftle].every(Number.isFinite) || angleCount <= 0) return null;
  return {
    backend: 'webgpu',
    elapsedMs,
    result: {
      dimension,
      links: parameters.masses.length,
      horizon: Number(reduced[6] ?? settings.window * settings.renormEvery * settings.dt),
      method: 'piecewise-jacobian-rk2-stm-qr',
      variationalFtle: ftle,
      clv: {
        exponents,
        times: [0],
        vectors: [vectors],
        hyperbolicityAngles: [minAngle],
        meanHyperbolicityAngle: meanAngle,
        minHyperbolicityAngle: minAngle,
        settings
      }
    },
    caveat:
      'Hybrid N-chain WebGPU candidate: the CPU f64 reference trajectory supplies a central-difference Jacobian tape; WebGPU f32 performs tiled STM propagation, QR tape, Ginelli backward solve, and the variational FTLE singular-value estimate.'
  };
}

export async function promotedNChainVariational(
  parameters: ChainParameters,
  state0: ArrayLike<number>,
  options: NChainVariationalOptions = {},
  damping = 0
): Promise<NChainVariationalPromotion> {
  const cpuOracle = nChainVariationalCpuOracle(parameters, state0, options, damping);
  const gpuCandidate = await webgpuNChainVariationalCandidate(parameters, state0, options, damping);
  if (!gpuCandidate) {
    return {
      backend: 'cpu',
      result: cpuOracle,
      cpuOracle,
      gpuCandidate: null,
      comparison: null,
      caveat:
        'CPU f64 N-chain variational result returned because WebGPU was unavailable, disabled, or outside the validated N<=8 scope.'
    };
  }
  const clv = compareClvAcceleration(gpuCandidate.result.clv, cpuOracle.clv, {
    exponents: 0.12,
    angle: 0.24,
    ...options.clvTolerances
  });
  const ftleAbsDiff = Math.abs(gpuCandidate.result.variationalFtle - cpuOracle.variationalFtle);
  const ftleTolerance = options.ftleTolerance ?? 0.1;
  const comparison = { passed: clv.passed && ftleAbsDiff <= ftleTolerance, clv, ftleAbsDiff, ftleTolerance };
  if (!comparison.passed) {
    return {
      backend: 'cpu',
      result: cpuOracle,
      cpuOracle,
      gpuCandidate,
      comparison,
      caveat:
        'CPU f64 N-chain variational result returned because the WebGPU f32 candidate failed the same-tape oracle gate.'
    };
  }
  return {
    backend: 'webgpu',
    result: gpuCandidate.result,
    cpuOracle,
    gpuCandidate,
    comparison,
    caveat:
      'N-chain WebGPU STM/QR/CLV/FTLE result promoted only after same-run CPU f64 Jacobian-tape comparison. Nonlinear trajectory integration and Jacobian construction remain CPU f64.'
  };
}
