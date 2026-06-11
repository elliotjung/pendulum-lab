/**
 * Audience modes — Beginner / Student / Research — gate how much of the UI is
 * visible without touching any functionality:
 *
 * - **Beginner**: the simulator and presets only (Simulate rail section).
 * - **Student**: adds the core analysis and validation sections.
 * - **Research**: everything, including chaos diagnostics, 3D lab, research
 *   workbench and governance tooling (the default).
 *
 * Pure helpers are exported for tests; `installAudienceMode` does the DOM
 * wiring (a select in the rail footer + a body class + persistence).
 */

import { installAdoptedStyle } from '../ui/adoptedStyles';

export type AudienceMode = 'beginner' | 'student' | 'research';

export const AUDIENCE_MODES: Record<AudienceMode, { label: string; description: string }> = {
  beginner: { label: 'Beginner', description: 'Simulator and presets only — explore the motion.' },
  student: { label: 'Student', description: 'Adds Lyapunov, sweep, bifurcation and validation tools.' },
  research: { label: 'Research', description: 'Everything: chaos diagnostics, 3D lab, research workbench, governance.' }
};

/** Rail sections (data-rail-section values) visible in each mode. */
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

const STORAGE_KEY = 'pendulum-lab/ui/audience-mode';
const STYLE_ID = 'audience-mode-style';

/** Tabs whose panels a non-research mode must not leave active (fallback to lab). */
const RESEARCH_ONLY_TABS = ['zeroone', 'clv', 'basin', 'rqa', 'ftle', 'architecture', 'research', 'lab3d', 'canonical', 'aplus', 'docs'];
const STUDENT_HIDDEN_TABS = RESEARCH_ONLY_TABS;
const BEGINNER_HIDDEN_TABS = [...RESEARCH_ONLY_TABS, 'lyap', 'sweep', 'bifurc', 'phase3d', 'density', 'validate', 'compare'];

function modeCss(): string {
  const hideSections = (mode: AudienceMode): string => {
    const visible = new Set(visibleRailSections(mode));
    const all = ['sim', 'analysis', 'chaos', 'check', 'govern'];
    return all
      .filter((section) => !visible.has(section))
      .map((section) => `body.audience-${mode} .rail-section[data-rail-section="${section}"]`)
      .join(',');
  };
  const beginnerHidden = hideSections('beginner');
  const studentHidden = hideSections('student');
  return `
${beginnerHidden}{display:none}
${studentHidden}{display:none}
body.audience-beginner .dev-hub,body.audience-beginner #ueFloatingDiag{display:none}
.audience-select{margin-top:auto;padding:6px;display:flex;flex-direction:column;gap:4px}
.audience-select label{font:700 8px/1 var(--font-mono,monospace);letter-spacing:1px;color:var(--muted,#4e5972);text-transform:uppercase;text-align:center}
.audience-select select{width:100%;font-size:10px}
`;
}

export function currentAudienceMode(): AudienceMode {
  try {
    return normalizeAudienceMode(window.localStorage?.getItem(STORAGE_KEY));
  } catch {
    return 'research';
  }
}

export function applyAudienceMode(mode: AudienceMode): void {
  document.body.classList.remove('audience-beginner', 'audience-student', 'audience-research');
  document.body.classList.add(`audience-${mode}`);
  try {
    window.localStorage?.setItem(STORAGE_KEY, mode);
  } catch {
    /* persistence is best-effort */
  }
  // If the active tab is no longer reachable in this mode, fall back to Lab.
  const hidden = mode === 'beginner' ? BEGINNER_HIDDEN_TABS : mode === 'student' ? STUDENT_HIDDEN_TABS : [];
  const active = document.querySelector<HTMLElement>('.tabpanel.active');
  const activeName = active?.id?.replace(/^tab-/, '') ?? '';
  if (hidden.includes(activeName)) {
    document.querySelector<HTMLElement>('.tab[data-tab="lab"]')?.click();
  }
  const select = document.getElementById('audienceMode');
  if (select instanceof HTMLSelectElement && select.value !== mode) select.value = mode;
}

/** Install the mode select in the rail and restore the persisted mode. */
export function installAudienceMode(): void {
  if (typeof document === 'undefined' || document.getElementById('audienceMode')) return;
  const rail = document.querySelector('.rail');
  if (!rail) return;
  installAdoptedStyle(STYLE_ID, modeCss());
  const wrap = document.createElement('div');
  wrap.className = 'audience-select';
  const label = document.createElement('label');
  label.htmlFor = 'audienceMode';
  label.textContent = 'Mode';
  const select = document.createElement('select');
  select.id = 'audienceMode';
  select.setAttribute('aria-label', 'Audience mode');
  for (const [value, meta] of Object.entries(AUDIENCE_MODES)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = meta.label;
    option.title = meta.description;
    select.append(option);
  }
  select.addEventListener('change', () => applyAudienceMode(normalizeAudienceMode(select.value)));
  wrap.append(label, select);
  rail.append(wrap);
  applyAudienceMode(currentAudienceMode());
}
