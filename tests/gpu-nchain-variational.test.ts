import { describe, expect, it } from 'vitest';
import {
  buildNChainTrajectoryJacobianTape,
  buildNChainJacobianTape,
  compareNChainTrajectoryTape,
  nChainVariationalCpuOracle,
  promotedNChainTrajectoryTape,
  promotedNChainVariational,
  webgpuNChainTrajectoryTapeCandidate,
  webgpuNChainVariationalCandidate
} from '../src/runtime/gpuNChainVariational';

const parameters = {
  masses: [1, 0.9, 0.8],
  lengths: [1, 0.85, 0.7],
  g: 9.81
};
const state = [1.2, 0.7, -0.45, 0.12, -0.08, 0.05];
const options = {
  dt: 0.006,
  renormEvery: 3,
  forwardTransient: 3,
  window: 8,
  backwardTransient: 2
};

describe('N-chain WebGPU STM/QR promotion contract', () => {
  it('builds a finite Jacobian tape for the actual chain trajectory', () => {
    const tape = buildNChainJacobianTape(parameters, state, 0.01, options);
    expect(tape).toHaveLength((options.forwardTransient + options.window) * options.renormEvery * state.length * state.length);
    expect(Array.from(tape).every(Number.isFinite)).toBe(true);
  });

  it('builds a trajectory plus Jacobian-tape oracle with the same tape contract', () => {
    const trajectoryTape = buildNChainTrajectoryJacobianTape(parameters, state, 0.01, options);
    const tape = buildNChainJacobianTape(parameters, state, 0.01, options);
    expect(trajectoryTape.trajectory).toHaveLength(((options.forwardTransient + options.window) * options.renormEvery + 1) * state.length);
    expect(trajectoryTape.jacobianTape).toEqual(tape);
    expect(trajectoryTape.finalState).toEqual(Array.from(trajectoryTape.trajectory.slice(trajectoryTape.trajectory.length - state.length)));
    expect(trajectoryTape.method).toBe('rk4-central-difference-jacobian-tape');
  });

  it('compares trajectory/tape candidates against the CPU f64 oracle with explicit tolerances', () => {
    const oracle = buildNChainTrajectoryJacobianTape(parameters, state, 0.01, options);
    const identical = compareNChainTrajectoryTape(oracle, oracle);
    expect(identical.passed).toBe(true);
    expect(identical.tolerances.jacobian).toBeGreaterThan(0);

    const perturbed = {
      ...oracle,
      finalState: [...oracle.finalState],
      trajectory: new Float64Array(oracle.trajectory),
      jacobianTape: new Float64Array(oracle.jacobianTape)
    };
    perturbed.jacobianTape[0] = perturbed.jacobianTape[0]! + 1;
    const failed = compareNChainTrajectoryTape(perturbed, oracle, { jacobian: 1e-6 });
    expect(failed.passed).toBe(false);
    expect(failed.maxJacobianAbsDiff).toBeGreaterThan(1e-6);
  });

  it('produces a finite f64 CLV and variational-FTLE oracle', () => {
    const result = nChainVariationalCpuOracle(parameters, state, options, 0.01);
    expect(result.dimension).toBe(6);
    expect(result.links).toBe(3);
    expect(result.clv.exponents).toHaveLength(6);
    expect(result.clv.exponents.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(result.variationalFtle)).toBe(true);
    expect(result.method).toBe('piecewise-jacobian-rk2-stm-qr');
  });

  it('does not fabricate a GPU result outside a WebGPU browser', async () => {
    await expect(webgpuNChainVariationalCandidate(parameters, state, options, 0.01)).resolves.toBeNull();
  });

  it('does not fabricate a GPU trajectory/tape result outside a WebGPU browser', async () => {
    await expect(webgpuNChainTrajectoryTapeCandidate(parameters, state, options, 0.01)).resolves.toBeNull();
  });

  it('fails trajectory/tape promotion closed to the f64 oracle when WebGPU is unavailable', async () => {
    const promotion = await promotedNChainTrajectoryTape(parameters, state, options, 0.01);
    expect(promotion.backend).toBe('cpu');
    expect(promotion.gpuCandidate).toBeNull();
    expect(promotion.result).toBe(promotion.cpuOracle);
    expect(promotion.caveat).toMatch(/CPU f64/);
  });

  it('fails closed to the f64 oracle when WebGPU is unavailable', async () => {
    const promotion = await promotedNChainVariational(parameters, state, options, 0.01);
    expect(promotion.backend).toBe('cpu');
    expect(promotion.gpuCandidate).toBeNull();
    expect(promotion.result).toBe(promotion.cpuOracle);
    expect(promotion.result.trajectoryTapeSource).toBe('cpu-f64');
  });

  it('rejects chains above the portable workgroup-storage ceiling', async () => {
    const oversized = { masses: new Array(9).fill(1), lengths: new Array(9).fill(1), g: 9.81 };
    await expect(webgpuNChainVariationalCandidate(oversized, new Array(18).fill(0), options)).rejects.toThrow(/limited to 8 links/);
  });

  it('keeps the nonlinear trajectory/tape candidate scoped to N<=3 until promoted wider', async () => {
    const fourLink = { masses: new Array(4).fill(1), lengths: new Array(4).fill(1), g: 9.81 };
    await expect(webgpuNChainTrajectoryTapeCandidate(fourLink, new Array(8).fill(0), options)).resolves.toBeNull();
  });
});
