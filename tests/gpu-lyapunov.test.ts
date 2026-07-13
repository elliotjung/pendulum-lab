import { describe, expect, it } from 'vitest';
import {
  promotedDoublePendulumLyapunovSpectrum,
  webgpuDoublePendulumLyapunovSpectrumCandidate
} from '../src/runtime/gpuLyapunov';

const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
const state0 = [1.2, 0.7, 0.12, -0.04];

describe('WebGPU Lyapunov promotion path', () => {
  it('does not fabricate a GPU candidate when WebGPU is unavailable', async () => {
    const candidate = await webgpuDoublePendulumLyapunovSpectrumCandidate(params, state0, {
      dt: 0.01,
      steps: 24,
      renormEvery: 6,
      transientSteps: 4,
      seed: 0x1234
    });
    expect(candidate).toBeNull();
  });

  it('fails closed to the CPU f64 oracle outside a browser WebGPU runtime', async () => {
    const promotion = await promotedDoublePendulumLyapunovSpectrum(params, state0, {
      dt: 0.01,
      steps: 24,
      renormEvery: 6,
      transientSteps: 4,
      seed: 0x1234
    });
    expect(promotion.backend).toBe('cpu');
    expect(promotion.gpuCandidate).toBeNull();
    expect(promotion.comparison).toBeNull();
    expect(promotion.result.spectrum).toHaveLength(4);
    expect(promotion.result).toBe(promotion.cpuOracle);
  });
});
