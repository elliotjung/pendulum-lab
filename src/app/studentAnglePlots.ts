import { DARK_THEME, OKABE_ITO } from '../viz';
import type { Ctx2D, Rect } from '../viz/types';

export interface AngleProjectionOptions {
  color?: string;
  background?: string;
}

function wrapAngle(value: number): number {
  const period = 2 * Math.PI;
  const wrapped = (value + Math.PI) % period;
  return (wrapped < 0 ? wrapped + period : wrapped) - Math.PI;
}

/** Wrapped theta-one/theta-two configuration-space projection. */
export function renderAngleProjection(
  ctx: Ctx2D,
  rect: Rect,
  theta1: ArrayLike<number>,
  theta2: ArrayLike<number>,
  options: AngleProjectionOptions = {}
): void {
  const padLeft = 22;
  const padRight = 8;
  const padTop = 8;
  const padBottom = 18;
  const width = Math.max(1, rect.width - padLeft - padRight);
  const height = Math.max(1, rect.height - padTop - padBottom);
  const left = rect.x + padLeft;
  const top = rect.y + padTop;
  const mapX = (theta: number) => left + ((theta + Math.PI) / (2 * Math.PI)) * width;
  const mapY = (theta: number) => top + height - ((theta + Math.PI) / (2 * Math.PI)) * height;

  ctx.save();
  ctx.fillStyle = options.background ?? '#05080d';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mapX(0), top);
  ctx.lineTo(mapX(0), top + height);
  ctx.moveTo(left, mapY(0));
  ctx.lineTo(left + width, mapY(0));
  ctx.stroke();

  const n = Math.min(theta1.length, theta2.length);
  if (n >= 2) {
    ctx.strokeStyle = options.color ?? OKABE_ITO.bluishGreen;
    ctx.lineWidth = 1.15;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let previousTheta1 = Number.NaN;
    let previousTheta2 = Number.NaN;
    for (let index = 0; index < n; index += 1) {
      const currentTheta1 = wrapAngle(Number(theta1[index] ?? 0));
      const currentTheta2 = wrapAngle(Number(theta2[index] ?? 0));
      if (
        index === 0 ||
        Math.abs(currentTheta1 - previousTheta1) > Math.PI ||
        Math.abs(currentTheta2 - previousTheta2) > Math.PI
      ) {
        ctx.moveTo(mapX(currentTheta1), mapY(currentTheta2));
      } else {
        ctx.lineTo(mapX(currentTheta1), mapY(currentTheta2));
      }
      previousTheta1 = currentTheta1;
      previousTheta2 = currentTheta2;
    }
    ctx.stroke();
  }

  ctx.fillStyle = DARK_THEME.axis;
  ctx.font = '8px ui-monospace, monospace';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillText('−π', left, top + height + 3);
  ctx.fillText('θ₁', left + width / 2, top + height + 3);
  ctx.fillText('π', left + width, top + height + 3);
  ctx.textAlign = 'left';
  ctx.fillText('θ₂', rect.x + 2, top + 2);
  ctx.restore();
}

export interface AngleTimeSeriesOptions {
  theta1Color?: string;
  theta2Color?: string;
  background?: string;
}

/** Draw theta-one(t) and theta-two(t) from typed rings on one shared scale. */
export function renderAngleTimeSeries(
  ctx: Ctx2D,
  rect: Rect,
  time: ArrayLike<number>,
  theta1: ArrayLike<number>,
  theta2: ArrayLike<number>,
  options: AngleTimeSeriesOptions = {}
): void {
  const padLeft = 26;
  const padRight = 8;
  const padTop = 16;
  const padBottom = 18;
  const width = Math.max(1, rect.width - padLeft - padRight);
  const height = Math.max(1, rect.height - padTop - padBottom);
  const left = rect.x + padLeft;
  const top = rect.y + padTop;
  const n = Math.min(time.length, theta1.length, theta2.length);

  ctx.save();
  ctx.fillStyle = options.background ?? '#05080d';
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  if (n >= 2) {
    const timeMin = Number(time[0] ?? 0);
    const timeMax = Number(time[n - 1] ?? timeMin + 1);
    const timeSpan = Math.max(1e-12, timeMax - timeMin);
    let valueMin = Infinity;
    let valueMax = -Infinity;
    for (let index = 0; index < n; index += 1) {
      const first = Number(theta1[index] ?? 0);
      const second = Number(theta2[index] ?? 0);
      if (Number.isFinite(first)) {
        valueMin = Math.min(valueMin, first);
        valueMax = Math.max(valueMax, first);
      }
      if (Number.isFinite(second)) {
        valueMin = Math.min(valueMin, second);
        valueMax = Math.max(valueMax, second);
      }
    }
    if (!Number.isFinite(valueMin) || valueMax - valueMin < 1e-9) {
      valueMin = -1;
      valueMax = 1;
    } else {
      const padding = Math.max(0.05, (valueMax - valueMin) * 0.08);
      valueMin -= padding;
      valueMax += padding;
    }
    const valueSpan = valueMax - valueMin;
    const mapX = (value: number) => left + ((value - timeMin) / timeSpan) * width;
    const mapY = (value: number) => top + height - ((value - valueMin) / valueSpan) * height;

    if (valueMin <= 0 && valueMax >= 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, mapY(0));
      ctx.lineTo(left + width, mapY(0));
      ctx.stroke();
    }

    const drawSeries = (values: ArrayLike<number>, color: string): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.1;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let started = false;
      for (let index = 0; index < n; index += 1) {
        const x = Number(time[index] ?? timeMin);
        const y = Number(values[index] ?? 0);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(mapX(x), mapY(y));
          started = true;
        } else {
          ctx.lineTo(mapX(x), mapY(y));
        }
      }
      ctx.stroke();
    };
    const theta1Color = options.theta1Color ?? OKABE_ITO.skyBlue;
    const theta2Color = options.theta2Color ?? OKABE_ITO.vermillion;
    drawSeries(theta1, theta1Color);
    drawSeries(theta2, theta2Color);

    ctx.font = '8px ui-monospace, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = theta1Color;
    ctx.fillText('θ₁', left + 2, rect.y + 3);
    ctx.fillStyle = theta2Color;
    ctx.fillText('θ₂', left + 28, rect.y + 3);
    ctx.fillStyle = DARK_THEME.axis;
    ctx.textAlign = 'center';
    ctx.fillText(`${timeMin.toFixed(1)} - ${timeMax.toFixed(1)} s`, left + width / 2, top + height + 3);
  }
  ctx.restore();
}
