import type { ClvResult, ClvSettings } from '../chaos/clv';

export interface NChainVariationalSummary {
  dimension: number;
  links: number;
  clv: ClvResult;
  variationalFtle: number;
  horizon: number;
  method: 'piecewise-jacobian-rk2-stm-qr';
  trajectoryTapeSource: 'cpu-f64' | 'webgpu-f32-promoted';
}

interface ResolvedSettings extends ClvSettings {
  count: number;
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

export function evaluateNChainVariationalTapeCpu(
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
