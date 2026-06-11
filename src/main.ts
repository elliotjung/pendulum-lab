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
import { maybeMountModernAnalysisTabs, maybeMountModernLab, maybeMountModernLabProbe, maybeMountModernShell } from './app';
import { installFeatureParityLayer, currentSnapshot } from './app/FeatureParityLayer';
import { installUiPolish } from './app/UiPolish';

function installIndexCommands(): void {
  commandRegistry.upsert({
    id: 'index.exportSubmissionManifest',
    label: 'Export submission manifest',
    description: 'Export a typed submission manifest with security and limitation metadata.',
    // Use the live snapshot (UI controls + running sim state + diagnostics) so
    // the manifest captures the actual run rather than state-store defaults.
    run: () => downloadJson('pendulum_submission_manifest_v10_ts.json', createSubmissionManifest(currentSnapshot()))
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
  window.PendulumLabIndex = Object.freeze({
    version: '10.30.0',
    commands: commandRegistry,
    events: eventBus,
    state: stateStore,
    physics: physicsAdapter
  });
}

function boot(): void {
  // The DI container / canonical runtime surface comes up first so every other
  // installer resolves its collaborators (events, commands, state, physics,
  // worker, adopted legacy app) from one typed source of truth.
  installPendulumRuntime();
  installRuntimeApi();
  installIndexCommands();
  installJsonImportGuard();
  installPerformanceProbe();
  installAccessibilityEnhancements();
  // Stage 2 of the legacy-removal program: the modern Lab simulation/render loop.
  // `?modernLabProbe` mounts a standalone probe canvas; `?lab=modern` takes over
  // the real lab canvases (legacy lab render stands down). Both are feature flags.
  maybeMountModernLabProbe();
  maybeMountModernLab();
  // Stage 3: modern analysis-tab takeovers.
  maybeMountModernAnalysisTabs();
  // Stage 3.5: restore the single-file research/governance/audit surfaces as
  // typed modular UI, keeping the CSP and no-inline-handler improvements.
  installFeatureParityLayer();
  // Stage 4: modern shell owns tab navigation.
  maybeMountModernShell();
  // Visual-only interaction polish (slider progress fill, ripples) — installed
  // last so it observes the fully-built DOM.
  installUiPolish();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
