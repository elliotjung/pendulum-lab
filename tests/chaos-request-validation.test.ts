import { describe, expect, test } from 'vitest';
import { bifurcationDiagram, codimTwoDiagram, wadaResolutionConvergence } from '../src/chaos';
import { runChaosJob } from '../src/workers/chaosProtocol';

const DRIVEN = {
  kind: 'driven' as const,
  g: 1,
  length: 1,
  damping: 0.2,
  driveAmplitude: 1,
  driveFrequency: 1
};

function errorFor(request: unknown): string {
  const response = runChaosJob(request);
  expect(response.ok).toBe(false);
  return response.ok ? '' : response.error;
}

describe('chaos worker request allocation boundary', () => {
  test('rejects sparse, wrong-size, and oversized state vectors', () => {
    expect(errorFor({ id: 'sparse', kind: 'lyapunov', spec: DRIVEN, state0: new Array(3) })).toMatch(/missing/);
    expect(errorFor({ id: 'short', kind: 'lyapunov', spec: DRIVEN, state0: [0, 0] })).toMatch(/exactly 3/);
    expect(errorFor({ id: 'huge', kind: 'lyapunovSpectrum', spec: DRIVEN, state0: new Array(10_000).fill(0) })).toMatch(
      /exactly 3/
    );
  });

  test('rejects unsafe or dimensionally inconsistent system specifications', () => {
    expect(
      errorFor({
        id: 'mass',
        kind: 'lyapunov',
        spec: { kind: 'double', m1: 0, m2: 1, l1: 1, l2: 1, g: 9.81 },
        state0: [0, 0, 0, 0]
      })
    ).toMatch(/m1/);
    expect(
      errorFor({
        id: 'chain',
        kind: 'lyapunov',
        spec: { kind: 'chain', masses: new Array(2), lengths: [1, 1], g: 9.81 },
        state0: [0, 0, 0, 0]
      })
    ).toMatch(/missing/);
  });

  test('caps bifurcation parameter arrays before constructing any solver', () => {
    expect(
      errorFor({
        id: 'bif',
        kind: 'bifurcation',
        base: DRIVEN,
        amplitudes: new Array(4_097).fill(1),
        state0: [0, 0, 0],
        settings: { dt: 0.01, maxTime: 1, transientCrossings: 0, maxPointsPerParam: 1 }
      })
    ).toMatch(/4096/);
  });

  test('rejects non-finite and reversed codimension-two ranges', () => {
    const base = { id: 'codim', kind: 'codim2', base: DRIVEN, state0: [0, 0, 0], settings: { n: 4, steps: 500 } };
    expect(errorFor({ ...base, xRange: [0, Number.POSITIVE_INFINITY], yRange: [0, 1] })).toMatch(/xRange/);
    expect(errorFor({ ...base, xRange: [1, 0], yRange: [0, 1] })).toMatch(/xRange/);
    expect(errorFor({ ...base, xRange: [0, 1], yRange: [-1, 1] })).toMatch(/yRange/);
  });
});

describe('aggregate chaos work budgets', () => {
  test('rejects a bifurcation sweep whose per-column jobs are individually valid but excessive together', () => {
    expect(() =>
      bifurcationDiagram({
        parameters: new Array(4_000).fill(0),
        makeRhs: () => (_state, out) => out.fill(0),
        makeState0: () => [0],
        section: () => 1,
        observable: () => 0,
        dt: 0.001,
        maxTime: 100
      })
    ).toThrow(/sweep work/);
  });

  test('rejects Wada resolution lists that exceed aggregate basin work', () => {
    expect(() =>
      wadaResolutionConvergence(
        { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
        { resolutions: [239, 240], dt: 0.01, maxTime: 20 }
      )
    ).toThrow(/aggregate grid work/);
    expect(() => wadaResolutionConvergence({ m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 }, { resolutions: [40, 40] })).toThrow(
      /unique/
    );
  });

  test('rejects codimension-two grid settings that would multiply into excessive work', () => {
    expect(() =>
      codimTwoDiagram(() => DRIVEN, [0, 0, 0], 'x', [0, 1], 'y', [0, 1], {
        n: 40,
        steps: 100_000,
        dt: 0.01
      })
    ).toThrow(/grid work/);
  });
});
