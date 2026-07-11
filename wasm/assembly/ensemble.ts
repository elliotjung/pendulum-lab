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
