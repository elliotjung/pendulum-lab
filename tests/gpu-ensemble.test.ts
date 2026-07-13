import { describe, expect, it } from 'vitest';
import { ensembleGrid, runDoublePendulumEnsemble } from '../src/runtime/gpuEnsemble';
import { rhsDouble } from '../src/physics/double';
import { rk4Step } from '../src/physics/integrators';

const params = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };

describe('ensemble integrator (WebGPU with CPU fallback)', () => {
  it('falls back to the f64 CPU backend in Node and matches a reference trajectory', async () => {
    const initial = new Float64Array([1.2, 0.8, 0, 0]);
    const result = await runDoublePendulumEnsemble(params, initial, { steps: 500, dt: 0.005 });
    expect(result.backend).toBe('cpu');
    expect(result.n).toBe(1);

    // Reference: same RK4 stepping directly.
    const state = new Float64Array(initial);
    const next = new Float64Array(4);
    const rhs = (s: Float64Array, o: Float64Array): void => {
      rhsDouble(s, params, 0, o);
    };
    for (let k = 0; k < 500; k += 1) {
      rk4Step(state, 0.005, rhs, next);
      state.set(next);
    }
    for (let i = 0; i < 4; i += 1) {
      expect(result.states[i]).toBeCloseTo(state[i]!, 12);
    }
    expect(result.caveat).toContain('CPU fallback');
  });

  it('integrates many trajectories independently', async () => {
    const grid = ensembleGrid(4, [-1, 1]); // 16 trajectories
    const result = await runDoublePendulumEnsemble(params, grid, { steps: 200, dt: 0.01 });
    expect(result.n).toBe(16);
    expect(result.states).toHaveLength(64);
    // All finite and not all equal (different ICs evolve differently).
    expect(Array.from(result.states).every(Number.isFinite)).toBe(true);
    const firstTheta = result.states[0];
    expect(Array.from({ length: 16 }, (_, i) => result.states[i * 4]).some((theta) => theta !== firstTheta)).toBe(true);
    // A single trajectory run reproduces the corresponding ensemble member.
    const single = await runDoublePendulumEnsemble(params, grid.slice(20, 24), { steps: 200, dt: 0.01 });
    for (let i = 0; i < 4; i += 1) expect(single.states[i]).toBeCloseTo(result.states[20 + i]!, 12);
  });

  it('chaotic sensitivity: nearby ensemble members separate', async () => {
    const initial = new Float64Array([2.1, 2.1, 0, 0, 2.1 + 1e-8, 2.1, 0, 0]);
    const result = await runDoublePendulumEnsemble(params, initial, { steps: 4000, dt: 0.005 });
    const separation = Math.abs(result.states[0]! - result.states[4]!);
    expect(separation).toBeGreaterThan(1e-5); // grew by orders of magnitude
  });

  it('forceCpu honours the A/B flag and grid builder covers corners', async () => {
    const result = await runDoublePendulumEnsemble(params, ensembleGrid(2, [-3, 3]), {
      steps: 10,
      dt: 0.01,
      forceCpu: true
    });
    expect(result.backend).toBe('cpu');
    const grid = ensembleGrid(3, [-3, 3]);
    expect(grid[0]).toBe(-3);
    expect(grid[8 * 4]).toBe(3); // last cell θ1
    expect(grid[8 * 4 + 1]).toBe(3); // last cell θ2
  });
});
