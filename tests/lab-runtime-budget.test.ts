import { describe, expect, it } from 'vitest';
import {
  canvasQualityDiagnostics,
  latestCanvasQualityReason,
  recordCanvasQualityEvent,
  setCanvasDprCap
} from '../src/app/canvasQuality';
import { LabRecording } from '../src/app/LabRecording';
import { pairsToPoints, sidePlotTransferables, type LabSidePlotPayload } from '../src/app/LabSidePlotProtocol';
import { PoincareAccumulator } from '../src/app/PoincareAccumulator';

describe('Lab side-plot transferable payloads', () => {
  it('collects typed-array buffers for worker transfer', () => {
    const payload: LabSidePlotPayload = {
      plot: 'energy',
      energy: {
        time: Float32Array.from([0, 1]),
        total: Float32Array.from([2, 3]),
        drift: Float32Array.from([0, 0.1])
      }
    };

    const transfers = sidePlotTransferables(payload);
    expect(transfers).toHaveLength(3);
    expect(transfers.every((buffer) => buffer instanceof ArrayBuffer)).toBe(true);
  });

  it('converts packed point pairs back to plot points', () => {
    expect(pairsToPoints(Float32Array.from([1, 2, 3, 4]))).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 }
    ]);
  });
});

describe('PoincareAccumulator diagnostics', () => {
  it('exposes cap, direction, refinement policy, and packed point snapshots', () => {
    const acc = new PoincareAccumulator(2, 'both');
    expect(acc.policy()).toEqual({ capacity: 2, direction: 'both', refined: false });

    acc.push(Float64Array.from([-0.1, 1, 1, 2]));
    acc.push(Float64Array.from([0, 3, 1, 4]));

    expect(acc.size).toBe(1);
    expect(Array.from(acc.toFloat32Pairs())).toEqual([3, 4]);
  });

  it('retargets the retention cap: shrinking drops oldest, growing keeps points', () => {
    const acc = new PoincareAccumulator(10, 'both');
    // Three alternating crossings of theta1 = 0 -> three section points.
    acc.push(Float64Array.from([-0.1, 1, 1, 1]));
    acc.push(Float64Array.from([0.1, 2, 1, 2]));
    acc.push(Float64Array.from([-0.1, 3, -1, 3]));
    acc.push(Float64Array.from([0.1, 4, 1, 4]));
    expect(acc.size).toBe(3);

    acc.setCapacity(2);
    expect(acc.capacity).toBe(2);
    expect(acc.size).toBe(2);
    // Oldest point (from the first crossing) was dropped.
    expect(acc.list()[0]?.x).not.toBe(1.5);

    acc.setCapacity(50);
    expect(acc.capacity).toBe(50);
    expect(acc.size).toBe(2);

    // Cap is clamped to at least one retained point.
    acc.setCapacity(0);
    expect(acc.capacity).toBe(1);
    expect(acc.size).toBe(1);
  });
});

describe('Canvas quality diagnostics', () => {
  it('records why the DPR cap changed', () => {
    setCanvasDprCap(1, 'test downgrade');
    recordCanvasQualityEvent({ dprCap: 1, reason: 'physics 12.0 ms', physicsMs: 12, stepsPerFrame: 4 });
    expect(latestCanvasQualityReason()).toBe('physics 12.0 ms');
    expect(canvasQualityDiagnostics().at(-1)).toMatchObject({ reason: 'physics 12.0 ms', stepsPerFrame: 4 });
  });
});

describe('LabRecording', () => {
  it('keeps a fixed-size ring of copied states', () => {
    const recording = new LabRecording(2);
    const state = Float64Array.from([1, 2]);
    recording.push(0, state);
    state[0] = 99;
    recording.push(1, Float64Array.from([3, 4]));
    recording.push(2, Float64Array.from([5, 6]));

    expect(recording.length).toBe(2);
    expect(recording.samples().map((sample) => [sample.time, Array.from(sample.state)])).toEqual([
      [1, [3, 4]],
      [2, [5, 6]]
    ]);
  });
});
