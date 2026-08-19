import { physicsAdapter } from '../physics';
import { LabSimulation, type BobPosition, type LabConfig } from './LabSimulation';
import { LabRenderer } from './LabRenderer';
import { PoincareAccumulator } from './PoincareAccumulator';
import { LyapunovEstimator } from './LyapunovEstimator';
import { downloadDataUrl, downloadText, poincareCsv, runJson, trajectoryCsv } from './labExport';
import { pageDom as dom } from './DomBinder';
import { AudioSonifier } from './AudioSonifier';
import { canvasQualityDiagnostics } from './canvasQuality';
import { DiagnosticsScheduler } from './DiagnosticsScheduler';
import { LabSidePlotCoordinator } from './LabSidePlotCoordinator';
import { LabEnsembleController } from './LabEnsembleController';
import { presentLabChrome } from './LabChromePresenter';
import { RenderScheduler } from './RenderScheduler';
import { SimulationClock, type SimulationTimingMode } from './SimulationClock';
import { LabRecording } from './LabRecording';
import { LabControls, readLabConfig, readLabStepsPerFrame } from './LabControls';
import { LabQualityBudget } from './LabQualityBudget';
import {
  mainCanvasWorkerRequested,
  tryCreateMainCanvasWorkerClient,
  type MainCanvasWorkerClient
} from './MainCanvasWorkerClient';
import type { RuntimeSnapshot } from '../types/domain';
import { stateStore } from '../state/StateStore';
import { legacyApp } from '../runtime/legacyCompat';
import { canonicalLabSnapshot, labConfigFromSnapshot } from './LabSnapshotRestore';
import { bobsFromState, mainCanvasContext } from './LabRenderHelpers';
import { LabHistory } from './LabHistory';
import { uiMessage } from './uiLocale';
import { labChainLength, labMainFrameStyle } from './LabRenderPolicy';
import type { LabDiagnostics } from './LabDiagnostics';
import { LabCanvasLifecycle } from './LabCanvasLifecycle';

/** Simulation orchestration; rendering policy, lifecycle, plots, and chrome are collaborators. */

const SIDE_PLOT_COUNT = 5;

export class LabApp {
  private sim!: LabSimulation;
  private renderer: LabRenderer | null = null;
  private mainCanvasWorker: MainCanvasWorkerClient | null = null;
  private poincare = new PoincareAccumulator(4000, 'both');
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
  private readonly diagnosticsScheduler = new DiagnosticsScheduler(SIDE_PLOT_COUNT);
  private readonly controls = new LabControls();
  private readonly quality = new LabQualityBudget(() => {
    this.renderer?.dispose();
    this.renderer = null;
    // Quality profiles carry the user-facing Poincaré memory budget.
    this.poincare.setCapacity(this.quality.effectivePoincareCap());
  });

  // Ensemble of perturbed copies (chaos divergence visualization).
  private readonly ensemble = new LabEnsembleController();
  private rhs: ((s: Float64Array, o: Float64Array) => void) | null = null;

  private readonly sidePlots = new LabSidePlotCoordinator(
    {
      energy: () => this.history.energy(),
      lyapunov: () => ({ history: Float32Array.from(this.lyap.history()), value: this.lyap.value() }),
      phase: () => this.history.phase(this.phaseAxis),
      poincarePairs: () => this.poincare.toFloat32Pairs(),
      fft: () => ({ theta1Frames: this.history.thetaFrames(), sampleRate: 1 / (this.sim.config.dt * this.spf) })
    },
    () => this.canvasLifecycle?.refresh()
  );

  private readonly recording = new LabRecording(4000);
  private scrubIndex = -1; // -1 = live; >=0 = showing a recorded frame
  private readonly bobsScratch: BobPosition[] = [];

  // Audio sonification of the angular velocities.
  private audio = new AudioSonifier();
  private canvasLifecycle: LabCanvasLifecycle | null = null;
  private disposed = false;
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
    // setMode only notifies on a mode delta; a rebuild must re-apply the
    // profile's Poincaré budget even when the mode itself did not change.
    this.poincare.setCapacity(this.quality.effectivePoincareCap());

    this.sim = new LabSimulation(config);
    if (restored) this.sim.time = restored.simTime;
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
    // Event-refined section crossings: root-found on the flow itself rather
    // than linearly interpolated between steps.
    this.poincare.setRefiner(rhs, activeConfig.dt);
    this.history.clear();
    this.recording.clear();
    this.scrubIndex = -1;
    this.simulationClock.reset();
    this.quality.resetTrailScale();
    this.diagnosticsScheduler.reset();
    this.ensemble.build(
      activeConfig,
      dim,
      dom.num('ensN', 0),
      this.quality.profile().ensembleCap,
      dom.num('ensEps', -4)
    );

    this.configureMainSurface();
    this.frameCount = 0;
    this.renderScheduler.reset();
  }

  /** One animation frame: advance spf steps, update histories, render everything. */
  frame(): void {
    if (document.hidden && !dom.bool('backgroundSim', false)) return;
    // Scrub/replay mode: render a recorded frame instead of advancing.
    if (this.scrubIndex >= 0) {
      this.renderScrubFrame();
      return;
    }
    const sim = this.sim;
    const triple = sim.config.system === 'triple';
    const w1Index = triple ? 3 : 2;
    const w2Index = triple ? 4 : 3;
    const speedMultiplier = Math.max(0, dom.num('speed', 1));
    const timingMode = this.timingMode();
    // Interactive rendering follows elapsed wall time through a fixed-dt
    // accumulator, so a slow paint does not slow simulation time. Deterministic
    // replay remains an explicit fixed-steps-per-frame mode.
    const effectiveStepsPerFrame =
      timingMode === 'wall-clock' ? Math.max(0, this.spf) : Math.max(0, Math.round(this.spf * speedMultiplier));
    const frame = this.simulationClock.advance({
      sim,
      stepsPerFrame: effectiveStepsPerFrame,
      mode: timingMode,
      timestampMs: nowMs(),
      speedMultiplier,
      bobsScratch: this.bobsScratch,
      onStep: (state) => {
        this.poincare.push(state);
        this.lyap.step(state);
        this.history.pushStep(state, w1Index, w2Index);
      },
      afterSteps: (stepsAdvanced) => this.ensemble.step(stepsAdvanced, sim.config, this.rhs)
    });
    this.lastAdvancedSteps = frame.stepsAdvanced;
    this.lastTimingDebtSeconds = frame.timingDebtSeconds;
    this.droppedSimulationSeconds = frame.droppedSimulationSeconds;
    const { state, energy, drift, bobs } = frame;
    this.lastPhysicsMs = frame.physicsMs;
    // Frame cadence may exceed physics cadence on high-refresh displays. Do
    // not duplicate samples when the accumulator advances zero fixed steps;
    // FFT/history/export timelines must represent physical observations.
    if (frame.stepsAdvanced > 0) {
      this.history.pushFrame(frame.time, state, energy, drift);
      this.recording.push(frame.time, state);
    }

    this.frameCount += 1;
    const diag = this.diagnosticsScheduler.shouldRun(this.frameCount, this.sidePlotInterval());
    this.renderScheduler.markFrame();

    this.audio.update(state[w1Index]!, state[w2Index]!);
    this.lastTime = frame.time;
    this.lastDrift = drift;

    // Skip all drawing while the Lab tab is hidden. Physics continuation is
    // intentional so analysis workspaces observe one continuous trajectory;
    // canvas and DOM rendering remain suspended to keep the active tab smooth.
    const labVisible = dom.tabActive('tab-lab');
    if (!labVisible) return;

    // Pendulum + trail render every frame, for smooth motion.
    this.renderScheduler.measureRender(() => {
      const mainWorker = this.mainCanvasWorker?.isActive() ? this.mainCanvasWorker : null;
      if (mainWorker) {
        mainWorker.draw({
          bobs,
          ensembleBobs: this.ensemble.tipPositionsMeters(sim.config),
          style: labMainFrameStyle(this.sim.config, this.quality, this.frameCount)
        });
      } else {
        const renderer = !this.renderer || this.frameCount % 30 === 0 ? this.ensureRenderer() : this.renderer;
        if (!renderer) return;
        renderer.draw(bobs, {
          ensembleTips: this.ensemble.tips(sim.config, renderer),
          ...labMainFrameStyle(this.sim.config, this.quality, this.frameCount)
        });
      }
    });

    // The side plots (FFT, scatter redraws) and the ~12 DOM chrome writes are an
    // order of magnitude more expensive than the main view, so run them at a
    // reduced cadence; the pendulum itself stays at full frame rate.
    if (diag) {
      this.diagnosticsScheduler.schedule({
        frameCount: this.frameCount,
        interval: this.sidePlotInterval(),
        visible: () => dom.tabActive('tab-lab'),
        draw: (plotIndex) => this.sidePlots.drawSlice(plotIndex)
      });
      this.updateChrome({ time: frame.time, energy, drift, state }, w1Index, w2Index);
      const scrubber = dom.el<HTMLInputElement>('scrubber');
      if (scrubber) {
        scrubber.max = String(Math.max(0, this.recording.length - 1));
        if (this.scrubIndex < 0) scrubber.value = scrubber.max;
      }
    }
    this.maybeAutoAdjustQuality();
  }

  private ensureRenderer(): LabRenderer | null {
    if (this.mainCanvasWorker?.isActive()) return null;
    const main = mainCanvasContext();
    if (!main) return null;
    const size = this.renderer?.size();
    if (!this.renderer) {
      this.renderer = new LabRenderer(main.ctx, {
        width: main.width,
        height: main.height,
        worldRadius: labChainLength(this.sim.config)
      });
      this.renderer.clear();
    } else if (size?.width !== main.width || size?.height !== main.height) {
      this.renderer.resize({ width: main.width, height: main.height });
    }
    return this.renderer;
  }

  private configureMainSurface(): void {
    if (this.mainCanvasWorker?.isActive()) {
      this.mainCanvasWorker.clear();
      this.mainCanvasWorker.resize();
      this.renderer?.dispose();
      this.renderer = null;
      return;
    }

    const canvas = dom.el<HTMLCanvasElement>('main');
    if (canvas && mainCanvasWorkerRequested()) {
      const client = tryCreateMainCanvasWorkerClient(canvas, {
        dprCap: this.quality.dprCap,
        onFallback: () => {
          this.mainCanvasWorker = null;
          this.renderer?.dispose();
          this.renderer = null;
          this.controls.rebindMainCanvasDrag();
          this.canvasLifecycle?.refresh();
        }
      });
      if (client) {
        this.mainCanvasWorker = client;
        this.renderer = null;
        return;
      }
    }

    this.mainCanvasWorker = null;
    const main = mainCanvasContext();
    this.renderer = main
      ? new LabRenderer(main.ctx, {
          width: main.width,
          height: main.height,
          worldRadius: labChainLength(this.sim.config)
        })
      : null;
    this.renderer?.clear();
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
    const frameRec = this.recording.at(this.scrubIndex);
    if (!frameRec) return;
    const bobs = bobsFromState(this.sim.config, frameRec.state);
    if (this.mainCanvasWorker?.isActive()) {
      this.mainCanvasWorker.draw({
        bobs,
        ensembleBobs: [],
        style: { ...labMainFrameStyle(this.sim.config, this.quality, this.frameCount), skipTrail: true }
      });
    } else {
      this.ensureRenderer()?.draw(bobs, { skipTrail: true });
    }
  }

  /** Refresh the header/diagnostics chrome from the latest frame snapshot. */
  private updateChrome(
    snapshot: { time: number; energy: number; drift: number; state: ArrayLike<number> },
    w1Index: number,
    w2Index: number
  ): void {
    const longTasks = this.renderScheduler.longTaskSnapshot();
    presentLabChrome({
      ...snapshot,
      initialEnergy: this.sim.initialEnergy,
      damping: this.sim.config.gamma,
      w1Index,
      w2Index,
      fps: this.renderScheduler.fps,
      physicsMs: this.lastPhysicsMs,
      renderMs: this.renderScheduler.renderMs,
      workerMs: this.sidePlots.renderMs(),
      qualityMode: this.quality.mode,
      qualityReason: this.quality.reason,
      dprCap: this.quality.dprCap,
      backend: this.sidePlots.usesWorker() ? 'offscreen' : 'main',
      lambdaMax: this.lyap.value(),
      poincare: { size: this.poincare.size, ...this.poincare.policy() },
      timingDebtSeconds: this.lastTimingDebtSeconds,
      droppedSimulationSeconds: this.droppedSimulationSeconds,
      longTaskCount: longTasks.count,
      longTaskMs: longTasks.totalDurationMs,
      phasePoints: this.history.phasePoints,
      spectrumSamples: this.history.spectrumSamples,
      modeLabel:
        this.scrubIndex >= 0
          ? 'replay'
          : this.running
            ? `${this.timingMode()} · ${this.lastAdvancedSteps} step(s)`
            : 'paused'
    });
  }

  /** Live diagnostics for tooling/tests. */
  diagnostics(): LabDiagnostics {
    const longTasks = this.renderScheduler.longTaskSnapshot();
    return {
      time: this.lastTime,
      drift: this.lastDrift,
      poincarePoints: this.poincare.size,
      lambdaMax: this.lyap.value(),
      fps: this.renderScheduler.fps,
      physicsMsPerFrame: this.lastPhysicsMs,
      renderMsPerFrame: this.renderScheduler.renderMs,
      sidePlotMsPerFrame: this.sidePlots.renderMs(),
      trailPoints: this.renderer?.trailPointCount() ?? 0,
      qualityMode: this.quality.mode,
      qualityReason: this.quality.reason,
      dprCap: this.quality.dprCap,
      stepsPerFrame: this.spf,
      stepsAdvanced: this.lastAdvancedSteps,
      timingMode: this.timingMode(),
      requestedStepsPerFrame: this.requestedSpf,
      trailQualityScale: this.quality.trailQualityScale,
      sidePlotBackend: this.sidePlots.usesWorker() ? 'offscreen' : 'main',
      mainCanvasBackend: this.mainCanvasWorker?.isActive() ? 'offscreen' : 'main',
      mainTrailBackend: this.mainCanvasWorker?.isActive()
        ? 'worker'
        : (this.renderer?.activeTrailBackend() ?? 'canvas2d'),
      pendingUiTasks: this.diagnosticsScheduler.pendingCount(),
      longTaskCount: longTasks.count,
      longTaskMs: longTasks.totalDurationMs,
      longestTaskMs: longTasks.maxDurationMs,
      timingDebtSeconds: this.lastTimingDebtSeconds,
      droppedSimulationSeconds: this.droppedSimulationSeconds,
      backgroundPolicy: dom.bool('backgroundSim', false) ? 'continue-when-hidden' : 'pause-when-hidden',
      decorativeEffects: this.quality.allowDecorativeEffects,
      canvasQualityEvents: canvasQualityDiagnostics()
    };
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = null;
    try {
      this.frame();
    } catch (error) {
      this.running = false;
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
    this.renderer?.clear();
    this.mainCanvasWorker?.clear();
    this.scheduleFrame();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    const app = (window as Window & { App?: Record<string, unknown> }).App;
    if (app) app.__modernLabActive = false;
  }

  /** Release every browser resource owned by this Lab mount. */
  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.mainCanvasWorker?.dispose();
    this.mainCanvasWorker = null;
    this.sidePlots.dispose();
    this.renderer?.dispose();
    this.renderer = null;
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
    if (!this.running) {
      this.running = true;
      this.scheduleFrame();
    }
  }

  /** Continue from a saved session only when store and interactive-Lab contracts agree. */
  restoreSnapshot(snapshot: RuntimeSnapshot): void {
    this.build(canonicalLabSnapshot(snapshot));
    if (!this.running) {
      this.running = true;
      this.scheduleFrame();
    }
  }

  /** Replace the initial angles (used by drag-to-set) and restart. */
  setAngles(angles: number[], resume = this.running): void {
    const ids = this.sim.config.system === 'triple' ? ['th1', 'th2', 'th3'] : ['th1', 'th2'];
    if (angles.length < ids.length || ids.some((_, index) => !Number.isFinite(angles[index]))) return;
    ids.forEach((id, i) => {
      if (angles[i] === undefined) return;
      const el = dom.el<HTMLInputElement>(id);
      const out = dom.el(`${id}V`);
      if (el) el.value = String(angles[i]);
      if (out) out.textContent = angles[i]!.toFixed(3);
    });
    this.reset();
    if (!resume) {
      this.running = false;
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private pauseForDrag(): boolean {
    const wasRunning = this.running;
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.simulationClock.reset(false);
    return wasRunning;
  }

  private finishDrag(resume: boolean): void {
    this.running = resume;
    this.simulationClock.reset(false);
    if (resume) this.scheduleFrame();
  }

  private wireControls(): void {
    const cfg = () => this.sim.config;
    this.controls.wire({
      reset: () => this.reset(),
      restoreSnapshot: (snapshot) => this.restoreSnapshot(snapshot),
      applyQualityMode: () => this.quality.setMode(this.quality.readMode(), 'manual'),
      trimEnsembleToQuality: () => this.ensemble.trimToCap(this.quality.profile().ensembleCap),
      clearTrail: () => {
        this.renderer?.clear();
        this.mainCanvasWorker?.clear();
      },
      clearPoincare: () => this.poincare.clear(),
      toggleRunning: () => {
        this.running = !this.running;
        // Never carry wall-clock debt across an explicit pause. The next
        // frame uses the deterministic fallback quantum instead of a catch-up
        // burst from time spent paused.
        this.simulationClock.reset(false);
        if (this.running) this.scheduleFrame();
        else if (this.rafId !== null) {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }
      },
      exportTrajectory: () =>
        downloadText(
          'pendulum_modern_trajectory.csv',
          trajectoryCsv(this.recording.samples(), cfg().system),
          'text/csv'
        ),
      exportPoincare: () => downloadText('pendulum_modern_poincare.csv', poincareCsv(this.poincare.list()), 'text/csv'),
      exportJson: () => {
        const snap = this.sim.snapshot();
        const seed = dom.num('seed', Number.NaN);
        downloadText(
          'pendulum_modern_run.json',
          JSON.stringify(
            runJson(cfg(), snap.state, snap.time, snap.energy, snap.drift, {
              mode: legacyApp()?.runMode ?? stateStore.snapshot().mode,
              stepsPerFrame: this.requestedSpf,
              seed: Number.isFinite(seed) ? seed : null,
              locale: document.documentElement.lang === 'ko' ? 'ko' : 'en'
            }),
            null,
            2
          ),
          'application/json'
        );
      },
      exportPng: () => {
        const canvas = dom.el<HTMLCanvasElement>('main');
        if (canvas && !this.mainCanvasWorker?.isActive())
          downloadDataUrl('pendulum_modern.png', canvas.toDataURL('image/png'));
      },
      scrubLength: () => this.recording.length,
      setScrubIndex: (index) => {
        this.scrubIndex = index;
      },
      scrubLabel: (index) => (this.scrubIndex < 0 ? 'live' : `${(this.recording.at(index)?.time ?? 0).toFixed(2)}s`),
      rewindScrub: () => {
        if (this.recording.length > 0) this.scrubIndex = 0;
      },
      setAudioEnabled: (enabled) => this.audio.setEnabled(enabled),
      setAudioVolume: (volume) => this.audio.setVolume(volume),
      drag: {
        rendererSize: () => this.renderer?.size() ?? null,
        bobPixels: () =>
          this.renderer
            ? bobsFromState(this.sim.config, this.sim.stateView()).map((b) => this.renderer!.toPixels(b))
            : [],
        pivot: () => this.renderer?.pivot() ?? null,
        stateAngles: () => {
          const state = this.sim.stateView();
          return this.sim.config.system === 'triple' ? [state[0]!, state[1]!, state[2]!] : [state[0]!, state[1]!];
        },
        setAngles: (angles, resume) => this.setAngles(angles, resume),
        beginDrag: () => this.pauseForDrag(),
        endDrag: (resume) => this.finishDrag(resume)
      }
    });
  }

  private handleCanvasResize(): void {
    if (this.disposed || !this.sim) return;
    if (this.mainCanvasWorker?.isActive()) this.mainCanvasWorker.resize();
    else {
      const renderer = this.ensureRenderer();
      if (renderer)
        renderer.draw(this.sim.bobPositionsInto(this.bobsScratch), {
          ...labMainFrameStyle(this.sim.config, this.quality, this.frameCount),
          // Repaint the trail after a CSS resize without clearing it as a replay frame would.
          preserveTrail: true
        });
    }
    for (let plot = 0; plot < SIDE_PLOT_COUNT; plot += 1) this.sidePlots.drawSlice(plot);
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
