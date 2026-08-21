/**
 * Audience modes gate visible UI complexity without disabling the engine.
 *
 * Chooser dialog, navigation decoration, and presentation mounting are split
 * into dedicated modules. This file owns policy application, persistence, and
 * the active-mode contract consumed by the rest of the shell.
 */
import { activateModalSurface, announceUiPreference, deactivateModalSurface } from './modalSurface';
import { currentNavLocale } from './navGuide';
import { enterLabWorkspace } from './tabRouting';
import { createAudienceChooser, type AudienceChooserController } from './audienceChooser';
import { AUDIENCE_MODES, AUDIENCE_MODES_KO } from './audienceModeContent';
import { AUDIENCE_MODE_CHANGED_EVENT, normalizeAudienceMode, type AudienceMode } from './audienceModePolicy';
import { installAudienceModeSurface } from './audienceModeSurface';
import { decorateAudienceNavigation } from './audienceNavigation';

export { AUDIENCE_MODES } from './audienceModeContent';

export {
  AUDIENCE_MODE_CHANGED_EVENT,
  normalizeAudienceMode,
  visibleRailSections,
  type AudienceMode
} from './audienceModePolicy';

const STORAGE_KEY = 'pendulum-lab/ui/audience-mode';
let activeAudienceMode: AudienceMode | null = null;
let audienceChooser: AudienceChooserController | null = null;

/** Tabs whose panels a non-research mode must not leave active (fallback to lab). */
const RESEARCH_ONLY_TABS = [
  'matrix',
  'zeroone',
  'clv',
  'basin',
  'rqa',
  'ftle',
  'architecture',
  'research',
  'lab3d',
  'canonical',
  'aplus',
  'docs'
];
const STUDENT_HIDDEN_TABS = RESEARCH_ONLY_TABS;
const BEGINNER_HIDDEN_TABS = [
  ...RESEARCH_ONLY_TABS,
  'lyap',
  'sweep',
  'bifurc',
  'phase3d',
  'density',
  'expansion',
  'validate',
  'golden',
  'compare'
];

const LAB_STUDENT_ROW_IDS = ['seed', 'th3', 'iw1', 'iw2', 'iw3', 'm3', 'l3', 'gamma'];
const LAB_STUDENT_DETAIL_ANCHORS = ['trailMode', 'method', 'ensN', 'dlTrajBtn', 'stats'];
const LAB_RESEARCH_DETAIL_ANCHORS = ['audioOn'];

function storedAudienceMode(): AudienceMode | null {
  try {
    const value = window.localStorage?.getItem(STORAGE_KEY);
    if (value === null) return null;
    if (value === 'beginner' || value === 'student' || value === 'research') return value;
    window.localStorage?.removeItem(STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function urlAudienceMode(): AudienceMode | null {
  try {
    const params = new URL(window.location.href).searchParams;
    const value = params.get('audience') ?? params.get('mode');
    return value === 'beginner' || value === 'student' || value === 'research' ? value : null;
  } catch {
    return null;
  }
}

/** Keep the visible workspace and reload/share URL on one canonical policy. */
export function audienceModeUrl(href: string, mode: AudienceMode): string | null {
  const url = new URL(href);
  const alreadyCanonical = url.searchParams.get('audience') === mode && !url.searchParams.has('mode');
  if (alreadyCanonical) return null;
  url.searchParams.set('audience', mode);
  url.searchParams.delete('mode');
  return url.toString();
}

function syncAudienceModeUrl(mode: AudienceMode): void {
  const canonical = audienceModeUrl(window.location.href, mode);
  if (canonical) window.history.replaceState(window.history.state, '', canonical);
}

function chooser(): AudienceChooserController {
  audienceChooser ??= createAudienceChooser({
    currentMode: currentAudienceMode,
    choose: (mode) => applyAudienceMode(mode),
    enterWorkspace: enterLabWorkspace,
    // Modal isolation is owned at the policy boundary, while the chooser only
    // owns focus and localized dialog markup. This avoids a second, detached
    // modal stack when another hardened surface is already active.
    activateModal: (overlay) => activateModalSurface(overlay),
    deactivateModal: (overlay) => deactivateModalSurface(overlay)
  });
  return audienceChooser;
}

function showAudienceChooser(): void {
  chooser().open();
}

/** Bind the rail home mark once so it reliably returns to workspace selection. */
function bindHomeLogo(): void {
  const logo = document.getElementById('railHome') ?? document.querySelector<HTMLElement>('.rail-logo');
  if (!logo || logo.dataset.homeBound === '1') return;
  logo.dataset.homeBound = '1';
  const open = (event: Event): void => {
    event.preventDefault();
    showAudienceChooser();
  };
  logo.addEventListener('click', open);
  logo.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') open(event);
  });
}

function markClosest(id: string, selector: string, level: AudienceMode): void {
  const element = document.getElementById(id);
  const target = element?.closest<HTMLElement>(selector);
  if (target) target.dataset.audienceMin = level;
}

function installAudienceAnnotations(): void {
  for (const id of LAB_STUDENT_ROW_IDS) markClosest(id, '.row', 'student');
  for (const id of LAB_STUDENT_DETAIL_ANCHORS) markClosest(id, 'details', 'student');
  for (const id of LAB_RESEARCH_DETAIL_ANCHORS) markClosest(id, 'details', 'research');
}

export function currentAudienceMode(): AudienceMode {
  return activeAudienceMode ?? urlAudienceMode() ?? storedAudienceMode() ?? 'research';
}

/** Central authorization for every tab entry path (click, shortcut, URL, command). */
export function canAccessAudienceTab(mode: AudienceMode, tab: string): boolean {
  const hidden = mode === 'beginner' ? BEGINNER_HIDDEN_TABS : mode === 'student' ? STUDENT_HIDDEN_TABS : [];
  return !hidden.includes(tab);
}

/** Whether the URL or persistent preference explicitly selected an audience. */
export function hasExplicitAudienceMode(): boolean {
  return urlAudienceMode() !== null || storedAudienceMode() !== null;
}

export function applyAudienceMode(mode: AudienceMode, persist = true, syncUrl = persist): void {
  activeAudienceMode = mode;
  installAudienceAnnotations();
  decorateAudienceNavigation();
  audienceChooser?.refresh();
  document.body.classList.remove('audience-beginner', 'audience-student', 'audience-research');
  document.body.classList.add(`audience-${mode}`);
  document.body.dataset.audienceMode = mode;
  if (persist) {
    if (syncUrl) syncAudienceModeUrl(mode);
    try {
      window.localStorage?.setItem(STORAGE_KEY, mode);
    } catch {
      // Persistence is best-effort; state remains active for this session.
    }
    audienceChooser?.close();
    document.dispatchEvent(new CustomEvent(AUDIENCE_MODE_CHANGED_EVENT, { detail: { mode } }));
    const label = currentNavLocale() === 'ko' ? AUDIENCE_MODES_KO[mode].label : AUDIENCE_MODES[mode].label;
    announceUiPreference(currentNavLocale() === 'ko' ? `사용자 모드: ${label}` : `Audience mode: ${label}`);
  }
  const active = document.querySelector<HTMLElement>('.tabpanel.active');
  const activeName = active?.id?.replace(/^tab-/, '') ?? '';
  if (!canAccessAudienceTab(mode, activeName)) document.querySelector<HTMLElement>('.tab[data-tab="lab"]')?.click();
  document.querySelectorAll<HTMLElement>('[data-workflow-tab]').forEach((entry) => {
    const tab = entry.dataset.workflowTab;
    const accessible = !tab || canAccessAudienceTab(mode, tab);
    entry.hidden = !accessible;
    entry.toggleAttribute('inert', !accessible);
    entry.setAttribute('aria-hidden', String(!accessible));
  });
  const select = document.getElementById('audienceMode');
  if (select instanceof HTMLSelectElement && select.value !== mode) select.value = mode;
}

/** Install rail preferences, visual decoration, and the first-visit chooser. */
export function installAudienceMode(): void {
  if (typeof document === 'undefined' || document.getElementById('audienceMode')) return;
  const rail = document.querySelector('.rail');
  if (!rail) return;
  installAudienceAnnotations();
  decorateAudienceNavigation();
  installAudienceModeSurface(rail, AUDIENCE_MODES, (value) => applyAudienceMode(normalizeAudienceMode(value)));
  bindHomeLogo();
  const requested = urlAudienceMode();
  const stored = storedAudienceMode();
  // A saved persona is part of the reproducible workspace contract too. Keep
  // the address bar canonical for returning sessions so a manual URL copy
  // opens the same audience mode in a fresh browser profile.
  applyAudienceMode(requested ?? stored ?? 'research', Boolean(requested ?? stored), Boolean(requested ?? stored));
  // First visit asks for intent; returning users land directly in their saved workspace.
  if (!requested && !stored) showAudienceChooser();
}
