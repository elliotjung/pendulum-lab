import { createSubmissionManifest, downloadJson } from './export/manifest';
import { commandRegistry, installDefaultCommands } from './runtime/CommandRegistry';
import { eventBus } from './runtime/EventBus';
import { stateStore } from './state/StateStore';
import { physicsAdapter } from './physics';
import { installJsonImportGuard } from './validation/importSchema';
import { runAllValidationChecks } from './validation/validationSuite';
import { installPerformanceProbe } from './render/performance';
import { installAccessibilityEnhancements } from './ui/accessibility';
import { workerBridge } from './runtime/WorkerBridge';
import { installPendulumRuntime } from './runtime/PendulumRuntime';
import { maybeMountModernAnalysisTabs, maybeMountModernLab, maybeMountModernLabProbe, maybeMountModernShell } from './app/bootstrap';
import { installUiPolish } from './app/UiPolish';
import { installHudEffects } from './app/hudEffects';
import { installKineticOverdrive } from './app/kineticOverdrive';
import { installEducationCards } from './app/educationCards';
import { publishPublicApi } from './runtime/globalApi';
import { applyAudienceMode, currentAudienceMode, installAudienceMode } from './app/audienceMode';
import { initNavLocale, installLocaleSelect } from './app/uiLocale';
import { installOnboardingTour } from './app/onboardingTour';
import { APP_VERSION } from './runtime/version';

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
      window.toast?.(`TypeScript validation ${result.ok ? 'passed' : 'failed'}`, 2200);
      downloadJson('pendulum_validation_report_v10_ts.json', result);
    }
  });
  commandRegistry.upsert({
    id: 'index.workerSmoke',
    label: 'Worker smoke test',
    description: 'Run a module-worker step with main-thread fallback.',
    run: async () => {
      const result = await workerBridge.step({ state: [1, 0], dt: 0.001, steps: 10, method: 'rk4' });
      window.toast?.(`Worker smoke ${result.fallback ? 'fallback' : 'module'} ${result.elapsedMs.toFixed(2)} ms`, 2200);
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
  installJsonImportGuard();
  installPerformanceProbe();
  installAccessibilityEnhancements();
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
  installEducationCards();
  installOnboardingTour();
  installUiPolish();
  installHudEffects();
  installKineticOverdrive();
}

async function boot(): Promise<void> {
  bootCoreRuntime();
  bootSafety();
  await bootSimulation();
  await bootResearch();
  bootShell();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void boot(); }, { once: true });
} else {
  void boot();
}
