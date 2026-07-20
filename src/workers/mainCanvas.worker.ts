/// <reference lib="webworker" />
import { LabRenderer } from '../app/LabRenderer';
import {
  isMainCanvasWorkerMessage,
  unpackBobPositions,
  type MainCanvasWorkerResponse
} from '../app/MainCanvasWorkerProtocol';
import type { Ctx2D } from '../viz/types';

let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;
let renderer: LabRenderer | null = null;
let logicalWidth = 1;
let logicalHeight = 1;
let dpr = 1;

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isMainCanvasWorkerMessage(event.data)) {
    post({ kind: 'error', detail: 'main canvas worker received a malformed message' });
    return;
  }
  const message = event.data;
  try {
    switch (message.kind) {
      case 'init':
        canvas = message.canvas;
        logicalWidth = message.width;
        logicalHeight = message.height;
        dpr = message.dpr;
        configure();
        post({ kind: 'ready' });
        break;
      case 'resize':
        logicalWidth = message.width;
        logicalHeight = message.height;
        dpr = message.dpr;
        configure();
        break;
      case 'frame': {
        if (!renderer) throw new Error('main canvas worker received a frame before initialization');
        const started = now();
        const ensembleTips = unpackBobPositions(message.ensembleBobs).map((bob) => renderer!.toPixels(bob));
        renderer.draw(unpackBobPositions(message.bobs), {
          ...message.style,
          ensembleTips
        });
        post({ kind: 'rendered', sequence: message.sequence, elapsedMs: now() - started });
        break;
      }
      case 'clear':
        renderer?.clear();
        break;
      case 'dispose':
        renderer = null;
        context = null;
        canvas = null;
        self.close();
        break;
    }
  } catch (error) {
    post({ kind: 'error', detail: error instanceof Error ? error.message : String(error) });
  }
});

function configure(): void {
  if (!canvas) throw new Error('main canvas worker has no OffscreenCanvas');
  const backingWidth = Math.max(1, Math.round(logicalWidth * dpr));
  const backingHeight = Math.max(1, Math.round(logicalHeight * dpr));
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;
  if (!context) context = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!context) throw new Error('main canvas worker could not acquire a 2D context');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.imageSmoothingEnabled = false;
  if (!renderer) {
    renderer = new LabRenderer(context as unknown as Ctx2D, { width: logicalWidth, height: logicalHeight });
    renderer.clear();
  } else {
    renderer.resize({ width: logicalWidth, height: logicalHeight });
  }
}

function post(message: MainCanvasWorkerResponse): void {
  self.postMessage(message);
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
