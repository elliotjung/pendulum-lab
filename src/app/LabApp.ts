import type { Point2D } from '../viz/poincare';
import { physicsAdapter } from '../physics';
import { renderEnergyPlot, renderLyapunovConvergence, renderPoincareSection } from '../viz';
import { LabSimulation, type BobPosition, type LabConfig } from './LabSimulation';
import { LabRenderer } from './LabRenderer';
import { PoincareAccumulator } from './PoincareAccumulator';
import { LyapunovEstimator } from './LyapunovEstimator';
import { renderPhasePortrait, renderSpectrum, type PhaseSample } from './labPlots';
import { magnitudeSpectrum } from './fft';
import { downloadDataUrl, downloadText, poincareCsv, runJson, trajectoryCsv } from './labExport';
import { pageDom as dom } from './DomBinder';
import { AudioSonifier } from './AudioSonifier';
import {
  canvasQualityDiagnostics,
  configureCanvas2D,
  type ManagedCanvas2D
} from './canvasQuality';
import { DiagnosticsScheduler } from './DiagnosticsScheduler';
import { LabSidePlotWorkerClient } from './LabSidePlotWorkerClient';
import { pairsToPoints, type LabSidePlotPayload } from './LabSidePlotProtocol';
import { RenderScheduler } from './RenderScheduler';
import { SimulationClock, type SimulationTimingMode } from './SimulationClock';
import { LabRecording } from './LabRecording';
import { LabControls, readLabConfig } from './LabControls';
import { compactViewport, LabQualityBudget, type QualityMode } from './LabQualityBudget';

/**
 * Full modern Lab tab: the simulation/render loop plus every side plot
 * (energy/drift, Lyapunov convergence, phase portrait, Poincaré section, FFT),
 * reading the on-page controls and driving the real lab canvases. When mounted
 * it sets `App.__modernLabActive` so the legacy lab render (guarded in
 * `Render.all`) stands down, pauses the legacy stepping, and mirrors its state
 * into `window.App` so the legacy chrome (diagnostics, hash, export) stays
 * coherent. This is the Stage-2 takeover that precedes deleting the legacy lab.
 */

const CANVAS_IDS = ['main', 'energy', 'lyap', 'phase', 'poincare', 'fft'] as const;
type CanvasId = (typeof CANVAS_IDS)[number];

function ctxOf(id: CanvasId): ManagedCanvas2D | null {
  const canvas = dom.el<HTMLCanvasElement>(id);
  if (!canvas) return null;
  try {
    return configureCanvas2D(canvas);
  } catch {
    return null;
  }
}

function phaseSamples(theta: Float32Array, omega: Float32Array): PhaseSample[] {
  const n = Math.min(theta.length, omega.length);
  const samples: PhaseSample[] = new Array(n);
  for (let i = 0; i < n; i += 1) samples[i] = { theta: theta[i] ?? 0, omega: omega[i] ?? 0 };
  return samples;
}

const SIDE_PLOT_COUNT = 5;

export class LabApp {
  private sim!: LabSimulation;
  private renderer: LabRenderer | null = null;
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
  private readonly sidePlotWorker = new LabSidePlotWorkerClient();
  private readonly controls = new LabControls();
  private readonly quality = new LabQualityBudget(() => {
    this.renderer = null;
  });

  // Ensemble of perturbed copies (chaos divergence visualization).
  private ensemble: Float64Array[] = [];
  private ensembleScratch: Float64Array[] = [];
  private ensembleTipScratch: Point2D[] = [];
  private rhs: ((s: Float64Array, o: Float64Array) => void) | null = null;

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
  private build(): void {
    const config = this.readConfig();
    this.requestedSpf = Math.max(1, Math.round(dom.num('spf', 6)));
    this.spf = this.requestedSpf;
    this.phaseAxis = dom.str('phaseAxis', '1');
    this.quality.setMode(this.quality.readMode(), 'silent');

    this.sim = new LabSimulation(config);
    const dim = config.system === 'triple' ? 6 : 4;
    const rhs = (s: Float64Array, o: Float64Array) => physicsAdapter.derivative(config.system, s, config.parameters, config.gamma, o);
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
    this.buildEnsemble(config, dim);

    const main = ctxOf('main');
    this.renderer = main ? new LabRenderer(main.ctx, { width: main.width, height: main.height }) : null;
    this.renderer?.clear();
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
    const effectiveStepsPerFrame = Math.max(0, Math.round(this.spf * speedMultiplier));
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
      afterSteps: (stepsAdvanced) => this.stepEnsemble(stepsAdvanced)
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
      const renderer = !this.renderer || this.frameCount % 30 === 0 ? this.ensureRenderer() : this.renderer;
      if (renderer) {
        renderer.draw(bobs, {
          fade: this.readFade(),
          ensembleTips: this.ensembleTips(),
          trailColor: this.trailColor(),
          trailMode: dom.str('trailMode', 'rainbow'),
          trailLength: this.quality.effectiveTrailLength(),
          glow: dom.bool('glowMode') && this.quality.profile().glow
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
        draw: (plotIndex) => this.drawSidePlotSlice(plotIndex)
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
    const main = ctxOf('main');
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

  private maybeAutoAdjustQuality(): void {
    this.spf = this.quality.maybeAutoAdjust({
      sampleCount: this.renderScheduler.sampleCount(),
      fps: this.renderScheduler.fps,
      renderMs: this.renderScheduler.renderMs,
      physicsMs: this.lastPhysicsMs,
      sidePlotMs: this.sidePlotWorker.renderMs(),
      stepsPerFrame: this.spf,
      requestedStepsPerFrame: this.requestedSpf
    });
  }

  /** Build N perturbed copies of the initial state for the ensemble view. */
  private buildEnsemble(config: LabConfig, dim: number): void {
    const n = Math.max(0, Math.min(this.quality.profile().ensembleCap, Math.round(dom.num('ensN', 0))));
    const eps = 10 ** dom.num('ensEps', -4);
    this.ensemble = [];
    this.ensembleScratch = [];
    this.ensembleTipScratch = [];
    for (let i = 0; i < n; i += 1) {
      const st = new Float64Array(dim);
      for (let j = 0; j < dim; j += 1) st[j] = config.initialState[j] ?? 0;
      // Perturb the first angle by a small ± multiple of eps.
      st[0] = (config.initialState[0] ?? 0) + eps * (i + 1) * (i % 2 === 0 ? 1 : -1);
      this.ensemble.push(st);
      this.ensembleScratch.push(new Float64Array(dim));
    }
  }

  private timingMode(): SimulationTimingMode {
    return dom.str('timeMode', 'deterministic') === 'wall-clock' ? 'wall-clock' : 'deterministic';
  }

  private stepEnsemble(steps: number): void {
    if (this.ensemble.length === 0 || !this.rhs) return;
    const { method, dt, tolerance } = this.sim.config;
    const options = tolerance === undefined ? {} : { tolerance };
    for (let m = 0; m < this.ensemble.length; m += 1) {
      const state = this.ensemble[m]!;
      const scratch = this.ensembleScratch[m]!;
      for (let s = 0; s < steps; s += 1) {
        physicsAdapter.step(method, state, dt, this.rhs, scratch, options);
        state.set(scratch);
      }
    }
  }

  /** Pre-mapped pixel positions of each ensemble member's tip. */
  private ensembleTips(): Point2D[] {
    if (!this.renderer || this.ensemble.length === 0) return [];
    const { l1, l2, l3 } = this.sim.config.parameters;
    const triple = this.sim.config.system === 'triple';
    this.ensembleTipScratch.length = this.ensemble.length;
    for (let i = 0; i < this.ensemble.length; i += 1) {
      const s = this.ensemble[i]!;
      const x1 = l1 * Math.sin(s[0]!);
      const y1 = l1 * Math.cos(s[0]!);
      const x2 = x1 + l2 * Math.sin(s[1]!);
      const y2 = y1 + l2 * Math.cos(s[1]!);
      const out = this.ensembleTipScratch[i] ?? { x: 0, y: 0 };
      this.ensembleTipScratch[i] = out;
      if (triple) {
        const ell3 = l3 ?? 1;
        this.renderer!.toPixelsXYInto(x2 + ell3 * Math.sin(s[2]!), y2 + ell3 * Math.cos(s[2]!), out);
      } else {
        this.renderer!.toPixelsXYInto(x2, y2, out);
      }
    }
    return this.ensembleTipScratch;
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
    return this.quality.sidePlotInterval(this.sidePlotWorker.renderMs());
  }

  private renderScrubFrame(): void {
    const frameRec = this.recording.at(this.scrubIndex);
    if (!frameRec || !this.renderer) return;
    const bobs = this.bobsFromState(frameRec.state);
    this.renderer.draw(bobs, { skipTrail: true });
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
      return [{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: x2 + ell3 * Math.sin(state[2]!), y: y2 + ell3 * Math.cos(state[2]!) }];
    }
    return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  }

  /**
   * Fill the header/diagnostics chrome directly from modern state. The legacy
   * runtime used to do this from its frame loop; once `js/` is removed this is
   * the only writer of these fields.
   */
  private updateChrome(snapshot: { time: number; energy: number; drift: number; state: ArrayLike<number> }, w1Index: number, w2Index: number): void {
    const set = (id: string, text: string): void => dom.setText(id, text);
    const st = snapshot.state;
    set('fpsBadge', `${this.renderScheduler.fps.toFixed(0)} fps`);
    set('dPhys', this.lastPhysicsMs.toFixed(2));
    set('dRender', this.renderScheduler.renderMs.toFixed(2));
    set('dWorker', this.sidePlotWorker.renderMs().toFixed(2));
    set('dQuality', this.quality.mode);
    set('dQualityReason', this.quality.reason);
    set('dDpr', this.quality.dprCap.toFixed(1));
    set('dBackend', this.sidePlotWorker.usesWorker() ? 'offscreen' : 'main');
    set('tStat', `${snapshot.time.toFixed(2)} s`);
    set('th1Stat', `${st[0]!.toFixed(3)} / ${st[w1Index]!.toFixed(2)}`);
    set('th2Stat', `${st[1]!.toFixed(3)} / ${st[w2Index]!.toFixed(2)}`);
    set('eStat', `${this.sim.initialEnergy.toFixed(3)} / ${snapshot.energy.toFixed(3)}`);
    const driftEl = dom.el('driftStat');
    if (driftEl) {
      driftEl.textContent = snapshot.drift.toExponential(2);
      driftEl.className = `sval ${snapshot.drift > 1e-2 ? 'bad' : snapshot.drift > 1e-4 ? 'warn' : 'good'}`;
    }
    set('lyapStat', `${this.lyap.value().toFixed(4)} /s`);
    const poincarePolicy = this.poincare.policy();
    set('dPoinc', `${this.poincare.size}/${poincarePolicy.capacity} ${poincarePolicy.direction}${poincarePolicy.refined ? ' refined' : ' linear'}`);
    set('modeLabel', this.scrubIndex >= 0 ? 'replay' : this.running ? `${this.timingMode()} · ${this.lastAdvancedSteps} step(s)` : 'paused');
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
      sidePlotMsPerFrame: this.sidePlotWorker.renderMs(),
      trailPoints: this.renderer?.trailPointCount() ?? 0,
      qualityMode: this.quality.mode,
      qualityReason: this.quality.reason,
      dprCap: this.quality.dprCap,
      stepsPerFrame: this.spf,
      stepsAdvanced: this.lastAdvancedSteps,
      timingMode: this.timingMode(),
      requestedStepsPerFrame: this.requestedSpf,
      trailQualityScale: this.quality.trailQualityScale,
      sidePlotBackend: this.sidePlotWorker.usesWorker() ? 'offscreen' : 'main',
      pendingUiTasks: this.diagnosticsScheduler.pendingCount(),
      canvasQualityEvents: canvasQualityDiagnostics()
    };
  }

  private drawSidePlotSlice(phaseIndex: number): void {
    const payload = this.sidePlotPayload(phaseIndex);
    if (!payload) return;
    if (this.ensureSidePlotWorker() && this.sidePlotWorker.render(payload)) return;
    this.drawSidePlotOnMain(payload);
  }

  private ensureSidePlotWorker(): boolean {
    if (!dom.bool('useWorker', true)) return false;
    return this.sidePlotWorker.ensure({
      energy: dom.el<HTMLCanvasElement>('energy') ?? undefined,
      lyap: dom.el<HTMLCanvasElement>('lyap') ?? undefined,
      phase: dom.el<HTMLCanvasElement>('phase') ?? undefined,
      poincare: dom.el<HTMLCanvasElement>('poincare') ?? undefined,
      fft: dom.el<HTMLCanvasElement>('fft') ?? undefined
    });
  }

  private sidePlotPayload(phaseIndex: number): LabSidePlotPayload | null {
    if (phaseIndex === 0) {
      return {
        plot: 'energy',
        energy: {
          time: Float32Array.from(this.energy.time),
          total: Float32Array.from(this.energy.total),
          drift: Float32Array.from(this.energy.drift)
        }
      };
    }
    if (phaseIndex === 1) {
      return { plot: 'lyap', history: Float32Array.from(this.lyap.history()), value: this.lyap.value() };
    }
    if (phaseIndex === 2) {
      return { plot: 'phase', ...this.phaseSeriesForAxis() };
    }
    if (phaseIndex === 3) {
      return { plot: 'poincare', points: this.poincare.toFloat32Pairs() };
    }
    const sampleRate = 1 / (this.sim.config.dt * this.spf);
    return { plot: 'fft', theta1Frames: Float32Array.from(this.theta1Frames), sampleRate };
  }

  private drawSidePlotOnMain(payload: LabSidePlotPayload): void {
    if (payload.plot === 'energy') {
      const energy = ctxOf('energy');
      if (energy) renderEnergyPlot(energy.ctx, { x: 0, y: 0, width: energy.width, height: energy.height }, payload.energy);
      return;
    }
    if (payload.plot === 'lyap') {
      const lyap = ctxOf('lyap');
      if (lyap) {
        const history = payload.history.length > 1 ? Array.from(payload.history) : [0, payload.value];
        renderLyapunovConvergence(lyap.ctx, { x: 0, y: 0, width: lyap.width, height: lyap.height }, history);
      }
      return;
    }
    if (payload.plot === 'phase') {
      const phase = ctxOf('phase');
      if (phase) renderPhasePortrait(phase.ctx, { x: 0, y: 0, width: phase.width, height: phase.height }, phaseSamples(payload.theta, payload.omega));
      return;
    }
    if (payload.plot === 'poincare') {
      const poincare = ctxOf('poincare');
      if (poincare) {
        renderPoincareSection(
          poincare.ctx,
          { x: 0, y: 0, width: poincare.width, height: poincare.height },
          pairsToPoints(payload.points),
          { xLabel: 'θ₂', yLabel: 'ω₂' }
        );
      }
      return;
    }
    const fft = ctxOf('fft');
    if (fft && payload.theta1Frames.length >= 16) {
      const spectrum = magnitudeSpectrum(payload.theta1Frames, payload.sampleRate);
      renderSpectrum(fft.ctx, { x: 0, y: 0, width: fft.width, height: fft.height }, spectrum.mags, {
        log: true,
        nyquist: payload.sampleRate / 2
      });
    }
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
      applyQualityMode: () => this.quality.setMode(this.quality.readMode(), 'manual'),
      trimEnsembleToQuality: () => this.trimEnsembleToQuality(),
      clearTrail: () => this.renderer?.clear(),
      clearPoincare: () => this.poincare.clear(),
      toggleRunning: () => {
        this.running = !this.running;
        if (this.running) this.rafId = requestAnimationFrame(this.loop);
      },
      exportTrajectory: () => downloadText('pendulum_modern_trajectory.csv', trajectoryCsv(this.recording.samples(), cfg().system), 'text/csv'),
      exportPoincare: () => downloadText('pendulum_modern_poincare.csv', poincareCsv(this.poincare.list()), 'text/csv'),
      exportJson: () => {
        const snap = this.sim.snapshot();
        downloadText('pendulum_modern_run.json', JSON.stringify(runJson(cfg(), snap.state, snap.time, snap.energy, snap.drift), null, 2), 'application/json');
      },
      exportPng: () => {
        const canvas = dom.el<HTMLCanvasElement>('main');
        if (canvas) downloadDataUrl('pendulum_modern.png', canvas.toDataURL('image/png'));
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
        bobPixels: () => (this.renderer ? this.bobsFromState(this.sim.stateView()).map((b) => this.renderer!.toPixels(b)) : []),
        pivot: () => this.renderer?.pivot() ?? null,
        stateAngles: () => {
          const state = this.sim.stateView();
          return this.sim.config.system === 'triple' ? [state[0]!, state[1]!, state[2]!] : [state[0]!, state[1]!];
        },
        setAngles: (angles) => this.setAngles(angles)
      }
    });
  }

  private trimEnsembleToQuality(): void {
    const cap = this.quality.profile().ensembleCap;
    if (this.ensemble.length <= cap) return;
    this.ensemble.length = cap;
    this.ensembleScratch.length = cap;
    this.ensembleTipScratch.length = cap;
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}
