import { describe, expect, test } from 'vitest';
import type { Ctx2D, CtxGradient, Rect } from '../src/viz/types';
import {
  makeScale,
  niceTicks,
  innerRect,
  DEFAULT_PADDING,
  hexToRgb,
  rgbToHex,
  lerpHexColor,
  CATEGORICAL,
  categorical,
  renderEnergyPlot,
  renderDriftGauge,
  renderLyapunovConvergence,
  renderPoincareSection,
  renderBifurcation,
  renderTrajectoryTrace,
  autoViewport,
  zoomViewport
} from '../src/viz/index';

/** Recording stub implementing the Ctx2D subset the renderers use. */
function makeStubCtx(): Ctx2D & { calls: Record<string, number> } {
  const calls: Record<string, number> = {};
  const bump = (k: string) => {
    calls[k] = (calls[k] ?? 0) + 1;
  };
  const gradient: CtxGradient = { addColorStop: () => bump('addColorStop') };
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
    createLinearGradient: () => {
      bump('createLinearGradient');
      return gradient;
    }
  };
}

const RECT: Rect = { x: 0, y: 0, width: 300, height: 180 };

describe('scales and ticks', () => {
  test('makeScale maps endpoints and midpoint, invert round-trips', () => {
    const s = makeScale(0, 10, 100, 200);
    expect(s.map(0)).toBe(100);
    expect(s.map(10)).toBe(200);
    expect(s.map(5)).toBe(150);
    expect(s.invert(150)).toBeCloseTo(5, 12);
  });

  test('niceTicks produces 1/2/5-snapped ascending ticks', () => {
    const ticks = niceTicks(0, 10, 5);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < ticks.length; i += 1) expect(ticks[i]! > ticks[i - 1]!).toBe(true);
  });

  test('innerRect reserves padding', () => {
    const inner = innerRect(RECT, DEFAULT_PADDING);
    expect(inner.x).toBe(DEFAULT_PADDING.left);
    expect(inner.width).toBe(RECT.width - DEFAULT_PADDING.left - DEFAULT_PADDING.right);
  });
});

describe('colorblind-safe palette', () => {
  test('categorical palette has the expected distinct entries', () => {
    expect(CATEGORICAL.length).toBe(7);
    expect(new Set(CATEGORICAL).size).toBe(CATEGORICAL.length);
    expect(categorical(CATEGORICAL.length)).toBe(categorical(0)); // wraps
  });

  test('hex round-trips and interpolation is monotone', () => {
    expect(rgbToHex(hexToRgb('#56B4E9')).toLowerCase()).toBe('#56b4e9');
    expect(lerpHexColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(lerpHexColor('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(lerpHexColor('#000000', '#ffffff', 0.5).toLowerCase()).toBe('#808080');
  });
});

describe('viewport helpers', () => {
  test('autoViewport bounds the points with a margin', () => {
    const vp = autoViewport(
      [
        { x: 0, y: 0 },
        { x: 10, y: 4 }
      ],
      0.1
    );
    expect(vp.xMin).toBeLessThan(0);
    expect(vp.xMax).toBeGreaterThan(10);
    expect(vp.yMin).toBeLessThan(0);
    expect(vp.yMax).toBeGreaterThan(4);
  });

  test('zoomViewport shrinks the span about the center', () => {
    const vp = { xMin: 0, xMax: 10, yMin: 0, yMax: 10 };
    const zoomed = zoomViewport(vp, 0.5);
    expect(zoomed.xMax - zoomed.xMin).toBeCloseTo(5, 12);
    expect((zoomed.xMin + zoomed.xMax) / 2).toBeCloseTo(5, 12);
  });
});

describe('renderers issue the expected draw calls', () => {
  test('renderEnergyPlot strokes lines and labels axes', () => {
    const ctx = makeStubCtx();
    renderEnergyPlot(ctx, RECT, {
      time: [0, 1, 2, 3],
      total: [10, 10.01, 9.99, 10.02],
      drift: [0, 1e-4, 2e-4, 1.5e-4]
    });
    expect(ctx.calls.stroke ?? 0).toBeGreaterThan(0);
    expect(ctx.calls.fillText ?? 0).toBeGreaterThan(0);
    expect(ctx.calls.fillRect ?? 0).toBeGreaterThan(0); // background
  });

  test('renderDriftGauge fills a background and a value bar', () => {
    const ctx = makeStubCtx();
    renderDriftGauge(ctx, { x: 0, y: 0, width: 200, height: 18 }, 5e-4);
    expect(ctx.calls.fillRect ?? 0).toBeGreaterThanOrEqual(3);
  });

  test('renderLyapunovConvergence draws a curve and zero line', () => {
    const ctx = makeStubCtx();
    renderLyapunovConvergence(ctx, RECT, [0.3, 0.18, 0.12, 0.105, 0.1]);
    expect(ctx.calls.stroke ?? 0).toBeGreaterThan(0);
    expect(ctx.calls.setLineDash ?? 0).toBeGreaterThan(0); // dashed zero reference
  });

  test('renderPoincareSection draws one arc per in-view point', () => {
    const ctx = makeStubCtx();
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0.5 },
      { x: -0.5, y: 1 },
      { x: 0.8, y: -0.3 }
    ];
    renderPoincareSection(ctx, RECT, pts);
    expect(ctx.calls.arc ?? 0).toBe(pts.length);
  });

  test('renderBifurcation rasterizes a point per value', () => {
    const ctx = makeStubCtx();
    const columns = [
      { param: 1.0, values: [0.1, 0.2] },
      { param: 1.1, values: [0.15, 0.25, 0.35] }
    ];
    renderBifurcation(ctx, RECT, columns);
    // One fillRect for the background frame plus one per finite value.
    expect(ctx.calls.fillRect ?? 0).toBeGreaterThanOrEqual(1 + 5);
  });

  test('renderTrajectoryTrace strokes the path (batched) and draws a head dot', () => {
    const ctx = makeStubCtx();
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
      { x: 30, y: 8 }
    ];
    renderTrajectoryTrace(ctx, path);
    // Colours are quantised and contiguous same-colour segments are batched, so
    // the number of strokes is between 1 and one-per-segment.
    expect(ctx.calls.stroke ?? 0).toBeGreaterThanOrEqual(1);
    expect(ctx.calls.stroke ?? 0).toBeLessThanOrEqual(path.length - 1);
    expect(ctx.calls.lineTo ?? 0).toBe(path.length - 1); // every segment drawn
    expect(ctx.calls.arc ?? 0).toBe(1); // head marker
  });

  test('renderTrajectoryTrace batches a long single-colour-bucket trail into few strokes', () => {
    const ctx = makeStubCtx();
    const path = Array.from({ length: 500 }, (_, i) => ({ x: i, y: Math.sin(i / 10) * 5 }));
    renderTrajectoryTrace(ctx, path, { headRadius: 0 });
    // 500 points = 499 segments, but batched into at most LUT_SIZE (24) strokes.
    expect(ctx.calls.stroke ?? 0).toBeLessThanOrEqual(24);
    expect(ctx.calls.lineTo ?? 0).toBe(499);
    expect(ctx.calls.arc ?? 0).toBe(0); // headRadius 0 → no head
  });
});

describe('renderers are safe on empty data', () => {
  test('no throws when arrays are empty', () => {
    const ctx = makeStubCtx();
    expect(() => renderEnergyPlot(ctx, RECT, { time: [], total: [], drift: [] })).not.toThrow();
    expect(() => renderLyapunovConvergence(ctx, RECT, [])).not.toThrow();
    expect(() => renderPoincareSection(ctx, RECT, [])).not.toThrow();
    expect(() => renderBifurcation(ctx, RECT, [])).not.toThrow();
    expect(() => renderTrajectoryTrace(ctx, [])).not.toThrow();
  });
});
