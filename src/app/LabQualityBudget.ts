import { getCanvasDprCap, recordCanvasQualityEvent, setCanvasDprCap } from './canvasQuality';
import { pageDom as dom } from './DomBinder';

export type QualityMode = 'performance' | 'balanced' | 'cinematic';

interface QualityProfile {
  dprCap: number;
  trailCap: number;
  poincareCap: number;
  sideInterval: number;
  ensembleCap: number;
  glow: boolean;
  className: string;
}

interface QualityMetrics {
  sampleCount: number;
  fps: number;
  renderMs: number;
  physicsMs: number;
  sidePlotMs: number;
  stepsPerFrame: number;
  requestedStepsPerFrame: number;
}

const QUALITY_PROFILES: Record<QualityMode, QualityProfile> = {
  performance: {
    dprCap: 1,
    trailCap: 720,
    poincareCap: 1500,
    sideInterval: 3,
    ensembleCap: 24,
    glow: false,
    className: 'quality-performance'
  },
  balanced: {
    dprCap: 1.5,
    trailCap: 1200,
    poincareCap: 4000,
    sideInterval: 2,
    ensembleCap: 60,
    glow: true,
    className: 'quality-balanced'
  },
  cinematic: {
    dprCap: 2,
    trailCap: 3000,
    poincareCap: 9000,
    sideInterval: 1,
    ensembleCap: 200,
    glow: true,
    className: 'quality-cinematic'
  }
};

/**
 * Poincaré-point retention budget for a quality mode. Compact viewports keep a
 * tighter cap: section scatter beyond ~2000 points reads as solid fill at
 * phone canvas sizes while still costing memory and redraw time.
 */
export function poincareCapForMode(mode: QualityMode, compact: boolean): number {
  const cap = (QUALITY_PROFILES[mode] ?? QUALITY_PROFILES.balanced).poincareCap;
  return compact ? Math.min(cap, 2000) : cap;
}

export function compactViewport(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 560px), (pointer: coarse)').matches
  );
}

export class LabQualityBudget {
  private currentMode: QualityMode = 'balanced';
  private currentReason = 'startup';
  private stableFrames = 0;
  private trailScale = 1;

  constructor(private readonly onModeChanged: () => void) {}

  get mode(): QualityMode {
    return this.currentMode;
  }

  get reason(): string {
    return this.currentReason;
  }

  get trailQualityScale(): number {
    return this.trailScale;
  }

  get dprCap(): number {
    return getCanvasDprCap();
  }

  readMode(): QualityMode {
    const raw = dom.str('qualityMode', 'balanced');
    return raw === 'performance' || raw === 'cinematic' ? raw : 'balanced';
  }

  profile(): QualityProfile {
    return QUALITY_PROFILES[this.currentMode];
  }

  resetTrailScale(): void {
    this.trailScale = 1;
  }

  setMode(mode: QualityMode, reason: 'manual' | 'auto' | 'silent' = 'manual', note?: string): void {
    if (!QUALITY_PROFILES[mode]) mode = 'balanced';
    const previous = this.currentMode;
    this.currentMode = mode;
    const profile = this.profile();
    this.currentReason = note ?? (reason === 'silent' ? `${mode} profile` : `${reason}: ${mode} profile`);
    setCanvasDprCap(profile.dprCap, this.currentReason);
    document.body.classList.remove('quality-performance', 'quality-balanced', 'quality-cinematic');
    document.body.classList.add(profile.className);

    const select = dom.el<HTMLSelectElement>('qualityMode');
    if (select && select.value !== mode) select.value = mode;
    dom.setText('dQuality', mode);
    dom.setText('dQualityReason', this.currentReason);
    dom.setText('dDpr', getCanvasDprCap().toFixed(1));
    dom.el('dQuality')?.setAttribute('title', this.currentReason);

    if (previous !== mode) {
      this.stableFrames = 0;
      this.onModeChanged();
      if (reason === 'auto') {
        const toast = (window as Window & { toast?: unknown }).toast;
        if (typeof toast === 'function') toast(`Quality adjusted to ${mode}`);
      }
    }
  }

  maybeAutoAdjust(metrics: QualityMetrics): number {
    const safeSteps =
      Number.isFinite(metrics.stepsPerFrame) && metrics.stepsPerFrame >= 1 ? Math.round(metrics.stepsPerFrame) : 1;
    const normalizedMetrics: QualityMetrics = {
      sampleCount: Number.isFinite(metrics.sampleCount) && metrics.sampleCount >= 0 ? metrics.sampleCount : 0,
      fps: Number.isFinite(metrics.fps) && metrics.fps >= 0 ? metrics.fps : 0,
      renderMs: Number.isFinite(metrics.renderMs) && metrics.renderMs >= 0 ? metrics.renderMs : 0,
      physicsMs: Number.isFinite(metrics.physicsMs) && metrics.physicsMs >= 0 ? metrics.physicsMs : 0,
      sidePlotMs: Number.isFinite(metrics.sidePlotMs) && metrics.sidePlotMs >= 0 ? metrics.sidePlotMs : 0,
      stepsPerFrame: safeSteps,
      requestedStepsPerFrame:
        Number.isFinite(metrics.requestedStepsPerFrame) && metrics.requestedStepsPerFrame >= 1
          ? Math.round(metrics.requestedStepsPerFrame)
          : safeSteps
    };
    if (!dom.bool('autoQual', true) || normalizedMetrics.sampleCount < 20) return normalizedMetrics.stepsPerFrame;
    this.stableFrames += 1;
    if (this.stableFrames < 45) return normalizedMetrics.stepsPerFrame;

    const { fps, renderMs, physicsMs, sidePlotMs, requestedStepsPerFrame } = normalizedMetrics;
    let stepsPerFrame = normalizedMetrics.stepsPerFrame;
    const physicsOver = physicsMs > 10 || (fps > 0 && fps < 45 && physicsMs > 7);
    const renderOver = (fps > 0 && fps < 30) || renderMs > 20;
    const sidePlotOver = sidePlotMs > 14;

    if (physicsOver) {
      if (stepsPerFrame > 1) stepsPerFrame = Math.max(1, Math.floor(stepsPerFrame * 0.82));
      this.trailScale = Math.max(0.55, this.trailScale * 0.9);
      this.note(
        `physics ${physicsMs.toFixed(1)} ms; spf ${stepsPerFrame}/${requestedStepsPerFrame}`,
        normalizedMetrics,
        stepsPerFrame
      );
      return stepsPerFrame;
    }

    if (renderOver) {
      this.trailScale = Math.max(0.5, this.trailScale * 0.85);
      if (this.currentMode !== 'performance')
        this.setMode('performance', 'auto', `render ${renderMs.toFixed(1)} ms; quality downgraded`);
      else
        this.note(
          `render ${renderMs.toFixed(1)} ms; trail ${Math.round(this.trailScale * 100)}%`,
          normalizedMetrics,
          stepsPerFrame
        );
      return stepsPerFrame;
    }

    if (sidePlotOver) {
      this.trailScale = Math.max(0.65, this.trailScale * 0.92);
      this.note(`side plots ${sidePlotMs.toFixed(1)} ms; cadence relaxed`, normalizedMetrics, stepsPerFrame);
      return stepsPerFrame;
    }

    if ((fps > 0 && fps < 45) || renderMs > 12) {
      if (this.currentMode === 'cinematic')
        this.setMode('balanced', 'auto', `balanced after ${renderMs.toFixed(1)} ms render`);
      return stepsPerFrame;
    }

    const canUpgrade = fps > 57 && renderMs < 7 && physicsMs < 5 && sidePlotMs < 8 && this.stableFrames > 300;
    if (!canUpgrade) return stepsPerFrame;
    if (stepsPerFrame < requestedStepsPerFrame) {
      stepsPerFrame += 1;
      this.note(`headroom recovered; spf ${stepsPerFrame}/${requestedStepsPerFrame}`, normalizedMetrics, stepsPerFrame);
      return stepsPerFrame;
    }
    if (this.trailScale < 1) {
      this.trailScale = Math.min(1, this.trailScale + 0.08);
      this.note(`headroom recovered; trail ${Math.round(this.trailScale * 100)}%`, normalizedMetrics, stepsPerFrame);
      return stepsPerFrame;
    }
    if (this.currentMode === 'performance') this.setMode('balanced', 'auto');
    else if (this.currentMode === 'balanced') this.setMode('cinematic', 'auto');
    return stepsPerFrame;
  }

  /** User-facing Poincaré memory cap for the active profile. */
  effectivePoincareCap(): number {
    return poincareCapForMode(this.currentMode, compactViewport());
  }

  effectiveTrailLength(): number {
    const raw = dom.num('trailLen', 1200);
    const requested = Number.isFinite(raw) ? Math.max(2, Math.round(raw)) : 1200;
    const cap = this.profile().trailCap;
    const adaptive = Math.max(2, Math.round(requested * this.trailScale));
    return compactViewport() ? Math.min(adaptive, 520, cap) : Math.min(adaptive, cap);
  }

  sidePlotInterval(sidePlotMs: number): number {
    const sidePlotPressure = Number.isFinite(sidePlotMs) && sidePlotMs > 14 ? 2 : 1;
    const effective = this.profile().sideInterval * sidePlotPressure;
    return compactViewport() ? Math.max(4, effective) : effective;
  }

  private note(reason: string, metrics: QualityMetrics, stepsPerFrame: number): void {
    this.currentReason = reason;
    recordCanvasQualityEvent({
      dprCap: getCanvasDprCap(),
      reason,
      fps: metrics.fps,
      physicsMs: metrics.physicsMs,
      renderMs: metrics.renderMs,
      sidePlotMs: metrics.sidePlotMs,
      stepsPerFrame
    });
    dom.setText('dQualityReason', reason);
    dom.el('dQuality')?.setAttribute('title', reason);
  }
}
