import { getCanvasDprCap } from './canvasQuality';
import type { LabSidePlotId, LabSidePlotPayload, LabSidePlotWorkerMessage } from './LabSidePlotProtocol';

type SidePlotCanvasMap = Partial<Record<LabSidePlotId, HTMLCanvasElement | undefined>>;

export class LabSidePlotWorkerClient {
  private worker: Worker | null = null;
  private enabled = false;
  private readonly canvases: SidePlotCanvasMap = {};

  ensure(canvases: SidePlotCanvasMap): boolean {
    if (this.enabled) return true;
    if (!canUseOffscreenWorker()) return false;

    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/labSidePlots.worker.ts', import.meta.url), {
        type: 'module',
        name: 'pendulum-lab-side-plots'
      });
    } catch {
      return false;
    }

    try {
      for (const [plot, canvas] of Object.entries(canvases) as Array<[LabSidePlotId, HTMLCanvasElement | undefined]>) {
        if (!canvas || typeof canvas.transferControlToOffscreen !== 'function') continue;
        const offscreen = canvas.transferControlToOffscreen();
        this.canvases[plot] = canvas;
        worker.postMessage({ kind: 'canvas', plot, canvas: offscreen } satisfies LabSidePlotWorkerMessage, [offscreen]);
      }
    } catch {
      worker.terminate();
      this.canvasesClear();
      return false;
    }

    worker.addEventListener('error', () => {
      this.enabled = false;
    });
    this.worker = worker;
    this.enabled = Object.keys(this.canvases).length > 0;
    return this.enabled;
  }

  render(payload: LabSidePlotPayload): boolean {
    if (!this.enabled || !this.worker) return false;
    const canvas = this.canvases[payload.plot];
    if (!canvas) return false;
    const size = measureCanvas(canvas);
    try {
      this.worker.postMessage({
        kind: 'render',
        plot: payload.plot,
        width: size.width,
        height: size.height,
        dpr: size.dpr,
        payload
      } satisfies LabSidePlotWorkerMessage);
      return true;
    } catch {
      this.enabled = false;
      return false;
    }
  }

  usesWorker(): boolean {
    return this.enabled;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.enabled = false;
    this.canvasesClear();
  }

  private canvasesClear(): void {
    for (const key of Object.keys(this.canvases) as LabSidePlotId[]) delete this.canvases[key];
  }
}

function canUseOffscreenWorker(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

function measureCanvas(canvas: HTMLCanvasElement): { width: number; height: number; dpr: number } {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width || canvas.clientWidth || canvas.width || 1));
  const height = Math.max(1, Math.floor(rect.height || canvas.clientHeight || canvas.height || 1));
  const dpr = Math.min(getCanvasDprCap(), Math.max(1, window.devicePixelRatio || 1));
  return { width, height, dpr };
}
