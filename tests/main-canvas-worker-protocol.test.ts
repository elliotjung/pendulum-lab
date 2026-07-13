import { describe, expect, it, vi } from 'vitest';
import { mainCanvasWorkerRequested, tryCreateMainCanvasWorkerClient } from '../src/app/MainCanvasWorkerClient';
import {
  packBobPositions,
  packPixelPoints,
  unpackBobPositions,
  unpackPixelPoints
} from '../src/app/MainCanvasWorkerProtocol';

describe('main trajectory OffscreenCanvas protocol', () => {
  it('is disabled unless explicitly requested', () => {
    expect(mainCanvasWorkerRequested('')).toBe(false);
    expect(mainCanvasWorkerRequested('?mainCanvasWorker=0')).toBe(false);
    expect(mainCanvasWorkerRequested('?mainCanvasWorker=1')).toBe(true);
  });

  it('round-trips bob positions through a transferable Float32 payload', () => {
    const packed = packBobPositions([
      { x: 1.25, y: -2.5 },
      { x: 3, y: 4 }
    ]);
    expect(packed).toBeInstanceOf(Float32Array);
    expect(unpackBobPositions(packed)).toEqual([
      { x: 1.25, y: -2.5 },
      { x: 3, y: 4 }
    ]);
  });

  it('round-trips projected ensemble tips', () => {
    const packed = packPixelPoints([
      { x: 100, y: 220 },
      { x: 9.5, y: 11.25 }
    ]);
    expect(unpackPixelPoints(packed)).toEqual([
      { x: 100, y: 220 },
      { x: 9.5, y: 11.25 }
    ]);
  });

  it('leaves synchronous transfer failures on the Canvas2D path', () => {
    const previousWorker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
    const previousOffscreen = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas');
    Object.defineProperty(globalThis, 'Worker', { configurable: true, value: class {} });
    Object.defineProperty(globalThis, 'OffscreenCanvas', { configurable: true, value: class {} });
    const terminate = vi.fn();
    const canvas = {
      transferControlToOffscreen: () => {
        throw new Error('already has a context');
      },
      cloneNode: () => ({}),
      isConnected: true
    } as unknown as HTMLCanvasElement;
    try {
      const client = tryCreateMainCanvasWorkerClient(canvas, {
        createWorker: () => ({ postMessage: vi.fn(), addEventListener: vi.fn(), terminate })
      });
      expect(client).toBeNull();
      expect(terminate).toHaveBeenCalledOnce();
    } finally {
      if (previousWorker) Object.defineProperty(globalThis, 'Worker', previousWorker);
      else delete (globalThis as { Worker?: unknown }).Worker;
      if (previousOffscreen) Object.defineProperty(globalThis, 'OffscreenCanvas', previousOffscreen);
      else delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
    }
  });
});
