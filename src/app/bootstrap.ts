import { mountModernLab, type LabHandle } from './LabController';
import { publishDebugApi } from '../runtime/globalApi';
import { LabApp } from './LabApp';
import { Shell, TAB_ACTIVATED_EVENT } from './Shell';
import type { LabConfig } from './LabSimulation';
import type { LyapunovTab } from './LyapunovTab';
import type { ValidationTab } from './ValidationTab';
import type { SweepTab } from './SweepTab';
import type { CompareTab } from './CompareTab';
import type { BifurcationTab } from './BifurcationTab';
import type { Phase3DTab } from './Phase3DTab';
import type { DensityTab } from './DensityTab';
import type { ExpansionLabTab } from './ExpansionLabTab';
import type { ResearchMatrixTab } from './ResearchMatrixTab';
import type { GoldenCenterTab } from './GoldenCenterTab';
import type { ZeroOneTab } from './ZeroOneTab';
import type { ClvTab } from './ClvTab';
import type { BasinTab } from './BasinTab';
import type { RqaTab } from './RqaTab';
import type { FtleTab } from './FtleTab';
import type { ResearchPlusTab } from './ResearchPlusTab';

/**
 * Runtime bootstrap entry points for the browser app. Imported directly by
 * `src/main.ts` so the public `src/app/index.ts` barrel can keep class exports
 * without forcing every analysis tab into the initial bundle.
 *
 * Analysis tabs mount lazily: only the tab that is active at boot (default or
 * deep link) is imported/installed synchronously with startup. Every other tab
 * mounts on first activation (Shell dispatches {@link TAB_ACTIVATED_EVENT}),
 * Hover/focus prefetches only the module bytes; controller installation stays
 * strictly on demand so hidden tabs do not accumulate DOM, timers, or workers.
 */

function modernEnabled(): boolean {
  return typeof location !== 'undefined';
}

const PROBE_CONFIG: LabConfig = {
  system: 'double',
  parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 },
  gamma: 0,
  method: 'rk4',
  dt: 0.002,
  initialState: [2.0, 2.5, 0, 0]
};

export function maybeMountModernLabProbe(): boolean {
  if (typeof location === 'undefined' || !/[?&]modernLabProbe\b/.test(location.search)) return false;
  if (document.getElementById('modern-lab-probe')) return true;

  const canvas = document.createElement('canvas');
  canvas.id = 'modern-lab-probe';
  canvas.width = 400;
  canvas.height = 400;
  canvas.setAttribute('aria-label', 'modern lab probe');
  canvas.style.cssText =
    'position:fixed;right:8px;bottom:8px;width:200px;height:200px;z-index:9999;border:1px solid #2a3340;border-radius:8px';
  document.body.appendChild(canvas);

  const handle = mountModernLab(canvas, PROBE_CONFIG, { stepsPerFrame: 6, trailLength: 1200 });
  handle.start();
  (window as Window & { __modernLabProbe?: LabHandle }).__modernLabProbe = handle;
  return true;
}

export function maybeMountModernLab(): boolean {
  if (!modernEnabled()) return false;
  const existing = (window as Window & { __modernLab?: LabApp }).__modernLab;
  if (existing) return true;
  if (!document.getElementById('main')) return false;
  const app = new LabApp();
  app.start();
  (window as Window & { __modernLab?: LabApp }).__modernLab = app;
  publishDebugApi({ modernLab: app });
  return true;
}

export function maybeMountModernShell(): boolean {
  if (!modernEnabled() || !document.querySelector('.tab[data-tab]')) return false;
  const w = window as Window & { __modernShell?: Shell };
  if (w.__modernShell) return true;
  const shell = new Shell();
  shell.install();
  w.__modernShell = shell;
  return true;
}

interface ModernTabs {
  lyapunov?: LyapunovTab;
  validation?: ValidationTab;
  sweep?: SweepTab;
  compare?: CompareTab;
  bifurcation?: BifurcationTab;
  phase3d?: Phase3DTab;
  density?: DensityTab;
  expansion?: ExpansionLabTab;
  matrix?: ResearchMatrixTab;
  golden?: GoldenCenterTab;
  zeroOne?: ZeroOneTab;
  clv?: ClvTab;
  basin?: BasinTab;
  rqa?: RqaTab;
  ftle?: FtleTab;
  researchPlus?: ResearchPlusTab;
}

type ModernTabsWindow = Window & {
  __modernTabs?: ModernTabs;
};

interface TabMount {
  /** Shell tab name whose activation requires this controller. */
  tab: string;
  prefetch(): void;
  mount(): Promise<void>;
}

function buildTabRegistry(tabs: ModernTabs): TabMount[] {
  function entry<K extends keyof ModernTabs>(
    tab: string,
    key: K,
    load: () => Promise<NonNullable<ModernTabs[K]>>
  ): TabMount {
    let loaded: Promise<NonNullable<ModernTabs[K]>> | null = null;
    let mounted = false;
    const loadOnce = (): Promise<NonNullable<ModernTabs[K]>> => {
      loaded ??= load().catch((error: unknown) => {
        loaded = null;
        throw error;
      });
      return loaded;
    };
    return {
      tab,
      prefetch() {
        void loadOnce().catch(() => undefined);
      },
      async mount() {
        if (mounted) return;
        const instance = await loadOnce();
        if (!mounted) {
          instance.install();
          tabs[key] = instance;
          mounted = true;
        }
      }
    };
  }

  return [
    entry('lyap', 'lyapunov', async () => new (await import('./LyapunovTab')).LyapunovTab()),
    entry('validate', 'validation', async () => new (await import('./ValidationTab')).ValidationTab()),
    entry('sweep', 'sweep', async () => new (await import('./SweepTab')).SweepTab()),
    entry('compare', 'compare', async () => new (await import('./CompareTab')).CompareTab()),
    entry('bifurc', 'bifurcation', async () => new (await import('./BifurcationTab')).BifurcationTab()),
    entry('phase3d', 'phase3d', async () => new (await import('./Phase3DTab')).Phase3DTab()),
    entry('density', 'density', async () => new (await import('./DensityTab')).DensityTab()),
    entry('expansion', 'expansion', async () => new (await import('./ExpansionLabTab')).ExpansionLabTab()),
    entry('matrix', 'matrix', async () => new (await import('./ResearchMatrixTab')).ResearchMatrixTab()),
    entry('golden', 'golden', async () => new (await import('./GoldenCenterTab')).GoldenCenterTab()),
    entry('zeroone', 'zeroOne', async () => new (await import('./ZeroOneTab')).ZeroOneTab()),
    entry('clv', 'clv', async () => new (await import('./ClvTab')).ClvTab()),
    entry('basin', 'basin', async () => new (await import('./BasinTab')).BasinTab()),
    entry('rqa', 'rqa', async () => new (await import('./RqaTab')).RqaTab()),
    entry('ftle', 'ftle', async () => new (await import('./FtleTab')).FtleTab()),
    entry('research', 'researchPlus', async () => new (await import('./ResearchPlusTab')).ResearchPlusTab())
  ];
}

function activeTabName(): string {
  const active = document.querySelector('.tabpanel.active');
  return active && active.id.startsWith('tab-') ? active.id.slice('tab-'.length) : 'lab';
}

function ensureLazyTabPlaceholder(
  tab: string,
  label: string,
  shortIcon: string,
  railId: string,
  afterTab: string
): void {
  if (document.querySelector(`.tab[data-tab="${tab}"]`)) return;
  const rail = document.getElementById(railId);
  if (!rail) return;
  const button = document.createElement('button');
  button.className = 'tab';
  button.type = 'button';
  button.dataset.tab = tab;
  button.dataset.tip = label;
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', 'false');
  button.setAttribute('aria-label', label);
  button.title = label;
  const icon = document.createElement('span');
  icon.className = 'tab-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = shortIcon;
  const text = document.createElement('span');
  text.className = 'tab-label';
  text.textContent = label;
  button.append(icon, text);
  const anchor = rail.querySelector(`.tab[data-tab="${afterTab}"]`);
  anchor?.after(button);
  if (!anchor) rail.append(button);
}

export function maybeMountModernAnalysisTabs(): Promise<boolean> {
  if (!modernEnabled() || !document.getElementById('lyapSpecCanvas')) return Promise.resolve(false);
  // Three workspaces build their heavy panel DOM inside install(). Publish only
  // lightweight rail entries up front so users can discover and activate them.
  ensureLazyTabPlaceholder('expansion', 'Expansion Lab', 'Ex', 'rail-panel-analysis', 'density');
  ensureLazyTabPlaceholder('matrix', 'Research Matrix', 'Mx', 'rail-panel-analysis', 'expansion');
  ensureLazyTabPlaceholder('golden', 'Golden Center', 'Gd', 'rail-panel-check', 'validate');
  const w = window as ModernTabsWindow;
  if (w.__modernTabs) return Promise.resolve(true);

  const tabs: ModernTabs = {};
  w.__modernTabs = tabs;
  const registry = buildTabRegistry(tabs);

  const mountForTab = (tabName: string): Promise<void[]> =>
    Promise.all(registry.filter((item) => item.tab === tabName).map((item) => item.mount()));
  const reactivating = new Set<string>();

  // On-demand path: every activation (rail click, keyboard, deep link,
  // programmatic switchTo) mounts that tab's controller before use.
  document.addEventListener(TAB_ACTIVATED_EVENT, (event) => {
    const tabName = (event as CustomEvent<{ tab?: string }>).detail?.tab;
    if (tabName) {
      if (reactivating.delete(tabName)) return;
      const existingPanel = document.getElementById(`tab-${tabName}`);
      existingPanel?.setAttribute('aria-busy', 'true');
      if (existingPanel) existingPanel.inert = true;
      void mountForTab(tabName)
        .then(() => {
          const panel = document.getElementById(`tab-${tabName}`);
          panel?.removeAttribute('aria-busy');
          if (panel) panel.inert = false;
          if (panel && !panel.classList.contains('active')) {
            reactivating.add(tabName);
            (window as Window & { __modernShell?: { switchTo(name: string): void } }).__modernShell?.switchTo(tabName);
          }
        })
        .catch((error: unknown) => {
          existingPanel?.removeAttribute('aria-busy');
          if (existingPanel) existingPanel.inert = false;
          console.error(`Failed to mount analysis tab "${tabName}".`, error);
        });
    }
  });

  const prefetchFromTarget = (target: EventTarget | null): void => {
    const tabElement = target instanceof Element ? target.closest<HTMLElement>('.tab[data-tab]') : null;
    const tabName = tabElement?.dataset.tab;
    if (!tabName) return;
    registry.find((item) => item.tab === tabName)?.prefetch();
  };
  document.addEventListener('pointerover', (event) => prefetchFromTarget(event.target), { passive: true });
  document.addEventListener('focusin', (event) => prefetchFromTarget(event.target));

  // Only the tab that is visible at boot mounts synchronously with startup.
  return mountForTab(activeTabName()).then(() => true);
}
