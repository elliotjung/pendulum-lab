import { describe, expect, it } from 'vitest';
import type { Ctx2D } from '../src/viz/types';
import { lambdaColor, rampColor } from '../src/app/sweepColor';
import { renderMultiLine, renderSpectrumBars } from '../src/app/labPlots';

function stubCtx(): Ctx2D & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const bump = (k: string) => {
    calls[k] = (calls[k] ?? 0) + 1;
  };
  return {
    calls,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '10px monospace',
    lineJoin: 'round',
    lineCap: 'round',
    textAlign: 'left',
    textBaseline: 'top',
    save: () => bump('save'),
    restore: () => bump('restore'),
    beginPath: () => bump('beginPath'),
    closePath: () => bump('closePath'),
    moveTo: () => bump('moveTo'),
    lineTo: () => bump('lineTo'),
    stroke: () => bump('stroke'),
    fill: () => bump('fill'),
    arc: () => bump('arc'),
    rect: () => bump('rect'),
    fillRect: () => bump('fillRect'),
    clearRect: () => bump('clearRect'),
    fillText: () => bump('fillText'),
    setLineDash: () => bump('setLineDash'),
    createLinearGradient: () => ({ addColorStop: () => bump('addColorStop') })
  } as unknown as Ctx2D & { calls: Record<string, number> };
}

const HEX = /^#[0-9a-f]{6}$/;
const RECT = { x: 0, y: 0, width: 200, height: 100 };

describe('sweepColor', () => {
  it('rampColor returns hex and is monotonic in endpoints', () => {
    expect(rampColor(0)).toMatch(HEX);
    expect(rampColor(1)).toMatch(HEX);
    expect(rampColor(0)).not.toBe(rampColor(1));
    // Clamps out-of-range input.
    expect(rampColor(-5)).toBe(rampColor(0));
    expect(rampColor(5)).toBe(rampColor(1));
  });

  it('lambdaColor: non-positive λ is the coolest stop, positive scales up', () => {
    const cool = lambdaColor(-1, 3);
    expect(cool).toMatch(HEX);
    expect(lambdaColor(0, 3)).toBe(cool);
    expect(lambdaColor(3, 3)).not.toBe(cool);
    expect(lambdaColor(Number.NaN, 3)).toBe('#000000');
  });
});

describe('renderMultiLine', () => {
  it('draws one stroked path per series with a log y-axis', () => {
    const ctx = stubCtx();
    renderMultiLine(
      ctx,
      RECT,
      [
        { color: '#18d4f8', values: [1e-6, 1e-5, 1e-4, 1e-3] },
        { color: '#ff7a2c', values: [1e-3, 1e-2, 1e-1, 1] }
      ],
      { log: true }
    );
    expect(ctx.calls.fillRect).toBeGreaterThanOrEqual(1); // background
    expect(ctx.calls.stroke).toBeGreaterThanOrEqual(2); // two series
  });

  it('does not throw on empty / single-point series', () => {
    const ctx = stubCtx();
    expect(() => renderMultiLine(ctx, RECT, [])).not.toThrow();
    expect(() => renderMultiLine(ctx, RECT, [{ color: '#fff', values: [1] }])).not.toThrow();
  });
});

describe('renderSpectrumBars', () => {
  it('draws a zero line and one bar per exponent with labels', () => {
    const ctx = stubCtx();
    renderSpectrumBars(ctx, RECT, [0.9, 0.0, -0.0, -0.9]);
    expect(ctx.calls.stroke).toBeGreaterThanOrEqual(1); // zero line
    expect(ctx.calls.fillRect).toBeGreaterThanOrEqual(5); // background + 4 bars
    expect(ctx.calls.fillText).toBeGreaterThanOrEqual(4); // labels
  });

  it('handles an empty spectrum', () => {
    const ctx = stubCtx();
    expect(() => renderSpectrumBars(ctx, RECT, [])).not.toThrow();
  });
});
