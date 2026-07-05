import type { PendulumParameters } from '../types/domain';
import type { AccelerationComparison, AccelerationTolerance } from '../chaos/accelerationContract';
import { compareLyapunovSpectrumAcceleration } from '../chaos/accelerationContract';
import { analyzeSpectrumConsistency } from '../chaos/spectrumConsistency';
import { lyapunovSpectrum, type LyapunovSettings, type LyapunovSpectrumResult, kaplanYorkeDimension } from '../chaos/lyapunov';
import { jacobianDouble, rhsDouble } from '../physics/double';
import { runComputeKernel } from './gpuEnsemble';

const FULL_DIMENSION = 4;

const DEFAULT_SETTINGS: LyapunovSettings = {
  dt: 0.01,
  steps: 2_000,
  renormEvery: 10,
  transientSteps: 200,
  seed: 0x9e37
};

const DEFAULT_GPU_TOLERANCES: AccelerationTolerance = {
  spectrum: 6e-2,
  aggregate: 6e-2
};

export const WGSL_FULL_SPECTRUM_KERNEL = /* wgsl */ `
struct Params {
  m1: f32, m2: f32, l1: f32, l2: f32,
  g: f32, damping: f32, dt: f32, steps: f32,
  renormEvery: f32, transientSteps: f32, seed: f32, count: f32,
  pad0: f32, pad1: f32, pad2: f32, pad3: f32,
};

struct GramSchmidtResult {
  aug: array<f32, 20>,
  norms: array<f32, 4>,
};

@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;

fn rng(seed: ptr<function, u32>) -> f32 {
  let next = (*seed + 0x6d2b79f5u);
  *seed = next;
  var t = next;
  t = (t ^ (t >> 15u)) * (1u | t);
  t = (t + ((t ^ (t >> 7u)) * (61u | t))) ^ t;
  return f32((t ^ (t >> 14u))) / 4294967296.0;
}

fn rhs4(x: array<f32, 4>) -> array<f32, 4> {
  var out: array<f32, 4>;
  let t1 = x[0];
  let t2 = x[1];
  let w1 = x[2];
  let w2 = x[3];
  let delta = t1 - t2;
  let sinD = sin(delta);
  let cosD = cos(delta);
  let m11 = (params.m1 + params.m2) * params.l1 * params.l1;
  let m22 = params.m2 * params.l2 * params.l2;
  let b = params.m2 * params.l1 * params.l2;
  let m12 = b * cosD;
  let det = m11 * m22 - m12 * m12;
  out[0] = w1;
  out[1] = w2;
  if (abs(det) < 1e-7) {
    out[2] = 0.0;
    out[3] = 0.0;
    return out;
  }
  let f1 = -b * sinD * w2 * w2 - (params.m1 + params.m2) * params.g * params.l1 * sin(t1) - params.damping * w1;
  let f2 = b * sinD * w1 * w1 - params.m2 * params.g * params.l2 * sin(t2) - params.damping * w2;
  out[2] = (m22 * f1 - m12 * f2) / det;
  out[3] = (-m12 * f1 + m11 * f2) / det;
  return out;
}

fn jac4(x: array<f32, 4>) -> array<f32, 16> {
  var jac: array<f32, 16>;
  let t1 = x[0];
  let t2 = x[1];
  let w1 = x[2];
  let w2 = x[3];
  let delta = t1 - t2;
  let sinD = sin(delta);
  let cosD = cos(delta);
  let m11 = (params.m1 + params.m2) * params.l1 * params.l1;
  let m22 = params.m2 * params.l2 * params.l2;
  let b = params.m2 * params.l1 * params.l2;
  let m12 = b * cosD;
  let det = m11 * m22 - m12 * m12;

  jac[0] = 0.0; jac[1] = 0.0; jac[2] = 1.0; jac[3] = 0.0;
  jac[4] = 0.0; jac[5] = 0.0; jac[6] = 0.0; jac[7] = 1.0;
  if (abs(det) < 1e-7) {
    for (var i = 8u; i < 16u; i = i + 1u) {
      jac[i] = 0.0;
    }
    return jac;
  }

  let f1 = -b * sinD * w2 * w2 - (params.m1 + params.m2) * params.g * params.l1 * sin(t1) - params.damping * w1;
  let f2 = b * sinD * w1 * w1 - params.m2 * params.g * params.l2 * sin(t2) - params.damping * w2;
  let n2 = m22 * f1 - m12 * f2;
  let n3 = -m12 * f1 + m11 * f2;
  let det2 = det * det;
  let dm12 = array<f32, 4>(-b * sinD, b * sinD, 0.0, 0.0);
  let ddet = array<f32, 4>(-2.0 * m12 * dm12[0], -2.0 * m12 * dm12[1], 0.0, 0.0);
  let df1 = array<f32, 4>(
    -b * cosD * w2 * w2 - (params.m1 + params.m2) * params.g * params.l1 * cos(t1),
    b * cosD * w2 * w2,
    -params.damping,
    -2.0 * b * sinD * w2
  );
  let df2 = array<f32, 4>(
    b * cosD * w1 * w1,
    -b * cosD * w1 * w1 - params.m2 * params.g * params.l2 * cos(t2),
    2.0 * b * sinD * w1,
    -params.damping
  );

  for (var j = 0u; j < 4u; j = j + 1u) {
    let dn2 = m22 * df1[j] - (dm12[j] * f2 + m12 * df2[j]);
    let dn3 = -(dm12[j] * f1 + m12 * df1[j]) + m11 * df2[j];
    jac[8u + j] = (dn2 * det - n2 * ddet[j]) / det2;
    jac[12u + j] = (dn3 * det - n3 * ddet[j]) / det2;
  }
  return jac;
}

fn add4(a: array<f32, 4>, b: array<f32, 4>, scale: f32) -> array<f32, 4> {
  var out: array<f32, 4>;
  for (var i = 0u; i < 4u; i = i + 1u) {
    out[i] = a[i] + scale * b[i];
  }
  return out;
}

fn rk4_state(x: array<f32, 4>, h: f32) -> array<f32, 4> {
  let k1 = rhs4(x);
  let k2 = rhs4(add4(x, k1, 0.5 * h));
  let k3 = rhs4(add4(x, k2, 0.5 * h));
  let k4 = rhs4(add4(x, k3, h));
  var out: array<f32, 4>;
  for (var i = 0u; i < 4u; i = i + 1u) {
    out[i] = x[i] + (h / 6.0) * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
  }
  return out;
}

fn add20(a: array<f32, 20>, b: array<f32, 20>, scale: f32) -> array<f32, 20> {
  var out: array<f32, 20>;
  for (var i = 0u; i < 20u; i = i + 1u) {
    out[i] = a[i] + scale * b[i];
  }
  return out;
}

fn rhs_aug(s: array<f32, 20>) -> array<f32, 20> {
  var x = array<f32, 4>(s[0], s[1], s[2], s[3]);
  let fx = rhs4(x);
  let jac = jac4(x);
  var out: array<f32, 20>;
  for (var i = 0u; i < 4u; i = i + 1u) {
    out[i] = fx[i];
  }
  for (var j = 0u; j < 4u; j = j + 1u) {
    let base = 4u + j * 4u;
    for (var r = 0u; r < 4u; r = r + 1u) {
      var acc = 0.0;
      for (var c = 0u; c < 4u; c = c + 1u) {
        acc = acc + jac[r * 4u + c] * s[base + c];
      }
      out[base + r] = acc;
    }
  }
  return out;
}

fn rk4_aug(s: array<f32, 20>, h: f32) -> array<f32, 20> {
  let k1 = rhs_aug(s);
  let k2 = rhs_aug(add20(s, k1, 0.5 * h));
  let k3 = rhs_aug(add20(s, k2, 0.5 * h));
  let k4 = rhs_aug(add20(s, k3, h));
  var out: array<f32, 20>;
  for (var i = 0u; i < 20u; i = i + 1u) {
    out[i] = s[i] + (h / 6.0) * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
  }
  return out;
}

fn gram_schmidt(s: array<f32, 20>) -> GramSchmidtResult {
  var out = s;
  var norms: array<f32, 4>;
  for (var i = 0u; i < 4u; i = i + 1u) {
    let bi = 4u + i * 4u;
    for (var j = 0u; j < i; j = j + 1u) {
      let bj = 4u + j * 4u;
      var dot = 0.0;
      for (var r = 0u; r < 4u; r = r + 1u) {
        dot = dot + out[bi + r] * out[bj + r];
      }
      for (var r = 0u; r < 4u; r = r + 1u) {
        out[bi + r] = out[bi + r] - dot * out[bj + r];
      }
    }
    var normSq = 0.0;
    for (var r = 0u; r < 4u; r = r + 1u) {
      normSq = normSq + out[bi + r] * out[bi + r];
    }
    let norm = sqrt(max(normSq, 0.0));
    norms[i] = norm;
    let inv = select(0.0, 1.0 / norm, norm > 0.0);
    for (var r = 0u; r < 4u; r = r + 1u) {
      out[bi + r] = out[bi + r] * inv;
    }
  }
  return GramSchmidtResult(out, norms);
}

fn sort_desc(v: array<f32, 4>) -> array<f32, 4> {
  var out = v;
  for (var i = 0u; i < 4u; i = i + 1u) {
    for (var j = i + 1u; j < 4u; j = j + 1u) {
      if (out[j] > out[i]) {
        let tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
    }
  }
  return out;
}

fn kaplan_yorke(spectrum: array<f32, 4>) -> f32 {
  var partial = 0.0;
  var j = 0u;
  for (; j < 4u; j = j + 1u) {
    let next = partial + spectrum[j];
    if (next < 0.0) {
      break;
    }
    partial = next;
  }
  if (j == 0u) {
    return 0.0;
  }
  if (j >= 4u) {
    return 4.0;
  }
  let nextExp = spectrum[j];
  if (nextExp == 0.0) {
    return f32(j);
  }
  return f32(j) + partial / abs(nextExp);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x != 0u) {
    return;
  }
  if (u32(params.count) != 4u || u32(params.renormEvery) == 0u) {
    data[7] = -1.0;
    return;
  }

  var x = array<f32, 4>(data[0], data[1], data[2], data[3]);
  for (var t = 0u; t < u32(params.transientSteps); t = t + 1u) {
    x = rk4_state(x, params.dt);
  }

  var aug: array<f32, 20>;
  for (var i = 0u; i < 4u; i = i + 1u) {
    aug[i] = x[i];
  }
  var seed = u32(params.seed);
  for (var j = 0u; j < 4u; j = j + 1u) {
    let base = 4u + j * 4u;
    for (var r = 0u; r < 4u; r = r + 1u) {
      aug[base + r] = rng(&seed) - 0.5;
    }
  }
  var gs = gram_schmidt(aug);
  aug = gs.aug;

  var accum = array<f32, 4>(0.0, 0.0, 0.0, 0.0);
  let intervals = u32(params.steps) / u32(params.renormEvery);
  let intervalTime = params.renormEvery * params.dt;
  var elapsed = 0.0;
  for (var interval = 0u; interval < intervals; interval = interval + 1u) {
    for (var s = 0u; s < u32(params.renormEvery); s = s + 1u) {
      aug = rk4_aug(aug, params.dt);
    }
    gs = gram_schmidt(aug);
    aug = gs.aug;
    for (var j = 0u; j < 4u; j = j + 1u) {
      accum[j] = accum[j] + log(max(gs.norms[j], 1e-20));
    }
    elapsed = elapsed + intervalTime;
  }

  var spectrum: array<f32, 4>;
  for (var j = 0u; j < 4u; j = j + 1u) {
    spectrum[j] = select(0.0, accum[j] / elapsed, elapsed > 0.0);
  }
  spectrum = sort_desc(spectrum);
  var sum = 0.0;
  for (var j = 0u; j < 4u; j = j + 1u) {
    data[j] = spectrum[j];
    sum = sum + spectrum[j];
  }
  data[4] = sum;
  data[5] = kaplan_yorke(spectrum);
  data[6] = elapsed;
  data[7] = f32(intervals);
}
`;

export interface WebgpuLyapunovSpectrumOptions extends Partial<LyapunovSettings> {
  count?: number;
  forceCpu?: boolean;
  tolerances?: AccelerationTolerance;
}

export interface WebgpuLyapunovSpectrumCandidate {
  backend: 'webgpu';
  result: LyapunovSpectrumResult;
  elapsedMs: number;
  caveat: string;
}

export interface WebgpuLyapunovSpectrumPromotion {
  backend: 'webgpu' | 'cpu';
  result: LyapunovSpectrumResult;
  cpuOracle: LyapunovSpectrumResult;
  gpuCandidate: WebgpuLyapunovSpectrumCandidate | null;
  comparison: AccelerationComparison | null;
  caveat: string;
}

function resolveSettings(options: WebgpuLyapunovSpectrumOptions = {}): LyapunovSettings & { count: number } {
  return {
    dt: options.dt ?? DEFAULT_SETTINGS.dt,
    steps: options.steps ?? DEFAULT_SETTINGS.steps,
    renormEvery: options.renormEvery ?? DEFAULT_SETTINGS.renormEvery,
    transientSteps: options.transientSteps ?? DEFAULT_SETTINGS.transientSteps,
    seed: options.seed ?? DEFAULT_SETTINGS.seed,
    ...(options.method ? { method: options.method } : {}),
    count: options.count ?? FULL_DIMENSION
  };
}

function cpuDoublePendulumSpectrum(
  params: PendulumParameters,
  state0: ArrayLike<number>,
  settings: LyapunovSettings & { count: number },
  damping: number
): LyapunovSpectrumResult {
  const rhs = (state: Float64Array, out: Float64Array): Float64Array => rhsDouble(state, params, damping, out);
  const jacobian = (state: ArrayLike<number>, jac: Float64Array): Float64Array => jacobianDouble(state, params, damping, jac);
  return lyapunovSpectrum(state0, rhs, settings.count, settings, jacobian);
}

function finiteVector(values: readonly number[]): boolean {
  return values.every((value) => Number.isFinite(value));
}

/**
 * Hardware WebGPU full-spectrum candidate for the 4D double pendulum. The kernel
 * mirrors the CPU variational-flow algorithm in f32 and is intentionally scoped
 * to the full four-exponent spectrum; callers must compare it to the f64 CPU
 * oracle before treating it as a scientific result.
 */
export async function webgpuDoublePendulumLyapunovSpectrumCandidate(
  params: PendulumParameters,
  state0: ArrayLike<number>,
  options: WebgpuLyapunovSpectrumOptions = {},
  damping = 0
): Promise<WebgpuLyapunovSpectrumCandidate | null> {
  const settings = resolveSettings(options);
  if (options.forceCpu || settings.count !== FULL_DIMENSION || settings.method) return null;
  if (settings.dt <= 0 || settings.steps <= 0 || settings.renormEvery <= 0 || settings.transientSteps < 0) return null;
  const io = new Float32Array(32);
  for (let i = 0; i < FULL_DIMENSION; i += 1) io[i] = Number(state0[i] ?? 0);
  const uniform = new Float32Array([
    params.m1, params.m2, params.l1, params.l2,
    params.g, damping, settings.dt, settings.steps,
    settings.renormEvery, settings.transientSteps, settings.seed, settings.count,
    0, 0, 0, 0
  ]);
  const started = typeof performance === 'undefined' ? Date.now() : performance.now();
  const reduced = await runComputeKernel(WGSL_FULL_SPECTRUM_KERNEL, uniform, io, 64);
  const elapsedMs = (typeof performance === 'undefined' ? Date.now() : performance.now()) - started;
  if (!reduced || (reduced[7] ?? -1) < 0) return null;
  const spectrum = Array.from(reduced.slice(0, FULL_DIMENSION), Number);
  const sum = Number(reduced[4] ?? NaN);
  const ky = Number(reduced[5] ?? NaN);
  if (!finiteVector(spectrum) || !Number.isFinite(sum) || !Number.isFinite(ky)) return null;
  return {
    backend: 'webgpu',
    elapsedMs,
    result: {
      spectrum,
      stdError: new Array(FULL_DIMENSION).fill(0),
      blockStdError: new Array(FULL_DIMENSION).fill(0),
      sum,
      kaplanYorkeDimension: ky,
      consistency: analyzeSpectrumConsistency(spectrum),
      settings: { ...settings, count: FULL_DIMENSION }
    },
    caveat: 'WebGPU f32 full-spectrum candidate for the 4D double pendulum. It is promotable only after same-run CPU f64 oracle comparison; uncertainty fields are supplied by the CPU oracle during promotion.'
  };
}

/**
 * Fail-closed production promotion path: compute the CPU f64 oracle, try the
 * WebGPU candidate, and return the GPU result only when the declared comparison
 * contract passes. Otherwise the CPU result remains the scientific output.
 */
export async function promotedDoublePendulumLyapunovSpectrum(
  params: PendulumParameters,
  state0: ArrayLike<number>,
  options: WebgpuLyapunovSpectrumOptions = {},
  damping = 0
): Promise<WebgpuLyapunovSpectrumPromotion> {
  const settings = resolveSettings(options);
  const cpuOracle = cpuDoublePendulumSpectrum(params, state0, settings, damping);
  const gpuCandidate = await webgpuDoublePendulumLyapunovSpectrumCandidate(params, state0, options, damping);
  if (!gpuCandidate) {
    return {
      backend: 'cpu',
      result: cpuOracle,
      cpuOracle,
      gpuCandidate: null,
      comparison: null,
      caveat: 'CPU f64 result returned because WebGPU was unavailable, disabled, or outside the validated 4D full-spectrum scope.'
    };
  }
  const comparison = compareLyapunovSpectrumAcceleration(
    gpuCandidate.result,
    cpuOracle,
    { ...DEFAULT_GPU_TOLERANCES, ...options.tolerances }
  );
  if (!comparison.passed) {
    return {
      backend: 'cpu',
      result: cpuOracle,
      cpuOracle,
      gpuCandidate,
      comparison,
      caveat: 'CPU f64 result returned because the WebGPU f32 candidate failed the CPU oracle promotion gate.'
    };
  }
  const promoted: LyapunovSpectrumResult = {
    ...gpuCandidate.result,
    stdError: cpuOracle.stdError,
    blockStdError: cpuOracle.blockStdError,
    consistency: analyzeSpectrumConsistency(gpuCandidate.result.spectrum),
    settings: cpuOracle.settings,
    kaplanYorkeDimension: kaplanYorkeDimension(gpuCandidate.result.spectrum)
  };
  return {
    backend: 'webgpu',
    result: promoted,
    cpuOracle,
    gpuCandidate,
    comparison,
    caveat: 'WebGPU f32 full-spectrum result promoted after same-run CPU f64 oracle comparison; CPU-derived uncertainty estimates are retained.'
  };
}
