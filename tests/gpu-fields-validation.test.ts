import { afterEach, describe, expect, it } from 'vitest';
import { flipBasinField, sweepLambdaField } from '../src/runtime/gpuFields';

/**
 * CI GPU-vs-CPU precision regression for the field scans, without real WebGPU.
 *
 * Node has no `navigator.gpu`, so we install a faithful mock device whose
 * compute pass runs a supplied JS kernel over the storage buffer. This
 * exercises the entire GPU branch end-to-end — `runComputeKernel`'s buffer
 * marshaling and `gpuFields`' cross-validation/fallback control flow — which
 * is exactly the code that real WebGPU hardware would drive. Two kernels are
 * tested: a *correct* one (the validation must accept it and report the
 * 'webgpu' backend) and a deliberately *wrong* one (the cross-validation must
 * reject it and fall back to the f64 CPU grid). The runtime contract this
 * verifies is what guards real GPU runs from silently diverging from f64.
 */

type CellKernel = (io: Float32Array, uniform: Float32Array) => void;

interface FakeBuffer {
  data: ArrayBuffer;
  getMappedRange(): ArrayBuffer;
  mapAsync(mode: number): Promise<void>;
  unmap(): void;
}

/** Install a mock `navigator.gpu` whose dispatch runs `kernel`. Returns a restore fn. */
function installMockGpu(kernel: CellKernel): () => void {
  // `navigator` is a getter-only global in the test environment, so swap it via
  // a configurable property descriptor and restore the original afterwards.
  const previousDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

  const makeBuffer = (size: number): FakeBuffer => {
    const buffer: FakeBuffer = {
      data: new ArrayBuffer(size),
      getMappedRange: () => buffer.data,
      mapAsync: async () => {},
      unmap: () => {}
    };
    return buffer;
  };

  const device = {
    createShaderModule: () => ({}),
    createBuffer: (desc: { size: number }) => makeBuffer(desc.size),
    createComputePipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroup: (desc: { entries: Array<{ binding: number; resource: { buffer: FakeBuffer } }> }) => {
      const io = desc.entries.find((entry) => entry.binding === 0)!.resource.buffer;
      const uniform = desc.entries.find((entry) => entry.binding === 1)!.resource.buffer;
      return { io, uniform };
    },
    createCommandEncoder: () => {
      let bound: { io: FakeBuffer; uniform: FakeBuffer } | null = null;
      return {
        beginComputePass: () => ({
          setPipeline: () => {},
          setBindGroup: (_index: number, group: { io: FakeBuffer; uniform: FakeBuffer }) => {
            bound = group;
          },
          dispatchWorkgroups: () => {
            if (!bound) return;
            // Emulate the GPU: run the kernel over the io storage buffer using
            // the uniform buffer, mutating io in place (f32 throughout).
            kernel(new Float32Array(bound.io.data), new Float32Array(bound.uniform.data));
          },
          end: () => {}
        }),
        copyBufferToBuffer: (src: FakeBuffer, _so: number, dst: FakeBuffer, _doff: number, size: number) => {
          new Uint8Array(dst.data).set(new Uint8Array(src.data).subarray(0, size));
        },
        finish: () => ({})
      };
    },
    queue: {
      submit: () => {},
      writeBuffer: (buffer: FakeBuffer, offset: number, data: ArrayBufferView) => {
        const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        new Uint8Array(buffer.data).set(bytes, offset);
      }
    }
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: {
      gpu: {
        requestAdapter: async () => ({ requestDevice: async () => device })
      }
    },
    configurable: true,
    writable: true
  });

  return () => {
    if (previousDescriptor) Object.defineProperty(globalThis, 'navigator', previousDescriptor);
    else delete (globalThis as { navigator?: unknown }).navigator;
  };
}

const f = Math.fround;
const PARAMS = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

/** f32-per-operation double-pendulum RHS, mirroring the WGSL kernel exactly. */
function rhsF32(
  s: Float32Array,
  out: Float32Array,
  m1: number,
  m2: number,
  l1: number,
  l2: number,
  g: number,
  damping: number
): void {
  const th1 = s[0]!;
  const th2 = s[1]!;
  const w1 = s[2]!;
  const w2 = s[3]!;
  const d = f(th1 - th2);
  const cd = f(Math.cos(d));
  const sd = f(Math.sin(d));
  const den = f(m1 + f(m2 * f(sd * sd)));
  const a1 =
    f(
      f(
        f(f(f(-m2 * l1) * f(w1 * w1)) * f(sd * cd)) +
          f(f(f(m2 * g) * f(Math.sin(th2))) * cd) -
          f(f(f(m2 * l2) * f(w2 * w2)) * sd) -
          f(f((m1 + m2) * g) * f(Math.sin(th1)))
      ) / f(l1 * den)
    ) - f(damping * w1);
  const a2 =
    f(
      f(
        f(f(m1 + m2) * f(f(f(l1 * f(w1 * w1)) * sd) - f(g * f(Math.sin(th2))) + f(f(g * f(Math.sin(th1))) * cd))) +
          f(f(f(m2 * l2) * f(w2 * w2)) * f(sd * cd))
      ) / f(l2 * den)
    ) - f(damping * w2);
  out[0] = w1;
  out[1] = w2;
  out[2] = a1;
  out[3] = a2;
}

function rk4F32(
  s: Float32Array,
  h: number,
  m1: number,
  m2: number,
  l1: number,
  l2: number,
  g: number,
  damping: number
): void {
  const k1 = new Float32Array(4);
  const k2 = new Float32Array(4);
  const k3 = new Float32Array(4);
  const k4 = new Float32Array(4);
  const tmp = new Float32Array(4);
  rhsF32(s, k1, m1, m2, l1, l2, g, damping);
  for (let c = 0; c < 4; c += 1) tmp[c] = f(s[c]! + f(f(0.5 * h) * k1[c]!));
  rhsF32(tmp, k2, m1, m2, l1, l2, g, damping);
  for (let c = 0; c < 4; c += 1) tmp[c] = f(s[c]! + f(f(0.5 * h) * k2[c]!));
  rhsF32(tmp, k3, m1, m2, l1, l2, g, damping);
  for (let c = 0; c < 4; c += 1) tmp[c] = f(s[c]! + f(h * k3[c]!));
  rhsF32(tmp, k4, m1, m2, l1, l2, g, damping);
  for (let c = 0; c < 4; c += 1) {
    const sum = f(k1[c]! + f(2 * k2[c]!) + f(2 * k3[c]!) + k4[c]!);
    s[c] = f(s[c]! + f(f(h / 6) * sum));
  }
}

/** Correct f32 basin kernel: matches the WGSL semantics in gpuFields.ts. */
const correctBasinKernel: CellKernel = (io, uniform) => {
  const [m1, m2, l1, l2, g, damping, dt, steps, lo, span, n] = uniform;
  const N = n!;
  const total = N * N;
  const pi = Math.PI;
  const s = new Float32Array(4);
  for (let i = 0; i < total; i += 1) {
    const ix = i % N;
    const iy = Math.floor(i / N);
    const denom = Math.max(N - 1, 1);
    s[0] = f(lo! + f(span! * f(ix / denom)));
    s[1] = f(lo! + f(span! * f(iy / denom)));
    s[2] = 0;
    s[3] = 0;
    let label = 2;
    let flipTime = -1;
    for (let k = 0; k < steps!; k += 1) {
      rk4F32(s, dt!, m1!, m2!, l1!, l2!, g!, damping!);
      const a1 = Math.abs(s[0]!);
      const a2 = Math.abs(s[1]!);
      if (a1 > pi || a2 > pi) {
        label = a1 > pi && (a2 <= pi || a1 >= a2) ? 0 : 1;
        flipTime = (k + 1) * dt!;
        break;
      }
    }
    io[i * 2] = label;
    io[i * 2 + 1] = flipTime;
  }
};

/** Broken kernel: always claims rod 1 flips immediately. */
const brokenBasinKernel: CellKernel = (io) => {
  for (let i = 0; i < io.length / 2; i += 1) {
    io[i * 2] = 0;
    io[i * 2 + 1] = 0.01;
  }
};

describe('GPU field cross-validation contract (mocked WebGPU device)', () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it('accepts a correct f32 kernel and reports the webgpu backend', async () => {
    restore = installMockGpu(correctBasinKernel);
    const result = await flipBasinField(PARAMS, { n: 24, maxTime: 8 });
    expect(result.backend).toBe('webgpu');
    expect(result.validation).not.toBeNull();
    expect(result.validation!.passed).toBe(true);
    // f32 RK4 vs f64 RK4 may flip a fractal-boundary probe cell, but the bulk
    // must agree — the contract's disagreement fraction stays within tolerance.
    expect(result.validation!.maxAbsDiff).toBeLessThanOrEqual(result.validation!.tolerance);
    expect(result.caveat).toContain('WebGPU');
  });

  it('rejects a wrong kernel and falls back to the f64 CPU grid', async () => {
    restore = installMockGpu(brokenBasinKernel);
    const result = await flipBasinField(PARAMS, { n: 24, maxTime: 8 });
    expect(result.backend).toBe('cpu');
    expect(result.validation).not.toBeNull();
    expect(result.validation!.passed).toBe(false);
    expect(result.caveat).toContain('failed CPU cross-validation');
    // The returned grid is the validated CPU one, so it is NOT all-zeros.
    expect(result.labels.some((label) => label !== 0)).toBe(true);
  });

  it('sweep λ field: a correct f32 Benettin kernel validates against the f64 CPU probe', async () => {
    // Reuse the basin RK4 machinery for the two-trajectory Benettin estimator.
    const sweepKernel: CellKernel = (io, uniform) => {
      const [m1, m2, l1, l2, g, damping, dt, steps, lo, span, n, d0, renormEvery, transientSteps] = uniform;
      const N = n!;
      const total = N * N;
      const a = new Float32Array(4);
      const b = new Float32Array(4);
      for (let i = 0; i < total; i += 1) {
        const ix = i % N;
        const iy = Math.floor(i / N);
        const theta1 = f(lo! + f(span! * f(f(ix + 0.5) / N)));
        const theta2 = f(lo! + f(span! * f(f(iy + 0.5) / N)));
        a.set([theta1, theta2, 0, 0]);
        b.set([f(theta1 + d0!), theta2, 0, 0]);
        let accum = 0;
        let measured = 0;
        const renorm = Math.max(Math.round(renormEvery!), 1);
        for (let k = 1; k <= steps!; k += 1) {
          rk4F32(a, dt!, m1!, m2!, l1!, l2!, g!, damping!);
          rk4F32(b, dt!, m1!, m2!, l1!, l2!, g!, damping!);
          if (k % renorm === 0) {
            let d2 = 0;
            for (let c = 0; c < 4; c += 1) d2 = f(d2 + f(f(b[c]! - a[c]!) * f(b[c]! - a[c]!)));
            const dist = Math.max(f(Math.sqrt(d2)), 1e-12);
            if (k > transientSteps!) {
              accum = f(accum + f(Math.log(f(dist / d0!))));
              measured = f(measured + renorm);
            }
            const scale = f(d0! / dist);
            for (let c = 0; c < 4; c += 1) b[c] = f(a[c]! + f(f(b[c]! - a[c]!) * scale));
          }
        }
        io[i] = f(accum / Math.max(f(measured * dt!), 1e-9));
      }
    };
    restore = installMockGpu(sweepKernel);
    // Regular (small-angle libration) region: λ ≈ 0 and the two-trajectory
    // estimate is well-conditioned, so f32 and f64 agree well within tolerance
    // and the GPU result is accepted. (In a strongly chaotic region f32 vs f64
    // Benettin legitimately exceeds tolerance and the contract falls back —
    // the basin reject-path test above covers that branch.)
    const result = await sweepLambdaField(PARAMS, { n: 4, range: [0.1, 0.4], steps: 1000 });
    expect(result.backend).toBe('webgpu');
    expect(result.validation!.passed).toBe(true);
    expect(result.validation!.maxAbsDiff).toBeLessThanOrEqual(result.validation!.tolerance);
  });
});
