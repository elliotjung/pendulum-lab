import { describe, expect, it } from 'vitest';
import { rhsDouble } from '../src/physics/double';
import {
  DEMO_KERNEL_VERSION,
  createRk4Work,
  rhsDoubleInto,
  rk4StepDouble
} from '../src/integrations/landingDemoKernel';
import { validateLandingKernelManifest } from '../scripts/landing-kernel-sync';

describe('Lab-generated landing demo kernel', () => {
  const parameters = { m1: 1.1, m2: 0.8, l1: 1.2, l2: 0.9, g: 9.81, damping: 0.07 };

  it('delegates every derivative to the authoritative Lab rhsDouble implementation', () => {
    const state = new Float64Array([0.7, -0.2, 0.4, -0.1]);
    const expected = new Float64Array(4);
    const actual = new Float64Array(4);
    rhsDouble(state, parameters, parameters.damping, expected);
    rhsDoubleInto(state, actual, parameters);
    expect([...actual]).toEqual([...expected]);
  });

  it('offers allocation-reusing RK4 with guarded time steps', () => {
    const state = new Float64Array([0.3, -0.1, 0, 0]);
    const work = createRk4Work();
    const returned = rk4StepDouble(state, parameters, 0.002, work);
    expect(returned).toBe(state);
    expect([...state].every(Number.isFinite)).toBe(true);
    expect(() => rk4StepDouble(state, parameters, 0, work)).toThrow(/dt/);
    expect(DEMO_KERNEL_VERSION).toBe('pendulum-demo-kernel/v3');
  });

  it('binds the copied bytes to package version and source commit', () => {
    expect(() =>
      validateLandingKernelManifest(
        {
          schemaVersion: 'pendulum-demo-kernel-manifest/v1',
          kernel: 'assets/pendulum-demo-kernel.js',
          kernelVersion: 'pendulum-demo-kernel/v3',
          sourcePackageVersion: '10.36.0',
          sourceCommit: 'a'.repeat(40),
          sha256: 'b'.repeat(64)
        },
        { packageVersion: '10.36.0', sourceCommit: 'a'.repeat(40), kernelSha256: 'b'.repeat(64) }
      )
    ).not.toThrow();
  });
});
