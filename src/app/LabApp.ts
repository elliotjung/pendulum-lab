import { physicsAdapter } from '../physics';
import { LabSimulation, type BobPosition, type LabConfig } from './LabSimulation';
import { PoincareAccumulator } from './PoincareAccumulator';
import { LyapunovEstimator } from './LyapunovEstimator';
import { pageDom as dom } from './DomBinder';
import { AudioSonifier } from './AudioSonifier';
import { DiagnosticsScheduler } from './DiagnosticsScheduler';
import { LabSidePlotCoordinator } from './LabSidePlotCoordinator';
import { LabEnsembleController } from './LabEnsembleController';
import { RenderScheduler } from './RenderScheduler';
import { SimulationClock, type SimulationTimingMode } from './SimulationClock';
import { LabControls, readLabConfig, readLabStepsPerFrame } from './LabControls';
import { LabQualityBudget } from './LabQualityBudget';
import type { RuntimeSnapshot } from '../types/domain';
import {
  canonicalLabSnapshot,
  exactRecoveryLabSnapshot,
  labConfigFromSnapshot,
  recoveryControlSnapshot
} from './LabSnapshotRestore';
import { projectSnapshotControls } from '../browser/savedRunImport';
import { bobsFromState } from './LabRenderHelpers';
import { LabHistory } from './LabHistory';
import { presentSimulationControl, uiMessage } from './uiLocale';
import type { LabDiagnostics } from './LabDiagnostics';
import { LabCanvasLifecycle } from './LabCanvasLifecycle';
import { LabRenderInterpolator } from './renderInterpolation';
import { LabReplayController } from './LabReplayController';
import { LAB_DIAGNOSTIC_PLOT_COUNT, LabDiagnosticPlots } from './LabDiagnosticPlots';
import { LabMainSurface } from './LabMainSurface';
import { normalizePerturbationPattern, normalizePerturbationVariableForSystem } from './ensemblePerturbation';
import { epsilonCanonicalValue, setPrecisionCanonicalValue } from './precisionControls';
import { presentEnsembleStatistics } from './ensembleStatisticsPresenter';
import { LabRuntimeReporter, type LabRuntimeReportSource } from './LabRuntimeReporter';
import { createLabControlBindings } from './LabControlBindingFactory';

/** Simulation orchestration; rendering policy, lifecycle, plots, and chrome are collaborators. */

export class LabApp {
  private sim!: LabSimulation;
  private poincare = new PoincareAccumulator(4000, 'rising');
  private lyap!: LyapunovEstimator;
  private readonly history = new LabHistory();
  private rafId: number | null = null;
  private running = false;
  private lastTime = 0;
  private lastDrift = 0;
  private lastPhysicsMs = 0;
  private frameCount = 0;
  private spf = 6;
  private requestedSpf = 6;
  private lastAdvancedSteps = 0;
  private lastTimingDebtSeconds = 0;
  private droppedSimulationSeconds = 0;
  private phaseAxis = '1';
  private readonly simulationClock = new SimulationClock();
  private readonly renderScheduler = new RenderScheduler();
  private readonly diagnosticsScheduler = new DiagnosticsScheduler(LAB_DIAGNOSTIC_PLOT_COUNT);
  private readonly controls = new LabControls();
  private readonly mainSurface = new LabMainSurface({
    rebindDrag: () => this.controls.rebindMainCanvasDrag(),
    refreshCanvasLifecycle: () => this.canvasLifecycle?.refresh()
  });
  private readonly quality = new LabQualityBudget(() => {
    this.mainSurface.invalidateRenderer();
    this.poincare.setCapacity(this.quality.effectivePoincareCap());
  });

  private readonly ensemble = new LabEnsembleController();
  private rhs: ((s: Float64Array, o: Float64Array) => void) | null = null;
  private readonly sidePlots = new LabSidePlotCoordinator(
    {
      energy: () => this.history.energy(),
      lyapunov: () => ({ history: Float32Array.from(this.lyap.history()), value: this.lyap.value() }),
      phase: () => this.history.phase(this.phaseAxis),
      poincarePairs: () => this.poincare.toFloat32Pairs(),
      fft: () => this.history.fft()
    },
    () => this.canvasLifecycle?.refresh()
  );
  private readonly diagnosticPlots = new LabDiagnosticPlots(this.sidePlots, this.history);

  private readonly replay = new LabReplayController(4000);
  private readonly bobsScratch: BobPosition[] = [];
  private readonly renderInterpolator = new LabRenderInterpolator();

  private audio = new AudioSonifier();
  private canvasLifecycle: LabCanvasLifecycle | null = null;
  private disposed = false;
  private readonly runtimeReporter = new LabRuntimeReporter((): LabRuntimeReportSource => ({
    sim: this.sim,
    lyap: this.lyap,
    poincare: this.poincare,
    history: this.history,
    quality: this.quality,
    sidePlots: this.sidePlots,
    mainSurface: this.mainSurface,
    diagnosticsScheduler: this.diagnosticsScheduler,
    renderScheduler: this.renderScheduler,
    lastTime: this.lastTime,
    lastDrift: this.lastDrift,
    lastPhysicsMs: this.lastPhysicsMs,
    spf: this.spf,
    requestedSpf: this.requestedSpf,
    lastAdvancedSteps: this.lastAdvancedSteps,
    lastTimingDebtSeconds: this.lastTimingDebtSeconds,
    droppedSimulationSeconds: this.droppedSimulationSeconds,
    modeLabel: this.currentModeLabel(),
    timingMode: this.timingMode()
  }));
  private readonly onVisibilityChange = (): void => {
    if (!this.running) return;
    if (document.hidden && !dom.bool('backgroundSim', false)) {
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      this.rafId = null;
      this.simulationClock.reset(false);
      return;
    }
    this.simulationClock.reset(false);
    this.scheduleFrame();
  };

  /** Read the current control values into a LabConfig. */
  readConfig(): LabConfig {
    return readLabConfig();
  }

  /** (Re)build the simulation and clear all derived histories. */
  private build(restored?: RuntimeSnapshot): void {
    const config: LabConfig = restored ? labConfigFromSnapshot(restored) : this.readConfig();
    this.requestedSpf = restored ? restored.stepsPerFrame : readLabStepsPerFrame();
    this.spf = this.requestedSpf;
    this.phaseAxis = dom.str('phaseAxis', '1');
    this.quality.setMode(this.quality.readMode(), 'silent');
    this.poincare.setCapacity(this.quality.effectivePoincareCap());

    this.sim = new LabSimulation(config);
    if (restored) this.sim.time = restored.simTime;
    this.renderInterpolator.reset(this.sim.stateView());
    this.lastTime = restored?.simTime ?? 0;
    this.lastDrift = 0;
    this.lastPhysicsMs = 0;
    this.lastAdvancedSteps = 0;
    this.lastTimingDebtSeconds = 0;
    this.droppedSimulationSeconds = 0;
    const activeConfig = this.sim.config;
    const dim = activeConfig.system === 'triple' ? 6 : 4;
    const rhs = (s: Float64Array, o: Float64Array) =>
      physicsAdapter.derivative(activeConfig.system, s, activeConfig.parameters, activeConfig.gamma, o);
    this.rhs = rhs;
    this.lyap = new LyapunovEstimator(rhs, dim, activeConfig.dt);
    this.lyap.reset(activeConfig.initialState);
    this.poincare.clear();
    this.poincare.setRefiner(rhs, activeConfig.dt);
    this.history.clear();
    this.replay.clear();
    this.simulationClock.reset();
    this.quality.resetTrailScale();
    this.diagnosticsScheduler.reset();
    this.ensemble.build(activeConfig, dim, dom.num('ensN', 0), this.quality.profile().ensembleCap, {
      variable: normalizePerturbationVariableForSystem(dom.str('ensVariable', 'th1'), activeConfig.system),
      pattern: normalizePerturbationPattern(dom.str('ensPattern', 'alternating')),
      epsilon: epsilonCanonicalValue(dom.el<HTMLInputElement>('ensEps'), 1e-4),
      seed: Math.max(0, Math.min(0xffff_ffff, Math.round(dom.num('ensSeed', 1))))
    });

    this.mainSurface.configure(activeConfig, this.quality);
    this.frameCount = 0;
    this.renderScheduler.reset();
    presentEnsembleStatistics(this.ensemble);
  }

  /** One animation frame: advance spf steps, update histories, render everything. */
  frame(): void {
    if (document.hidden && !dom.bool('backgroundSim', false)) return;
    if (this.replay.active) {
      return;
    }
    const sim = this.sim;
    const triple = sim.config.system === 'triple';
    const w1Index = triple ? 3 : 2;
    const w2Index = triple ? 4 : 3;
    const speedMultiplier = Math.max(0, dom.num('speed', 1));
    const timingMode = this.timingMode();
    const effectiveStepsPerFrame =
      timingMode === 'wall-clock' ? Math.max(0, this.spf) : Math.max(0, Math.round(this.spf * speedMultiplier));
    let ensembleSampled = false;
    const frame = this.simulationClock.advance({
      sim,
      stepsPerFrame: effectiveStepsPerFrame,
      mode: timingMode,
      timestampMs: nowMs(),
      speedMultiplier,
      bobsScratch: this.bobsScratch,
      onStep: (state) => {
        this.renderInterpolator.capture(state);
        this.poincare.push(state);
        this.lyap.step(state);
        this.history.pushStep(state, w1Index, w2Index);
        this.ensemble.step(1, sim.config, this.rhs);
        if (this.ensemble.sample(sim.time, state, sim.config)) ensembleSampled = true;
      }
    });
    this.lastAdvancedSteps = frame.stepsAdvanced;
    this.lastTimingDebtSeconds = frame.timingDebtSeconds;
    this.droppedSimulationSeconds = frame.droppedSimulationSeconds;
    const { state, energy, drift, bobs } = frame;
    this.lastPhysicsMs = frame.physicsMs;
    if (frame.stepsAdvanced > 0) {
      this.history.pushFrame(frame.time, state, energy, drift);
      this.replay.record(frame.time, state);
    }

    this.frameCount += 1;
    const diag = this.diagnosticsScheduler.shouldRun(this.frameCount, this.sidePlotInterval());
    this.renderScheduler.markFrame();

    this.audio.update(state[w1Index]!, state[w2Index]!);
    this.lastTime = frame.time;
    this.lastDrift = drift;

    const labVisible = dom.tabActive('tab-lab');
    if (!labVisible) return;
    const renderBobs = this.renderInterpolator.bobs({
      exactBobs: bobs,
      config: sim.config,
      enabled: dom.bool('interpolateRender', true),
      timingMode,
      timingDebtSeconds: frame.timingDebtSeconds
    });

    this.renderScheduler.measureRender(() => {
      this.mainSurface.drawLive({
        bobs: renderBobs,
        config: sim.config,
        quality: this.quality,
        frameCount: this.frameCount,
        ensemble: this.ensemble
      });
    });

    if (ensembleSampled) presentEnsembleStatistics(this.ensemble);
    if (diag) {
      this.diagnosticsScheduler.schedule({
        frameCount: this.frameCount,
        interval: this.sidePlotInterval(),
        visible: () => dom.tabActive('tab-lab'),
        draw: (plotIndex) => this.diagnosticPlots.draw(plotIndex)
      });
      this.updateChrome({ time: frame.time, energy, drift, state }, w1Index, w2Index);
    }
    this.maybeAutoAdjustQuality();
  }

  private maybeAutoAdjustQuality(): void {
    const longTasks = this.renderScheduler.longTaskSnapshot();
    this.spf = this.quality.maybeAutoAdjust({
      sampleCount: this.renderScheduler.sampleCount(),
      fps: this.renderScheduler.fps,
      renderMs: this.renderScheduler.renderMs,
      physicsMs: this.lastPhysicsMs,
      sidePlotMs: this.sidePlots.renderMs(),
      longTaskCount: longTasks.count,
      longTaskMs: longTasks.totalDurationMs,
      longestTaskMs: longTasks.maxDurationMs,
      stepsPerFrame: this.spf,
      requestedStepsPerFrame: this.requestedSpf
    });
  }

  private timingMode(): SimulationTimingMode {
    return dom.str('timeMode', 'wall-clock') === 'deterministic' ? 'deterministic' : 'wall-clock';
  }

  private sidePlotInterval(): number {
    return this.quality.sidePlotInterval(this.sidePlots.renderMs());
  }

  private renderScrubFrame(): void {
    const frameRec = this.replay.frame;
    if (!frameRec) return;
    const bobs = bobsFromState(this.sim.config, frameRec.state);
    this.mainSurface.drawReplay(bobs, this.sim.config, this.quality, this.frameCount);
  }

  private renderLiveFrame(preserveTrail = false): void {
    const bobs = this.sim.bobPositionsInto(this.bobsScratch);
    this.mainSurface.drawLive({
      bobs,
      config: this.sim.config,
      quality: this.quality,
      frameCount: this.frameCount,
      ensemble: this.ensemble,
      preserveTrail
    });
  }

  private refreshCurrentChrome(): void {
    const triple = this.sim.config.system === 'triple';
    const w1Index = triple ? 3 : 2;
    const w2Index = triple ? 4 : 3;
    const replayFrame = this.replay.frame;
    if (replayFrame) {
      const energy = physicsAdapter.energy(this.sim.config.system, replayFrame.state, this.sim.config.parameters).total;
      this.updateChrome(
        {
          time: replayFrame.time,
          energy,
          drift: this.sim.driftForEnergy(energy),
          state: replayFrame.state
        },
        w1Index,
        w2Index
      );
      return;
    }
    const state = this.sim.stateView();
    const energy = this.sim.energy();
    this.updateChrome({ time: this.sim.time, energy, drift: this.sim.driftForEnergy(energy), state }, w1Index, w2Index);
  }

  private syncRunPresentation(): void {
    presentSimulationControl(this.running);
    this.replay.syncPresentation();
    try {
      this.refreshCurrentChrome();
    } catch {
      // A numerical fault can make energy formatting unavailable; the control
      // and mode label must still immediately expose that the loop stopped.
      dom.setText('modeLabel', this.currentModeLabel());
    }
  }

  private currentModeLabel(): string {
    if (this.replay.active) return uiMessage('replayMode');
    return this.running
      ? `${uiMessage('runningMode')} · ${this.timingMode()} · ${this.lastAdvancedSteps} step(s)`
      : uiMessage('pausedMode');
  }

  private cancelScheduledFrame(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private setRunningState(running: boolean): void {
    this.running = running;
    this.simulationClock.reset(false);
    this.lastTimingDebtSeconds = 0;
    if (running) this.scheduleFrame();
    else this.cancelScheduledFrame();
    this.syncRunPresentation();
  }

  private setScrubIndex(index: number): void {
    const transition = this.replay.transition(index, this.running);
    if (!transition) return;
    if (!transition.frame) {
      this.running = transition.running;
      this.simulationClock.reset(false);
      this.lastTimingDebtSeconds = 0;
      this.renderLiveFrame();
      this.syncRunPresentation();
      if (this.running) this.scheduleFrame();
      return;
    }

    this.running = false;
    this.cancelScheduledFrame();
    this.simulationClock.reset(false);
    this.lastTimingDebtSeconds = 0;
    this.renderScrubFrame();
    this.syncRunPresentation();
  }

  private updateChrome(
    snapshot: { time: number; energy: number; drift: number; state: ArrayLike<number> },
    w1Index: number,
    w2Index: number
  ): void {
    this.runtimeReporter.present(snapshot, w1Index, w2Index);
  }

  /** Live diagnostics for tooling/tests. */
  diagnostics(): LabDiagnostics {
    return this.runtimeReporter.diagnostics();
  }

  /** Atomic, directly restorable description of the actual live solver state. */
  runtimeSnapshot(): RuntimeSnapshot {
    return this.runtimeReporter.runtimeSnapshot();
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = null;
    try {
      this.frame();
    } catch (error) {
      this.running = false;
      this.simulationClock.reset(false);
      this.syncRunPresentation();
      const message = uiMessage('simulationError');
      console.error(message, error);
      const toast = (window as Window & { toast?: unknown }).toast;
      if (typeof toast === 'function') toast(message, 5000);
      document.dispatchEvent(new CustomEvent('pendulum:simulation-error', { detail: { error, message } }));
      return;
    }
    this.scheduleFrame();
  };

  private scheduleFrame(): void {
    if (this.running && this.rafId === null && (!document.hidden || dom.bool('backgroundSim', false)))
      this.rafId = requestAnimationFrame(this.loop);
  }

  start(): void {
    if (this.running) return;
    if (this.disposed) throw new Error('A disposed LabApp cannot be restarted');
    this.build();
    this.wireControls();
    this.canvasLifecycle ??= new LabCanvasLifecycle(() => this.handleCanvasResize(), this.onVisibilityChange);
    this.canvasLifecycle.install();
    this.running = true;
    this.mainSurface.clear();
    this.replay.syncPresentation();
    this.syncRunPresentation();
    this.scheduleFrame();
  }

  stop(): void {
    this.running = false;
    this.cancelScheduledFrame();
    this.simulationClock.reset(false);
    if (this.sim) this.syncRunPresentation();
    const app = (window as Window & { App?: Record<string, unknown> }).App;
    if (app) app.__modernLabActive = false;
  }

  /** Release every browser resource owned by this Lab mount. */
  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.mainSurface.dispose();
    this.sidePlots.dispose();
    this.audio.dispose();
    this.controls.dispose();
    this.diagnosticsScheduler.dispose();
    this.renderScheduler.dispose();
    this.canvasLifecycle?.dispose();
    this.canvasLifecycle = null;
    this.simulationClock.reset();
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Restart the simulation from the current control values. */
  reset(): void {
    this.build();
    this.replay.syncPresentation();
    this.setRunningState(true);
  }

  /** Continue from a saved session only when store and interactive-Lab contracts agree. */
  restoreSnapshot(snapshot: RuntimeSnapshot): void {
    this.build(canonicalLabSnapshot(snapshot));
    this.replay.syncPresentation();
    this.setRunningState(true);
  }

  /** Restore an authenticated update checkpoint while retaining exact solver winding. */
  restoreRecoverySnapshot(snapshot: RuntimeSnapshot): void {
    const exact = exactRecoveryLabSnapshot(snapshot);
    const controls = projectSnapshotControls(recoveryControlSnapshot(exact));
    if (!controls.ok) throw new Error(`recovery controls could not be projected: ${controls.problems.join('; ')}`);
    this.build(exact);
    this.replay.syncPresentation();
    this.setRunningState(true);
  }

  /** Replace the initial angles (used by drag-to-set) and restart. */
  setAngles(angles: number[], resume = this.running): void {
    const ids = this.sim.config.system === 'triple' ? ['th1', 'th2', 'th3'] : ['th1', 'th2'];
    if (angles.length < ids.length || ids.some((_, index) => !Number.isFinite(angles[index]))) return;
    ids.forEach((id, i) => {
      if (angles[i] === undefined) return;
      const el = dom.el<HTMLInputElement>(id);
      const out = dom.el(`${id}V`);
      if (el) {
        if (el.dataset.precisionKeyboardStep !== undefined) setPrecisionCanonicalValue(el, angles[i]!);
        else el.value = String(angles[i]);
      }
      if (out) out.textContent = angles[i]!.toFixed(3);
    });
    this.reset();
    if (!resume) this.setRunningState(false);
  }

  private wireControls(): void {
    this.controls.wire(
      createLabControlBindings({
        sim: () => this.sim,
        requestedStepsPerFrame: () => this.requestedSpf,
        isRunning: () => this.running,
        setRunning: (running) => this.setRunningState(running),
        reset: () => this.reset(),
        restoreSnapshot: (snapshot) => this.restoreSnapshot(snapshot),
        setScrubIndex: (index) => this.setScrubIndex(index),
        setAngles: (angles, resume) => this.setAngles(angles, resume),
        refreshPresentation: () => {
          this.syncRunPresentation();
          presentEnsembleStatistics(this.ensemble);
        },
        refreshEnsembleRendering: () => (this.replay.active ? this.renderScrubFrame() : this.renderLiveFrame(true)),
        quality: this.quality,
        ensemble: this.ensemble,
        mainSurface: this.mainSurface,
        poincare: this.poincare,
        replay: this.replay,
        audio: this.audio
      })
    );
  }

  private handleCanvasResize(): void {
    if (this.disposed || !this.sim) return;
    const replayFrame = this.replay.frame;
    this.mainSurface.repaintAfterResize(
      {
        bobs: this.sim.bobPositionsInto(this.bobsScratch),
        config: this.sim.config,
        quality: this.quality,
        frameCount: this.frameCount,
        ensemble: this.ensemble
      },
      replayFrame ? bobsFromState(this.sim.config, replayFrame.state) : undefined
    );
    for (let plot = 0; plot < LAB_DIAGNOSTIC_PLOT_COUNT; plot += 1) this.diagnosticPlots.draw(plot);
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
