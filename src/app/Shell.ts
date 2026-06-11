import { takeOverElement } from './domTakeover';

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

const KNOWN_TABS = ['lab', 'compare', 'lyap', 'sweep', 'bifurc', 'phase3d', 'density', 'validate', 'zeroone', 'clv', 'basin', 'rqa', 'ftle', 'architecture', 'research', 'lab3d', 'canonical', 'aplus', 'docs'];
const PANEL_COLLAPSED_KEY = 'pendulum-lab/ui/panel-collapsed';
const TAB_KEYS: Record<string, string> = { '1': 'lab', '2': 'compare', '3': 'lyap', '4': 'sweep', '5': 'bifurc', '6': 'phase3d', '7': 'density', '8': 'validate', '9': 'architecture', '0': 'research' };

type Fmt = (v: string) => string;
const f2: Fmt = (v) => Number.parseFloat(v).toFixed(2);
const f3: Fmt = (v) => Number.parseFloat(v).toFixed(3);
const f1: Fmt = (v) => Number.parseFloat(v).toFixed(1);
const raw: Fmt = (v) => v;
const sci: Fmt = (v) => `1.0e${v}`;

/** id → [valueSpanId, formatter]. Mirrors the legacy slider displays. */
const SLIDERS: Record<string, Fmt> = {
  th1: f3, th2: f3, th3: f3, iw1: f1, iw2: f1, iw3: f1,
  m1: f2, m2: f2, m3: f2, l1: f2, l2: f2, l3: f2, g: f2, gamma: f2,
  dt: (v) => Number.parseFloat(v).toFixed(4), tol: sci, spf: raw,
  speed: (v) => `${f1(v)}×`, trailLen: raw, ensN: raw, ensEps: (v) => `1.0e${f1(v)}`,
  audioVol: f2, p3dN: raw,
  // analysis-tab sliders
  lyapDt: (v) => `${f2(v)} s`, lyapT: (v) => `${v} s`, lyapEps: sci,
  sweepRes: raw, sweepT: (v) => `${v} s`,
  bifGMin: f1, bifGMax: f1, bifSteps: raw, bifT: (v) => `${v} s`,
  cmpDt: (v) => Number.parseFloat(v).toFixed(3), gpuAlpha: f2,
  // chaos-diagnostics tab sliders
  zeroOneSamples: raw, basinRes: raw, rqaDim: raw, rqaDelay: raw,
  ftleRes: raw, ftleT: (v) => `${Number.parseFloat(v).toFixed(1)} s`
};

interface Preset {
  th1: number; th2: number; th3?: number; iw1?: number; iw2?: number; iw3?: number;
  m1: number; m2: number; m3?: number; l1: number; l2: number; l3?: number;
  g: number; gamma?: number; sysType?: string;
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
    if (!KNOWN_TABS.includes(name)) return;
    document.querySelectorAll<HTMLElement>('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false'));
    document.querySelectorAll<HTMLElement>('.tabpanel').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
    const app = (window as Window & { App?: { activeTab?: string } }).App;
    if (app) app.activeTab = name;
    this.syncRailSectionForTab(name);
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
    const tab = document.querySelector<HTMLElement>(`.rail-section .tab[data-tab="${tabName}"]`);
    const section = tab?.closest<HTMLElement>('.rail-section');
    const sectionName = section?.dataset.railSection;
    if (sectionName) this.openRailSection(sectionName);
  }

  private setSlider(id: string, value: number): void {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    el.value = String(value);
    const span = document.getElementById(`${id}V`);
    const fmt = SLIDERS[id];
    if (span && fmt) span.textContent = fmt(el.value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  applyPreset(name: string): void {
    const p = PRESETS[name];
    if (!p) return;
    const sel = document.getElementById('sysType') as HTMLSelectElement | null;
    if (sel) {
      sel.value = p.sysType ?? 'double';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const entries: Array<[string, number | undefined]> = [
      ['th1', p.th1], ['th2', p.th2], ['th3', p.th3], ['iw1', p.iw1 ?? 0], ['iw2', p.iw2 ?? 0], ['iw3', p.iw3 ?? 0],
      ['m1', p.m1], ['m2', p.m2], ['m3', p.m3], ['l1', p.l1], ['l2', p.l2], ['l3', p.l3], ['g', p.g], ['gamma', p.gamma ?? 0]
    ];
    for (const [id, v] of entries) if (v !== undefined) this.setSlider(id, v);
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
      closeTimer = window.setTimeout(() => {
        closeTimer = null;
        if (document.querySelector('.rail-section.open:hover')) return;
        this.closeRailSections();
      }, 80);
    };

    document.querySelectorAll<HTMLElement>('.rail-menu-button[data-rail-section-button]').forEach((btn) => {
      btn.addEventListener('click', () => {
        clearCloseTimer();
        const section = btn.dataset.railSectionButton;
        if (section) this.openRailSection(section);
      });
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
      clone.addEventListener('click', () => {
        if (clone.dataset.tab) this.switchTo(clone.dataset.tab);
      });
    });
    // Dev-hub rail actions that correspond to tabs.
    document.querySelectorAll<HTMLElement>('.dev-tool-btn[data-rail-action]').forEach((btn) => {
      const action = btn.dataset.railAction;
      const tab = action === 'runtime' ? 'architecture' : action === 'audit' ? 'aplus' : action === 'report' ? 'canonical' : action;
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

  private bindKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (TAB_KEYS[e.key]) {
        this.switchTo(TAB_KEYS[e.key]!);
        return;
      }
      const click = (id: string): void => {
        e.preventDefault();
        document.getElementById(id)?.click();
      };
      switch (e.key) {
        case ' ': click('pauseBtn'); break;
        case 'r': case 'R': click('resetBtn'); break;
        case 'c': case 'C': click('clearTrailBtn'); break;
        case 'p': case 'P': click('clearPoincBtn'); break;
        case '\\': e.preventDefault(); this.togglePanel(); break;
        default: break;
      }
    });
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
    this.bindKeyboard();
    this.bindPanelToggle();
  }
}
