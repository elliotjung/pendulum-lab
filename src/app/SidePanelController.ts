const PANEL_COLLAPSED_KEY = 'pendulum-lab/ui/panel-collapsed';
const PANEL_MOTION_MS = 220;

/** Owns the persisted, accessible control-panel collapse transition. */
export class SidePanelController {
  private collapsed = false;
  private motionCleanup: (() => void) | null = null;

  private panels(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.tabpanel .layout > .controls'));
  }

  private activePanel(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.tabpanel.active .layout > .controls');
  }

  private setPanelsHidden(hidden: boolean): void {
    for (const panel of this.panels()) {
      if (hidden) {
        panel.setAttribute('aria-hidden', 'true');
        panel.setAttribute('inert', '');
      } else {
        panel.removeAttribute('aria-hidden');
        panel.removeAttribute('inert');
      }
    }
  }

  private updateButton(collapsed: boolean): void {
    const button = document.getElementById('panelToggle');
    if (!button) return;
    const korean = document.documentElement.lang === 'ko';
    const label = collapsed
      ? korean
        ? '측면 패널 표시'
        : 'Show side panel'
      : korean
        ? '측면 패널 숨기기'
        : 'Hide side panel';
    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    button.removeAttribute('aria-pressed');
    button.setAttribute('aria-label', label);
    button.title = `${label} (\\)`;
    button.dataset.panelState = collapsed ? 'collapsed' : 'expanded';
  }

  private cancelMotionWait(): void {
    this.motionCleanup?.();
    this.motionCleanup = null;
  }

  private finishMotion(collapsed: boolean): void {
    if (collapsed !== this.collapsed) return;
    this.cancelMotionWait();
    document.body.classList.toggle('panel-collapsed', collapsed);
    document.body.classList.remove('panel-transitioning', 'panel-opening', 'panel-closing', 'panel-motion-prep');
    this.setPanelsHidden(collapsed);
    document.dispatchEvent(new CustomEvent('pendulum:panel-toggle-settled', { detail: { collapsed } }));
  }

  private waitForMotion(collapsed: boolean): void {
    this.cancelMotionWait();
    const panel = this.activePanel();
    if (!panel) {
      this.finishMotion(collapsed);
      return;
    }
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      this.finishMotion(collapsed);
    };
    const onTransitionEnd = (event: TransitionEvent): void => {
      if (event.target === panel && event.propertyName === 'transform') finish();
    };
    const timeout = window.setTimeout(finish, PANEL_MOTION_MS + 100);
    const cleanup = (): void => {
      panel.removeEventListener('transitionend', onTransitionEnd);
      window.clearTimeout(timeout);
      if (this.motionCleanup === cleanup) this.motionCleanup = null;
    };
    panel.addEventListener('transitionend', onTransitionEnd);
    this.motionCleanup = cleanup;
  }

  private animate(collapsed: boolean): void {
    const body = document.body;
    this.cancelMotionWait();
    if (collapsed) {
      body.classList.remove('panel-collapsed', 'panel-opening', 'panel-motion-prep');
      body.classList.add('panel-transitioning', 'panel-closing');
      this.waitForMotion(true);
      return;
    }
    const openingFromRest = body.classList.contains('panel-collapsed');
    body.classList.remove('panel-collapsed', 'panel-closing');
    body.classList.add('panel-transitioning', 'panel-opening');
    if (openingFromRest) {
      body.classList.add('panel-motion-prep');
      void this.activePanel()?.offsetWidth;
      body.classList.remove('panel-motion-prep');
    }
    this.waitForMotion(false);
  }

  toggle(force?: boolean, animate = true): void {
    const collapsed = force ?? !this.collapsed;
    this.collapsed = collapsed;
    this.updateButton(collapsed);
    if (collapsed) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && this.panels().some((panel) => panel.contains(active))) {
        document.getElementById('panelToggle')?.focus({ preventScroll: true });
      }
    }
    this.setPanelsHidden(true);
    try {
      window.localStorage?.setItem(PANEL_COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // Private/storage-disabled sessions retain the state in memory only.
    }
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!animate || reduceMotion || !document.body.classList.contains('panel-motion-ready')) {
      this.finishMotion(collapsed);
      return;
    }
    this.animate(collapsed);
  }

  install(): void {
    const header = document.querySelector('header');
    if (!header || document.getElementById('panelToggle')) return;
    const button = document.createElement('button');
    button.id = 'panelToggle';
    button.type = 'button';
    button.className = 'panel-toggle';
    button.setAttribute('aria-label', 'Toggle side panel');
    const icon = document.createElement('span');
    icon.className = 'panel-toggle-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '›';
    button.append(icon);
    const panelIds = this.panels().map((panel, index) => {
      const tabId = panel.closest<HTMLElement>('.tabpanel')?.id;
      panel.id ||= tabId ? `${tabId}-controls` : `workspace-controls-${index + 1}`;
      return panel.id;
    });
    if (panelIds.length > 0) button.setAttribute('aria-controls', panelIds.join(' '));
    button.addEventListener('click', () => this.toggle());
    header.append(button);
    try {
      this.collapsed = window.localStorage?.getItem(PANEL_COLLAPSED_KEY) === '1';
    } catch {
      this.collapsed = false;
    }
    this.toggle(this.collapsed, false);
    requestAnimationFrame(() => document.body.classList.add('panel-motion-ready'));
  }
}
