import type { DesignBudget, StudyVariable } from '../../research/experimentDesign';

export const DESIGN_VARIABLE_KEYS = new Set([
  'theta1',
  'theta2',
  'omega1',
  'omega2',
  'damping',
  'dt',
  'mass-ratio',
  'length-ratio'
]);

export function parseDesignVariableLines(text: string): StudyVariable[] {
  const variables: StudyVariable[] = [];
  for (const line of text.split(/\n+/)) {
    const [keyRaw, minRaw, maxRaw] = line.split(',').map((part) => part.trim());
    if (!keyRaw || !DESIGN_VARIABLE_KEYS.has(keyRaw)) continue;
    const min = Number(minRaw);
    const max = Number(maxRaw);
    if (Number.isFinite(min) && Number.isFinite(max) && min !== max) {
      variables.push({ key: keyRaw, min: Math.min(min, max), max: Math.max(min, max) });
    }
  }
  return variables;
}

export function createDesignBudget(maxPoints: number, maxTimeMs: number, maxFailures: number): DesignBudget {
  return {
    maxPoints: Math.round(Math.max(4, Math.min(256, maxPoints))),
    maxTimeMs: Math.round(Math.max(10_000, Math.min(3_600_000, maxTimeMs))),
    maxFailures: Math.round(Math.max(1, Math.min(64, maxFailures)))
  };
}
