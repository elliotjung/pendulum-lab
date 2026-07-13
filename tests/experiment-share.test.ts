import { describe, expect, it } from 'vitest';
import { decodeSharedExperiment, encodeSharedExperiment, type SharedExperimentV1 } from '../src/app/experimentShare';

const setup: SharedExperimentV1 = {
  v: 1,
  system: 'triple',
  method: 'yoshida4',
  dt: 0.0015,
  damping: 0.04,
  toleranceExponent: -9,
  parameters: { m1: 1, m2: 1.2, m3: 0.8, l1: 1.1, l2: 0.9, l3: 0.7, g: 9.81 },
  initial: { theta: [1.1, -0.4, 0.2], omega: [0.1, 0.2, -0.3] },
  tab: 'bifurc'
};

describe('versioned experiment share hashes', () => {
  it('round-trips parameters, initial conditions, integrator, and active tab', () => {
    const hash = encodeSharedExperiment(setup);
    expect(hash).toMatch(/^#experiment=/);
    expect(hash).not.toContain('+');
    expect(decodeSharedExperiment(hash)).toEqual(setup);
  });

  it('fails closed for malformed and future-version hashes', () => {
    expect(decodeSharedExperiment('#experiment=%%%')).toBeNull();
    const future = `#experiment=${btoa(JSON.stringify({ ...setup, v: 2 })).replace(/=+$/u, '')}`;
    expect(decodeSharedExperiment(future)).toBeNull();
    expect(decodeSharedExperiment(`#experiment=${'A'.repeat(9_000)}`)).toBeNull();
  });

  it('sanitizes untrusted numeric ranges, method names, and tab names', () => {
    const unsafe = {
      ...setup,
      method: 'eval-javascript',
      tab: 'not-a-tab',
      dt: -1,
      damping: 999,
      initial: { theta: [Infinity, -999, 1], omega: ['bad', 200, 0] }
    } as unknown as SharedExperimentV1;
    const parsed = decodeSharedExperiment(encodeSharedExperiment(unsafe));
    expect(parsed?.method).toBe('rk4');
    expect(parsed?.tab).toBe('lab');
    expect(parsed?.dt).toBe(0.00001);
    expect(parsed?.damping).toBe(10);
    expect(parsed?.initial.theta[1]).toBeCloseTo(-Math.PI * 4);
    expect(parsed?.initial.omega[1]).toBe(100);
  });
});
