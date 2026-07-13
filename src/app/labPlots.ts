import type { Ctx2D, Rect } from '../viz/types';
import { DARK_THEME, OKABE_ITO } from '../viz';

/**
 * The two Lab plots not already covered by `viz/`: the phase portrait
 * (θ vs ω trajectory) and the FFT magnitude spectrum. Both target the
 * structural `Ctx2D`, so they unit-test in Node against a stub context.
 */

export interface PhaseSample {
  theta: number;
  omega: number;
}

export interface PhasePortraitOptions {
  thetaRange?: [number, number];
  omegaRange?: [number, number];
  color?: string;
  background?: string;
}

export function renderPhasePortrait(
  ctx: Ctx2D,
  rect: Rect,
  samples: readonly PhaseSample[],
  options: PhasePortraitOptions = {}
): void {
  const [xmin, xmax] = options.thetaRange ?? [-Math.PI, Math.PI];
  const [ymin, ymax] = options.omegaRange ?? [-25, 25];
  const mapX = (t: number) => rect.x + ((t - xmin) / (xmax - xmin)) * rect.width;
  const mapY = (w: number) => rect.y + rect.height - ((w - ymin) / (ymax - ymin)) * rect.height;

  ctx.save();
  ctx.fillStyle = options.background ?? '#05080d';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  // Axes through the origin.
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mapX(0), rect.y);
  ctx.lineTo(mapX(0), rect.y + rect.height);
  ctx.moveTo(rect.x, mapY(0));
  ctx.lineTo(rect.x + rect.width, mapY(0));
  ctx.stroke();

  if (samples.length >= 2) {
    ctx.strokeStyle = options.color ?? OKABE_ITO.bluishGreen;
    ctx.lineWidth = 1.1;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    for (const s of samples) {
      const px = mapX(s.theta);
      const py = mapY(s.omega);
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

export interface SpectrumPlotOptions {
  /** Use a log magnitude axis (matches the legacy log-Hann FFT view). */
  log?: boolean;
  color?: string;
  background?: string;
  nyquist?: number;
}

export function renderSpectrum(
  ctx: Ctx2D,
  rect: Rect,
  mags: readonly number[],
  options: SpectrumPlotOptions = {}
): void {
  ctx.save();
  ctx.fillStyle = options.background ?? '#05080d';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const n = mags.length;
  if (n >= 2) {
    const transform = options.log ? (m: number) => Math.log10(m + 1e-9) : (m: number) => m;
    let lo = Infinity;
    let hi = -Infinity;
    for (const m of mags) {
      const v = transform(m);
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo) || hi - lo < 1e-12) {
      lo = 0;
      hi = 1;
    }
    const mapX = (i: number) => rect.x + (i / (n - 1)) * rect.width;
    const mapY = (m: number) => rect.y + rect.height - ((transform(m) - lo) / (hi - lo)) * (rect.height - 6) - 3;

    ctx.fillStyle = 'rgba(0,150,220,0.10)';
    ctx.beginPath();
    ctx.moveTo(rect.x, rect.y + rect.height);
    for (let i = 0; i < n; i += 1) ctx.lineTo(mapX(i), mapY(mags[i]!));
    ctx.lineTo(rect.x + rect.width, rect.y + rect.height);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = options.color ?? OKABE_ITO.skyBlue;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const px = mapX(i);
      const py = mapY(mags[i]!);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  if (options.nyquist !== undefined) {
    ctx.fillStyle = DARK_THEME.axis;
    ctx.font = '8px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(`0 — ${options.nyquist.toFixed(1)} Hz`, rect.x + 4, rect.y + 3);
  }
  ctx.restore();
}

export interface LineSeries {
  color: string;
  values: readonly number[];
}

export interface MultiLineOptions {
  log?: boolean;
  background?: string;
}

/**
 * Overlay of several equal-length (in x) line series on a shared y-scale, with an
 * optional log10 y transform. Used by the integrator-comparison panels
 * (energy drift, divergence). Pure / Ctx2D-testable.
 */
export function renderMultiLine(
  ctx: Ctx2D,
  rect: Rect,
  series: readonly LineSeries[],
  options: MultiLineOptions = {}
): void {
  ctx.save();
  ctx.fillStyle = options.background ?? '#05080d';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const transform = options.log ? (v: number) => Math.log10(Math.max(v, 1e-30)) : (v: number) => v;
  let lo = Infinity;
  let hi = -Infinity;
  let maxLen = 0;
  for (const s of series) {
    maxLen = Math.max(maxLen, s.values.length);
    for (const v of s.values) {
      const t = transform(v);
      if (!Number.isFinite(t)) continue;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
  }
  if (!Number.isFinite(lo) || hi - lo < 1e-12) {
    lo = 0;
    hi = 1;
  }
  if (maxLen >= 2) {
    const mapX = (i: number) => rect.x + (i / (maxLen - 1)) * rect.width;
    const mapY = (v: number) => rect.y + rect.height - ((transform(v) - lo) / (hi - lo)) * (rect.height - 6) - 3;
    ctx.lineWidth = 1.25;
    ctx.lineJoin = 'round';
    for (const s of series) {
      if (s.values.length < 2) continue;
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < s.values.length; i += 1) {
        const v = s.values[i]!;
        if (!Number.isFinite(transform(v))) continue;
        const px = mapX(i);
        const py = mapY(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

export interface ScatterPathOptions {
  color?: string;
  background?: string;
  /** Draw a faint marker at the origin (0,0) when it lies inside the data range. */
  markOrigin?: boolean;
}

/**
 * Auto-scaled 2-D path/scatter of paired (x, y) samples drawn as a connected
 * line. Used for the 0–1 test translation trajectory (p_c, q_c): a bounded blob
 * means regular dynamics, a Brownian-like wandering means chaos. Pure / Ctx2D.
 */
export function renderScatterPath(
  ctx: Ctx2D,
  rect: Rect,
  xs: readonly number[],
  ys: readonly number[],
  options: ScatterPathOptions = {}
): void {
  ctx.save();
  ctx.fillStyle = options.background ?? '#05080d';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const n = Math.min(xs.length, ys.length);
  if (n >= 2) {
    let xmin = Infinity;
    let xmax = -Infinity;
    let ymin = Infinity;
    let ymax = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const x = xs[i] ?? 0;
      const y = ys[i] ?? 0;
      if (x < xmin) xmin = x;
      if (x > xmax) xmax = x;
      if (y < ymin) ymin = y;
      if (y > ymax) ymax = y;
    }
    // Keep aspect square so a bounded blob actually looks bounded.
    const span = Math.max(xmax - xmin, ymax - ymin, 1e-9);
    const cx = (xmin + xmax) / 2;
    const cy = (ymin + ymax) / 2;
    const pad = 8;
    const half = span / 2;
    const mapX = (x: number) => rect.x + pad + ((x - (cx - half)) / span) * (rect.width - 2 * pad);
    const mapY = (y: number) => rect.y + rect.height - pad - ((y - (cy - half)) / span) * (rect.height - 2 * pad);

    if (options.markOrigin && cx - half <= 0 && 0 <= cx + half && cy - half <= 0 && 0 <= cy + half) {
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mapX(0), rect.y);
      ctx.lineTo(mapX(0), rect.y + rect.height);
      ctx.moveTo(rect.x, mapY(0));
      ctx.lineTo(rect.x + rect.width, mapY(0));
      ctx.stroke();
    }

    ctx.strokeStyle = options.color ?? OKABE_ITO.skyBlue;
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const px = mapX(xs[i] ?? 0);
      const py = mapY(ys[i] ?? 0);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export interface HistogramOptions {
  bins?: number;
  color?: string;
  background?: string;
  /** Fixed value range; defaults to the data min/max. */
  range?: [number, number];
  label?: string;
}

/**
 * Histogram of a scalar sample set (equal-width bins). Used for the distribution
 * of CLV hyperbolicity angles. Pure / Ctx2D-testable.
 */
export function renderHistogram(
  ctx: Ctx2D,
  rect: Rect,
  values: readonly number[],
  options: HistogramOptions = {}
): void {
  ctx.save();
  ctx.fillStyle = options.background ?? '#05080d';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const finite = values.filter((v) => Number.isFinite(v));
  const bins = Math.max(1, options.bins ?? 24);
  if (finite.length >= 1) {
    let lo = options.range ? options.range[0] : Math.min(...finite);
    let hi = options.range ? options.range[1] : Math.max(...finite);
    if (hi - lo < 1e-12) {
      lo -= 0.5;
      hi += 0.5;
    }
    const counts = new Array<number>(bins).fill(0);
    for (const v of finite) {
      let b = Math.floor(((v - lo) / (hi - lo)) * bins);
      if (b < 0) b = 0;
      if (b >= bins) b = bins - 1;
      counts[b] = (counts[b] ?? 0) + 1;
    }
    const maxCount = Math.max(1, ...counts);
    const pad = 4;
    const slot = (rect.width - 2 * pad) / bins;
    ctx.fillStyle = options.color ?? OKABE_ITO.bluishGreen;
    for (let i = 0; i < bins; i += 1) {
      const h = ((counts[i] ?? 0) / maxCount) * (rect.height - 16);
      ctx.fillRect(rect.x + pad + i * slot + 0.5, rect.y + rect.height - 4 - h, Math.max(1, slot - 1), h);
    }
    if (options.label) {
      ctx.fillStyle = DARK_THEME.text;
      ctx.font = '9px ui-monospace, monospace';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(options.label, rect.x + 6, rect.y + 4);
    }
  }
  ctx.restore();
}

export interface LabelGridOptions {
  /** Fill colours indexed by label; index past the end falls back to a neutral grey. */
  colors?: string[];
  background?: string;
}

/**
 * Render a row-major integer label grid (e.g. the double-pendulum flip basin) as
 * a coloured image stretched to fill `rect`. Pure / Ctx2D-testable.
 */
export function renderLabelGrid(
  ctx: Ctx2D,
  rect: Rect,
  labels: ArrayLike<number>,
  width: number,
  height: number,
  options: LabelGridOptions = {}
): void {
  ctx.save();
  ctx.fillStyle = options.background ?? '#05080d';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  if (width > 0 && height > 0 && labels.length >= width * height) {
    const colors = options.colors ?? [OKABE_ITO.vermillion, OKABE_ITO.skyBlue, '#10151d'];
    const cw = rect.width / width;
    const ch = rect.height / height;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const label = labels[y * width + x] ?? 0;
        ctx.fillStyle = colors[label] ?? '#3a4150';
        // +1 px overdraw avoids seams from fractional cell sizes.
        ctx.fillRect(rect.x + x * cw, rect.y + y * ch, cw + 1, ch + 1);
      }
    }
  }
  ctx.restore();
}

export interface ScalarFieldOptions {
  /** Fixed value range; defaults to the data min/max. */
  range?: [number, number];
  background?: string;
}

/**
 * Render a row-major scalar field (e.g. an FTLE field) as a heatmap stretched to
 * fill `rect`, using a perceptual blue→cyan→yellow→red ramp. Pure / Ctx2D.
 */
export function renderScalarField(
  ctx: Ctx2D,
  rect: Rect,
  values: ArrayLike<number>,
  width: number,
  height: number,
  options: ScalarFieldOptions = {}
): void {
  ctx.save();
  ctx.fillStyle = options.background ?? '#05080d';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  if (width > 0 && height > 0 && values.length >= width * height) {
    let lo = options.range ? options.range[0] : Infinity;
    let hi = options.range ? options.range[1] : -Infinity;
    if (!options.range) {
      for (let i = 0; i < width * height; i += 1) {
        const v = values[i] ?? 0;
        if (!Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    if (!Number.isFinite(lo) || hi - lo < 1e-12) {
      lo = 0;
      hi = 1;
    }
    const cw = rect.width / width;
    const ch = rect.height / height;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const v = values[y * width + x] ?? 0;
        const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
        ctx.fillStyle = heatColor(t);
        ctx.fillRect(rect.x + x * cw, rect.y + y * ch, cw + 1, ch + 1);
      }
    }
  }
  ctx.restore();
}

/** Blue→cyan→yellow→red ramp for t ∈ [0,1]. */
function heatColor(t: number): string {
  // Four-stop interpolation.
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [12, 24, 56]],
    [0.34, [24, 170, 220]],
    [0.67, [240, 220, 60]],
    [1.0, [220, 50, 40]]
  ];
  let a = stops[0]!;
  let b = stops[stops.length - 1]!;
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (t >= stops[i]![0] && t <= stops[i + 1]![0]) {
      a = stops[i]!;
      b = stops[i + 1]!;
      break;
    }
  }
  const span = b[0] - a[0] || 1;
  const f = (t - a[0]) / span;
  const r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * f);
  const g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * f);
  const bl = Math.round(a[1][2] + (b[1][2] - a[1][2]) * f);
  return `rgb(${r},${g},${bl})`;
}

export interface SpectrumBarsOptions {
  background?: string;
}

/**
 * Bar chart of a Lyapunov spectrum: one bar per exponent, drawn up (positive) or
 * down (negative) from a zero line, with the value labeled. Positive bars (chaos)
 * are warm; non-positive bars are cool.
 */
export function renderSpectrumBars(
  ctx: Ctx2D,
  rect: Rect,
  values: readonly number[],
  options: SpectrumBarsOptions = {}
): void {
  ctx.save();
  ctx.fillStyle = options.background ?? '#05080d';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const n = values.length;
  if (n === 0) {
    ctx.restore();
    return;
  }
  let mag = 1e-9;
  for (const v of values) mag = Math.max(mag, Math.abs(v));
  const midY = rect.y + rect.height / 2;

  // Zero reference line.
  ctx.strokeStyle = DARK_THEME.axis;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rect.x, midY);
  ctx.lineTo(rect.x + rect.width, midY);
  ctx.stroke();

  const slot = rect.width / n;
  const barW = slot * 0.6;
  const maxBar = rect.height / 2 - 14;
  ctx.font = '9px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i += 1) {
    const v = values[i]!;
    const cx = rect.x + slot * (i + 0.5);
    const h = (Math.abs(v) / mag) * maxBar;
    ctx.fillStyle = v > 0 ? OKABE_ITO.vermillion : OKABE_ITO.skyBlue;
    if (v >= 0) ctx.fillRect(cx - barW / 2, midY - h, barW, h);
    else ctx.fillRect(cx - barW / 2, midY, barW, h);
    ctx.fillStyle = DARK_THEME.text;
    ctx.fillText(`λ${i + 1}`, cx, v >= 0 ? midY + 8 : midY - 8);
    ctx.fillText(v.toFixed(3), cx, v >= 0 ? midY - h - 8 : midY + h + 8);
  }
  ctx.restore();
}
