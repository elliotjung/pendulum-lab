import { describe, expect, test } from 'vitest';
import {
  buildReproPackage,
  verifyReproPackage,
  hashRunInputs,
  canonicalJson,
  cyrb53,
  reproMethodsText,
  type ReproRun
} from '../src/research/reproPackage';

const RUN: ReproRun = {
  spec: { kind: 'double', m1: 1, m2: 1, l1: 1.2, l2: 1, g: 9.81 },
  method: 'rk4',
  dt: 0.01,
  steps: 200,
  state0: [0.5, 0.3, 0, 0],
  seed: 42
};

const fixedOpts = {
  libraryVersion: '10.10.0',
  generatedAt: '2026-06-09T00:00:00.000Z',
  includeLyapunov: false
} as const;

describe('canonical hashing', () => {
  test('canonicalJson is independent of key insertion order', () => {
    expect(canonicalJson({ a: 1, b: { c: 2, d: 3 } })).toBe(canonicalJson({ b: { d: 3, c: 2 }, a: 1 }));
  });

  test('cyrb53 is deterministic and sensitive to input', () => {
    expect(cyrb53('hello')).toBe(cyrb53('hello'));
    expect(cyrb53('hello')).not.toBe(cyrb53('world'));
  });

  test('hashRunInputs is stable across rebuilds and ignores object key order', () => {
    const a = hashRunInputs(RUN);
    const reordered: ReproRun = {
      state0: [0.5, 0.3, 0, 0],
      dt: 0.01,
      steps: 200,
      seed: 42,
      method: 'rk4',
      spec: RUN.spec
    };
    expect(hashRunInputs(reordered)).toBe(a);
  });
});

describe('build → verify round-trip', () => {
  test('a freshly built package verifies (deterministic re-run reproduces final state)', () => {
    const pkg = buildReproPackage(RUN, fixedOpts);
    const v = verifyReproPackage(pkg);
    expect(v.ok).toBe(true);
    expect(v.maxStateDiff).toBeLessThan(1e-12); // fully deterministic integration
    expect(v.hashMatches).toBe(true);
  });

  test('rebuilding the same run yields an identical input hash and final state', () => {
    const a = buildReproPackage(RUN, fixedOpts);
    const b = buildReproPackage(RUN, fixedOpts);
    expect(b.inputHash).toBe(a.inputHash);
    expect(b.result.finalState).toEqual(a.result.finalState);
  });

  test('the package is plain serializable JSON', () => {
    const pkg = buildReproPackage(RUN, fixedOpts);
    expect(JSON.parse(JSON.stringify(pkg))).toEqual(pkg);
  });
});

describe('tamper detection', () => {
  test('a corrupted final state fails verification', () => {
    const pkg = buildReproPackage(RUN, fixedOpts);
    pkg.result.finalState[0] = (pkg.result.finalState[0] ?? 0) + 0.5;
    const v = verifyReproPackage(pkg);
    expect(v.ok).toBe(false);
    expect(v.maxStateDiff).toBeGreaterThan(0.1);
  });

  test('a corrupted input hash fails verification', () => {
    const pkg = buildReproPackage(RUN, fixedOpts);
    pkg.inputHash = 'deadbeef';
    const v = verifyReproPackage(pkg);
    expect(v.hashMatches).toBe(false);
    expect(v.ok).toBe(false);
  });
});

describe('diagnostics and methods text', () => {
  test('includes a Lyapunov estimate when requested', () => {
    const pkg = buildReproPackage(RUN, { ...fixedOpts, includeLyapunov: true, lyapunovSteps: 3000 });
    expect(typeof pkg.result.lambdaMax).toBe('number');
    expect(pkg.result.energyDrift).toBeGreaterThanOrEqual(0);
  });

  test('reproMethodsText embeds method, hash, and a citation section', () => {
    const pkg = buildReproPackage(RUN, fixedOpts);
    const text = reproMethodsText(pkg);
    expect(text).toContain('Runge-Kutta 4');
    expect(text).toContain(pkg.inputHash);
    expect(text).toContain('## Citation');
    expect(text).toContain('10.10.0');
  });
});
