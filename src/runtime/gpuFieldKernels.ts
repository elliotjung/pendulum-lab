/**
 * Isolated WGSL source for double-pendulum field scans.
 *
 * Dispatch, validation and CPU fallback policies intentionally live in
 * gpuFieldDispatch.ts, keeping shader review independent of I/O plumbing.
 */
export const WGSL_COMMON: string = /* wgsl */ `
fn rhs(s: vec4<f32>) -> vec4<f32> {
  let th1 = s.x; let th2 = s.y; let w1 = s.z; let w2 = s.w;
  let m1 = params.m1; let m2 = params.m2;
  let l1 = params.l1; let l2 = params.l2; let g = params.g;
  let d = th1 - th2;
  let cd = cos(d); let sd = sin(d);
  let den = m1 + m2 * sd * sd;
  let a1 = (-m2 * l1 * w1 * w1 * sd * cd
            + m2 * g * sin(th2) * cd
            - m2 * l2 * w2 * w2 * sd
            - (m1 + m2) * g * sin(th1)) / (l1 * den)
           - params.damping * w1;
  let a2 = ((m1 + m2) * (l1 * w1 * w1 * sd - g * sin(th2) + g * sin(th1) * cd)
            + m2 * l2 * w2 * w2 * sd * cd) / (l2 * den)
           - params.damping * w2;
  return vec4<f32>(w1, w2, a1, a2);
}

fn rk4(s: vec4<f32>, h: f32) -> vec4<f32> {
  let k1 = rhs(s);
  let k2 = rhs(s + 0.5 * h * k1);
  let k3 = rhs(s + 0.5 * h * k2);
  let k4 = rhs(s + h * k3);
  return s + (h / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}
`;

// ---------------------------------------------------------------------------
// Flip basin
// ---------------------------------------------------------------------------

export const WGSL_BASIN: string = /* wgsl */ `
struct Params {
  m1: f32, m2: f32, l1: f32, l2: f32,
  g: f32, damping: f32, dt: f32, steps: f32,
  lo: f32, span: f32, n: f32, pad: f32,
};
@group(0) @binding(0) var<storage, read_write> out: array<vec2<f32>>;
@group(0) @binding(1) var<uniform> params: Params;
${WGSL_COMMON}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&out)) { return; }
  let n = u32(params.n);
  let ix = i % n;
  let iy = i / n;
  let denom = max(params.n - 1.0, 1.0);
  var s = vec4<f32>(
    params.lo + params.span * f32(ix) / denom,
    params.lo + params.span * f32(iy) / denom,
    0.0, 0.0);
  var label = 2.0;
  var flipTime = -1.0;
  let steps = u32(params.steps);
  let pi = 3.14159265358979;
  for (var k = 0u; k < steps; k = k + 1u) {
    s = rk4(s, params.dt);
    let a1 = abs(s.x);
    let a2 = abs(s.y);
    if (a1 > pi || a2 > pi) {
      if (a1 > pi && (a2 <= pi || a1 >= a2)) { label = 0.0; } else { label = 1.0; }
      flipTime = f32(k + 1u) * params.dt;
      break;
    }
  }
  out[i] = vec2<f32>(label, flipTime);
}
`;

export const WGSL_SWEEP: string = /* wgsl */ `
struct Params {
  m1: f32, m2: f32, l1: f32, l2: f32,
  g: f32, damping: f32, dt: f32, steps: f32,
  lo: f32, span: f32, n: f32, d0: f32,
  renormEvery: f32, transientSteps: f32, pad0: f32, pad1: f32,
};
@group(0) @binding(0) var<storage, read_write> out: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;
${WGSL_COMMON}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&out)) { return; }
  let n = u32(params.n);
  let ix = i % n;
  let iy = i / n;
  // Cell-centre lattice, matching the Sweep tab convention.
  let theta1 = params.lo + params.span * (f32(ix) + 0.5) / params.n;
  let theta2 = params.lo + params.span * (f32(iy) + 0.5) / params.n;
  var a = vec4<f32>(theta1, theta2, 0.0, 0.0);
  var b = a + vec4<f32>(params.d0, 0.0, 0.0, 0.0);
  let steps = u32(params.steps);
  let renorm = max(u32(params.renormEvery), 1u);
  let transient = u32(params.transientSteps);
  var accum = 0.0;
  var measured = 0.0;
  for (var k = 1u; k <= steps; k = k + 1u) {
    a = rk4(a, params.dt);
    b = rk4(b, params.dt);
    if (k % renorm == 0u) {
      let diff = b - a;
      let d = max(length(diff), 1e-12);
      if (k > transient) {
        accum = accum + log(d / params.d0);
        measured = measured + f32(renorm);
      }
      b = a + diff * (params.d0 / d);
    }
  }
  out[i] = accum / max(measured * params.dt, 1e-9);
}
`;
