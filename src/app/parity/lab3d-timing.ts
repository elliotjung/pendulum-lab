import type { ClampNumber } from './lab3d-utils';

export type Lab3dTimingMode = 'demo' | 'research';

export interface Lab3dStepTimingInput {
  timestamp: number;
  lastFrame: number;
  mode: Lab3dTimingMode;
  researchStep: number;
  clampNumber: ClampNumber;
}

export interface Lab3dStepTiming {
  elapsed: number;
  nextLastFrame: number;
  deterministic: boolean;
}

export function normalizeLab3dTimingMode(value: string): Lab3dTimingMode {
  return value === 'research' ? 'research' : 'demo';
}

export function normalizeLab3dResearchStep(value: unknown, clampNumber: ClampNumber): number {
  return clampNumber(value, 1 / 60, 0.001, 0.05);
}

/**
 * Demo mode follows wall-clock time. Research mode advances by a fixed
 * simulation quantum on every render tick, making the trajectory independent of
 * browser frame pacing for deterministic screen recordings and comparisons.
 */
export function resolveLab3dStepTiming(input: Lab3dStepTimingInput): Lab3dStepTiming {
  const step = normalizeLab3dResearchStep(input.researchStep, input.clampNumber);
  if (input.mode === 'research') {
    return { elapsed: step, nextLastFrame: input.timestamp, deterministic: true };
  }
  const elapsed =
    input.lastFrame > 0 ? input.clampNumber((input.timestamp - input.lastFrame) / 1000, 0.016, 0, 0.05) : 0.016;
  return { elapsed, nextLastFrame: input.timestamp, deterministic: false };
}
