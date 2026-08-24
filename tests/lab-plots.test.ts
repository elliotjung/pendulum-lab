import { describe, expect, it } from 'vitest';
import type { Ctx2D } from '../src/viz/types';
import { renderAngleProjection, renderAngleTimeSeries, renderPhasePortrait, renderSpectrum } from '../src/app/labPlots';

function makeStubCtx(): Ctx2D & { calls: Record<string, number>; lineTos: number; coordinates: [number, number][] } {
  const calls: Record<string, number> = {};
  const coordinates: [number, number][] = [];
  let lineTos = 0;
  const bump = (k: string) => {
    calls[k] = (calls[k] ?? 0) + 1;
  };
  return {
    get lineTos() {
      return lineTos;
    },
    calls,
    coordinates,
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
    moveTo: (x: number, y: number) => {
      coordinates.push([x, y]);
      bump('moveTo');
    },
    lineTo: (x: number, y: number) => {
      coordinates.push([x, y]);
      lineTos += 1;
      bump('lineTo');
    },
    stroke: () => bump('stroke'),
    fill: () => bump('fill'),
    arc: () => bump('arc'),
    rect: () => bump('rect'),
    fillRect: () => bump('fillRect'),
    clearRect: () => bump('clearRect'),
    fillText: () => bump('fillText'),
    setLineDash: () => bump('setLineDash'),
    createLinearGradient: () => ({ addColorStop: () => bump('addColorStop') })
  } as unknown as Ctx2D & { calls: Record<string, number>; lineTos: number; coordinates: [number, number][] };
}

const RECT = { x: 0, y: 0, width: 220, height: 120 };

describe('renderPhasePortrait', () => {
  it('draws axes and a polyline through the samples without throwing', () => {
    const ctx = makeStubCtx();
    const samples = Array.from({ length: 50 }, (_, i) => ({ theta: Math.sin(i / 5), omega: Math.cos(i / 5) * 10 }));
    renderPhasePortrait(ctx, RECT, samples);
    expect(ctx.calls.fillRect).toBeGreaterThanOrEqual(1); // background
    expect(ctx.calls.stroke).toBeGreaterThanOrEqual(2); // axes + trajectory
    expect(ctx.calls.lineTo).toBeGreaterThan(40); // one segment per sample
  });

  it('still renders axes with fewer than two samples', () => {
    const ctx = makeStubCtx();
    expect(() => renderPhasePortrait(ctx, RECT, [{ theta: 0, omega: 0 }])).not.toThrow();
    expect(ctx.calls.stroke).toBeGreaterThanOrEqual(1);
  });

  it('wraps rotating angles and auto-scales high angular velocities into the visible rect', () => {
    const ctx = makeStubCtx();
    const samples = Array.from({ length: 80 }, (_, index) => ({
      theta: 12 * Math.PI + index * 0.15,
      omega: 80 + 40 * Math.sin(index / 8)
    }));

    renderPhasePortrait(ctx, RECT, samples);

    expect(ctx.coordinates.length).toBeGreaterThan(60);
    expect(
      ctx.coordinates.every(
        ([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= RECT.width && y >= 0 && y <= RECT.height
      )
    ).toBe(true);
    expect(ctx.calls.moveTo).toBeGreaterThan(2); // origin axis plus at least one wrapped seam restart
  });
});

describe('renderSpectrum', () => {
  it('draws a filled spectrum and a Nyquist label', () => {
    const ctx = makeStubCtx();
    const mags = Array.from({ length: 64 }, (_, i) => Math.exp(-Math.abs(i - 8) / 4));
    renderSpectrum(ctx, RECT, mags, { log: true, nyquist: 83.3 });
    expect(ctx.calls.fill).toBeGreaterThanOrEqual(1);
    expect(ctx.calls.stroke).toBeGreaterThanOrEqual(1);
    expect(ctx.calls.fillText).toBeGreaterThanOrEqual(1); // Nyquist label
  });

  it('handles an empty spectrum gracefully', () => {
    const ctx = makeStubCtx();
    expect(() => renderSpectrum(ctx, RECT, [])).not.toThrow();
  });
});

describe('student angle plots', () => {
  it('draws a wrapped theta1-theta2 projection and breaks at the angle seam', () => {
    const ctx = makeStubCtx();
    const theta1 = Float32Array.from([3.0, 3.1, -3.1, -3.0, -2.8]);
    const theta2 = Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5]);
    renderAngleProjection(ctx, RECT, theta1, theta2);
    expect(ctx.calls.fillRect).toBeGreaterThanOrEqual(1);
    expect(ctx.calls.moveTo).toBeGreaterThanOrEqual(4); // two axes, path start, seam restart
    expect(ctx.calls.stroke).toBeGreaterThanOrEqual(2);
    expect(ctx.calls.fillText).toBeGreaterThanOrEqual(4);
  });

  it('draws both angle histories against a physical-time axis', () => {
    const ctx = makeStubCtx();
    const time = Float32Array.from([0, 0.1, 0.2, 0.3]);
    const theta1 = Float32Array.from([0.1, 0.2, 0.3, 0.4]);
    const theta2 = Float32Array.from([-0.2, -0.1, 0.1, 0.2]);
    renderAngleTimeSeries(ctx, RECT, time, theta1, theta2);
    expect(ctx.calls.fillRect).toBeGreaterThanOrEqual(1);
    expect(ctx.calls.stroke).toBeGreaterThanOrEqual(3); // zero axis plus two series
    expect(ctx.lineTos).toBeGreaterThanOrEqual(7);
    expect(ctx.calls.fillText).toBeGreaterThanOrEqual(3);
  });

  it('leaves an empty but valid surface before history has enough samples', () => {
    const ctx = makeStubCtx();
    expect(() => renderAngleTimeSeries(ctx, RECT, [], [], [])).not.toThrow();
    expect(ctx.calls.fillRect).toBe(1);
  });
});
