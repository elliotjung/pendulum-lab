/**
 * AssemblyScript source of the WASM double-pendulum RK4 ensemble kernel.
 *
 * This is the CPU hot loop of large ensemble / basin sweeps, ported 1:1 from
 * `src/physics/double.ts` (mass-matrix formulation, same singularity guard)
 * and `src/physics/integrators.ts` (classic RK4 with the same floating-point
 * grouping). f64 throughout — unlike the WebGPU f32 lane, this lane targets
 * *trajectory-grade* precision, and because the kernel is a fixed WASM binary
 * its results are bit-reproducible across JS engines (V8/JSC/SpiderMonkey),
 * which JS `Math.sin`/`Math.cos` do not guarantee.
 *
 * Compiled by `npm run build:wasm` into `src/runtime/wasm/pendulum-kernel.wasm`
 * (committed; CI re-compiles and fails on drift via `check:wasm-sync`).
 * Loaded by `src/runtime/wasmEnsemble.ts`.
 *
 * Memory contract: the host calls `alloc(n * 32)` once (bump allocator, reused
 * across calls by the host wrapper), writes N packed [θ1, θ2, ω1, ω2] f64
 * quadruples, calls `stepEnsembleRk4`, and reads the same region back.
 */

// Must match MASS_MATRIX_SINGULARITY_THRESHOLD in src/physics/constants.ts.
const DET_THRESHOLD: f64 = 1e-14;

/** Bump-allocate kernel memory; the host wrapper caches and reuses the block. */
export function alloc(bytes: i32): usize {
  return heap.alloc(<usize>bytes);
}

// Scratch "return values" for the inlined acceleration helper.
let acc1: f64 = 0;
let acc2: f64 = 0;

// @ts-ignore: decorator is an AssemblyScript builtin
@inline
function rhsAccel(
  t1: f64,
  t2: f64,
  w1: f64,
  w2: f64,
  m11: f64,
  m22: f64,
  B: f64,
  gl1: f64,
  gl2: f64,
  gamma: f64
): void {
  const delta = t1 - t2;
  const sinD = Math.sin(delta);
  const cosD = Math.cos(delta);
  const m12 = B * cosD;
  const det = m11 * m22 - m12 * m12;
  if (Math.abs(det) < DET_THRESHOLD) {
    acc1 = 0;
    acc2 = 0;
    return;
  }
  const f1 = -B * sinD * w2 * w2 - gl1 * Math.sin(t1) - gamma * w1;
  const f2 = B * sinD * w1 * w1 - gl2 * Math.sin(t2) - gamma * w2;
  acc1 = (m22 * f1 - m12 * f2) / det;
  acc2 = (-m12 * f1 + m11 * f2) / det;
}

/**
 * Advance `n` packed [θ1, θ2, ω1, ω2] trajectories at `ptr` by `steps` RK4
 * steps of size `dt` under the double-pendulum flow with viscous damping.
 */
export function stepEnsembleRk4(
  ptr: usize,
  n: i32,
  steps: i32,
  dt: f64,
  m1: f64,
  m2: f64,
  l1: f64,
  l2: f64,
  g: f64,
  gamma: f64
): void {
  // Same floating-point grouping as the inline expressions in rhsDouble:
  // B = ((m2 * l1) * l2), gl1 = (((m1 + m2) * g) * l1), gl2 = ((m2 * g) * l2).
  const m11: f64 = (m1 + m2) * l1 * l1;
  const m22: f64 = m2 * l2 * l2;
  const B: f64 = m2 * l1 * l2;
  const gl1: f64 = (m1 + m2) * g * l1;
  const gl2: f64 = m2 * g * l2;
  const half: f64 = 0.5 * dt;
  const sixth: f64 = dt / 6.0;

  for (let i: i32 = 0; i < n; i++) {
    const off: usize = ptr + (<usize>i << 5);
    let t1: f64 = load<f64>(off);
    let t2: f64 = load<f64>(off, 8);
    let w1: f64 = load<f64>(off, 16);
    let w2: f64 = load<f64>(off, 24);

    for (let k: i32 = 0; k < steps; k++) {
      // k1 = f(y)
      rhsAccel(t1, t2, w1, w2, m11, m22, B, gl1, gl2, gamma);
      const k1t1 = w1;
      const k1t2 = w2;
      const k1w1 = acc1;
      const k1w2 = acc2;
      // k2 = f(y + dt/2 · k1)
      rhsAccel(t1 + half * k1t1, t2 + half * k1t2, w1 + half * k1w1, w2 + half * k1w2, m11, m22, B, gl1, gl2, gamma);
      const k2t1 = w1 + half * k1w1;
      const k2t2 = w2 + half * k1w2;
      const k2w1 = acc1;
      const k2w2 = acc2;
      // k3 = f(y + dt/2 · k2)
      rhsAccel(t1 + half * k2t1, t2 + half * k2t2, w1 + half * k2w1, w2 + half * k2w2, m11, m22, B, gl1, gl2, gamma);
      const k3t1 = w1 + half * k2w1;
      const k3t2 = w2 + half * k2w2;
      const k3w1 = acc1;
      const k3w2 = acc2;
      // k4 = f(y + dt · k3)
      rhsAccel(t1 + dt * k3t1, t2 + dt * k3t2, w1 + dt * k3w1, w2 + dt * k3w2, m11, m22, B, gl1, gl2, gamma);
      const k4t1 = w1 + dt * k3w1;
      const k4t2 = w2 + dt * k3w2;
      const k4w1 = acc1;
      const k4w2 = acc2;

      t1 += sixth * (k1t1 + 2 * k2t1 + 2 * k3t1 + k4t1);
      t2 += sixth * (k1t2 + 2 * k2t2 + 2 * k3t2 + k4t2);
      w1 += sixth * (k1w1 + 2 * k2w1 + 2 * k3w1 + k4w1);
      w2 += sixth * (k1w2 + 2 * k2w2 + 2 * k3w2 + k4w2);
    }

    store<f64>(off, t1);
    store<f64>(off, t2, 8);
    store<f64>(off, w1, 16);
    store<f64>(off, w2, 24);
  }
}

// ---------------------------------------------------------------------------
// Planar N-chain f64 RHS + central-difference Jacobian-tape candidate.
//
// ABI 2 intentionally keeps every variable-size buffer in one host-owned,
// reusable allocation. The host can query the exact tape offset and required
// byte count before calling the kernel, so this does not introduce hidden
// bump-allocation or overlap with the ensemble lane. N is capped at 8 to match
// the validated hybrid WebGPU path. The RK4 vector updates use f64x2 SIMD; the
// mass-matrix solve and transcendental operations remain scalar f64.
// ---------------------------------------------------------------------------

const NCHAIN_ABI_VERSION: i32 = 2;
const NCHAIN_MAX_LINKS: i32 = 8;
const NCHAIN_PIVOT_FLOOR: f64 = 1e-14;

export function nChainKernelAbiVersion(): i32 {
  return NCHAIN_ABI_VERSION;
}

export function nChainKernelMaxLinks(): i32 {
  return NCHAIN_MAX_LINKS;
}

/** Byte offset of the row-major Jacobian tape in the reusable host block. */
export function nChainTapeOffset(n: i32): i32 {
  // masses[n], lengths[n], state[2n]
  return 4 * n * 8;
}

/** Exact reusable allocation size for an N-chain tape workload. */
export function nChainRequiredBytes(n: i32, steps: i32): i32 {
  if (n < 1 || n > NCHAIN_MAX_LINKS || steps < 1) return 0;
  const dimension = 2 * n;
  const inputAndTape = 4 * n + steps * dimension * dimension;
  // suffix[n], matrix[n*n], factor[n*n], rhs[n], six dimension-sized lanes.
  const scratch = 2 * n + 2 * n * n + 6 * dimension;
  return (inputAndTape + scratch) * 8;
}

// @ts-ignore: AssemblyScript inline decorator
@inline
function nLoad(ptr: usize, index: i32): f64 {
  return load<f64>(ptr + (<usize>index << 3));
}

// @ts-ignore: AssemblyScript inline decorator
@inline
function nStore(ptr: usize, index: i32, value: f64): void {
  store<f64>(ptr + (<usize>index << 3), value);
}

function nChainCholeskySolve(matrixPtr: usize, rhsPtr: usize, factorPtr: usize, n: i32): bool {
  for (let j: i32 = 0; j < n; j++) {
    let sum = nLoad(matrixPtr, j * n + j);
    for (let k: i32 = 0; k < j; k++) {
      const value = nLoad(factorPtr, j * n + k);
      sum -= value * value;
    }
    if (!(sum > NCHAIN_PIVOT_FLOOR)) return false;
    const diagonal = Math.sqrt(sum);
    nStore(factorPtr, j * n + j, diagonal);
    for (let i: i32 = j + 1; i < n; i++) {
      let value = nLoad(matrixPtr, i * n + j);
      for (let k: i32 = 0; k < j; k++) value -= nLoad(factorPtr, i * n + k) * nLoad(factorPtr, j * n + k);
      nStore(factorPtr, i * n + j, value / diagonal);
    }
  }

  for (let i: i32 = 0; i < n; i++) {
    let value = nLoad(rhsPtr, i);
    for (let k: i32 = 0; k < i; k++) value -= nLoad(factorPtr, i * n + k) * nLoad(rhsPtr, k);
    nStore(rhsPtr, i, value / nLoad(factorPtr, i * n + i));
  }
  for (let i: i32 = n - 1; i >= 0; i--) {
    let value = nLoad(rhsPtr, i);
    for (let k: i32 = i + 1; k < n; k++) value -= nLoad(factorPtr, k * n + i) * nLoad(rhsPtr, k);
    nStore(rhsPtr, i, value / nLoad(factorPtr, i * n + i));
  }
  return true;
}

function nChainRhs(
  statePtr: usize,
  massesPtr: usize,
  lengthsPtr: usize,
  outPtr: usize,
  suffixPtr: usize,
  matrixPtr: usize,
  factorPtr: usize,
  rhsPtr: usize,
  n: i32,
  g: f64,
  gamma: f64
): bool {
  let suffixMass: f64 = 0;
  for (let j: i32 = n - 1; j >= 0; j--) {
    suffixMass += nLoad(massesPtr, j);
    nStore(suffixPtr, j, suffixMass);
  }

  for (let j: i32 = 0; j < n; j++) {
    const thetaJ = nLoad(statePtr, j);
    const omegaJ = nLoad(statePtr, n + j);
    const lengthJ = nLoad(lengthsPtr, j);
    nStore(outPtr, j, omegaJ);
    let coupling: f64 = 0;
    for (let k: i32 = 0; k < n; k++) {
      const thetaK = nLoad(statePtr, k);
      const omegaK = nLoad(statePtr, n + k);
      const lengthK = nLoad(lengthsPtr, k);
      const suffix = nLoad(suffixPtr, j > k ? j : k);
      const delta = thetaJ - thetaK;
      const scale = suffix * lengthJ * lengthK;
      nStore(matrixPtr, j * n + k, scale * Math.cos(delta));
      coupling += scale * Math.sin(delta) * omegaK * omegaK;
    }
    nStore(rhsPtr, j, -coupling - g * lengthJ * Math.sin(thetaJ) * nLoad(suffixPtr, j) - gamma * omegaJ);
  }

  if (!nChainCholeskySolve(matrixPtr, rhsPtr, factorPtr, n)) return false;
  for (let j: i32 = 0; j < n; j++) nStore(outPtr, n + j, nLoad(rhsPtr, j));
  return true;
}

// @ts-ignore: AssemblyScript SIMD builtins
@inline
function nChainOffsetStateSimd(statePtr: usize, derivativePtr: usize, outPtr: usize, dimension: i32, scale: f64): void {
  const scaleVector = f64x2.splat(scale);
  for (let i: i32 = 0; i < dimension; i += 2) {
    const state = v128.load(statePtr + (<usize>i << 3));
    const derivative = v128.load(derivativePtr + (<usize>i << 3));
    v128.store(outPtr + (<usize>i << 3), f64x2.add(state, f64x2.mul(scaleVector, derivative)));
  }
}

// @ts-ignore: AssemblyScript SIMD builtins
@inline
function nChainRk4CombineSimd(
  statePtr: usize,
  k1Ptr: usize,
  k2Ptr: usize,
  k3Ptr: usize,
  k4Ptr: usize,
  outPtr: usize,
  dimension: i32,
  sixth: f64
): void {
  const two = f64x2.splat(2.0);
  const weight = f64x2.splat(sixth);
  for (let i: i32 = 0; i < dimension; i += 2) {
    const offset = <usize>i << 3;
    let sum = f64x2.add(v128.load(k1Ptr + offset), f64x2.mul(two, v128.load(k2Ptr + offset)));
    sum = f64x2.add(sum, f64x2.mul(two, v128.load(k3Ptr + offset)));
    sum = f64x2.add(sum, v128.load(k4Ptr + offset));
    v128.store(outPtr + offset, f64x2.add(v128.load(statePtr + offset), f64x2.mul(weight, sum)));
  }
}

/**
 * Fill the f64 row-major central-difference Jacobian tape and advance the
 * reference state with RK4. Returns 0 on success; non-zero makes the host fail
 * closed to its JS f64 oracle.
 */
export function buildNChainJacobianTapeSimd(
  basePtr: usize,
  n: i32,
  steps: i32,
  dt: f64,
  g: f64,
  gamma: f64
): i32 {
  if (n < 1 || n > NCHAIN_MAX_LINKS || steps < 1 || !(dt > 0.0) || !(g > 0.0)) return 1;
  const dimension = 2 * n;
  const massesPtr = basePtr;
  const lengthsPtr = massesPtr + (<usize>n << 3);
  const statePtr = lengthsPtr + (<usize>n << 3);
  const tapePtr = statePtr + (<usize>dimension << 3);
  let scratchPtr = tapePtr + (<usize>(steps * dimension * dimension) << 3);
  const suffixPtr = scratchPtr;
  scratchPtr += <usize>n << 3;
  const matrixPtr = scratchPtr;
  scratchPtr += <usize>(n * n) << 3;
  const factorPtr = scratchPtr;
  scratchPtr += <usize>(n * n) << 3;
  const rhsPtr = scratchPtr;
  scratchPtr += <usize>n << 3;
  const tempPtr = scratchPtr;
  scratchPtr += <usize>dimension << 3;
  const k1Ptr = scratchPtr;
  scratchPtr += <usize>dimension << 3;
  const k2Ptr = scratchPtr;
  scratchPtr += <usize>dimension << 3;
  const k3Ptr = scratchPtr;
  scratchPtr += <usize>dimension << 3;
  const k4Ptr = scratchPtr;
  scratchPtr += <usize>dimension << 3;
  const nextPtr = scratchPtr;

  const half = 0.5 * dt;
  const sixth = dt / 6.0;
  for (let step: i32 = 0; step < steps; step++) {
    for (let i: i32 = 0; i < dimension; i++) nStore(tempPtr, i, nLoad(statePtr, i));
    const tapeStepOffset = step * dimension * dimension;
    for (let column: i32 = 0; column < dimension; column++) {
      const value = nLoad(statePtr, column);
      const epsilon = 6e-6 * Math.max(1.0, Math.abs(value));
      nStore(tempPtr, column, value + epsilon);
      if (!nChainRhs(tempPtr, massesPtr, lengthsPtr, k1Ptr, suffixPtr, matrixPtr, factorPtr, rhsPtr, n, g, gamma)) return 2;
      nStore(tempPtr, column, value - epsilon);
      if (!nChainRhs(tempPtr, massesPtr, lengthsPtr, k2Ptr, suffixPtr, matrixPtr, factorPtr, rhsPtr, n, g, gamma)) return 2;
      const inverse = 0.5 / epsilon;
      for (let row: i32 = 0; row < dimension; row++) {
        nStore(tapePtr, tapeStepOffset + row * dimension + column, (nLoad(k1Ptr, row) - nLoad(k2Ptr, row)) * inverse);
      }
      nStore(tempPtr, column, value);
    }

    if (!nChainRhs(statePtr, massesPtr, lengthsPtr, k1Ptr, suffixPtr, matrixPtr, factorPtr, rhsPtr, n, g, gamma)) return 2;
    nChainOffsetStateSimd(statePtr, k1Ptr, tempPtr, dimension, half);
    if (!nChainRhs(tempPtr, massesPtr, lengthsPtr, k2Ptr, suffixPtr, matrixPtr, factorPtr, rhsPtr, n, g, gamma)) return 2;
    nChainOffsetStateSimd(statePtr, k2Ptr, tempPtr, dimension, half);
    if (!nChainRhs(tempPtr, massesPtr, lengthsPtr, k3Ptr, suffixPtr, matrixPtr, factorPtr, rhsPtr, n, g, gamma)) return 2;
    nChainOffsetStateSimd(statePtr, k3Ptr, tempPtr, dimension, dt);
    if (!nChainRhs(tempPtr, massesPtr, lengthsPtr, k4Ptr, suffixPtr, matrixPtr, factorPtr, rhsPtr, n, g, gamma)) return 2;
    nChainRk4CombineSimd(statePtr, k1Ptr, k2Ptr, k3Ptr, k4Ptr, nextPtr, dimension, sixth);
    for (let i: i32 = 0; i < dimension; i++) nStore(statePtr, i, nLoad(nextPtr, i));
  }
  return 0;
}
