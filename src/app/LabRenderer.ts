import type { Ctx2D } from '../viz/types';
import type { Point2D } from '../viz/poincare';
import type { BobPosition } from './LabSimulation';

/**
 * Canvas renderer for the Lab pendulum. Geometry reproduces the legacy `#main`
 * view: pivot at (width/2, height*0.38), 110 px/m by default, and theta=0
 * hanging straight down. The visual treatment intentionally mirrors the
 * original single-file renderer: long colored trail buckets, cyan ensemble
 * traces, translucent rods, and glowing bobs.
 */

export interface LabRenderOptions {
  width: number;
  height: number;
  /** Pixels per metre. Default 110 matches the legacy runtime (CONSTS.SCALE). */
  scale?: number;
  /** Vertical pivot position as a fraction of height. Default 0.38 (legacy). */
  pivotYFraction?: number;
  background?: string;
  /** Per-frame background fade alpha (motion-blur trail). Default 0.12. */
  fade?: number;
  trailColorOld?: string;
  trailColorNew?: string;
  rodColor?: string;
}

export interface LabDrawExtras {
  fade?: number;
  ensembleTips?: readonly Point2D[];
  trailColor?: string;
  trailMode?: string;
  trailLength?: number;
  skipTrail?: boolean;
  glow?: boolean;
}

interface TrailBuffer {
  buf: Float32Array;
  idx: number;
  filled: number;
}

type TrailLayerCanvas = HTMLCanvasElement | OffscreenCanvas;
type TrailLayerContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type DrawableCtx = Ctx2D & {
  drawImage?: (image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => void;
};

const BOB_COLORS = ['#60a0d0', '#00d4ff', '#00d4ff'];
const TRIPLE_BOB_COLORS = ['#90a0b8', '#60c0ff', '#00d4ff'];
const ENSEMBLE_TRAIL_CAP = 200;
const FULL_CIRCLE = Math.PI * 2;
const LAYER_TRAIL_THRESHOLD = 1400;

export class LabRenderer {
  private readonly ctx: Ctx2D;
  private readonly opts: Required<LabRenderOptions>;
  private trail: TrailBuffer = { buf: new Float32Array(0), idx: 0, filled: 0 };
  private ensembleTrails: TrailBuffer[] = [];
  private pixelsScratch: Point2D[] = [];
  private trailLayer: TrailLayerCanvas | null = null;
  private trailLayerCtx: TrailLayerContext | null = null;
  private lastTrailTip: Point2D | null = null;

  constructor(ctx: Ctx2D, options: LabRenderOptions) {
    this.ctx = ctx;
    this.opts = {
      scale: 110,
      pivotYFraction: 0.38,
      background: '#07090d',
      fade: 0.12,
      trailColorOld: '#13243a',
      trailColorNew: '#00d4ff',
      rodColor: 'rgba(160,185,220,0.5)',
      ...options
    };
  }

  /** Logical canvas size in CSS pixels, not the high-DPI backing-store size. */
  size(): { width: number; height: number } {
    return { width: this.opts.width, height: this.opts.height };
  }

  /** Number of stored main-trail points, used by diagnostics and resize regression tests. */
  trailPointCount(): number {
    return this.trail.filled;
  }

  /**
   * Resize the logical drawing surface without treating it as a physics reset.
   * Changing a canvas backing store clears its pixels; preserving and rescaling
   * the trail buffer keeps side-panel collapse/expand from looking like the
   * pendulum restarted.
   */
  resize(options: Pick<LabRenderOptions, 'width' | 'height'>): void {
    const oldWidth = this.opts.width;
    const oldHeight = this.opts.height;
    const nextWidth = Math.max(1, options.width);
    const nextHeight = Math.max(1, options.height);
    if (oldWidth === nextWidth && oldHeight === nextHeight) return;

    const sx = nextWidth / Math.max(1, oldWidth);
    const sy = nextHeight / Math.max(1, oldHeight);
    this.scaleTrail(this.trail, sx, sy);
    for (const trail of this.ensembleTrails) this.scaleTrail(trail, sx, sy);
    this.opts.width = nextWidth;
    this.opts.height = nextHeight;
  }

  /** Pivot pixel position. */
  pivot(): Point2D {
    return { x: this.opts.width / 2, y: this.opts.height * this.opts.pivotYFraction };
  }

  /** Map a bob position in metres to canvas pixels. */
  toPixels(bob: BobPosition): Point2D {
    return this.toPixelsInto(bob, { x: 0, y: 0 });
  }

  toPixelsInto(bob: BobPosition, out: Point2D): Point2D {
    return this.toPixelsXYInto(bob.x, bob.y, out);
  }

  toPixelsXYInto(x: number, y: number, out: Point2D): Point2D {
    out.x = this.opts.width / 2 + x * this.opts.scale;
    out.y = this.opts.height * this.opts.pivotYFraction + y * this.opts.scale;
    return out;
  }

  /** Clear to the background colour (used for a hard reset, e.g. on trail clear). */
  clear(): void {
    this.ctx.save();
    this.ctx.fillStyle = this.opts.background;
    this.ctx.fillRect(0, 0, this.opts.width, this.opts.height);
    this.ctx.restore();
    this.trail = { buf: new Float32Array(0), idx: 0, filled: 0 };
    this.ensembleTrails = [];
    this.lastTrailTip = null;
    this.clearTrailLayer();
  }

  draw(bobsMeters: readonly BobPosition[], extras: LabDrawExtras = {}): void {
    const ctx = this.ctx;
    const { width, height } = this.opts;
    const fade = extras.skipTrail ? 1 : extras.fade ?? this.opts.fade;

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.opts.background;
    ctx.globalAlpha = fade;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.restore();

    const pivot = this.pivot();
    this.pixelsScratch.length = bobsMeters.length;
    for (let i = 0; i < bobsMeters.length; i += 1) {
      const p = this.pixelsScratch[i] ?? { x: 0, y: 0 };
      this.toPixelsInto(bobsMeters[i]!, p);
      this.pixelsScratch[i] = p;
    }
    const pixels = this.pixelsScratch;
    const tip = pixels[pixels.length - 1];

    if (!extras.skipTrail && tip) {
      const trailLength = Math.max(2, Math.round(extras.trailLength ?? 1500));
      this.pushTrail(this.trail, tip.x, tip.y, trailLength);
      if (!this.drawLayerTrail(tip, trailLength, extras.trailMode ?? 'rainbow', extras.trailColor)) {
        this.drawMainTrail(extras.trailMode ?? 'rainbow', extras.trailColor);
      }
    } else if (extras.skipTrail) {
      this.trail.idx = 0;
      this.trail.filled = 0;
      this.lastTrailTip = null;
      this.clearTrailLayer();
    }

    if (extras.ensembleTips && extras.ensembleTips.length > 0) {
      this.drawEnsemble(extras.ensembleTips);
    }

    ctx.save();
    ctx.strokeStyle = this.opts.rodColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pivot.x, pivot.y);
    for (const p of pixels) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(144,160,184,0.6)';
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, 4, 0, FULL_CIRCLE);
    ctx.fill();
    ctx.restore();

    const colors = pixels.length >= 3 ? TRIPLE_BOB_COLORS : BOB_COLORS;
    pixels.forEach((p, i) => {
      ctx.save();
      const color = colors[i] ?? '#00d4ff';
      this.setShadow(color, extras.glow ? 24 : 0);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.bobRadius(i, pixels.length), 0, FULL_CIRCLE);
      ctx.fill();
      ctx.restore();
    });
  }

  private bobRadius(index: number, count: number): number {
    if (count >= 3) return [5, 5, 6][index] ?? 5;
    return index === 0 ? 4.5 : 5;
  }

  private setShadow(color: string, blur: number): void {
    const fx = this.ctx as Ctx2D & { shadowColor?: string; shadowBlur?: number };
    fx.shadowColor = color;
    fx.shadowBlur = blur;
  }

  private trailColor(frac: number, mode: string, alpha = 1): string {
    const h = Math.floor(frac * 360);
    const a = alpha.toFixed(2);
    switch (mode) {
      case 'rainbow':
        return `hsla(${h},90%,58%,${a})`;
      case 'heat': {
        const r = Math.min(255, Math.floor(frac * 2 * 255));
        const g = Math.max(0, Math.floor((frac - 0.5) * 2 * 255));
        return `rgba(${r},${g},0,${a})`;
      }
      case 'ice':
        return `hsla(${200 + frac * 60},80%,${50 + frac * 30}%,${a})`;
      case 'plasma':
        return `hsla(${280 - frac * 200},80%,${40 + frac * 30}%,${a})`;
      case 'white':
        return `rgba(255,255,255,${(frac * 0.7 + 0.1).toFixed(2)})`;
      case 'green':
        return `hsla(135,80%,${35 + frac * 35}%,${a})`;
      default:
        return alpha < 1 ? `hsla(${h},85%,55%,${a})` : this.opts.trailColorNew;
    }
  }

  private pushTrail(target: TrailBuffer, x: number, y: number, cap: number): void {
    if (target.buf.length !== cap * 2) {
      target.buf = new Float32Array(cap * 2);
      target.idx = 0;
      target.filled = 0;
    }
    target.buf[target.idx * 2] = x;
    target.buf[target.idx * 2 + 1] = y;
    target.idx = (target.idx + 1) % cap;
    if (target.filled < cap) target.filled += 1;
  }

  private scaleTrail(target: TrailBuffer, sx: number, sy: number): void {
    for (let i = 0; i < target.filled; i += 1) {
      target.buf[i * 2] = (target.buf[i * 2] ?? 0) * sx;
      target.buf[i * 2 + 1] = (target.buf[i * 2 + 1] ?? 0) * sy;
    }
  }

  private drawMainTrail(mode: string, fallbackColor?: string): void {
    const { buf, filled } = this.trail;
    if (filled < 2) return;
    const ctx = this.ctx;
    const cap = buf.length / 2;
    const start = (this.trail.idx - filled + cap) % cap;
    const stride = Math.max(1, Math.ceil(filled / 1200));
    const buckets = filled > 1600 ? 6 : 8;

    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (let b = 0; b < buckets; b += 1) {
      const f0 = b / buckets;
      const f1 = (b + 1) / buckets;
      const fmid = (f0 + f1) / 2;
      ctx.strokeStyle = fallbackColor && mode === 'fixed' ? fallbackColor : this.trailColor(fmid, mode, fmid * 0.85 + 0.1);
      ctx.beginPath();
      const first = Math.max(1, Math.floor(f0 * filled));
      const last = Math.min(filled - 1, Math.max(first, Math.ceil(f1 * filled) - 1));
      for (let i = first; i <= last; i += stride) {
        const i0 = (start + i - 1) % cap;
        const i1 = (start + i) % cap;
        if (i === first) ctx.moveTo(buf[i0 * 2]!, buf[i0 * 2 + 1]!);
        ctx.lineTo(buf[i1 * 2]!, buf[i1 * 2 + 1]!);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawLayerTrail(tip: Point2D, trailLength: number, mode: string, fallbackColor?: string): boolean {
    if (trailLength < LAYER_TRAIL_THRESHOLD) return false;
    const drawCtx = this.ctx as DrawableCtx;
    if (typeof drawCtx.drawImage !== 'function') return false;
    const layerCtx = this.ensureTrailLayer();
    if (!layerCtx || !this.trailLayer) return false;

    const fadeAlpha = Math.max(0.006, Math.min(0.045, 22 / trailLength));
    layerCtx.save();
    layerCtx.globalCompositeOperation = 'destination-out';
    layerCtx.fillStyle = `rgba(0,0,0,${fadeAlpha.toFixed(4)})`;
    layerCtx.fillRect(0, 0, this.opts.width, this.opts.height);
    layerCtx.restore();

    if (this.lastTrailTip) {
      layerCtx.save();
      layerCtx.globalCompositeOperation = 'source-over';
      layerCtx.strokeStyle = fallbackColor && mode === 'fixed' ? fallbackColor : this.trailColor(1, mode, 0.86);
      layerCtx.lineWidth = 1.4;
      layerCtx.lineCap = 'round';
      layerCtx.beginPath();
      layerCtx.moveTo(this.lastTrailTip.x, this.lastTrailTip.y);
      layerCtx.lineTo(tip.x, tip.y);
      layerCtx.stroke();
      layerCtx.restore();
    }
    this.lastTrailTip = { x: tip.x, y: tip.y };

    drawCtx.save();
    drawCtx.drawImage(this.trailLayer as CanvasImageSource, 0, 0, this.opts.width, this.opts.height);
    drawCtx.restore();
    return true;
  }

  private ensureTrailLayer(): TrailLayerContext | null {
    if (this.trailLayer && this.trailLayer.width === this.opts.width && this.trailLayer.height === this.opts.height) return this.trailLayerCtx;

    const layer = createTrailLayer(this.opts.width, this.opts.height);
    if (!layer) return null;
    const ctx = layer.getContext('2d') as TrailLayerContext | null;
    if (!ctx) return null;
    this.trailLayer = layer;
    this.trailLayerCtx = ctx;
    this.lastTrailTip = null;
    return ctx;
  }

  private clearTrailLayer(): void {
    if (!this.trailLayerCtx) return;
    this.trailLayerCtx.clearRect(0, 0, this.opts.width, this.opts.height);
  }

  private drawEnsemble(tips: readonly Point2D[]): void {
    const ctx = this.ctx;
    if (this.ensembleTrails.length !== tips.length) {
      this.ensembleTrails = Array.from({ length: tips.length }, () => ({ buf: new Float32Array(0), idx: 0, filled: 0 }));
    }

    ctx.save();
    for (let n = 0; n < tips.length; n += 1) {
      const p = tips[n]!;
      const trail = this.ensembleTrails[n]!;
      this.pushTrail(trail, p.x, p.y, ENSEMBLE_TRAIL_CAP);
      if (trail.filled > 1) {
        const cap = trail.buf.length / 2;
        const start = (trail.idx - trail.filled + cap) % cap;
        ctx.strokeStyle = 'rgba(0,212,255,0.25)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let i = 0; i < trail.filled; i += 1) {
          const ix = (start + i) % cap;
          const x = trail.buf[ix * 2]!;
          const y = trail.buf[ix * 2 + 1]!;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,212,255,0.4)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, FULL_CIRCLE);
      ctx.fill();
    }
    ctx.restore();
  }
}

function createTrailLayer(width: number, height: number): TrailLayerCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}
