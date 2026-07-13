import type { Ctx2D, Rect } from './types';
import { DARK_THEME, OKABE_ITO, type VizTheme } from './palette';
import { DEFAULT_PADDING, drawFrame, innerRect, makeScale } from './scales';

/**
 * Lyapunov convergence plot: the running maximal-exponent estimate against the
 * renormalization index (or time). A converged estimate flattens out; a value
 * settling above zero is the visual signature of chaos. Pairs with
 * `maximalLyapunov(...).convergence`.
 */

export interface LyapunovPlotOptions {
  theme?: VizTheme;
  /** If set, x-axis is labeled in time using renormEvery*dt per sample. */
  timePerSample?: number;
}

export function renderLyapunovConvergence(
  ctx: Ctx2D,
  rect: Rect,
  convergence: readonly number[],
  options: LyapunovPlotOptions = {}
): void {
  const theme = options.theme ?? DARK_THEME;
  const inner = innerRect(rect, DEFAULT_PADDING);
  const n = convergence.length;

  let lo = 0;
  let hi = 0;
  for (const v of convergence) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === hi) {
    lo -= 0.1;
    hi += 0.1;
  }
  const pad = (hi - lo) * 0.1;
  const dt = options.timePerSample ?? 1;
  const xScale = makeScale(0, Math.max(1, (n - 1) * dt), inner.x, inner.x + inner.width);
  const yScale = makeScale(lo - pad, hi + pad, inner.y + inner.height, inner.y);
  drawFrame(ctx, rect, inner, xScale, yScale, theme, {
    xLabel: options.timePerSample ? 'time' : 'renorm #',
    yLabel: 'λ_max estimate'
  });

  // Zero reference line.
  if (lo - pad <= 0 && hi + pad >= 0) {
    ctx.save();
    ctx.strokeStyle = theme.axis;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    const zeroY = yScale.map(0);
    ctx.beginPath();
    ctx.moveTo(inner.x, zeroY);
    ctx.lineTo(inner.x + inner.width, zeroY);
    ctx.stroke();
    ctx.restore();
  }

  // Convergence curve.
  ctx.save();
  ctx.strokeStyle = OKABE_ITO.bluishGreen;
  ctx.lineWidth = 1.75;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < n; i += 1) {
    const v = convergence[i];
    if (v === undefined || !Number.isFinite(v)) continue;
    const px = xScale.map(i * dt);
    const py = yScale.map(v);
    if (!started) {
      ctx.moveTo(px, py);
      started = true;
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();

  // Final value marker + label.
  if (n > 0) {
    const final = convergence[n - 1]!;
    ctx.fillStyle = theme.text;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillText(`λ_max ≈ ${final.toFixed(4)}`, inner.x + inner.width - 6, inner.y + 4);
  }
  ctx.restore();
}
