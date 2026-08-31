import { canvasQualityDiagnostics } from './canvasQuality';
import { pageDom as dom } from './DomBinder';
import type { DiagnosticsScheduler } from './DiagnosticsScheduler';
import type { LabDiagnostics } from './LabDiagnostics';
import type { LabHistory } from './LabHistory';
import type { LabMainSurface } from './LabMainSurface';
import type { LabQualityBudget } from './LabQualityBudget';
import type { LabSidePlotCoordinator } from './LabSidePlotCoordinator';
import type { LabSimulation } from './LabSimulation';
import type { LyapunovEstimator } from './LyapunovEstimator';
import type { PoincareAccumulator } from './PoincareAccumulator';
import { presentLabChrome } from './LabChromePresenter';
import type { RenderScheduler } from './RenderScheduler';
import type { SimulationTimingMode } from './SimulationClock';
import { legacyApp } from '../runtime/legacyCompat';
import { SESSION_SCHEMA_VERSION } from '../state/sessionSchema';
import { stateHash, stateStore } from '../state/StateStore';
import type { RuntimeSnapshot } from '../types/domain';

export interface LabRuntimeReportSource {
  sim: LabSimulation;
  lyap: LyapunovEstimator;
  poincare: PoincareAccumulator;
  history: LabHistory;
  quality: LabQualityBudget;
  sidePlots: LabSidePlotCoordinator;
  mainSurface: LabMainSurface;
  diagnosticsScheduler: DiagnosticsScheduler;
  renderScheduler: RenderScheduler;
  lastTime: number;
  lastDrift: number;
  lastPhysicsMs: number;
  spf: number;
  requestedSpf: number;
  lastAdvancedSteps: number;
  lastTimingDebtSeconds: number;
  droppedSimulationSeconds: number;
  modeLabel: string;
  timingMode: SimulationTimingMode;
}

/** Owns Lab chrome, diagnostic snapshots, and restorable runtime reporting. */
export class LabRuntimeReporter {
  constructor(private readonly read: () => LabRuntimeReportSource) {}

  present(
    snapshot: { time: number; energy: number; drift: number; state: ArrayLike<number> },
    w1: number,
    w2: number
  ): void {
    const source = this.read();
    const longTasks = source.renderScheduler.longTaskSnapshot();
    presentLabChrome({
      ...snapshot,
      initialEnergy: source.sim.initialEnergy,
      damping: source.sim.config.gamma,
      w1Index: w1,
      w2Index: w2,
      fps: source.renderScheduler.fps,
      physicsMs: source.lastPhysicsMs,
      renderMs: source.renderScheduler.renderMs,
      workerMs: source.sidePlots.renderMs(),
      qualityMode: source.quality.mode,
      qualityReason: source.quality.reason,
      dprCap: source.quality.dprCap,
      backend: source.sidePlots.usesWorker() ? 'offscreen' : 'main',
      lambdaMax: source.lyap.value(),
      poincare: { size: source.poincare.size, ...source.poincare.policy() },
      timingDebtSeconds: source.lastTimingDebtSeconds,
      droppedSimulationSeconds: source.droppedSimulationSeconds,
      longTaskCount: longTasks.count,
      longTaskMs: longTasks.totalDurationMs,
      phasePoints: source.history.phasePoints,
      spectrumSamples: source.history.spectrumSamples,
      angleTimeSamples: source.history.angleTimeSamples,
      modeLabel: source.modeLabel
    });
  }

  diagnostics(): LabDiagnostics {
    const source = this.read();
    const longTasks = source.renderScheduler.longTaskSnapshot();
    return {
      time: source.lastTime,
      drift: source.lastDrift,
      poincarePoints: source.poincare.size,
      lambdaMax: source.lyap.value(),
      fps: source.renderScheduler.fps,
      physicsMsPerFrame: source.lastPhysicsMs,
      renderMsPerFrame: source.renderScheduler.renderMs,
      sidePlotMsPerFrame: source.sidePlots.renderMs(),
      trailPoints: source.mainSurface.trailPointCount(),
      qualityMode: source.quality.mode,
      qualityReason: source.quality.reason,
      dprCap: source.quality.dprCap,
      stepsPerFrame: source.spf,
      stepsAdvanced: source.lastAdvancedSteps,
      timingMode: source.timingMode,
      requestedStepsPerFrame: source.requestedSpf,
      trailQualityScale: source.quality.trailQualityScale,
      sidePlotBackend: source.sidePlots.usesWorker() ? 'offscreen' : 'main',
      mainCanvasBackend: source.mainSurface.canvasBackend(),
      mainTrailBackend: source.mainSurface.trailBackend(),
      pendingUiTasks: source.diagnosticsScheduler.pendingCount(),
      longTaskCount: longTasks.count,
      longTaskMs: longTasks.totalDurationMs,
      longestTaskMs: longTasks.maxDurationMs,
      timingDebtSeconds: source.lastTimingDebtSeconds,
      droppedSimulationSeconds: source.droppedSimulationSeconds,
      backgroundPolicy: dom.bool('backgroundSim', false) ? 'continue-when-hidden' : 'pause-when-hidden',
      decorativeEffects: source.quality.allowDecorativeEffects,
      canvasQualityEvents: canvasQualityDiagnostics()
    };
  }

  runtimeSnapshot(): RuntimeSnapshot {
    const source = this.read();
    const config = source.sim.config;
    const state = Array.from(source.sim.stateView());
    const seed = dom.num('seed', Number.NaN);
    return {
      schemaVersion: SESSION_SCHEMA_VERSION,
      systemType: config.system,
      method: config.method,
      mode: legacyApp()?.runMode ?? stateStore.snapshot().mode,
      dt: config.dt,
      tolerance: config.tolerance ?? 1e-7,
      stepsPerFrame: source.requestedSpf,
      damping: config.gamma,
      parameters: { ...config.parameters },
      state,
      simTime: source.sim.time,
      seed: Number.isSafeInteger(seed) ? seed : null,
      hash: stateHash(state)
    };
  }
}
