import type { PendulumParameters } from '../types/domain';
import type { StateVector } from './types';
import { MASS_MATRIX_SINGULARITY_THRESHOLD as DET_THRESHOLD } from './constants';

export function rhsTriple(
  state: ArrayLike<number>,
  parameters: Required<PendulumParameters>,
  gamma: number,
  out: StateVector
): StateVector {
  const t1 = Number(state[0] ?? 0);
  const t2 = Number(state[1] ?? 0);
  const t3 = Number(state[2] ?? 0);
  const w1 = Number(state[3] ?? 0);
  const w2 = Number(state[4] ?? 0);
  const w3 = Number(state[5] ?? 0);
  const { m1, m2, m3, l1, l2, l3, g } = parameters;
  const d12 = t1 - t2;
  const d23 = t2 - t3;
  const d13 = t1 - t3;
  const matrix = new Float64Array(12);

  const m11 = (m1 + m2 + m3) * l1 * l1;
  const m12 = (m2 + m3) * l1 * l2 * Math.cos(d12);
  const m13 = m3 * l1 * l3 * Math.cos(d13);
  const m22 = (m2 + m3) * l2 * l2;
  const m23 = m3 * l2 * l3 * Math.cos(d23);
  const m33 = m3 * l3 * l3;
  const f1 =
    -(m2 + m3) * l1 * l2 * Math.sin(d12) * w2 * w2 -
    m3 * l1 * l3 * Math.sin(d13) * w3 * w3 -
    (m1 + m2 + m3) * g * l1 * Math.sin(t1) -
    gamma * w1;
  const f2 =
    (m2 + m3) * l1 * l2 * Math.sin(d12) * w1 * w1 -
    m3 * l2 * l3 * Math.sin(d23) * w3 * w3 -
    (m2 + m3) * g * l2 * Math.sin(t2) -
    gamma * w2;
  const f3 =
    m3 * l1 * l3 * Math.sin(d13) * w1 * w1 +
    m3 * l2 * l3 * Math.sin(d23) * w2 * w2 -
    m3 * g * l3 * Math.sin(t3) -
    gamma * w3;

  matrix.set([m11, m12, m13, f1, m12, m22, m23, f2, m13, m23, m33, f3]);
  for (let c = 0; c < 3; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < 3; r += 1) {
      if (Math.abs(matrix[r * 4 + c] ?? 0) > Math.abs(matrix[pivot * 4 + c] ?? 0)) pivot = r;
    }
    if (pivot !== c) {
      for (let k = 0; k < 4; k += 1) {
        const temp = matrix[c * 4 + k] ?? 0;
        matrix[c * 4 + k] = matrix[pivot * 4 + k] ?? 0;
        matrix[pivot * 4 + k] = temp;
      }
    }
    const diagonal = matrix[c * 4 + c] ?? 0;
    if (Math.abs(diagonal) < DET_THRESHOLD) {
      out[0] = w1;
      out[1] = w2;
      out[2] = w3;
      out[3] = 0;
      out[4] = 0;
      out[5] = 0;
      return out;
    }
    for (let r = 0; r < 3; r += 1) {
      if (r === c) continue;
      const factor = (matrix[r * 4 + c] ?? 0) / diagonal;
      for (let k = c; k < 4; k += 1) matrix[r * 4 + k] = (matrix[r * 4 + k] ?? 0) - factor * (matrix[c * 4 + k] ?? 0);
    }
  }

  out[0] = w1;
  out[1] = w2;
  out[2] = w3;
  out[3] = (matrix[3] ?? 0) / (matrix[0] ?? 1);
  out[4] = (matrix[7] ?? 0) / (matrix[5] ?? 1);
  out[5] = (matrix[11] ?? 0) / (matrix[10] ?? 1);
  return out;
}
