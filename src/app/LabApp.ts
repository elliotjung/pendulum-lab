import { physicsAdapter } from '../physics';
import { LabSimulation, type BobPosition, type LabConfig } from './LabSimulation';
import { LabRenderer } from './LabRenderer';
import { PoincareAccumulator } from './PoincareAccumulator';
import { LyapunovEstimator } from './LyapunovEstimator';
import { downloadDataUrl, downloadText, poincareCsv, runJson, trajectoryCsv } from './labExport';
import { pageDom as dom } from './DomBinder';
import { AudioSonifier } from './AudioSonifier';
import { canvasQualityDiagnostics, configureCanvas2D, type ManagedCanvas2D } from './canvasQuality';
import { DiagnosticsScheduler } from './DiagnosticsScheduler';
import { LabSidePlotCoordinator } from './LabSidePlotCoordinator';
import { LabEnsembleController } from './LabEnsembleController';
import { presentLabChrome } from './LabChromePresenter';
import { RenderScheduler } from './RenderScheduler';
import { SimulationClock, type SimulationTimingMode } from './SimulationClock';
import { LabRecording } from './LabRecording';
import { LabControls, readLabConfig, readLabStepsPerFrame } from './LabControls';
import { compactViewport, LabQualityBudget, type QualityMode } from './LabQualityBudget';
import { webGLTrailRequested } from '../render/webglTrailRenderer';
import {
  mainCanvasWorkerRequested,
  tryCreateMainCanvasWorkerClient,
  type MainCanvasWorkerClient
} from './MainCanvasWorkerClient';
import type { RuntimeSnapshot } from '../types/domain';
import { stateStore } from '../state/StateStore';
import { legacyApp } from '../runtime/legacyCompat';
import { canonicalLabSnapshot, labConfigFromSnapshot } from './LabSnapshotRestore';

/**
 * Full modern Lab tab: the simulation/render loop plus every side plot
 * (energy/drift, Lyapunov convergence, phase portrait, Poincaré section, FFT),
 * reading the on-page controls and driving the real lab canvases. When mounted
 * it sets `App.__modernLabActive` so the legacy lab render (guarded in
 * `Render.all`) stands down, pauses the legacy stepping, and mirrors its state
 * into `window.App` so the legacy chrome (diagnostics, hash, export) stays
 * coherent. This is the Stage-2 takeover that precedes deleting the legacy lab.
 *
 * Collaborators own the non-loop responsibilities: `LabSidePlotCoordinator`
 * (worker payloads + fallback drawing), `LabEnsembleController` (perturbed
 * copies), and `presentLabChrome` (header/diagnostics DOM writes).
 */

function mainCtx(): ManagedCanvas2D | null {
  const canvas = dom.el<HTMLCanvasElement>('main');
  if (!canvas) return null;
  try {
    return configureCanvas2D(canvas);
  } catch {
    return null;
  }
}

const SIDE_PLOT_COUNT = 5;

export class LabApp {
  private sim!: LabSimulation;
  private renderer: LabRenderer | null = null;
  private mainCanvasWorker: MainCanvasWorkerClient | null = null;
  private poincare = new PoincareAccumulator(4000, 'both');
  private lyap!: LyapunovEstimator;
  private theta1Frames: number[] = [];
  private energy = { time: [] as number[], total: [] as number[], drift: [] as number[] };
  private rafId: number | null = null;
  private running = false;
  private lastTime = 0;
  private lastDrift = 0;
  private lastPhysicsMs = 0;
  private frameCount = 0;
  private spf = 6;
  private requestedSpf = 6;
  private lastAdvancedSteps = 0;
  private phaseAxis = '1';
  private readonly simulationClock = new SimulationClock();
  private readonly renderScheduler = new RenderScheduler();
  private readonly diagnosticsScheduler = new DiagnosticsScheduler(SIDE_PLOT_COUNT);
  private readonly controls = new LabControls();
  private readonly quality = new LabQualityBudget(() => {
    this.renderer = null;
    // Quality profiles carry the user-facing Poincaré memory budget.
    this.poincare.setCapacity(this.quality.effectivePoincareCap());
  });

  // Ensemble of perturbed copies (chaos divergence visualization).
  private readonly ensemble = new LabEnsembleController();
  private rhs: ((s: Float64Array, o: Float64Array) => void) | null = null;

  // Side plots pull their payloads lazily so histories stay owned here.
  private readonly sidePlots = new LabSidePlotCoordinator({
    energy: () => ({
      time: Float32Array.from(this.energy.time),
      total: Float32Array.from(this.energy.total),
      drift: Float32Array.from(this.energy.drift)
    }),
    lyapunov: () => ({ history: Float32Array.from(this.lyap.history()), value: this.lyap.value() }),
    phase: () => this.phaseSeriesForAxis(),
    poincarePairs: () => this.poincare.toFloat32Pairs(),
    fft: () => ({ theta1Frames: Float32Array.from(this.theta1Frames), sampleRate: 1 / (this.sim.config.dt * this.spf) })
  });

  // Trajectory recording for export + scrubber/replay.
  private readonly recording = new LabRecording(4000);
  private scrubIndex = -1; // -1 = live; >=0 = showing a recorded frame
  private readonly bobsScratch: BobPosition[] = [];

  // Phase portrait history as a fixed ring to avoid hundreds of object writes.
  private readonly phaseCap = 800;
  private phaseT1 = new Float64Array(this.phaseCap);
  private phaseW1 = new Float64Array(this.phaseCap);
  private phaseT2 = new Float64Array(this.phaseCap);
  private phaseW2 = new Float64Array(this.phaseCap);
  private phaseIndex = 0;
  private phaseCount = 0;

  // Audio sonification of the angular velocities.
  private audio = new AudioSonifier();

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
    const dim = config.system === 'triple' ? 6 : 4;
    const rhs = (s: Float64Array, o: Float64Array) =>
      physicsAdapter.derivative(config.system, s, config.parameters, config.gamma, o);
    this.rhs = rhs;
    this.lyap = new LyapunovEstimator(rhs, dim, config.dt);
    this.lyap.reset(config.initialState);
    this.poincare.clear();
    // Event-refined section crossings: root-found on the flow itself rather
    // than linearly interpolated between steps.
    this.poincare.setRefiner(rhs, config.dt);
    this.phaseIndex = 0;
    this.phaseCount = 0;
    this.theta1Frames = [];
    this.energy = { time: [], total: [], drift: [] };
    this.recording.clear();
    this.scrubIndex = -1;
    this.simulationClock.reset();
    this.quality.resetTrailScale();
    this.diagnosticsScheduler.reset();
    this.ensemble.build(config, dim, dom.num('ensN', 0), this.quality.profile().ensembleCap, dom.num('ensEps', -4));

    this.configureMainSurface();
    this.frameCount = 0;
    this.renderScheduler.reset();
  }

  private push<T>(arr: T[], value: T, cap: number): void {
    arr.push(value);
    if (arr.length > cap) arr.splice(0, arr.length - cap);
  }

  private pushPhase(state: ArrayLike<number>, w1Index: number, w2Index: number): void {
    const i = this.phaseIndex;
    this.phaseT1[i] = state[0] ?? 0;
    this.phaseW1[i] = state[w1Index] ?? 0;
    this.phaseT2[i] = state[1] ?? 0;
    this.phaseW2[i] = state[w2Index] ?? 0;
    this.phaseIndex = (i + 1) % this.phaseCap;
    this.phaseCount = Math.min(this.phaseCap, this.phaseCount + 1);
  }

  private phaseSeriesForAxis(): { theta: Float32Array; omega: Float32Array } {
    const useArm2 = this.phaseAxis === '2';
    const theta = new Float32Array(this.phaseCount);
    const omega = new Float32Array(this.phaseCount);
    const start = this.phaseCount === this.phaseCap ? this.phaseIndex : 0;
    for (let i = 0; i < this.phaseCount; i += 1) {
      const j = (start + i) % this.phaseCap;
      theta[i] = useArm2 ? this.phaseT2[j]! : this.phaseT1[j]!;
      omega[i] = useArm2 ? this.phaseW2[j]! : this.phaseW1[j]!;
    }
    return { theta, omega };
  }

  /** One animation frame: advance spf steps, update histories, render everything. */
  frame(): void {
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
        this.pushPhase(state, w1Index, w2Index);
      },
      afterSteps: (stepsAdvanced) => this.ensemble.step(stepsAdvanced, sim.config, this.rhs)
    });
    this.lastAdvancedSteps = frame.stepsAdvanced;
    const { state, energy, drift, bobs } = frame;
    this.lastPhysicsMs = frame.physicsMs;
    this.push(this.theta1Frames, state[0]!, 1024);
    this.push(this.energy.time, frame.time, 600);
    this.push(this.energy.total, energy, 600);
    this.push(this.energy.drift, drift, 600);
    this.recording.push(frame.time, state);

    this.frameCount += 1;
    const diag = this.diagnosticsScheduler.shouldRun(this.frameCount, this.sidePlotInterval());
    this.renderScheduler.markFrame();

    this.audio.update(state[w1Index]!, state[w2Index]!);
    this.lastTime = frame.time;
    this.lastDrift = drift;

    // Skip all drawing while the Lab tab is hidden: the simulation keeps
    // advancing (so the trajectory is continuous when you return) but we don't
    // pay for rendering canvases nobody is looking at — which keeps the active
    // analysis tab smooth.
    const labVisible = dom.tabActive('tab-lab');
    if (!labVisible) return;

    // Pendulum + trail render every frame, for smooth motion.
    this.renderScheduler.measureRender(() => {
      const mainWorker = this.mainCanvasWorker?.isActive() ? this.mainCanvasWorker : null;
      if (mainWorker) {
        mainWorker.draw({
          bobs,
          ensembleBobs: this.ensemble.tipPositionsMeters(sim.config),
          style: this.mainFrameStyle()
        });
      } else {
        const renderer = !this.renderer || this.frameCount % 30 === 0 ? this.ensureRenderer() : this.renderer;
        if (!renderer) return;
        renderer.draw(bobs, {
          ensembleTips: this.ensemble.tips(sim.config, renderer),
          ...this.mainFrameStyle()
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

  /** New-segment trail colour for the current trail-mode (incremental trail). */
  private trailColor(): string {
    const mode = dom.str('trailMode', 'rainbow');
    if (mode === 'rainbow') return `hsl(${(this.frameCount * 2) % 360}, 90%, 60%)`; // cycles hue over time
    const fixed: Record<string, string> = {
      heat: '#ff7a1a',
      ice: '#7fdfff',
      plasma: '#f0c419',
      white: '#ffffff',
      green: '#3bff7a'
    };
    return fixed[mode] ?? '#56b4e9';
  }

  private ensureRenderer(): LabRenderer | null {
    if (this.mainCanvasWorker?.isActive()) return null;
    const main = mainCtx();
    if (!main) return null;
    const size = this.renderer?.size();
    if (!this.renderer) {
      this.renderer = new LabRenderer(main.ctx, { width: main.width, height: main.height });
      this.renderer.clear();
    } else if (size?.width !== main.width || size?.height !== main.height) {
      this.renderer.resize({ width: main.width, height: main.height });
    }
    return this.renderer;
  }

  private configureMainSurface(): void {
    if (this.mainCanvasWorker?.isActive()) {
      this.mainCanvasWorker.clear();
      this.renderer = null;
      return;
    }

    const canvas = dom.el<HTMLCanvasElement>('main');
    if (canvas && mainCanvasWorkerRequested()) {
      const client = tryCreateMainCanvasWorkerClient(canvas, {
        dprCap: this.quality.dprCap,
        onFallback: () => {
          this.mainCanvasWorker = null;
          this.renderer = null;
        }
      });
      if (client) {
        this.mainCanvasWorker = client;
        this.renderer = null;
        return;
      }
    }

    this.mainCanvasWorker = null;
    const main = mainCtx();
    this.renderer = main ? new LabRenderer(main.ctx, { width: main.width, height: main.height }) : null;
    this.renderer?.clear();
  }

  private mainFrameStyle(): {
    fade: number;
    trailColor: string;
    trailMode: string;
    trailLength: number;
    glow: boolean;
    trailBackend: 'canvas2d' | 'webgl2';
  } {
    return {
      fade: this.readFade(),
      trailColor: this.trailColor(),
      trailMode: dom.str('trailMode', 'rainbow'),
      trailLength: this.quality.effectiveTrailLength(),
      glow: dom.bool('glowMode') && this.quality.profile().glow,
      // An explicit URL opt-in plus the highest quality tier keeps the
      // experimental GPU compositor away from ordinary/classroom runs.
      trailBackend: this.quality.mode === 'cinematic' && webGLTrailRequested() ? 'webgl2' : 'canvas2d'
    };
  }

  private maybeAutoAdjustQuality(): void {
    this.spf = this.quality.maybeAutoAdjust({
      sampleCount: this.renderScheduler.sampleCount(),
      fps: this.renderScheduler.fps,
      renderMs: this.renderScheduler.renderMs,
      physicsMs: this.lastPhysicsMs,
      sidePlotMs: this.sidePlots.renderMs(),
      stepsPerFrame: this.spf,
      requestedStepsPerFrame: this.requestedSpf
    });
  }

  private timingMode(): SimulationTimingMode {
    return dom.str('timeMode', 'wall-clock') === 'deterministic' ? 'deterministic' : 'wall-clock';
  }

  /**
   * Per-frame fade alpha, which sets how long the incremental trail persists.
   * Long-exposure / glow override it; otherwise it derives from the trail-length
   * control (a segment stays visible for roughly `trailLen/10` frames).
   */
  private readFade(): number {
    const compact = compactViewport();
    if (this.quality.mode === 'performance') return compact ? 0.22 : 0.16;
    if (dom.bool('longExpose')) return compact ? 0.018 : 0.008;
    if (dom.bool('glowMode')) return compact ? 0.07 : 0.04;
    return compact ? 0.18 : 0.12;
  }

  private sidePlotInterval(): number {
    return this.quality.sidePlotInterval(this.sidePlots.renderMs());
  }

  private renderScrubFrame(): void {
    const frameRec = this.recording.at(this.scrubIndex);
    if (!frameRec) return;
    const bobs = this.bobsFromState(frameRec.state);
    if (this.mainCanvasWorker?.isActive()) {
      this.mainCanvasWorker.draw({
        bobs,
        ensembleBobs: [],
        style: { ...this.mainFrameStyle(), skipTrail: true }
      });
    } else {
      this.ensureRenderer()?.draw(bobs, { skipTrail: true });
    }
  }

  /** Cartesian bob positions (metres) from a raw state, for replay rendering. */
  private bobsFromState(state: ArrayLike<number>): BobPosition[] {
    const { l1, l2, l3 } = this.sim.config.parameters;
    const x1 = l1 * Math.sin(state[0]!);
    const y1 = l1 * Math.cos(state[0]!);
    const x2 = x1 + l2 * Math.sin(state[1]!);
    const y2 = y1 + l2 * Math.cos(state[1]!);
    if (this.sim.config.system === 'triple') {
      const ell3 = l3 ?? 1;
      return [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
        { x: x2 + ell3 * Math.sin(state[2]!), y: y2 + ell3 * Math.cos(state[2]!) }
      ];
    }
    return [
      { x: x1, y: y1 },
      { x: x2, y: y2 }
    ];
  }

  /** Refresh the header/diagnostics chrome from the latest frame snapshot. */
  private updateChrome(
    snapshot: { time: number; energy: number; drift: number; state: ArrayLike<number> },
    w1Index: number,
    w2Index: number
  ): void {
    presentLabChrome({
      ...snapshot,
      initialEnergy: this.sim.initialEnergy,
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
      modeLabel:
        this.scrubIndex >= 0
          ? 'replay'
          : this.running
            ? `${this.timingMode()} · ${this.lastAdvancedSteps} step(s)`
            : 'paused'
    });
  }

  /** Live diagnostics for tooling/tests. */
  diagnostics(): {
    time: number;
    drift: number;
    poincarePoints: number;
    lambdaMax: number;
    fps: number;
    physicsMsPerFrame: number;
    renderMsPerFrame: number;
    sidePlotMsPerFrame: number;
    trailPoints: number;
    qualityMode: QualityMode;
    qualityReason: string;
    dprCap: number;
    stepsPerFrame: number;
    stepsAdvanced: number;
    timingMode: SimulationTimingMode;
    requestedStepsPerFrame: number;
    trailQualityScale: number;
    sidePlotBackend: 'offscreen' | 'main';
    mainCanvasBackend: 'offscreen' | 'main';
    mainTrailBackend: 'webgl2' | 'canvas2d' | 'worker';
    pendingUiTasks: number;
    canvasQualityEvents: readonly ReturnType<typeof canvasQualityDiagnostics>[number][];
  } {
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
      canvasQualityEvents: canvasQualityDiagnostics()
    };
  }

  private loop = (): void => {
    if (!this.running) return;
    this.frame();
    this.rafId = requestAnimationFrame(this.loop);
  };

  start(): void {
    this.build();
    this.wireControls();
    this.running = true;
    this.renderer?.clear();
    this.mainCanvasWorker?.clear();
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    const app = (window as Window & { App?: Record<string, unknown> }).App;
    if (app) app.__modernLabActive = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Restart the simulation from the current control values. */
  reset(): void {
    this.build();
    if (!this.running) {
      this.running = true;
      this.rafId = requestAnimationFrame(this.loop);
    }
  }

  /** Continue from a saved session only when store and interactive-Lab contracts agree. */
  restoreSnapshot(snapshot: RuntimeSnapshot): void {
    this.build(canonicalLabSnapshot(snapshot));
    if (!this.running) {
      this.running = true;
      this.rafId = requestAnimationFrame(this.loop);
    }
  }

  /** Replace the initial angles (used by drag-to-set) and restart. */
  setAngles(angles: number[]): void {
    const ids = this.sim.config.system === 'triple' ? ['th1', 'th2', 'th3'] : ['th1', 'th2'];
    ids.forEach((id, i) => {
      if (angles[i] === undefined) return;
      const el = dom.el<HTMLInputElement>(id);
      const out = dom.el(`${id}V`);
      if (el) el.value = String(angles[i]);
      if (out) out.textContent = angles[i]!.toFixed(3);
    });
    this.reset();
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
        if (this.running) this.rafId = requestAnimationFrame(this.loop);
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
              seed: Number.isFinite(seed) ? seed : null
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
          this.renderer ? this.bobsFromState(this.sim.stateView()).map((b) => this.renderer!.toPixels(b)) : [],
        pivot: () => this.renderer?.pivot() ?? null,
        stateAngles: () => {
          const state = this.sim.stateView();
          return this.sim.config.system === 'triple' ? [state[0]!, state[1]!, state[2]!] : [state[0]!, state[1]!];
        },
        setAngles: (angles) => this.setAngles(angles)
      }
    });
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
