import { describe, expect, it } from 'vitest';
import type { Ctx2D } from '../src/viz/types';
import { LabRenderer } from '../src/app/LabRenderer';
import { mountModernLab } from '../src/app/LabController';
import type { LabConfig } from '../src/app/LabSimulation';

interface ArcCall {
  x: number;
  y: number;
  r: number;
}

/** Recording stub implementing the Ctx2D subset, capturing arc/line coordinates. */
function makeStubCtx(): Ctx2D & { calls: Record<string, number>; arcs: ArcCall[]; lineTos: Array<{ x: number; y: number }> } {
  const calls: Record<string, number> = {};
  const arcs: ArcCall[] = [];
  const lineTos: Array<{ x: number; y: number }> = [];
  const bump = (k: string) => {
    calls[k] = (calls[k] ?? 0) + 1;
  };
  return {
    calls,
    arcs,
    lineTos,
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
    lineTo: (x: number, y: number) => {
      lineTos.push({ x, y });
      bump('lineTo');
    },
    stroke: () => bump('stroke'),
    fill: () => bump('fill'),
    arc: (x: number, y: number, r: number) => {
      arcs.push({ x, y, r });
      bump('arc');
    },
    rect: () => bump('rect'),
    fillRect: () => bump('fillRect'),
    clearRect: () => bump('clearRect'),
    fillText: () => bump('fillText'),
    setLineDash: () => bump('setLineDash'),
    createLinearGradient: () => ({ addColorStop: () => bump('addColorStop') })
  };
}

const DOUBLE: LabConfig = {
  system: 'double',
  parameters: { m1: 1, m2: 1, l1: 1.2, l2: 1.0, g: 9.81 },
  gamma: 0,
  method: 'rk4',
  dt: 0.002,
  initialState: [2.0, 2.5, 0, 0]
};

describe('LabRenderer', () => {
  it('maps metres to legacy-parity pixels (pivot w/2, h·0.38, 110 px/m)', () => {
    const renderer = new LabRenderer(makeStubCtx(), { width: 680, height: 520 });
    expect(renderer.pivot()).toEqual({ x: 340, y: 520 * 0.38 });
    // A bob 1.2 m straight down maps below the pivot by 1.2·110 px.
    const p = renderer.toPixels({ x: 0, y: 1.2 });
    expect(p.x).toBeCloseTo(340, 9);
    expect(p.y).toBeCloseTo(520 * 0.38 + 1.2 * 110, 9);
  });

  it('draws a pivot dot plus one bob per arm at the mapped positions', () => {
    const ctx = makeStubCtx();
    const renderer = new LabRenderer(ctx, { width: 400, height: 400, scale: 100 });
    // Double pendulum hanging straight down: bobs at (0,1.2) and (0,2.2) metres.
    renderer.draw([{ x: 0, y: 1.2 }, { x: 0, y: 2.2 }]);
    // 3 arcs: pivot + 2 bobs.
    expect(ctx.arcs).toHaveLength(3);
    const pivotY = 400 * 0.38;
    expect(ctx.arcs[0]!).toMatchObject({ x: 200, y: pivotY });
    expect(ctx.arcs[1]!.y).toBeCloseTo(pivotY + 1.2 * 100, 6);
    expect(ctx.arcs[2]!.y).toBeCloseTo(pivotY + 2.2 * 100, 6);
  });

  it('preserves the main trail across logical resize', () => {
    const ctx = makeStubCtx();
    const renderer = new LabRenderer(ctx, { width: 400, height: 400, scale: 100 });
    renderer.draw([{ x: 0, y: 1.2 }, { x: 0.1, y: 2.2 }], { trailLength: 8 });
    renderer.draw([{ x: 0, y: 1.2 }, { x: 0.2, y: 2.1 }], { trailLength: 8 });
    renderer.draw([{ x: 0, y: 1.2 }, { x: 0.3, y: 2.0 }], { trailLength: 8 });

    expect(renderer.trailPointCount()).toBe(3);
    renderer.resize({ width: 640, height: 420 });
    expect(renderer.size()).toEqual({ width: 640, height: 420 });
    expect(renderer.trailPointCount()).toBe(3);

    renderer.draw([{ x: 0, y: 1.2 }, { x: 0.4, y: 1.9 }], { trailLength: 8 });
    expect(renderer.trailPointCount()).toBe(4);
  });
});

/** Minimal canvas double whose getContext returns our recording stub. */
function fakeCanvas(ctx: Ctx2D, width = 400, height = 400): HTMLCanvasElement {
  return { width, height, getContext: () => ctx } as unknown as HTMLCanvasElement;
}

describe('mountModernLab controller', () => {
  it('steps the simulation and draws one frame at a time', () => {
    const ctx = makeStubCtx();
    const handle = mountModernLab(fakeCanvas(ctx), DOUBLE, {
      stepsPerFrame: 4,
      scheduler: () => () => {} // do not auto-run; we call frame() manually
    });
    expect(handle.lastSnapshot().time).toBe(0);
    handle.frame();
    expect(handle.simulation.time).toBeCloseTo(4 * DOUBLE.dt, 12);
    handle.frame();
    expect(handle.simulation.time).toBeCloseTo(8 * DOUBLE.dt, 12);
    // Each frame draws bobs (arc calls accumulate) and advances state.
    expect(ctx.calls.arc).toBeGreaterThanOrEqual(6);
  });

  it('start/stop toggles the running flag through the injected scheduler', () => {
    const ctx = makeStubCtx();
    let cancelled = false;
    const handle = mountModernLab(fakeCanvas(ctx), DOUBLE, {
      scheduler: (cb) => {
        cb(); // run a single frame synchronously
        return () => {
          cancelled = true;
        };
      }
    });
    expect(handle.running()).toBe(false);
    handle.start();
    expect(handle.running()).toBe(true);
    expect(handle.simulation.time).toBeGreaterThan(0); // scheduler ran one frame
    handle.stop();
    expect(handle.running()).toBe(false);
    expect(cancelled).toBe(true);
  });

  it('clearTrail resets the trail buffer', () => {
    const ctx = makeStubCtx();
    const handle = mountModernLab(fakeCanvas(ctx), DOUBLE, { scheduler: () => () => {} });
    handle.frame();
    handle.frame();
    handle.clearTrail();
    // After clearing, a fresh frame still renders without error.
    expect(() => handle.frame()).not.toThrow();
  });
});
