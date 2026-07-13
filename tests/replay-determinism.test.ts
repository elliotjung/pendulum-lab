import { describe, expect, test } from 'vitest';
import { rhsDouble } from '../src/physics/double';
import { rk4Step } from '../src/physics/integrators';

function replay(): string {
  const parameters = { m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };
  const state = new Float64Array([0.23, -0.17, 0.02, -0.01]);
  const out = new Float64Array(4);
  const rhs = (s: Float64Array, o: Float64Array) => rhsDouble(s, parameters, 0, o);
  for (let i = 0; i < 1_000; i += 1) {
    rk4Step(state, 0.0015, rhs, out);
    state.set(out);
  }
  return Array.from(state)
    .map((value) => value.toPrecision(16))
    .join('|');
}

describe('replay determinism', () => {
  test('same seedless deterministic path serializes identically', () => {
    expect(replay()).toBe(replay());
  });
});
