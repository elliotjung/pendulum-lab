import { describe, expect, test } from 'vitest';
import { runChaosJob } from '../src/workers/chaosProtocol';
import type { SystemSpec } from '../src/physics/systemSpec';

/**
 * The chaos-diagnostics tabs (0–1 test, CLV, flip basin) run their work through
 * the same pure `runChaosJob` handler the worker uses, so these tests exercise
 * exactly the code path the UI takes — minus the DOM. They pin the wiring
 * (request → handler → response shape) and a coarse physics sanity check on each.
 */

const chaotic: Extract<SystemSpec, { kind: 'double' }> = { kind: 'double', m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 };

describe('0–1 test job', () => {
  test('a chaotic double pendulum yields K ≈ 1 and a translation path', () => {
    const res = runChaosJob({
      id: 'z1',
      kind: 'zeroOne',
      spec: chaotic,
      state0: [2.1, 2.9, 0, 0],
      settings: { samples: 1500 }
    });
    expect(res.ok).toBe(true);
    if (!res.ok || res.kind !== 'zeroOne') throw new Error('wrong response');
    expect(res.K).toBeGreaterThan(0.5);
    expect(res.K).toBeLessThanOrEqual(1.0001);
    expect(res.pPath.length).toBeGreaterThan(0);
    expect(res.qPath.length).toBe(res.pPath.length);
    expect(res.kValues.length).toBeGreaterThan(10);
  });

  test('a near-rest regular pendulum yields a low K', () => {
    const res = runChaosJob({
      id: 'z2',
      kind: 'zeroOne',
      spec: chaotic,
      state0: [0.2, 0.1, 0, 0],
      settings: { samples: 1500 }
    });
    if (!res.ok || res.kind !== 'zeroOne') throw new Error('wrong response');
    expect(res.K).toBeLessThan(0.5);
  });
});

describe('CLV job', () => {
  test('returns 4 exponents, λ₁>0, sum≈0, and a finite hyperbolicity angle', () => {
    const res = runChaosJob({
      id: 'c1',
      kind: 'clv',
      spec: chaotic,
      state0: [2.0, 2.0, 0, 0],
      count: 4,
      settings: { dt: 0.01, renormEvery: 10, forwardTransient: 150, window: 300, backwardTransient: 150 }
    });
    expect(res.ok).toBe(true);
    if (!res.ok || res.kind !== 'clv') throw new Error('wrong response');
    expect(res.exponents.length).toBe(4);
    expect(res.exponents[0]!).toBeGreaterThan(0);
    const sum = res.exponents.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum)).toBeLessThan(0.3);
    expect(Number.isFinite(res.meanHyperbolicityAngle)).toBe(true);
    expect(res.meanHyperbolicityAngle).toBeGreaterThan(0);
  });
});

describe('RQA job', () => {
  test('returns RQA measures and a square recurrence plot; chaotic ⇒ higher divergence', () => {
    const regular = runChaosJob({
      id: 'r1',
      kind: 'rqa',
      spec: chaotic,
      state0: [0.2, 0.1, 0, 0],
      settings: { samples: 300 }
    });
    const chao = runChaosJob({
      id: 'r2',
      kind: 'rqa',
      spec: chaotic,
      state0: [2.5, 2.5, 0, 0],
      settings: { samples: 300 }
    });
    expect(regular.ok).toBe(true);
    if (!regular.ok || regular.kind !== 'rqa') throw new Error('wrong response');
    if (!chao.ok || chao.kind !== 'rqa') throw new Error('wrong response');
    // Recurrence plot is a square 0/1 matrix.
    expect(regular.plotSize).toBeGreaterThan(0);
    expect(regular.plot.length).toBe(regular.plotSize * regular.plotSize);
    expect(regular.recurrenceRate).toBeGreaterThan(0);
    // Chaos signature: shorter diagonals ⇒ larger divergence than the regular orbit.
    expect(chao.divergence).toBeGreaterThan(regular.divergence);
  });
});

describe('FTLE field job', () => {
  test('returns an n×n field with real spatial variation', () => {
    const res = runChaosJob({ id: 'f1', kind: 'ftle', spec: chaotic, settings: { n: 24, totalTime: 3, dt: 0.02 } });
    expect(res.ok).toBe(true);
    if (!res.ok || res.kind !== 'ftle') throw new Error('wrong response');
    expect(res.width).toBe(24);
    expect(res.height).toBe(24);
    expect(res.values.length).toBe(24 * 24);
    expect(res.max).toBeGreaterThan(res.min);
    expect(res.max).toBeGreaterThan(0); // chaotic regions stretch (positive FTLE)
  });
});

describe('study-point job', () => {
  test('fills lambda/RQA/FTLE for one point; chaotic point separates from regular', () => {
    const settings = { lyapunov: { steps: 4000 }, rqa: { samples: 300 }, ftleHorizon: 4 };
    const chao = runChaosJob({ id: 's1', kind: 'studyPoint', spec: chaotic, state0: [2.5, 2.5, 0, 0], settings });
    const regular = runChaosJob({ id: 's2', kind: 'studyPoint', spec: chaotic, state0: [0.2, 0.1, 0, 0], settings });
    expect(chao.ok).toBe(true);
    if (!chao.ok || chao.kind !== 'studyPoint') throw new Error('wrong response');
    if (!regular.ok || regular.kind !== 'studyPoint') throw new Error('wrong response');
    // All three diagnostics agree on the chaotic/regular separation.
    expect(chao.lambdaMax).toBeGreaterThan(0.5);
    expect(regular.lambdaMax).toBeLessThan(chao.lambdaMax);
    expect(chao.rqaDivergence).toBeGreaterThan(regular.rqaDivergence);
    expect(chao.ftle).toBeGreaterThan(regular.ftle);
    expect(chao.lambdaBlockStdError).toBeGreaterThan(0);
    expect(chao.ftleHorizon).toBe(4);
  });
});

describe('flip-basin job', () => {
  test('returns an n×n label grid with a fractal-dimension boundary', () => {
    const res = runChaosJob({
      id: 'b1',
      kind: 'basin',
      spec: chaotic,
      settings: { n: 40, dt: 0.02, maxTime: 8 }
    });
    expect(res.ok).toBe(true);
    if (!res.ok || res.kind !== 'basin') throw new Error('wrong response');
    expect(res.width).toBe(40);
    expect(res.height).toBe(40);
    expect(res.labels.length).toBe(1600);
    expect(res.basinEntropy).toBeGreaterThan(0);
    // Box-counting dimension of the flip boundary sits strictly between a line
    // and the filled plane — a measured fractal witness, resolution-robust.
    expect(res.boxCountingDimension).toBeGreaterThan(1.0);
    expect(res.boxCountingDimension).toBeLessThan(2.0);
  });
});
