export type TabHistoryMode = 'push' | 'replace' | 'none';

export interface TabRequestedDetail {
  tab: string;
  historyMode: TabHistoryMode;
  fallbackTab: string;
  requestId: number;
}

export type LandingGoal = 'explore' | 'classroom' | 'reproduce';

const LANDING_GOAL_TABS: Record<LandingGoal, string> = {
  explore: 'lab',
  classroom: 'lyap',
  reproduce: 'research'
};

/** Resolve the landing-page intent contract without accepting arbitrary tabs. */
export function tabForLandingGoal(href: string): string | null {
  try {
    const goal = new URL(href).searchParams.get('goal');
    return goal === 'explore' || goal === 'classroom' || goal === 'reproduce' ? LANDING_GOAL_TABS[goal] : null;
  } catch {
    return null;
  }
}

interface TabRoutingHooks {
  canActivate(tab: string): boolean;
  syncRail(tab: string): void;
  request(detail: TabRequestedDetail): void;
  activated(tab: string): void;
}

/** Return a same-document URL with one canonical tab while retaining all other state. */
export function urlForTab(href: string, tab: string): string {
  const url = new URL(href);
  url.searchParams.set('tab', tab);
  return url.href;
}

function urlTab(): string | null {
  try {
    return new URL(window.location.href).searchParams.get('tab');
  } catch {
    return null;
  }
}

function urlGoalTab(): string | null {
  try {
    return tabForLandingGoal(window.location.href);
  } catch {
    return null;
  }
}

/**
 * Owns tab URL/history state and single-use lazy-navigation requests. DOM tab
 * activation lives here as one transaction so stale imports cannot take back
 * the visible panel or commit an obsolete URL.
 */
export class TabRouting {
  private generation = 0;
  private pendingRequestId: number | null = null;
  private activeTab = 'lab';
  private unbindPopstate: (() => void) | null = null;

  constructor(private readonly hooks: TabRoutingHooks) {}

  private commitUrl(tab: string, mode: TabHistoryMode): void {
    if (mode === 'none') return;
    let next: string;
    try {
      next = urlForTab(window.location.href, tab);
    } catch {
      return;
    }
    if (next === window.location.href) return;
    if (mode === 'replace') window.history.replaceState(window.history.state, '', next);
    else window.history.pushState(window.history.state, '', next);
  }

  private activate(tab: string, mode: TabHistoryMode, panel: HTMLElement): void {
    const focusWasInPanel =
      document.activeElement instanceof HTMLElement && Boolean(document.activeElement.closest('.tabpanel'));
    document.querySelectorAll<HTMLElement>('.tab[data-tab]').forEach((entry) => {
      const selected = entry.dataset.tab === tab;
      entry.setAttribute('aria-selected', String(selected));
      entry.tabIndex = selected ? 0 : -1;
    });
    const selectedTab = document.querySelector<HTMLElement>(`.tab[data-tab="${CSS.escape(tab)}"]`);
    document.querySelectorAll<HTMLElement>('.tabpanel').forEach((entry) => {
      const selected = entry === panel;
      entry.classList.toggle('active', selected);
      entry.setAttribute('aria-hidden', String(!selected));
      entry.inert = !selected;
    });
    const app = (window as Window & { App?: { activeTab?: string } }).App;
    if (app) app.activeTab = tab;
    this.activeTab = tab;
    this.hooks.syncRail(tab);
    this.commitUrl(tab, mode);
    const status = document.getElementById('tabChangeStatus');
    if (status) status.textContent = selectedTab?.getAttribute('aria-label') ?? tab;
    if (focusWasInPanel && selectedTab) queueMicrotask(() => selectedTab.focus());
    this.hooks.activated(tab);
  }

  isCurrentRequest(requestId: number): boolean {
    return requestId === this.pendingRequestId;
  }

  complete(request: TabRequestedDetail): boolean {
    if (!this.isCurrentRequest(request.requestId) || !this.hooks.canActivate(request.tab)) return false;
    const panel = document.getElementById(`tab-${request.tab}`);
    if (!panel) return false;
    this.pendingRequestId = null;
    this.activate(request.tab, request.historyMode, panel);
    return true;
  }

  switchTo(tab: string, historyMode: TabHistoryMode = 'push'): void {
    if (!this.hooks.canActivate(tab)) return;
    const requestId = ++this.generation;
    this.pendingRequestId = null;
    const panel = document.getElementById(`tab-${tab}`);
    if (panel) {
      this.activate(tab, historyMode, panel);
      return;
    }
    const querySelector = (document as Partial<Pick<Document, 'querySelector'>>).querySelector;
    const activePanel = typeof querySelector === 'function' ? querySelector.call(document, '.tabpanel.active') : null;
    const fallbackTab = activePanel?.id.replace(/^tab-/, '') || this.activeTab;
    this.pendingRequestId = requestId;
    this.hooks.request({ tab, historyMode, fallbackTab, requestId });
  }

  applyInitialUrl(fallbackTab = 'lab'): void {
    const requested = urlTab();
    const goalTab = urlGoalTab();
    const fallback = goalTab && this.hooks.canActivate(goalTab) ? goalTab : fallbackTab;
    this.switchTo(requested && this.hooks.canActivate(requested) ? requested : fallback, 'replace');
  }

  bindPopstate(fallbackTab = 'lab'): void {
    this.unbindPopstate?.();
    const onPopstate = (): void => {
      const requested = urlTab();
      const tab = requested && this.hooks.canActivate(requested) ? requested : null;
      const goalTab = urlGoalTab();
      const fallback = goalTab && this.hooks.canActivate(goalTab) ? goalTab : fallbackTab;
      this.switchTo(tab ?? fallback, tab ? 'none' : 'replace');
    };
    window.addEventListener('popstate', onPopstate);
    this.unbindPopstate = () => window.removeEventListener('popstate', onPopstate);
  }

  dispose(): void {
    this.unbindPopstate?.();
    this.unbindPopstate = null;
    this.pendingRequestId = null;
    this.generation += 1;
  }
}

/** Enter the canonical Lab, with a rail-button fallback for non-shell embeds. */
export function enterLabWorkspace(): void {
  const shell = (window as Window & { __modernShell?: { switchTo(tab: string): void } }).__modernShell;
  if (shell) shell.switchTo('lab');
  else {
    const querySelector = (document as Partial<Pick<Document, 'querySelector'>>).querySelector;
    if (typeof querySelector === 'function') {
      (querySelector.call(document, '.tab[data-tab="lab"]') as HTMLElement | null)?.click();
    }
  }
}
