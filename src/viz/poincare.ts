import type { Ctx2D, Rect } from './types';
import { DARK_THEME, OKABE_ITO, type VizTheme } from './palette';
import { DEFAULT_PADDING, drawFrame, innerRect, makeScale } from './scales';

/**
 * Interactive Poincare-section scatter view. The viewport is an explicit data
 * rectangle so the host can pan/zoom; `autoViewport` and `zoomViewport` are
 * pure helpers that compute and transform that rectangle (unit-tested without a
 * canvas).
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Viewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** Bounding viewport of the points with a fractional margin (default 5%). */
export function autoViewport(points: readonly Point2D[], margin = 0.05): Viewport {
  if (points.length === 0) return { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const p of points) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  return {
    xMin: xMin - xSpan * margin,
    xMax: xMax + xSpan * margin,
    yMin: yMin - ySpan * margin,
    yMax: yMax + ySpan * margin
  };
}

/**
 * Zoom a viewport by `factor` (<1 zooms in) about a data-space center. With no
 * center the viewport center is used.
 */
export function zoomViewport(vp: Viewport, factor: number, center?: Point2D): Viewport {
  const cx = center?.x ?? (vp.xMin + vp.xMax) / 2;
  const cy = center?.y ?? (vp.yMin + vp.yMax) / 2;
  const halfW = ((vp.xMax - vp.xMin) / 2) * factor;
  const halfH = ((vp.yMax - vp.yMin) / 2) * factor;
  return { xMin: cx - halfW, xMax: cx + halfW, yMin: cy - halfH, yMax: cy + halfH };
}

export interface PoincarePlotOptions {
  theme?: VizTheme;
  viewport?: Viewport;
  pointRadius?: number;
  color?: string;
  xLabel?: string;
  yLabel?: string;
}

export function renderPoincareSection(
  ctx: Ctx2D,
  rect: Rect,
  points: readonly Point2D[],
  options: PoincarePlotOptions = {}
): void {
  const theme = options.theme ?? DARK_THEME;
  const vp = options.viewport ?? autoViewport(points);
  const inner = innerRect(rect, DEFAULT_PADDING);
  const xScale = makeScale(vp.xMin, vp.xMax, inner.x, inner.x + inner.width);
  const yScale = makeScale(vp.yMin, vp.yMax, inner.y + inner.height, inner.y);
  drawFrame(ctx, rect, inner, xScale, yScale, theme, {
    xLabel: options.xLabel ?? 'q',
    yLabel: options.yLabel ?? 'p'
  });

  const r = options.pointRadius ?? 1.5;
  ctx.save();
  ctx.fillStyle = options.color ?? OKABE_ITO.orange;
  for (const p of points) {
    const px = xScale.map(p.x);
    const py = yScale.map(p.y);
    if (px < inner.x || px > inner.x + inner.width || py < inner.y || py > inner.y + inner.height) continue;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
