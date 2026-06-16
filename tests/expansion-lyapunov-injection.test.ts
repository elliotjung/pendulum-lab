import { describe, expect, test } from 'vitest';
import {
  runExpansionSuite,
  runResearchMatrixStudy,
  type ExpansionLyapunovProfile,
  type ExpansionLyapunovProfiler,
  type ExpansionSuiteConfig
} from '../src/physics/expandedModels';

/**
 * The Lyapunov profiler is now an injected dependency of the suite / matrix
 * runners (ROADMAP "Architecture": the prerequisite that unblocks the file
 * split). These tests pin both the injection (a stub profiler is used and its
 * result propagates) and the default (the real profiler still runs when none is
 * supplied), which together prove the runners no longer hard-depend on the
 * concrete `expansionLyapunovProfile`.
 */

function makeStubProfiler(leading: number): { profiler: ExpansionLyapunovProfiler; calls: ExpansionSuiteConfig[] } {
  const calls: ExpansionSuiteConfig[] = [];
  const result: ExpansionLyapunovProfile = {
    spectrum: [leading, -leading],
    blockStdError: [0.1, 0.1],
    sum: 0,
    kaplanYorkeDimension: 2,
    leadingExponent: leading,
    consistency: {
      sum: 0,
      pairingError: 0,
      zeroExponentCount: 2,
      symplectic: true,
      tolerances: { sumTolerance: 0.1, pairingTolerance: 0.1, zeroTolerance: 0.05 }
    },
    timeline: [{ time: 0, leading, secondary: -leading }],
    settings: { dt: 0.01, steps: 100, renormEvery: 5, transientSteps: 10, count: 2, jacobian: 'central-difference' }
  };
  return {
    profiler: (config) => {
      calls.push(config);
      return result;
    },
    calls
  };
}

describe('expansionLyapunovProfile injection', () => {
  test('runExpansionSuite uses the injected profiler when one is supplied', () => {
    const { profiler, calls } = makeStubProfiler(42);
    const result = runExpansionSuite({ model: 'coupled' }, { includeLyapunov: true, lyapunovProfiler: profiler });
    expect(calls).toHaveLength(1);
    expect(result.lyapunov?.leadingExponent).toBe(42);
  });

  test('the injected profiler is not called when includeLyapunov is false', () => {
    const { profiler, calls } = makeStubProfiler(7);
    const result = runExpansionSuite({ model: 'coupled' }, { lyapunovProfiler: profiler });
    expect(calls).toHaveLength(0);
    expect(result.lyapunov).toBeUndefined();
  });

  test('the default (real) profiler still runs when none is injected', () => {
    const result = runExpansionSuite({ model: 'coupled' }, { includeLyapunov: true });
    expect(result.lyapunov).toBeDefined();
    expect(result.lyapunov!.spectrum.length).toBeGreaterThan(0);
  });

  test('runResearchMatrixStudy threads the injected profiler through to its result', () => {
    const { profiler, calls } = makeStubProfiler(99);
    const result = runResearchMatrixStudy({ model: 'coupled' }, { lyapunovProfiler: profiler, gridSize: 4 });
    expect(calls).toHaveLength(1); // the matrix study computes its own spectrum exactly once
    expect(result.summary.maxLyapunovEstimate).toBe(99);
    expect(result.diagnostics.lyapunovSpectrum).toEqual([99, -99]);
  });
});
