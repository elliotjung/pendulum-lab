import { describe, expect, test } from 'vitest';
import {
  normalizeLab3dResearchStep,
  normalizeLab3dTimingMode,
  resolveLab3dStepTiming
} from '../src/app/parity/lab3d-timing';

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
};

describe('lab3d timing policy', () => {
  test('normalizes timing controls at the UI boundary', () => {
    expect(normalizeLab3dTimingMode('research')).toBe('research');
    expect(normalizeLab3dTimingMode('anything-else')).toBe('demo');
    expect(normalizeLab3dResearchStep(0.2, clampNumber)).toBe(0.05);
    expect(normalizeLab3dResearchStep(0.00001, clampNumber)).toBe(0.001);
    expect(normalizeLab3dResearchStep(Number.NaN, clampNumber)).toBeCloseTo(1 / 60);
  });

  test('demo mode follows wall-clock deltas with a catch-up clamp', () => {
    expect(
      resolveLab3dStepTiming({
        timestamp: 1016,
        lastFrame: 1000,
        mode: 'demo',
        researchStep: 0.01,
        clampNumber
      })
    ).toEqual({ elapsed: 0.016, nextLastFrame: 1016, deterministic: false });

    expect(
      resolveLab3dStepTiming({
        timestamp: 2000,
        lastFrame: 1000,
        mode: 'demo',
        researchStep: 0.01,
        clampNumber
      }).elapsed
    ).toBe(0.05);
  });

  test('research mode ignores wall-clock jitter and advances a fixed quantum', () => {
    const slowFrame = resolveLab3dStepTiming({
      timestamp: 5000,
      lastFrame: 1000,
      mode: 'research',
      researchStep: 0.0125,
      clampNumber
    });
    const fastFrame = resolveLab3dStepTiming({
      timestamp: 5010,
      lastFrame: 5000,
      mode: 'research',
      researchStep: 0.0125,
      clampNumber
    });

    expect(slowFrame).toEqual({ elapsed: 0.0125, nextLastFrame: 5000, deterministic: true });
    expect(fastFrame.elapsed).toBe(0.0125);
  });
});
