export type AudienceMode = 'beginner' | 'student' | 'research';
export const AUDIENCE_MODE_CHANGED_EVENT = 'pendulum:audience-mode-changed';

export function visibleRailSections(mode: AudienceMode): readonly string[] {
  switch (mode) {
    case 'beginner':
      return ['sim'];
    case 'student':
      return ['sim', 'analysis', 'check'];
    case 'research':
      return ['sim', 'analysis', 'chaos', 'check', 'govern'];
    default: {
      const exhaustive: never = mode;
      throw new Error(`unknown audience mode: ${String(exhaustive)}`);
    }
  }
}

export function normalizeAudienceMode(value: unknown): AudienceMode {
  return value === 'beginner' || value === 'student' || value === 'research' ? value : 'research';
}
