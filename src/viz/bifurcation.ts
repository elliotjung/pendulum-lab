import type { Ctx2D, Rect } from './types';
import { DARK_THEME, type VizTheme } from './palette';
import { DEFAULT_PADDING, drawFrame, innerRect, makeScale } from './scales';

/**
 * Bifurcation-diagram raster: one column of observable samples per swept
 * parameter, plotted as a dense point cloud. Pairs with
 * `bifurcationDiagram(...)` from src/chaos.
 */

export interface BifurcationColumnData {
  param: number;
  values: readonly number[];
}

export interface BifurcationPlotOptions {
  theme?: VizTheme;
  /** Clip the value axis to this central quantile to suppress outliers (0..1). */
  valueQuantile?: number;
  pointSize?: number;
  color?: string;
  xLabel?: string;
  yLabel?: string;
}

function quantileExtent(values: number[], q: number): [number, number] {
  if (values.length === 0) return [0, 1];
  const sorted = [...values].sort((a, b) => a - b);
  const loIdx = Math.floor(((1 - q) / 2) * (sorted.length - 1));
  const hiIdx = Math.ceil((1 - (1 - q) / 2) * (sorted.length - 1));
  const lo = sorted[loIdx] ?? sorted[0]!;
  const hi = sorted[hiIdx] ?? sorted[sorted.length - 1]!;
  return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
}

export function renderBifurcation(
  ctx: Ctx2D,
  rect: Rect,
  columns: readonly BifurcationColumnData[],
  options: BifurcationPlotOptions = {}
): void {
  const theme = options.theme ?? DARK_THEME;
  const inner = innerRect(rect, DEFAULT_PADDING);

  const params = columns.map((c) => c.param);
  const pMin = params.length ? Math.min(...params) : 0;
  const pMax = params.length ? Math.max(...params) : 1;
  const allValues: number[] = [];
  for (const c of columns) for (const v of c.values) if (Number.isFinite(v)) allValues.push(v);
  const [vLo, vHi] = quantileExtent(allValues, options.valueQuantile ?? 0.98);

  const xScale = makeScale(pMin, pMax, inner.x, inner.x + inner.width);
  const yScale = makeScale(vLo, vHi, inner.y + inner.height, inner.y);
  drawFrame(ctx, rect, inner, xScale, yScale, theme, {
    xLabel: options.xLabel ?? 'parameter',
    yLabel: options.yLabel ?? 'observable'
  });

  const size = options.pointSize ?? 1;
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = options.color ?? theme.accent;
  for (const col of columns) {
    const px = xScale.map(col.param);
    for (const v of col.values) {
      if (!Number.isFinite(v) || v < vLo || v > vHi) continue;
      const py = yScale.map(v);
      ctx.fillRect(px, py, size, size);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
