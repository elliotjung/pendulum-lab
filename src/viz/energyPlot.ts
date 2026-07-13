import type { Ctx2D, Rect } from './types';
import { DARK_THEME, type VizTheme } from './palette';

/**
 * Live energy and energy-drift plots. The Lab side plot follows the original
 * single-file visual style: black field, center zero line, thin cyan/orange
 * relative-drift trace. A faint total-energy trace remains as a modular
 * improvement, but it no longer dominates the legacy delta-E view.
 */

export interface EnergySeries {
  time: NumericSeries;
  total: NumericSeries;
  drift: NumericSeries;
}

export interface EnergyPlotOptions {
  theme?: VizTheme;
}

type NumericSeries = readonly number[] | Float32Array | Float64Array;

function extent(values: NumericSeries): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!Number.isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo - 1, hi + 1];
  return [lo, hi];
}

function finiteAbsMax(values: NumericSeries, fallback: number): number {
  let max = fallback;
  for (const v of values) {
    if (Number.isFinite(v)) max = Math.max(max, Math.abs(v));
  }
  return max;
}

export function renderEnergyPlot(ctx: Ctx2D, rect: Rect, series: EnergySeries, options: EnergyPlotOptions = {}): void {
  const theme = options.theme ?? DARK_THEME;
  const n = Math.min(series.time.length, series.drift.length);

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  if (n < 2) {
    ctx.restore();
    return;
  }

  const midY = rect.y + rect.height / 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rect.x, midY);
  ctx.lineTo(rect.x + rect.width, midY);
  ctx.stroke();

  const xAt = (i: number): number => rect.x + (i / (n - 1)) * rect.width;

  if (series.total.length >= 2) {
    const [eLo, eHi] = extent(series.total.slice(0, n));
    if (eHi > eLo) {
      ctx.strokeStyle = 'rgba(96,160,208,0.24)';
      ctx.lineWidth = 0.8;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) {
        const e = series.total[i] ?? eLo;
        const y = rect.y + rect.height - ((e - eLo) / (eHi - eLo)) * (rect.height - 10) - 5;
        if (i) ctx.lineTo(xAt(i), y);
        else ctx.moveTo(xAt(i), y);
      }
      ctx.stroke();
    }
  }

  const driftMax = finiteAbsMax(series.drift.slice(0, n), 1e-14);
  ctx.strokeStyle = driftMax > 1e-4 ? '#ff7a30' : '#00d4ff';
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const drift = series.drift[i] ?? 0;
    const y = midY - (drift / driftMax) * (rect.height / 2 - 5);
    if (i) ctx.lineTo(xAt(i), y);
    else ctx.moveTo(xAt(i), y);
  }
  ctx.stroke();

  ctx.fillStyle = theme.axis;
  ctx.font = '8px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(`+-${driftMax.toExponential(1)}`, rect.x + 3, rect.y + 3);
  ctx.restore();
}

export interface DriftGaugeOptions {
  theme?: VizTheme;
  /** Drift value treated as the warning edge of the gauge (default 1e-3). */
  tolerance?: number;
}

export function renderDriftGauge(ctx: Ctx2D, rect: Rect, drift: number, options: DriftGaugeOptions = {}): void {
  const theme = options.theme ?? DARK_THEME;
  const tol = options.tolerance ?? 1e-3;
  ctx.save();
  ctx.fillStyle = theme.background;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const decades = 3;
  const value = Math.max(
    0,
    Math.min(1, (Math.log10(Math.max(drift, 1e-30)) - Math.log10(tol / 10 ** decades)) / decades)
  );
  const barX = rect.x + 2;
  const barW = rect.width - 4;
  const barY = rect.y + 2;
  const barH = rect.height - 4;

  ctx.fillStyle = theme.grid;
  ctx.fillRect(barX, barY, barW, barH);
  const overTol = drift >= tol;
  ctx.fillStyle = overTol ? theme.warn : theme.good;
  ctx.fillRect(barX, barY, barW * value, barH);

  ctx.fillStyle = theme.text;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`drift ${drift.toExponential(2)}`, barX + 6, rect.y + rect.height / 2);
  ctx.restore();
}
