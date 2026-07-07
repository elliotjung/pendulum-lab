import type { IntegratorId, SystemType } from '../types/domain';
import type { Point2D } from '../viz/poincare';
import { physicsAdapter } from '../physics';
import { renderEnergyPlot, renderLyapunovConvergence, renderPoincareSection } from '../viz';
import { LabSimulation, type LabConfig } from './LabSimulation';
import { LabRenderer } from './LabRenderer';
import { PoincareAccumulator } from './PoincareAccumulator';
import { LyapunovEstimator } from './LyapunovEstimator';
import { renderPhasePortrait, renderSpectrum, type PhaseSample } from './labPlots';
import { magnitudeSpectrum } from './fft';
import { downloadDataUrl, downloadText, poincareCsv, runJson, trajectoryCsv } from './labExport';
import { pageDom as dom } from './DomBinder';
import { AudioSonifier } from './AudioSonifier';
import { configureCanvas2D, type ManagedCanvas2D } from './canvasQuality';

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
  return configureCanvas2D(canvas);
}

function compactViewport(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 560px), (pointer: coarse)').matches;
}

export class LabApp {
  private sim!: LabSimulation;
  private renderer: LabRenderer | null = null;
  private poincare = new PoincareAccumulator(4000, 'both');
  private lyap!: LyapunovEstimator;
  private phaseSamples: Array<{ t1: number; w1: number; t2: number; w2: number }> = [];
  private theta1Frames: number[] = [];
  private energy = { time: [] as number[], total: [] as number[], drift: [] as number[] };
  private rafId: number | null = null;
  private running = false;
  private lastTime = 0;
  private lastDrift = 0;
  private lastFrameTs = 0;
  private frameTimes: number[] = [];
  private lastFps = 0;
  private lastPhysicsMs = 0;
  private frameCount = 0;
  private spf = 6;
  private phaseAxis = '1';

  // Ensemble of perturbed copies (chaos divergence visualization).
  private ensemble: Float64Array[] = [];
  private ensembleScratch: Float64Array[] = [];
  private rhs: ((s: Float64Array, o: Float64Array) => void) | null = null;

  // Trajectory recording for export + scrubber/replay.
  private record: Array<{ time: number; state: number[] }> = [];
  private readonly recordCap = 4000;
  private scrubIndex = -1; // -1 = live; >=0 = showing a recorded frame

  // Visual FX (glow / long-exposure) and drag interaction.
  private dragTarget: number | null = null;

  // Audio sonification of the angular velocities.
  private audio = new AudioSonifier();

  /** Read the current control values into a LabConfig. */
  readConfig(): LabConfig {
    const system: SystemType = dom.str('sysType', 'double') === 'triple' ? 'triple' : 'double';
    const parameters = {
      m1: dom.num('m1', 1),
      m2: dom.num('m2', 1),
      m3: dom.num('m3', 1),
      l1: dom.num('l1', 1.2),
      l2: dom.num('l2', 1.0),
      l3: dom.num('l3', 0.8),
      g: dom.num('g', 9.81)
    };
    const initialState =
      system === 'triple'
        ? [dom.num('th1', 2), dom.num('th2', 2.5), dom.num('th3', 1), dom.num('iw1', 0), dom.num('iw2', 0), dom.num('iw3', 0)]
        : [dom.num('th1', 2), dom.num('th2', 2.5), dom.num('iw1', 0), dom.num('iw2', 0)];
    return {
      system,
      parameters,
      gamma: dom.num('gamma', 0),
      method: dom.str('method', 'rk4') as IntegratorId,
      dt: dom.num('dt', 0.003),
      tolerance: 10 ** dom.num('tol', -6),
      initialState
    };
  }

  /** (Re)build the simulation and clear all derived histories. */
  private build(): void {
    const config = this.readConfig();
    this.spf = Math.max(1, Math.round(dom.num('spf', 6)));
    this.phaseAxis = dom.str('phaseAxis', '1');

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
    this.phaseSamples = [];
    this.theta1Frames = [];
    this.energy = { time: [], total: [], drift: [] };
    this.record = [];
    this.scrubIndex = -1;
    this.buildEnsemble(config, dim);

    const main = ctxOf('main');
    this.renderer = main ? new LabRenderer(main.ctx, { width: main.width, height: main.height }) : null;
    this.renderer?.clear();
    this.frameCount = 0;
  }

  private push<T>(arr: T[], value: T, cap: number): void {
    arr.push(value);
    if (arr.length > cap) arr.splice(0, arr.length - cap);
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
    const physStart = performance.now();
    for (let s = 0; s < this.spf; s += 1) {
      sim.step(1);
      const state = sim.getState();
      this.poincare.push(state);
      this.lyap.step(state);
      this.push(this.phaseSamples, { t1: state[0]!, w1: state[w1Index]!, t2: state[1]!, w2: state[w2Index]! }, 800);
    }
    this.stepEnsemble();
    this.lastPhysicsMs = performance.now() - physStart;
    const snapshot = sim.snapshot();
    this.push(this.theta1Frames, snapshot.state[0]!, 1024);
    this.push(this.energy.time, snapshot.time, 600);
    this.push(this.energy.total, snapshot.energy, 600);
    this.push(this.energy.drift, snapshot.drift, 600);
    this.push(this.record, { time: snapshot.time, state: snapshot.state }, this.recordCap);

    this.frameCount += 1;
    const diag = this.frameCount % this.sidePlotInterval() === 0; // side plots/chrome at a reduced cadence

    // Frame-time / fps tracking (every frame, cheap).
    const now = performance.now();
    if (this.lastFrameTs) {
      this.frameTimes.push(now - this.lastFrameTs);
      if (this.frameTimes.length > 30) this.frameTimes.shift();
    }
    this.lastFrameTs = now;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / (this.frameTimes.length || 1);
    this.lastFps = avg > 0 ? 1000 / avg : 0;

    this.audio.update(snapshot.state[w1Index]!, snapshot.state[w2Index]!);
    this.lastTime = snapshot.time;
    this.lastDrift = snapshot.drift;

    // Skip all drawing while the Lab tab is hidden: the simulation keeps
    // advancing (so the trajectory is continuous when you return) but we don't
    // pay for rendering canvases nobody is looking at — which keeps the active
    // analysis tab smooth.
    const labVisible = dom.tabActive('tab-lab');
    if (!labVisible) return;

    // Pendulum + trail render every frame, for smooth motion.
    const renderer = !this.renderer || this.frameCount % 30 === 0 ? this.ensureRenderer() : this.renderer;
    if (renderer) {
      renderer.draw(snapshot.bobs, {
        fade: this.readFade(),
        ensembleTips: this.ensembleTips(),
        trailColor: this.trailColor(),
        trailMode: dom.str('trailMode', 'rainbow'),
        trailLength: this.effectiveTrailLength(),
        glow: dom.bool('glowMode')
      });
    }

    // The side plots (FFT, scatter redraws) and the ~12 DOM chrome writes are an
    // order of magnitude more expensive than the main view, so run them at a
    // reduced cadence; the pendulum itself stays at full frame rate.
    if (diag) {
      this.drawSidePlots();
      this.updateChrome(snapshot, w1Index, w2Index);
      const scrubber = dom.el<HTMLInputElement>('scrubber');
      if (scrubber) {
        scrubber.max = String(Math.max(0, this.record.length - 1));
        if (this.scrubIndex < 0) scrubber.value = scrubber.max;
      }
    }
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

  /** Build N perturbed copies of the initial state for the ensemble view. */
  private buildEnsemble(config: LabConfig, dim: number): void {
    const n = Math.max(0, Math.min(200, Math.round(dom.num('ensN', 0))));
    const eps = 10 ** dom.num('ensEps', -4);
    this.ensemble = [];
    this.ensembleScratch = [];
    for (let i = 0; i < n; i += 1) {
      const st = new Float64Array(dim);
      for (let j = 0; j < dim; j += 1) st[j] = config.initialState[j] ?? 0;
      // Perturb the first angle by a small ± multiple of eps.
      st[0] = (config.initialState[0] ?? 0) + eps * (i + 1) * (i % 2 === 0 ? 1 : -1);
      this.ensemble.push(st);
      this.ensembleScratch.push(new Float64Array(dim));
    }
  }

  private stepEnsemble(): void {
    if (this.ensemble.length === 0 || !this.rhs) return;
    const { method, dt, tolerance } = this.sim.config;
    const options = tolerance === undefined ? {} : { tolerance };
    for (let m = 0; m < this.ensemble.length; m += 1) {
      const state = this.ensemble[m]!;
      const scratch = this.ensembleScratch[m]!;
      for (let s = 0; s < this.spf; s += 1) {
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
    return this.ensemble.map((s) => {
      const x1 = l1 * Math.sin(s[0]!);
      const y1 = l1 * Math.cos(s[0]!);
      const x2 = x1 + l2 * Math.sin(s[1]!);
      const y2 = y1 + l2 * Math.cos(s[1]!);
      if (triple) {
        const ell3 = l3 ?? 1;
        return this.renderer!.toPixels({ x: x2 + ell3 * Math.sin(s[2]!), y: y2 + ell3 * Math.cos(s[2]!) });
      }
      return this.renderer!.toPixels({ x: x2, y: y2 });
    });
  }

  /**
   * Per-frame fade alpha, which sets how long the incremental trail persists.
   * Long-exposure / glow override it; otherwise it derives from the trail-length
   * control (a segment stays visible for roughly `trailLen/10` frames).
   */
  private readFade(): number {
    const compact = compactViewport();
    if (dom.bool('longExpose')) return compact ? 0.018 : 0.008;
    if (dom.bool('glowMode')) return compact ? 0.07 : 0.04;
    return compact ? 0.18 : 0.12;
  }

  private effectiveTrailLength(): number {
    const requested = Math.max(2, Math.round(dom.num('trailLen', 1500)));
    return compactViewport() ? Math.min(requested, 520) : requested;
  }

  private sidePlotInterval(): number {
    return compactViewport() ? 14 : 6;
  }

  private renderScrubFrame(): void {
    const frameRec = this.record[this.scrubIndex];
    if (!frameRec || !this.renderer) return;
    const bobs = this.bobsFromState(frameRec.state);
    this.renderer.draw(bobs, { skipTrail: true });
  }

  /** Cartesian bob positions (metres) from a raw state, for replay rendering. */
  private bobsFromState(state: readonly number[]): Array<{ x: number; y: number }> {
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
  private updateChrome(snapshot: { time: number; energy: number; drift: number; state: number[] }, w1Index: number, w2Index: number): void {
    const set = (id: string, text: string): void => dom.setText(id, text);
    const st = snapshot.state;
    set('fpsBadge', `${this.lastFps.toFixed(0)} fps`);
    set('dPhys', this.lastPhysicsMs.toFixed(2));
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
    set('dPoinc', String(this.poincare.size));
    set('modeLabel', this.scrubIndex >= 0 ? 'replay' : this.running ? 'running' : 'paused');
  }

  /** Live diagnostics for tooling/tests. */
  diagnostics(): { time: number; drift: number; poincarePoints: number; lambdaMax: number; fps: number; physicsMsPerFrame: number; trailPoints: number } {
    return {
      time: this.lastTime,
      drift: this.lastDrift,
      poincarePoints: this.poincare.size,
      lambdaMax: this.lyap.value(),
      fps: this.lastFps,
      physicsMsPerFrame: this.lastPhysicsMs,
      trailPoints: this.renderer?.trailPointCount() ?? 0
    };
  }

  private drawSidePlots(): void {
    const energy = ctxOf('energy');
    if (energy) renderEnergyPlot(energy.ctx, { x: 0, y: 0, width: energy.width, height: energy.height }, this.energy);

    const lyap = ctxOf('lyap');
    if (lyap) {
      const history = this.lyap.history();
      renderLyapunovConvergence(lyap.ctx, { x: 0, y: 0, width: lyap.width, height: lyap.height }, history.length > 1 ? [...history] : [0, this.lyap.value()]);
    }

    const phase = ctxOf('phase');
    if (phase) {
      const useArm2 = this.phaseAxis === '2';
      const samples: PhaseSample[] = this.phaseSamples.map((s) => (useArm2 ? { theta: s.t2, omega: s.w2 } : { theta: s.t1, omega: s.w1 }));
      renderPhasePortrait(phase.ctx, { x: 0, y: 0, width: phase.width, height: phase.height }, samples);
    }

    const poincare = ctxOf('poincare');
    if (poincare) {
      renderPoincareSection(
        poincare.ctx,
        { x: 0, y: 0, width: poincare.width, height: poincare.height },
        this.poincare.list(),
        { xLabel: 'θ₂', yLabel: 'ω₂' }
      );
    }

    const fft = ctxOf('fft');
    if (fft && this.theta1Frames.length >= 16) {
      const sampleRate = 1 / (this.sim.config.dt * this.spf);
      const spectrum = magnitudeSpectrum(this.theta1Frames, sampleRate);
      renderSpectrum(fft.ctx, { x: 0, y: 0, width: fft.width, height: fft.height }, spectrum.mags, {
        log: true,
        nyquist: sampleRate / 2
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

  private controlsWired = false;
  private wireControls(): void {
    if (this.controlsWired) return;
    this.controlsWired = true;

    const rebuildOn = [
      'sysType', 'method', 'dt', 'gamma', 'g', 'm1', 'm2', 'm3', 'l1', 'l2', 'l3', 'spf', 'tol',
      'phaseAxis', 'trailLen', 'ensN', 'ensEps', 'th1', 'th2', 'th3', 'iw1', 'iw2', 'iw3', 'seed'
    ];
    for (const id of rebuildOn) dom.el(id)?.addEventListener('change', () => this.reset());

    // Presets: legacy applyPreset updates the sliders first (registered earlier);
    // our handler then rebuilds the modern sim from those values.
    dom.all('[data-preset]').forEach((btn) => btn.addEventListener('click', () => setTimeout(() => this.reset(), 0)));

    dom.el('resetBtn')?.addEventListener('click', () => this.reset());
    dom.el('clearTrailBtn')?.addEventListener('click', () => {
      this.renderer?.clear();
    });
    dom.el('clearPoincBtn')?.addEventListener('click', () => this.poincare.clear());
    dom.el('pauseBtn')?.addEventListener('click', () => {
      this.running = !this.running;
      if (this.running) this.rafId = requestAnimationFrame(this.loop);
    });

    this.wireExport();
    this.wireScrubber();
    this.wireDrag();
    this.wireAudio();
  }

  private wireAudio(): void {
    // Take over the audio controls so the legacy audioInit never runs (no double
    // AudioContext); the modern AudioSonifier owns sonification.
    this.audio.setVolume(dom.num('audioVol', 0.08));
    dom.takeOver('audioOn')?.addEventListener('change', (e) => this.audio.setEnabled((e.target as HTMLInputElement).checked));
    dom.takeOver('audioVol')?.addEventListener('input', (e) => this.audio.setVolume(Number.parseFloat((e.target as HTMLInputElement).value)));
  }

  private wireExport(): void {
    const cfg = () => this.sim.config;
    dom.el('dlTrajBtn')?.addEventListener('click', () =>
      downloadText('pendulum_modern_trajectory.csv', trajectoryCsv(this.record, cfg().system), 'text/csv')
    );
    dom.el('dlPoincBtn')?.addEventListener('click', () =>
      downloadText('pendulum_modern_poincare.csv', poincareCsv(this.poincare.list()), 'text/csv')
    );
    dom.el('dlJsonBtn')?.addEventListener('click', () => {
      const snap = this.sim.snapshot();
      downloadText('pendulum_modern_run.json', JSON.stringify(runJson(cfg(), snap.state, snap.time, snap.energy, snap.drift), null, 2), 'application/json');
    });
    dom.el('dlPNGBtn')?.addEventListener('click', () => {
      const canvas = dom.el<HTMLCanvasElement>('main');
      if (canvas) downloadDataUrl('pendulum_modern.png', canvas.toDataURL('image/png'));
    });
  }

  private wireScrubber(): void {
    const scrubber = dom.el<HTMLInputElement>('scrubber');
    const scrubVal = dom.el('scrubVal');
    if (scrubber) {
      scrubber.addEventListener('input', () => {
        const max = Math.max(0, this.record.length - 1);
        const v = Math.min(max, Math.round(Number(scrubber.value)));
        this.scrubIndex = v >= max ? -1 : v; // dragging to the end resumes live
        if (scrubVal) scrubVal.textContent = this.scrubIndex < 0 ? 'live' : `${(this.record[v]?.time ?? 0).toFixed(2)}s`;
      });
    }
    dom.el('rewindBtn')?.addEventListener('click', () => {
      if (this.record.length > 0) this.scrubIndex = 0;
    });
  }

  private wireDrag(): void {
    const canvas = dom.el<HTMLCanvasElement>('main');
    if (!canvas || !this.renderer) return;
    const toCanvas = (e: PointerEvent): Point2D => ({
      x: e.offsetX * (this.renderer!.size().width / canvas.offsetWidth),
      y: e.offsetY * (this.renderer!.size().height / canvas.offsetHeight)
    });
    canvas.addEventListener('pointerdown', (e) => {
      const bobs = this.bobsFromState(this.sim.getState()).map((b) => this.renderer!.toPixels(b));
      const p = toCanvas(e);
      for (let i = 0; i < bobs.length; i += 1) {
        if (Math.hypot(p.x - bobs[i]!.x, p.y - bobs[i]!.y) < 20) {
          this.dragTarget = i;
          canvas.setPointerCapture(e.pointerId);
          break;
        }
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.dragTarget === null || !this.renderer) return;
      const p = toCanvas(e);
      const pivot = this.renderer.pivot();
      const state = this.sim.getState();
      const angles = this.sim.config.system === 'triple' ? [state[0]!, state[1]!, state[2]!] : [state[0]!, state[1]!];
      if (this.dragTarget === 0) {
        angles[0] = Math.atan2(p.x - pivot.x, p.y - pivot.y);
      } else {
        const parent = this.bobsFromState(state).map((b) => this.renderer!.toPixels(b))[this.dragTarget - 1]!;
        angles[this.dragTarget] = Math.atan2(p.x - parent.x, p.y - parent.y);
      }
      this.setAngles(angles);
    });
    const release = (e: PointerEvent): void => {
      if (this.dragTarget === null) return;
      this.dragTarget = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* capture may already be released */
      }
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }
}
