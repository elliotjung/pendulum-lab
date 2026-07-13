import { createSubmissionManifest, downloadJson } from './export/manifest';
import { commandRegistry, installDefaultCommands } from './runtime/CommandRegistry';
import { eventBus } from './runtime/EventBus';
import { stateStore } from './state/StateStore';
import { physicsAdapter } from './physics';
import { installJsonImportGuard } from './browser/installJsonImportGuard';
import { runAllValidationChecks } from './validation/validationSuite';
import { installPerformanceProbe } from './render/performance';
import { installAccessibilityEnhancements } from './ui/accessibility';
import { workerBridge } from './runtime/WorkerBridge';
import { installPendulumRuntime } from './runtime/PendulumRuntime';
import {
  maybeMountModernAnalysisTabs,
  maybeMountModernLab,
  maybeMountModernLabProbe,
  maybeMountModernShell
} from './app/bootstrap';
import { installTrustDrawer } from './app/trustDrawer';
import { installUiPolish } from './app/UiPolish';
import { installHudEffects } from './app/hudEffects';
import { installKineticOverdrive } from './app/kineticOverdrive';
import { installEducationCards } from './app/educationCards';
import { publishPublicApi } from './runtime/globalApi';
import {
  AUDIENCE_MODE_CHANGED_EVENT,
  applyAudienceMode,
  currentAudienceMode,
  hasExplicitAudienceMode,
  installAudienceMode
} from './app/audienceMode';
import { TAB_ACTIVATED_EVENT } from './app/Shell';
import { applyStructuralLocale, initNavLocale, installLocaleSelect } from './app/uiLocale';
import { installOnboardingTour } from './app/onboardingTour';
import { installExperimentShare } from './app/experimentShare';
import { installShortcutHelp } from './app/shortcutHelp';
import { APP_VERSION } from './runtime/version';
import { captureReferralAttribution } from './runtime/referralAttribution';

function showToast(message: string, timeout = 2200): void {
  if (typeof window.toast === 'function') {
    window.toast(message, timeout);
    return;
  }
  const box = document.getElementById('toast');
  if (!box) return;
  box.textContent = message;
  box.classList.add('show');
  window.setTimeout(() => box.classList.remove('show'), timeout);
}

function installPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  if (location.protocol === 'file:') return;
  const scope = new URL('./', location.href).pathname;
  void navigator.serviceWorker.register(new URL('./sw.js', location.href), { scope }).catch((error: unknown) => {
    console.warn('Pendulum Lab service worker registration failed; online mode remains available.', error);
  });
}

function installIndexCommands(): void {
  commandRegistry.upsert({
    id: 'index.exportSubmissionManifest',
    label: 'Export submission manifest',
    description: 'Export a typed submission manifest with security and limitation metadata.',
    // Use the live snapshot (UI controls + running sim state + diagnostics) so
    // the manifest captures the actual run rather than state-store defaults.
    run: async () => {
      const { currentSnapshot } = await import('./app/parity/shared');
      downloadJson('pendulum_submission_manifest_v10_ts.json', createSubmissionManifest(currentSnapshot()));
    }
  });
  commandRegistry.upsert({
    id: 'index.validationReport',
    label: 'Run TypeScript validation',
    description: 'Run modular validation checks independent of the legacy validation panel.',
    run: () => {
      const result = runAllValidationChecks();
      showToast(`TypeScript validation ${result.ok ? 'passed' : 'failed'}`);
      downloadJson('pendulum_validation_report_v10_ts.json', result);
    }
  });
  commandRegistry.upsert({
    id: 'index.workerSmoke',
    label: 'Worker smoke test',
    description: 'Run a module-worker step with main-thread fallback.',
    run: async () => {
      const result = await workerBridge.step({ state: [1, 0], dt: 0.001, steps: 10, method: 'rk4' });
      if (!result.fallback) showToast(`Worker smoke module ${result.elapsedMs.toFixed(2)} ms`);
    }
  });
}

/**
 * Public scripting surface (`window.PendulumLabIndex`) and the default command
 * set. This used to live in the LegacyBridge shim; with the legacy runtime gone
 * the shim's other duties (onclick migration, a duplicate Space/R key handler
 * that made Space double-toggle pause, a legacy state poller) were dead weight,
 * so only the genuinely-used parts survive here.
 */
function installRuntimeApi(): void {
  installDefaultCommands();
  stateStore.syncFromLegacy();
  const api = Object.freeze({
    version: APP_VERSION,
    commands: commandRegistry,
    events: eventBus,
    state: stateStore,
    physics: physicsAdapter
  });
  // Public surface is `window.PendulumLab`; `PendulumLabIndex` stays as a
  // deprecated alias for older scripts and the e2e suite.
  publishPublicApi({ ...api }, { PendulumLabIndex: api });
}

/**
 * Boot stage 1 — core runtime. The DI container / canonical runtime surface
 * comes up first so every other installer resolves its collaborators (events,
 * commands, state, physics, worker, adopted legacy app) from one typed source
 * of truth.
 */
function bootCoreRuntime(): void {
  installPendulumRuntime();
  installRuntimeApi();
  installIndexCommands();
}

/** Boot stage 2 — safety rails: import validation, perf probe, a11y. */
function bootSafety(): void {
  installPwa();
  installJsonImportGuard();
  installPerformanceProbe();
  installAccessibilityEnhancements();
  // The Trust & Diagnostics drawer must exist before the parity layer mounts
  // its health/validation/provenance/performance/fault cards into it.
  installTrustDrawer();
}

/**
 * Boot stage 3 — the modern Lab simulation/render loop and analysis tabs.
 * `?modernLabProbe` mounts a standalone probe canvas; `?lab=modern` takes over
 * the real lab canvases (legacy lab render stands down). Both are feature flags.
 */
async function bootSimulation(): Promise<void> {
  maybeMountModernLabProbe();
  maybeMountModernLab();
  await maybeMountModernAnalysisTabs();
}

/**
 * Boot stage 4 — the research/governance/audit surfaces (parity modules),
 * keeping the CSP and no-inline-handler improvements.
 */
async function bootResearch(): Promise<void> {
  const { installFeatureParityLayer } = await import('./app/FeatureParityLayer');
  installFeatureParityLayer();
}

const RESEARCH_SURFACE_TABS = new Set(['architecture', 'research', 'lab3d', 'canonical', 'aplus', 'docs']);
let researchBoot: Promise<void> | null = null;

function ensureResearch(tabAfterInstall?: string): Promise<void> {
  researchBoot ??= bootResearch();
  return researchBoot.then(() => {
    // The research layer registers extra rail entries lazily; redecorate them
    // after mounting so Korean labels and stable data-testid selectors cover
    // dynamic navigation just like the static shell.
    applyAudienceMode(currentAudienceMode(), false);
    applyStructuralLocale();
    if (tabAfterInstall) {
      (window as Window & { __modernShell?: { switchTo(name: string): void } }).__modernShell?.switchTo(
        tabAfterInstall
      );
    }
  });
}

function armResearchOnDemand(): void {
  document.addEventListener(AUDIENCE_MODE_CHANGED_EVENT, (event) => {
    const mode = (event as CustomEvent<{ mode?: string }>).detail?.mode;
    if (mode === 'research') void ensureResearch();
  });
  document.addEventListener(TAB_ACTIVATED_EVENT, (event) => {
    const tab = (event as CustomEvent<{ tab?: string }>).detail?.tab;
    if (tab && RESEARCH_SURFACE_TABS.has(tab) && researchBoot === null) void ensureResearch(tab);
  });
  // Rail action buttons (the always-visible palette launcher, Floquet probe,
  // manifest/report exports) are bound by the lazily-loaded parity layer. A
  // click landing before that chunk installs — or in a mode that never loads
  // it — would be silently dropped: load the layer on demand and replay the
  // click once the real binding exists (parity binding marks the button).
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const btn = target?.closest<HTMLElement>('.dev-tool-btn[data-rail-action]');
    if (!btn || btn.dataset.parityBound === 'true') return;
    void ensureResearch().then(() => {
      if (btn.dataset.parityBound === 'true') btn.click();
    });
  });
  // The Ctrl+K binding itself also lives in that lazy chunk, so a keystroke
  // landing before it installs (fresh session, or any mode that has not
  // loaded the research layer yet) would be silently dropped — the keyboard
  // twin of the click-replay above. Until the real listener exists (#rgv8Cmd
  // is created by installCommandPalettes), claim the shortcut, mount the
  // layer, and open the palette directly.
  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
    if (document.getElementById('rgv8Cmd')) return; // the parity listener owns it now
    event.preventDefault();
    void ensureResearch().then(async () => {
      (await import('./app/FeatureParityLayer')).showCommandPalette();
    });
  });
}

/**
 * Boot stage 5 — modern shell owns tab navigation, then visual-only
 * interaction polish (slider progress fill, ripples) installed last so it
 * observes the fully-built DOM.
 */
function bootShell(): void {
  maybeMountModernShell();
  initNavLocale(); // restore the guide language before the menus are decorated
  installAudienceMode();
  installLocaleSelect(() => applyAudienceMode(currentAudienceMode(), false));
  applyStructuralLocale();
  installExperimentShare();
  installShortcutHelp();
  installEducationCards();
  installOnboardingTour();
  installUiPolish();
  installHudEffects();
  installKineticOverdrive();
}

async function boot(): Promise<void> {
  try {
    captureReferralAttribution(window.location.href, window.sessionStorage);
  } catch {
    // Storage can be unavailable in hardened/file:// contexts; startup continues.
  }
  bootCoreRuntime();
  bootSafety();
  await bootSimulation();
  armResearchOnDemand();
  bootShell();
  if (hasExplicitAudienceMode() && currentAudienceMode() === 'research') void ensureResearch();
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      void boot();
    },
    { once: true }
  );
} else {
  void boot();
}
