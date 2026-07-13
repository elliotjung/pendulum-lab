import { describe, expect, it } from 'vitest';
import {
  buildLab3dChainInitialState,
  buildLab3dChainParams,
  buildLab3dChainSpec,
  normalizeLab3dChainMethod,
  normalizeLab3dChainN,
  type Lab3dChainInput
} from '../src/app/parity/lab3d-chain-config';

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
};

function input(overrides: Partial<Lab3dChainInput> = {}): Lab3dChainInput {
  return {
    nValue: 3,
    methodValue: 'gbs',
    massesText: '1, 0.8, 9',
    lengthsText: '1 0.7',
    thetaText: '1.6, 2.2, 9',
    phiText: '0, 3.5',
    thetaDotText: '0, 0.2',
    phiDotText: '1.2, -0.8, 50',
    gravityValue: 9.81,
    dampingValue: 0.1,
    clampNumber,
    ...overrides
  };
}

describe('lab3d spherical-chain config', () => {
  it('normalizes N and integrator method at the UI boundary', () => {
    expect(normalizeLab3dChainN(9, clampNumber)).toBe(5);
    expect(normalizeLab3dChainN(0, clampNumber)).toBe(1);
    expect(normalizeLab3dChainMethod('gauss2')).toBe('gauss2');
    expect(normalizeLab3dChainMethod('not-a-method')).toBe('rk4');
  });

  it('builds clamped chain parameters from text controls', () => {
    expect(buildLab3dChainParams(input())).toEqual({
      masses: [1, 0.8, 5],
      lengths: [1, 0.7, 0.7],
      g: 9.81,
      damping: 0.1
    });
  });

  it('builds the full [theta, phi, thetaDot, phiDot] state layout', () => {
    expect(buildLab3dChainInitialState(input())).toEqual([
      1.6,
      0,
      2.2,
      Math.PI,
      3.05,
      Math.PI,
      0,
      1.2,
      0.2,
      -0.8,
      0.2,
      10
    ]);
  });

  it('creates a defensive SystemSpec copy for worker/research jobs', () => {
    const params = { masses: [1, 2], lengths: [0.5, 0.9], g: 9.81, damping: 0.1 };
    const spec = buildLab3dChainSpec(params);
    params.masses[0] = 99;
    expect(spec).toEqual({ kind: 'spherical-chain', masses: [1, 2], lengths: [0.5, 0.9], g: 9.81, damping: 0.1 });
  });
});
