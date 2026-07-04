import type { AccelerationComparison, AccelerationTolerance } from '../chaos/accelerationContract';
import { compareClvAcceleration } from '../chaos/accelerationContract';
import type { ClvResult, ClvSettings } from '../chaos/clv';
import { numericalJacobian } from '../physics/variational';
import { createChainWorkspace, rhsChain, validateChainParameters, type ChainParameters } from '../physics/nPendulum';
import { rk4Step } from '../physics/integrators';
import { runComputeKernel } from './gpuEnsemble';
import { WGSL_NCHAIN_TRAJECTORY_TAPE_KERNEL, WGSL_NCHAIN_VARIATIONAL_KERNEL } from './gpuNChainVariationalKernel';

const MAX_LINKS = 8;
const MAX_TRAJECTORY_TAPE_LINKS = 3;
const MAX_DIMENSION = MAX_LINKS * 2;
const MAX_WINDOW = 64;
const OUTPUT_VECTOR_OFFSET = 32;
const OUTPUT_FLOATS = OUTPUT_VECTOR_OFFSET + MAX_DIMENSION * MAX_DIMENSION;

export interface NChainVariationalOptions extends Partial<ClvSettings> {
  forceCpu?: boolean;
  ftleTolerance?: number;
  clvTolerances?: AccelerationTolerance;
  trajectoryTapeTolerances?: NChainTrajectoryTapeTolerances;
}

export interface NChainTrajectoryTapeTolerances {
  finalState?: number;
  trajectory?: number;
  jacobian?: number;
}

export interface NChainTrajectoryTapeSummary {
  dimension: number;
  links: number;
  steps: number;
  dt: number;
  finalState: number[];
  trajectory: Float64Array;
  jacobianTape: Float64Array;
  method: 'rk4-central-difference-jacobian-tape';
}

export interface WebgpuNChainTrajectoryTapeCandidate {
  backend: 'webgpu';
  result: NChainTrajectoryTapeSummary;
  elapsedMs: number;
  caveat: string;
}

export interface NChainTrajectoryTapeComparison {
  passed: boolean;
  maxFinalStateAbsDiff: number;
  maxTrajectoryAbsDiff: number;
  maxJacobianAbsDiff: number;
  tolerances: Required<NChainTrajectoryTapeTolerances>;
}

export interface NChainTrajectoryTapePromotion {
  backend: 'webgpu' | 'cpu';
  result: NChainTrajectoryTapeSummary;
  cpuOracle: NChainTrajectoryTapeSummary;
  gpuCandidate: WebgpuNChainTrajectoryTapeCandidate | null;
  comparison: NChainTrajectoryTapeComparison | null;
  caveat: string;
}

export interface NChainVariationalSummary {
  dimension: number;
  links: number;
  clv: ClvResult;
  variationalFtle: number;
  horizon: number;
  method: 'piecewise-jacobian-rk2-stm-qr';
  trajectoryTapeSource: 'cpu-f64' | 'webgpu-f32-promoted';
}

export interface WebgpuNChainVariationalCandidate {
  backend: 'webgpu';
  result: NChainVariationalSummary;
  trajectoryTapePromotion: NChainTrajectoryTapePromotion;
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
  if (links > MAX_LINKS) throw new Error(`N-chain WebGPU scope is limited to ${MAX_LINKS} links (${MAX_DIMENSION} state dimensions)`);
  if (state0.length !== dimension) throw new Error(`N-chain state length ${state0.length} does not match 2N=${dimension}`);
  if (!(settings.dt > 0) || settings.renormEvery <= 0 || settings.forwardTransient < 0 || settings.window <= 0) {
    throw new Error('N-chain variational settings require dt>0, renormEvery>0, forwardTransient>=0, and window>0');
  }
  if (settings.window > MAX_WINDOW) throw new Error(`N-chain WebGPU window exceeds the validated ceiling ${MAX_WINDOW}`);
  if (settings.backwardTransient < 0 || settings.backwardTransient >= settings.window) {
    throw new Error('N-chain backwardTransient must be in [0, window)');
  }
  return dimension;
}

const DEFAULT_TRAJECTORY_TAPE_TOLERANCES: Required<NChainTrajectoryTapeTolerances> = {
  finalState: 5e-3,
  trajectory: 5e-3,
  jacobian: 5e-2
};

function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let max = Math.abs(a.length - b.length);
  for (let i = 0; i < n; i += 1) max = Math.max(max, Math.abs(Number(a[i] ?? 0) - Number(b[i] ?? 0)));
  return max;
}

function resolveTapeTolerances(tolerances: NChainTrajectoryTapeTolerances | undefined): Required<NChainTrajectoryTapeTolerances> {
  return { ...DEFAULT_TRAJECTORY_TAPE_TOLERANCES, ...tolerances };
}

/** Build the f64 reference trajectory and central-difference Jacobian tape. */
export function buildNChainTrajectoryJacobianTape(
  parameters: ChainParameters,
  state0: ArrayLike<number>,
  damping: number,
  settings: Pick<ResolvedSettings, 'dt' | 'renormEvery' | 'forwardTransient' | 'window'>
): NChainTrajectoryTapeSummary {
  const links = parameters.masses.length;
  const dimension = links * 2;
  const steps = (settings.forwardTransient + settings.window) * settings.renormEvery;
  const tape = new Float64Array(steps * dimension * dimension);
  const trajectory = new Float64Array((steps + 1) * dimension);
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
    trajectory.set(state, step * dimension);
    numericalJacobian(rhs, state, dimension, jacobian, scratch, plus, minus);
    tape.set(jacobian, step * dimension * dimension);
    rk4Step(state, settings.dt, rhs, next);
    state.set(next);
  }
  trajectory.set(state, steps * dimension);
  return {
    dimension,
    links,
    steps,
    dt: settings.dt,
    finalState: Array.from(state),
    trajectory,
    jacobianTape: tape,
    method: 'rk4-central-difference-jacobian-tape'
  };
}

/** Build only the f64 central-difference Jacobian tape consumed by legacy callers. */
export function buildNChainJacobianTape(
  parameters: ChainParameters,
  state0: ArrayLike<number>,
  damping: number,
  settings: Pick<ResolvedSettings, 'dt' | 'renormEvery' | 'forwardTransient' | 'window'>
): Float64Array {
  return buildNChainTrajectoryJacobianTape(parameters, state0, damping, settings).jacobianTape;
}

export function compareNChainTrajectoryTape(
  candidate: NChainTrajectoryTapeSummary,
  oracle: NChainTrajectoryTapeSummary,
  tolerances?: NChainTrajectoryTapeTolerances
): NChainTrajectoryTapeComparison {
  const resolved = resolveTapeTolerances(tolerances);
  const maxFinalStateAbsDiff = maxAbsDiff(candidate.finalState, oracle.finalState);
  const maxTrajectoryAbsDiff = maxAbsDiff(candidate.trajectory, oracle.trajectory);
  const maxJacobianAbsDiff = maxAbsDiff(candidate.jacobianTape, oracle.jacobianTape);
  return {
    passed: candidate.dimension === oracle.dimension
      && candidate.steps === oracle.steps
      && maxFinalStateAbsDiff <= resolved.finalState
      && maxTrajectoryAbsDiff <= resolved.trajectory
      && maxJacobianAbsDiff <= resolved.jacobian,
    maxFinalStateAbsDiff,
    maxTrajectoryAbsDiff,
    maxJacobianAbsDiff,
    tolerances: resolved
  };
}

export async function webgpuNChainTrajectoryTapeCandidate(
  parameters: ChainParameters,
  state0: ArrayLike<number>,
  options: NChainVariationalOptions = {},
  damping = 0
): Promise<WebgpuNChainTrajectoryTapeCandidate | null> {
  const dimension = parameters.masses.length * 2;
  const settings = resolveSettings(dimension, options);
  validateInputs(parameters, state0, settings);
  if (options.forceCpu || parameters.masses.length > MAX_TRAJECTORY_TAPE_LINKS) return null;
  const steps = (settings.forwardTransient + settings.window) * settings.renormEvery;
  const trajectoryOffset = 16;
  const trajectoryLength = (steps + 1) * dimension;
  const tapeOffset = trajectoryOffset + trajectoryLength;
  const tapeLength = steps * dimension * dimension;
  const finalStateOffset = tapeOffset + tapeLength;
  const io = new Float32Array(finalStateOffset + dimension);
  for (let i = 0; i < dimension; i += 1) io[i] = Number(state0[i] ?? 0);
  const masses = [parameters.masses[0] ?? 0, parameters.masses[1] ?? 0, parameters.masses[2] ?? 0];
  const lengths = [parameters.lengths[0] ?? 0, parameters.lengths[1] ?? 0, parameters.lengths[2] ?? 0];
  const uniform = new Float32Array([
    masses[0]!, masses[1]!, masses[2]!, lengths[0]!,
    lengths[1]!, lengths[2]!, parameters.g, damping,
    parameters.masses.length, dimension, settings.dt, steps,
    1e-3, trajectoryOffset, tapeOffset, finalStateOffset
  ]);
  const started = typeof performance === 'undefined' ? Date.now() : performance.now();
  const reduced = await runComputeKernel(WGSL_NCHAIN_TRAJECTORY_TAPE_KERNEL, uniform, io, 1);
  const elapsedMs = (typeof performance === 'undefined' ? Date.now() : performance.now()) - started;
  if (!reduced || (reduced[0] ?? -1) < 0) return null;
  const trajectory = new Float64Array(trajectoryLength);
  const jacobianTape = new Float64Array(tapeLength);
  const finalState = new Array<number>(dimension);
  for (let i = 0; i < trajectoryLength; i += 1) trajectory[i] = Number(reduced[trajectoryOffset + i] ?? NaN);
  for (let i = 0; i < tapeLength; i += 1) jacobianTape[i] = Number(reduced[tapeOffset + i] ?? NaN);
  for (let i = 0; i < dimension; i += 1) finalState[i] = Number(reduced[finalStateOffset + i] ?? NaN);
  if (![...finalState, ...Array.from(trajectory), ...Array.from(jacobianTape)].every(Number.isFinite)) return null;
  return {
    backend: 'webgpu',
    elapsedMs,
    result: {
      dimension,
      links: parameters.masses.length,
      steps,
      dt: settings.dt,
      finalState,
      trajectory,
      jacobianTape,
      method: 'rk4-central-difference-jacobian-tape'
    },
    caveat: `WebGPU f32 nonlinear trajectory and central-difference Jacobian-tape candidate for planar N-chain N<=${MAX_TRAJECTORY_TAPE_LINKS}; promotable only after same-run CPU f64 trajectory/tape comparison.`
  };
}

export async function promotedNChainTrajectoryTape(
  parameters: ChainParameters,
  state0: ArrayLike<number>,
  options: NChainVariationalOptions = {},
  damping = 0
): Promise<NChainTrajectoryTapePromotion> {
  const dimension = parameters.masses.length * 2;
  const settings = resolveSettings(dimension, options);
  validateInputs(parameters, state0, settings);
  const cpuOracle = buildNChainTrajectoryJacobianTape(parameters, state0, damping, settings);
  const gpuCandidate = await webgpuNChainTrajectoryTapeCandidate(parameters, state0, options, damping);
  if (!gpuCandidate) {
    return {
      backend: 'cpu',
      result: cpuOracle,
      cpuOracle,
      gpuCandidate: null,
      comparison: null,
      caveat: `CPU f64 trajectory/Jacobian tape returned because WebGPU was unavailable, disabled, or outside the N<=${MAX_TRAJECTORY_TAPE_LINKS} trajectory-tape candidate scope.`
    };
  }
  const comparison = compareNChainTrajectoryTape(gpuCandidate.result, cpuOracle, options.trajectoryTapeTolerances);
  if (!comparison.passed) {
    return {
      backend: 'cpu',
      result: cpuOracle,
      cpuOracle,
      gpuCandidate,
      comparison,
      caveat: 'CPU f64 trajectory/Jacobian tape returned because the WebGPU f32 trajectory-tape candidate failed its CPU oracle promotion gate.'
    };
  }
  return {
    backend: 'webgpu',
    result: gpuCandidate.result,
    cpuOracle,
    gpuCandidate,
    comparison,
    caveat: 'WebGPU f32 trajectory/Jacobian tape promoted for this run after same-run CPU f64 comparison; downstream science still requires its own CLV/FTLE oracle gate.'
  };
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
      for (let inner = 0; inner < dimension; inner += 1) value += (jacobian[row * dimension + inner] ?? 0) * (matrix[inner * dimension + col] ?? 0);
      first[row * dimension + col] = value;
    }
  }
  for (let row = 0; row < dimension; row += 1) {
    for (let col = 0; col < dimension; col += 1) {
      let value = 0;
      for (let inner = 0; inner < dimension; inner += 1) value += (jacobian[row * dimension + inner] ?? 0) * (first[inner * dimension + col] ?? 0);
      second[row * dimension + col] = value;
    }
  }
  const halfDtSquared = 0.5 * dt * dt;
  for (let i = 0; i < matrix.length; i += 1) matrix[i] = (matrix[i] ?? 0) + dt * (first[i] ?? 0) + halfDtSquared * (second[i] ?? 0);
}

function qrInPlace(matrix: Float64Array, dimension: number): Float64Array {
  const factor = new Float64Array(matrix.length);
  for (let col = 0; col < dimension; col += 1) {
    for (let previous = 0; previous < col; previous += 1) {
      let dot = 0;
      for (let row = 0; row < dimension; row += 1) dot += (matrix[row * dimension + col] ?? 0) * (matrix[row * dimension + previous] ?? 0);
      factor[previous * dimension + col] = dot;
      for (let row = 0; row < dimension; row += 1) matrix[row * dimension + col] = (matrix[row * dimension + col] ?? 0) - dot * (matrix[row * dimension + previous] ?? 0);
    }
    let normSquared = 0;
    for (let row = 0; row < dimension; row += 1) normSquared += (matrix[row * dimension + col] ?? 0) ** 2;
    const norm = Math.sqrt(normSquared);
    factor[col * dimension + col] = norm;
    const inverse = norm > 1e-20 ? 1 / norm : 0;
    for (let row = 0; row < dimension; row += 1) matrix[row * dimension + col] = (matrix[row * dimension + col] ?? 0) * inverse;
  }
  return factor;
}

function normalizeColumns(matrix: Float64Array, dimension: number): void {
  for (let col = 0; col < dimension; col += 1) {
    let normSquared = 0;
    for (let row = 0; row < dimension; row += 1) normSquared += (matrix[row * dimension + col] ?? 0) ** 2;
    const inverse = normSquared > 0 ? 1 / Math.sqrt(normSquared) : 0;
    for (let row = 0; row < dimension; row += 1) matrix[row * dimension + col] = (matrix[row * dimension + col] ?? 0) * inverse;
  }
}

function solveUpper(factor: Float64Array, coefficients: Float64Array, dimension: number): Float64Array {
  const solved = new Float64Array(coefficients.length);
  for (let col = 0; col < dimension; col += 1) {
    for (let row = dimension - 1; row >= 0; row -= 1) {
      let value = coefficients[row * dimension + col] ?? 0;
      for (let inner = row + 1; inner < dimension; inner += 1) value -= (factor[row * dimension + inner] ?? 0) * (solved[inner * dimension + col] ?? 0);
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
      for (let inner = 0; inner < dimension; inner += 1) value += (frame[row * dimension + inner] ?? 0) * (coefficients[inner * dimension + col] ?? 0);
      rowMajor[row * dimension + col] = value;
    }
  }
  normalizeColumns(rowMajor, dimension);
  const columnPacked = new Float64Array(frame.length);
  for (let col = 0; col < dimension; col += 1) {
    for (let row = 0; row < dimension; row += 1) columnPacked[col * dimension + row] = rowMajor[row * dimension + col] ?? 0;
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
      for (let row = 0; row < dimension; row += 1) dot += (vectors[expanding * dimension + row] ?? 0) * (vectors[contracting * dimension + row] ?? 0);
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
      for (let inner = 0; inner < dimension; inner += 1) value += (stm[inner * dimension + row] ?? 0) * (stm[inner * dimension + col] ?? 0);
      cauchyGreen[row * dimension + col] = value;
    }
  }
  let vector = new Float64Array(dimension);
  vector.fill(1 / Math.sqrt(dimension));
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const next = new Float64Array(dimension);
    let normSquared = 0;
    for (let row = 0; row < dimension; row += 1) {
      for (let col = 0; col < dimension; col += 1) next[row] = (next[row] ?? 0) + (cauchyGreen[row * dimension + col] ?? 0) * (vector[col] ?? 0);
      normSquared += (next[row] ?? 0) ** 2;
    }
    const inverse = normSquared > 0 ? 1 / Math.sqrt(normSquared) : 0;
    for (let i = 0; i < dimension; i += 1) next[i] = (next[i] ?? 0) * inverse;
    vector = next;
  }
  let eigenvalue = 0;
  for (let row = 0; row < dimension; row += 1) {
    let value = 0;
    for (let col = 0; col < dimension; col += 1) value += (cauchyGreen[row * dimension + col] ?? 0) * (vector[col] ?? 0);
    eigenvalue += (vector[row] ?? 0) * value;
  }
  return 0.5 * Math.log(Math.max(eigenvalue, 1e-20)) / horizon;
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

function evaluateTapeCpu(
  tape: Float64Array,
  links: number,
  settings: ResolvedSettings,
  trajectoryTapeSource: NChainVariationalSummary['trajectoryTapeSource'] = 'cpu-f64'
): NChainVariationalSummary {
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
    for (let col = 0; col < dimension; col += 1) exponentSums[col] = (exponentSums[col] ?? 0) + Math.log(Math.max(factor[col * dimension + col] ?? 0, 1e-20));
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
    trajectoryTapeSource,
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
  const trajectoryTapePromotion = await promotedNChainTrajectoryTape(parameters, state0, options, damping);
  const tape = trajectoryTapePromotion.result.jacobianTape;
  const matrixSize = dimension * dimension;
  const jacobianOffset = OUTPUT_FLOATS;
  const framesOffset = jacobianOffset + tape.length;
  const factorsOffset = framesOffset + (settings.window + 1) * matrixSize;
  const io = new Float32Array(factorsOffset + settings.window * matrixSize);
  for (let i = 0; i < tape.length; i += 1) io[jacobianOffset + i] = tape[i] ?? 0;
  const uniform = new Float32Array([
    dimension, settings.renormEvery, settings.forwardTransient, settings.window,
    settings.backwardTransient, settings.dt, jacobianOffset, framesOffset,
    factorsOffset, OUTPUT_VECTOR_OFFSET, 0, 0, 0, 0, 0, 0
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
      trajectoryTapeSource: trajectoryTapePromotion.backend === 'webgpu' ? 'webgpu-f32-promoted' : 'cpu-f64',
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
    trajectoryTapePromotion,
    caveat: trajectoryTapePromotion.backend === 'webgpu'
      ? 'N-chain WebGPU candidate uses a promoted f32 nonlinear trajectory/Jacobian tape, then performs tiled STM propagation, QR tape, Ginelli backward solve, and the variational FTLE singular-value estimate. It remains promotable only after the final CPU f64 CLV/FTLE oracle gate.'
      : 'Hybrid N-chain WebGPU candidate: the CPU f64 reference trajectory supplies a central-difference Jacobian tape; WebGPU f32 performs tiled STM propagation, QR tape, Ginelli backward solve, and the variational FTLE singular-value estimate.'
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
      caveat: 'CPU f64 N-chain variational result returned because WebGPU was unavailable, disabled, or outside the validated N<=8 scope.'
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
      caveat: 'CPU f64 N-chain variational result returned because the WebGPU f32 candidate failed the same-tape oracle gate.'
    };
  }
  return {
    backend: 'webgpu',
    result: gpuCandidate.result,
    cpuOracle,
    gpuCandidate,
    comparison,
    caveat: 'N-chain WebGPU STM/QR/CLV/FTLE result promoted only after same-run CPU f64 Jacobian-tape comparison. Nonlinear trajectory integration and Jacobian construction remain CPU f64.'
  };
}
