import { takeOverElement } from './domTakeover';
import { commitLabControls } from './controlCommit';
import { canAccessAudienceTab, currentAudienceMode } from './audienceMode';

/**
 * Modern application shell — owns the responsibilities the legacy `js/` runtime
 * used to provide, so the legacy scripts can be removed entirely:
 *   - tab navigation (the `.tab` rail + the dev-hub tab actions),
 *   - slider value-display updates,
 *   - keyboard shortcuts,
 *   - presets (set the controls, then let the Lab/analysis modules rebuild).
 *
 * Functional rebuilds are handled by the modules themselves (LabApp listens to
 * `change`; the analysis tabs read the controls when their job runs), so the
 * shell only needs to keep the DOM displays and navigation in sync.
 */

const KNOWN_TABS = [
  'lab',
  'compare',
  'lyap',
  'sweep',
  'bifurc',
  'phase3d',
  'density',
  'expansion',
  'matrix',
  'validate',
  'golden',
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

/** Fired on document whenever a tab becomes active; detail: `{ tab }`. */
export const TAB_ACTIVATED_EVENT = 'pendulum:tab-activated';
export const TAB_REQUESTED_EVENT = 'pendulum:tab-requested';
const PANEL_COLLAPSED_KEY = 'pendulum-lab/ui/panel-collapsed';
const TAB_KEYS: Record<string, string> = {
  '1': 'lab',
  '2': 'compare',
  '3': 'lyap',
  '4': 'sweep',
  '5': 'bifurc',
  '6': 'phase3d',
  '7': 'density',
  '8': 'validate',
  '9': 'architecture',
  '0': 'research'
};

const INTERACTIVE_SHORTCUT_TARGET = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="textbox"]'
].join(',');

type ShortcutGuardEvent = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'defaultPrevented' | 'isComposing' | 'metaKey' | 'target'
>;

interface ClosestTarget {
  closest?(selector: string): unknown;
  parentElement?: ClosestTarget | null;
}

export function isShellShortcutTarget(target: EventTarget | null): boolean {
  const candidate = target as (EventTarget & ClosestTarget) | null;
  const closestTarget = typeof candidate?.closest === 'function' ? candidate : candidate?.parentElement;
  return typeof closestTarget?.closest === 'function' && Boolean(closestTarget.closest(INTERACTIVE_SHORTCUT_TARGET));
}

/** True when a global shell shortcut must leave the keystroke to the page/widget. */
export function shouldIgnoreShellShortcut(event: ShortcutGuardEvent): boolean {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return true;
  return isShellShortcutTarget(event.target);
}

function compactRail(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 560px), (pointer: coarse)').matches;
}

function urlParam(name: string): string | null {
  try {
    return new URL(window.location.href).searchParams.get(name);
  } catch {
    return null;
  }
}

type Fmt = (v: string) => string;
const f2: Fmt = (v) => Number.parseFloat(v).toFixed(2);
const f3: Fmt = (v) => Number.parseFloat(v).toFixed(3);
const f1: Fmt = (v) => Number.parseFloat(v).toFixed(1);
const raw: Fmt = (v) => v;
const sci: Fmt = (v) => `1.0e${v}`;

/** id → [valueSpanId, formatter]. Mirrors the legacy slider displays. */
const SLIDERS: Record<string, Fmt> = {
  th1: f3,
  th2: f3,
  th3: f3,
  iw1: f1,
  iw2: f1,
  iw3: f1,
  m1: f2,
  m2: f2,
  m3: f2,
  l1: f2,
  l2: f2,
  l3: f2,
  g: f2,
  gamma: f2,
  dt: (v) => Number.parseFloat(v).toFixed(4),
  tol: sci,
  spf: raw,
  speed: (v) => `${f1(v)}×`,
  trailLen: raw,
  ensN: raw,
  ensEps: (v) => `1.0e${f1(v)}`,
  audioVol: f2,
  p3dN: raw,
  // analysis-tab sliders
  lyapDt: (v) => `${f2(v)} s`,
  lyapT: (v) => `${v} s`,
  lyapEps: sci,
  sweepRes: raw,
  sweepT: (v) => `${v} s`,
  bifGMin: f1,
  bifGMax: f1,
  bifSteps: raw,
  bifT: (v) => `${v} s`,
  cmpDt: (v) => Number.parseFloat(v).toFixed(3),
  gpuAlpha: f2,
  // chaos-diagnostics tab sliders
  zeroOneSamples: raw,
  basinRes: raw,
  rqaDim: raw,
  rqaDelay: raw,
  ftleRes: raw,
  ftleT: (v) => `${Number.parseFloat(v).toFixed(1)} s`
};

interface Preset {
  th1: number;
  th2: number;
  th3?: number;
  iw1?: number;
  iw2?: number;
  iw3?: number;
  m1: number;
  m2: number;
  m3?: number;
  l1: number;
  l2: number;
  l3?: number;
  g: number;
  gamma?: number;
  sysType?: string;
}

const PRESETS: Record<string, Preset> = {
  classic: { th1: 2.0, th2: 2.5, m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 },
  butterfly: { th1: 1.57, th2: 1.57, m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
  periodic: { th1: 0.5, th2: -0.5, m1: 1, m2: 2, l1: 1, l2: 0.5, g: 9.81 },
  symmetric: { th1: 1.0, th2: 1.0, m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
  whirling: { th1: 3.0, th2: 3.0, m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 },
  upright: { th1: 0.01, th2: 0.02, m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 },
  chaotic: { th1: 2.1, th2: 2.9, m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 },
  resonance: { th1: 1.0, th2: 2.0, m1: 2, m2: 1, l1: 0.7, l2: 1.4, g: 9.81 },
  triple: { th1: 1.5, th2: 1.5, th3: 1.5, m1: 1, m2: 1, m3: 1, l1: 1, l2: 1, l3: 0.8, g: 9.81, sysType: 'triple' }
};

export class Shell {
  /** Activate a tab by name, replicating the legacy `switchTab` exactly. */
  switchTo(name: string): void {
    if (!KNOWN_TABS.includes(name) || !canAccessAudienceTab(currentAudienceMode(), name)) return;
    const targetPanel = document.getElementById(`tab-${name}`);
    if (!targetPanel) {
      document.dispatchEvent(new CustomEvent(TAB_REQUESTED_EVENT, { detail: { tab: name } }));
      return;
    }
    const focusWasInPanel =
      document.activeElement instanceof HTMLElement && Boolean(document.activeElement.closest('.tabpanel'));
    document.querySelectorAll<HTMLElement>('.tab[data-tab]').forEach((tab) => {
      const selected = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    const selectedTab = document.querySelector<HTMLElement>(`.tab[data-tab="${CSS.escape(name)}"]`);
    document.querySelectorAll<HTMLElement>('.tabpanel').forEach((panel) => {
      const selected = panel === targetPanel;
      panel.classList.toggle('active', selected);
      panel.setAttribute('aria-hidden', String(!selected));
      panel.inert = !selected;
    });
    const app = (window as Window & { App?: { activeTab?: string } }).App;
    if (app) app.activeTab = name;
    this.syncRailSectionForTab(name);
    const status = document.getElementById('tabChangeStatus');
    if (status) status.textContent = selectedTab?.getAttribute('aria-label') ?? name;
    if (focusWasInPanel && selectedTab) queueMicrotask(() => selectedTab?.focus());
    // Lazily-mounted collaborators (analysis tab controllers) listen for this.
    document.dispatchEvent(new CustomEvent(TAB_ACTIVATED_EVENT, { detail: { tab: name } }));
  }

  private openRailSection(name: string): void {
    document.querySelectorAll<HTMLElement>('.rail-section[data-rail-section]').forEach((section) => {
      const open = section.dataset.railSection === name;
      section.classList.toggle('open', open);
      section.querySelector<HTMLElement>('.rail-menu-button')?.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  private closeRailSections(): void {
    document.querySelectorAll<HTMLElement>('.rail-section.open[data-rail-section]').forEach((section) => {
      section.classList.remove('open');
      section.querySelector<HTMLElement>('.rail-menu-button')?.setAttribute('aria-expanded', 'false');
    });
  }

  private syncRailSectionForTab(tabName: string): void {
    if (compactRail()) {
      this.closeRailSections();
      return;
    }
    void tabName;
  }

  private setSlider(id: string, value: number, changed: Set<string>): void {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    const next = String(value);
    if (el.value !== next) changed.add(id);
    el.value = next;
    const span = document.getElementById(`${id}V`);
    const fmt = SLIDERS[id];
    if (span && fmt) span.textContent = fmt(el.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private applyPresetValues(name: string, changed: Set<string>): boolean {
    const p = PRESETS[name];
    if (!p) return false;
    const sel = document.getElementById('sysType') as HTMLSelectElement | null;
    if (sel) {
      const next = p.sysType ?? 'double';
      if (sel.value !== next) changed.add('sysType');
      sel.value = next;
    }
    const entries: Array<[string, number | undefined]> = [
      ['th1', p.th1],
      ['th2', p.th2],
      ['th3', p.th3],
      ['iw1', p.iw1 ?? 0],
      ['iw2', p.iw2 ?? 0],
      ['iw3', p.iw3 ?? 0],
      ['m1', p.m1],
      ['m2', p.m2],
      ['m3', p.m3],
      ['l1', p.l1],
      ['l2', p.l2],
      ['l3', p.l3],
      ['g', p.g],
      ['gamma', p.gamma ?? 0]
    ];
    for (const [id, v] of entries) if (v !== undefined) this.setSlider(id, v, changed);
    return true;
  }

  applyPreset(name: string): void {
    const changed = new Set<string>();
    if (this.applyPresetValues(name, changed)) commitLabControls('preset', changed);
  }

  private bindRailSections(): void {
    let closeTimer: number | null = null;
    const clearCloseTimer = (): void => {
      if (closeTimer === null) return;
      window.clearTimeout(closeTimer);
      closeTimer = null;
    };
    const schedulePointerClose = (event: PointerEvent): void => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      clearCloseTimer();
      // Grace period for crossing the rail→submenu gap. 80ms raced against the
      // pointer's dwell time in the gap (a single synthetic-mouse step can take
      // ~80ms under load); 180ms keeps the close feeling instant while making
      // the crossing reliable. An invisible hover bridge in css/00 covers the
      // horizontal gap so the common path never leaves the section at all.
      closeTimer = window.setTimeout(() => {
        closeTimer = null;
        if (document.querySelector('.rail-section.open:hover')) return;
        this.closeRailSections();
      }, 180);
    };

    document.querySelectorAll<HTMLElement>('.rail-menu-button[data-rail-section-button]').forEach((btn) => {
      const open = (): void => {
        clearCloseTimer();
        const section = btn.dataset.railSectionButton;
        if (section) this.openRailSection(section);
      };
      btn.addEventListener('click', open);
      // Keyboard path: focusing a section button opens its menu, so Tab
      // reaches the submenu entries without needing a pointer.
      btn.addEventListener('focus', open);
    });
    document.querySelectorAll<HTMLElement>('.rail-section[data-rail-section]').forEach((section) => {
      section.addEventListener('pointerenter', clearCloseTimer);
      section.addEventListener('pointerleave', schedulePointerClose);
    });
    document.addEventListener('pointerdown', (event) => {
      const target = event.target as Element | null;
      if (target?.closest('.rail')) return;
      clearCloseTimer();
      this.closeRailSections();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        clearCloseTimer();
        this.closeRailSections();
      }
    });
  }

  private bindNavigation(): void {
    document.querySelectorAll<HTMLElement>('.tab[data-tab]').forEach((btn) => {
      const clone = takeOverElement(btn);
      const name = clone.dataset.tab;
      if (name) {
        clone.id = `workspace-tab-${name}`;
        clone.setAttribute('aria-controls', `tab-${name}`);
        clone.tabIndex = clone.getAttribute('aria-selected') === 'true' ? 0 : -1;
        const panel = document.getElementById(`tab-${name}`);
        if (panel) {
          panel.setAttribute('aria-labelledby', clone.id);
          const active = panel.classList.contains('active');
          panel.setAttribute('aria-hidden', String(!active));
          panel.inert = !active;
        }
      }
      const tablist = clone.closest<HTMLElement>('.rail-submenu,.rail-tab-list');
      tablist?.setAttribute('role', 'tablist');
      tablist?.setAttribute('aria-orientation', compactRail() ? 'horizontal' : 'vertical');
      clone.addEventListener('click', () => {
        if (clone.dataset.tab) this.switchTo(clone.dataset.tab);
        if (compactRail()) this.closeRailSections();
      });
      clone.addEventListener('keydown', (event) => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const tabs = Array.from(document.querySelectorAll<HTMLElement>('.tab[data-tab]')).filter(
          (tab) =>
            !tab.hidden &&
            tab.getAttribute('aria-hidden') !== 'true' &&
            canAccessAudienceTab(currentAudienceMode(), tab.dataset.tab ?? '')
        );
        const index = tabs.indexOf(clone);
        if (index < 0 || !tabs.length) return;
        event.preventDefault();
        const nextIndex =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + tabs.length) %
                tabs.length;
        tabs[nextIndex]?.click();
        tabs[nextIndex]?.focus();
      });
    });
    if (!document.getElementById('tabChangeStatus')) {
      const status = document.createElement('div');
      status.id = 'tabChangeStatus';
      status.className = 'v10-sr';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      document.body.append(status);
    }
    // Dev-hub rail actions that correspond to tabs.
    document.querySelectorAll<HTMLElement>('.dev-tool-btn[data-rail-action]').forEach((btn) => {
      const action = btn.dataset.railAction;
      const tab =
        action === 'runtime'
          ? 'architecture'
          : action === 'audit'
            ? 'aplus'
            : action === 'report'
              ? 'canonical'
              : action;
      if (tab && KNOWN_TABS.includes(tab)) btn.addEventListener('click', () => this.switchTo(tab));
    });
  }

  private bindSliders(): void {
    for (const [id, fmt] of Object.entries(SLIDERS)) {
      const el = document.getElementById(id) as HTMLInputElement | null;
      const span = document.getElementById(`${id}V`);
      if (!el || !span) continue;
      el.addEventListener('input', () => {
        span.textContent = fmt(el.value);
      });
    }
  }

  private bindPresets(): void {
    document.querySelectorAll<HTMLElement>('[data-preset]').forEach((btn) => {
      const name = btn.dataset.preset;
      if (name && PRESETS[name]) btn.addEventListener('click', () => this.applyPreset(name));
    });
  }

  private bindWorkflowStrip(): void {
    document.querySelectorAll<HTMLElement>('[data-workflow-tab], [data-workflow-section]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.workflowTab;
        if (tab && KNOWN_TABS.includes(tab)) this.switchTo(tab);
        const section = btn.dataset.workflowSection;
        if (section && !compactRail()) this.openRailSection(section);
        const focusId = btn.dataset.workflowFocus;
        const focusTarget = focusId ? document.getElementById(focusId) : null;
        focusTarget?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        if (focusTarget instanceof HTMLElement) focusTarget.focus({ preventScroll: true });
      });
    });
  }

  private bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      if (shouldIgnoreShellShortcut(e)) return;
      if (TAB_KEYS[e.key]) {
        this.switchTo(TAB_KEYS[e.key]!);
        return;
      }
      const click = (id: string): void => {
        e.preventDefault();
        document.getElementById(id)?.click();
      };
      switch (e.key) {
        case ' ':
          click('pauseBtn');
          break;
        case 'r':
        case 'R':
          click('resetBtn');
          break;
        case 'c':
        case 'C':
          click('clearTrailBtn');
          break;
        case 'p':
        case 'P':
          click('clearPoincBtn');
          break;
        case '\\':
          e.preventDefault();
          this.togglePanel();
          break;
        default:
          break;
      }
    });
  }

  private applyUrlDeepLink(): void {
    const changed = new Set<string>();
    let hasControlOverride = false;
    const preset = urlParam('preset');
    if (preset && PRESETS[preset]) hasControlOverride = this.applyPresetValues(preset, changed);
    const sysType = urlParam('sysType') ?? urlParam('system');
    const systemSelect = document.getElementById('sysType') as HTMLSelectElement | null;
    if (sysType && systemSelect && Array.from(systemSelect.options).some((option) => option.value === sysType)) {
      if (systemSelect.value !== sysType) changed.add('sysType');
      systemSelect.value = sysType;
      hasControlOverride = true;
    }
    for (const id of [
      'th1',
      'th2',
      'th3',
      'iw1',
      'iw2',
      'iw3',
      'm1',
      'm2',
      'm3',
      'l1',
      'l2',
      'l3',
      'g',
      'gamma',
      'dt',
      'speed',
      'spf'
    ]) {
      const value = urlParam(id);
      if (value === null) continue;
      const numeric = Number.parseFloat(value);
      if (Number.isFinite(numeric)) {
        this.setSlider(id, numeric, changed);
        hasControlOverride = true;
      }
    }
    if (hasControlOverride) commitLabControls('deep-link', changed);
    const tab = urlParam('tab');
    if (tab && KNOWN_TABS.includes(tab)) this.switchTo(tab);
  }

  /** Collapse/expand every tab's right control panel (persisted; shortcut "\"). */
  togglePanel(force?: boolean): void {
    const collapsed = force ?? !document.body.classList.contains('panel-collapsed');
    document.body.classList.toggle('panel-collapsed', collapsed);
    const btn = document.getElementById('panelToggle');
    if (btn) {
      btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
      btn.textContent = collapsed ? '⟨' : '⟩';
      btn.title = collapsed ? 'Show side panel (\\)' : 'Hide side panel (\\)';
    }
    try {
      window.localStorage?.setItem(PANEL_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage unavailable (private mode) — the toggle still works for the session */
    }
  }

  private bindPanelToggle(): void {
    const header = document.querySelector('header');
    if (!header || document.getElementById('panelToggle')) return;
    const btn = document.createElement('button');
    btn.id = 'panelToggle';
    btn.type = 'button';
    btn.className = 'panel-toggle';
    btn.setAttribute('aria-label', 'Toggle side panel');
    btn.addEventListener('click', () => this.togglePanel());
    header.append(btn);
    let collapsed = false;
    try {
      collapsed = window.localStorage?.getItem(PANEL_COLLAPSED_KEY) === '1';
    } catch {
      collapsed = false;
    }
    this.togglePanel(collapsed);
  }

  install(): void {
    this.bindRailSections();
    this.bindNavigation();
    this.bindSliders();
    this.bindPresets();
    this.bindWorkflowStrip();
    this.bindKeyboard();
    this.bindPanelToggle();
    this.applyUrlDeepLink();
    if (compactRail()) this.closeRailSections();
  }
}
