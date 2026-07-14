import { describe, expect, test } from 'vitest';
import { runChaosJob, type ChaosRequest } from '../src/workers/chaosProtocol';
import { buildRhs, type SystemSpec } from '../src/physics/systemSpec';
import { rhsDouble } from '../src/physics/double';

const DRIVEN: Extract<SystemSpec, { kind: 'driven' }> = {
  kind: 'driven',
  g: 1,
  length: 1,
  damping: 0.5,
  driveAmplitude: 1.15,
  driveFrequency: 2 / 3
};

describe('buildRhs parity with direct physics', () => {
  test('double-spec RHS matches rhsDouble to machine epsilon', () => {
    const spec: SystemSpec = { kind: 'double', m1: 1.3, m2: 0.7, l1: 1.1, l2: 0.9, g: 9.81 };
    const state = new Float64Array([0.6, -0.4, 0.3, -0.2]);
    const a = new Float64Array(4);
    const b = new Float64Array(4);
    buildRhs(spec)(state, a);
    rhsDouble(state, spec, 0, b);
    for (let i = 0; i < 4; i += 1) expect(Math.abs((a[i] ?? 0) - (b[i] ?? 0))).toBeLessThan(1e-12);
  });
});

describe('runChaosJob (pure handler shared by worker and fallback)', () => {
  test('lyapunov on the driven chaos preset returns a positive exponent', () => {
    const req: ChaosRequest = {
      id: 'r1',
      kind: 'lyapunov',
      spec: DRIVEN,
      state0: [0.2, 0, 0],
      settings: { steps: 6000 }
    };
    const res = runChaosJob(req);
    expect(res.ok).toBe(true);
    if (res.ok && res.kind === 'lyapunov') {
      expect(res.lambdaMax).toBeGreaterThan(0.03);
      expect(res.convergence.length).toBeGreaterThan(10);
    }
  });

  test('response is plain serializable JSON (no functions, survives a round-trip)', () => {
    const res = runChaosJob({
      id: 'r2',
      kind: 'lyapunov',
      spec: DRIVEN,
      state0: [0.2, 0, 0],
      settings: { steps: 2000 }
    });
    const clone = JSON.parse(JSON.stringify(res));
    expect(clone).toEqual(res);
  });

  test('bifurcation returns one column per amplitude with finite values', () => {
    const amplitudes = [1.0, 1.1, 1.2, 1.3];
    const req: ChaosRequest = {
      id: 'r3',
      kind: 'bifurcation',
      base: DRIVEN,
      amplitudes,
      state0: [0.2, 0, 0],
      settings: { dt: 6e-3, maxTime: 120, transientCrossings: 10, maxPointsPerParam: 20 }
    };
    const res = runChaosJob(req);
    expect(res.ok).toBe(true);
    if (res.ok && res.kind === 'bifurcation') {
      expect(res.columns.length).toBe(amplitudes.length);
      for (const col of res.columns) for (const v of col.values) expect(Number.isFinite(v)).toBe(true);
    }
  });

  test('a malformed request becomes an error response instead of throwing', () => {
    const bogus = { id: 'r4', kind: 'nope' } as unknown as ChaosRequest;
    const res = runChaosJob(bogus);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.length).toBeGreaterThan(0);
  });

  test('null, primitive, id-less, and cyclic malformed requests are catch-safe', () => {
    const cyclic: Record<string, unknown> = { id: 'cycle', kind: 'nope' };
    cyclic.self = cyclic;
    for (const malformed of [null, undefined, 42, {}, cyclic]) {
      expect(() => runChaosJob(malformed)).not.toThrow();
      const result = runChaosJob(malformed);
      expect(result.ok).toBe(false);
    }
    expect(runChaosJob(null)).toMatchObject({ id: 'unknown', ok: false });
    expect(runChaosJob(cyclic)).toMatchObject({ id: 'cycle', ok: false });
  });

  test('study-point jobs pass all RQA line options through', () => {
    const res = runChaosJob({
      id: 'rqa-options',
      kind: 'studyPoint',
      spec: DRIVEN,
      state0: [0.2, 0, 0],
      settings: {
        lyapunov: { dt: 0.01, steps: 20, renormEvery: 2, transientSteps: 0 },
        rqa: {
          dt: 0.01,
          sampleEvery: 1,
          samples: 40,
          transientSteps: 0,
          dimension: 1,
          delay: 1,
          epsilon: 1e6,
          lMin: 1000,
          vMin: 1000,
          theiler: 0
        },
        ftleHorizon: 0.02,
        ftleDt: 0.01
      }
    });
    expect(res.ok).toBe(true);
    if (res.ok && res.kind === 'studyPoint') expect(res.rqaDeterminism).toBe(0);
  });

  test('RQA uses the spring angular coordinate rather than radial extension', () => {
    const res = runChaosJob({
      id: 'spring-observable',
      kind: 'rqa',
      spec: { kind: 'spring', mass: 1, stiffness: 1, restLength: 1, g: 0 },
      state0: [1.5, 0, 0, 0],
      settings: { dt: 0.01, sampleEvery: 1, samples: 40, transientSteps: 0, dimension: 1, delay: 1 }
    });
    expect(res.ok).toBe(true);
    if (res.ok && res.kind === 'rqa') expect(res.recurrenceRate).toBe(1);
  });
});
